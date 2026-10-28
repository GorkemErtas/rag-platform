import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { EMBEDDING_CONFIG } from "../config/constants.js";
import { sleep } from "../utils/async.js";

let ai: GoogleGenAI | undefined;

type EmbeddingType = "document" | "query";

interface GenerateEmbeddingOptions {
  type: EmbeddingType;
  title?: string;
}

export function normalizeEmbedding(values: number[]): number[] {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding must contain finite numeric values");
  }
  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0),
  );

  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Cannot normalize a zero embedding");
  }

  return values.map((value) => value / magnitude);
}

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("429") ||
    message.includes("resource_exhausted") ||
    message.includes("rate limit") ||
    message.includes("quota exceeded")
  );
}

function getRetryDelay(
  error: unknown,
  attempt: number,
): number {
  if (error instanceof Error) {
    const retryDelayMatch = error.message.match(
      /"retryDelay"\s*:\s*"(\d+)s"/i,
    );

    if (retryDelayMatch?.[1]) {
      return Number(retryDelayMatch[1]) * 1_000;
    }

    const pleaseRetryMatch = error.message.match(
      /please retry in\s+([\d.]+)s/i,
    );

    if (pleaseRetryMatch?.[1]) {
      return Math.ceil(
        Number(pleaseRetryMatch[1]) * 1_000,
      );
    }
  }

  return (
  EMBEDDING_CONFIG.initialRetryDelayMs *
  2 ** attempt
);
}

async function requestEmbedding(
  text: string,
  options: GenerateEmbeddingOptions,
) {
  if (!env.geminiApiKey) throw new Error("GEMINI_API_KEY is not defined");
  ai ??= new GoogleGenAI({ apiKey: env.geminiApiKey });
  for (let attempt = 0; attempt <= EMBEDDING_CONFIG.maxRetries; attempt += 1) {
    try {
      return await ai.models.embedContent({
        model: env.geminiEmbeddingModel,
        contents: text,
        config: {
          outputDimensionality: EMBEDDING_CONFIG.dimensions,
          taskType:
            options.type === "document"
              ? "RETRIEVAL_DOCUMENT"
              : "RETRIEVAL_QUERY",
          ...(options.type === "document" && options.title
            ? { title: options.title }
            : {}),
        },
      });
    } catch (error) {
      if (
        !isRateLimitError(error) ||
        attempt === EMBEDDING_CONFIG.maxRetries
      ) {
        throw error;
      }

      const delay = getRetryDelay(error, attempt);

      console.warn(
        `[embedding] Rate limited. Retrying in ${Math.ceil(
          delay / 1_000,
        )}s (${attempt + 1}/${EMBEDDING_CONFIG.maxRetries})`,
      );

      await sleep(delay);
    }
  }

  throw new Error("Embedding request failed");
}

export async function generateEmbedding(
  text: string,
  options: GenerateEmbeddingOptions,
): Promise<number[]> {
  const normalizedText = text.trim();

  if (!normalizedText) {
    throw new Error(
      "Cannot generate an embedding for empty text",
    );
  }

  const response = await requestEmbedding(
    normalizedText,
    options,
  );

  const embedding = response.embeddings?.[0]?.values;

  if (!embedding || embedding.length === 0) {
    throw new Error("Gemini returned no embedding");
  }

  if (embedding.length !== EMBEDDING_CONFIG.dimensions) {
    throw new Error(
      `Unexpected embedding dimension: ${embedding.length}`,
    );
  }

  return normalizeEmbedding(embedding);
}
