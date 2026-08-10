import { Ollama } from "ollama";
import { env } from "../config/env.js";

const ollama = new Ollama({
  host: env.ollamaBaseUrl,
});

export async function generateEmbedding(
  text: string,
): Promise<number[]> {
  if (!text.trim()) {
    throw new Error("Cannot generate an embedding for empty text");
  }

  const response = await ollama.embed({
    model: env.ollamaEmbeddingModel,
    input: text,
  });

  const embedding = response.embeddings[0];

  if (!embedding) {
    throw new Error("Ollama returned no embedding");
  }

  return embedding;
}