import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";

if (!env.geminiApiKey) {
  throw new Error("GEMINI_API_KEY is not defined");
}

const ai = new GoogleGenAI({
  apiKey: env.geminiApiKey,
});

const EMBEDDING_DIMENSIONS = 768;

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

export async function generateEmbedding(
  text: string,
  options: GenerateEmbeddingOptions,
): Promise<number[]> {
  const normalizedText = text.trim();

  if (!normalizedText) {
    throw new Error("Cannot generate an embedding for empty text");
  }

  const response = await ai.models.embedContent({
    model: env.geminiEmbeddingModel,
    contents: normalizedText,
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