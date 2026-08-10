import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";

if (!env.geminiApiKey) {
  throw new Error("GEMINI_API_KEY is not defined");
}

const ai = new GoogleGenAI({
  apiKey: env.geminiApiKey,
});

export async function generateEmbedding(
  text: string,
): Promise<number[]> {
  if (!text.trim()) {
    throw new Error("Cannot generate an embedding for empty text");
  }

  const response = await ai.models.embedContent({
    model: env.geminiEmbeddingModel,
    contents: text,
    config: {
      outputDimensionality: 768,
    },
  });

  const embedding = response.embeddings?.[0]?.values;

  if (!embedding || embedding.length === 0) {
    throw new Error("Gemini returned no embedding");
  }

  if (embedding.length !== 768) {
    throw new Error(
      `Unexpected embedding dimension: ${embedding.length}`,
    );
  }

  return embedding;
}