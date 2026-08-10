import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";

if (!env.geminiApiKey) {
  throw new Error("GEMINI_API_KEY is not defined");
}

const ai = new GoogleGenAI({
  apiKey: env.geminiApiKey,
});

const EMBEDDING_DIMENSIONS = 768;

const MAX_RETRIES = 4;
const INITIAL_RETRY_DELAY_MS = 5_000;

type EmbeddingType = "document" | "query";

interface GenerateEmbeddingOptions {
  type: EmbeddingType;
  title?: string;
}

function normalizeEmbedding(values: number[]): number[] {
  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0),
  );

  if (magnitude === 0) {
    throw new Error("Cannot normalize a zero embedding");
  }

  return values.map((value) => value / magnitude);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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

  return INITIAL_RETRY_DELAY_MS * 2 ** attempt;
}

async function requestEmbedding(
  text: string,
  options: GenerateEmbeddingOptions,
) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await ai.models.embedContent({
        model: env.geminiEmbeddingModel,
        contents: text,
        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
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
        attempt === MAX_RETRIES
      ) {
        throw error;
      }

      const delay = getRetryDelay(error, attempt);

      console.warn(
        `[embedding] Rate limited. Retrying in ${Math.ceil(
          delay / 1_000,
        )}s (${attempt + 1}/${MAX_RETRIES})`,
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

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding dimension: ${embedding.length}`,
    );
  }

  return normalizeEmbedding(embedding);
}