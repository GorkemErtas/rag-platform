import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

const rootDir = path.resolve(currentDir, "../../../..");

config({
  path: path.join(rootDir, ".env"),
});

export const env = {
  databaseUrl: process.env.DATABASE_URL,
  port: Number(process.env.PORT ?? 4000),

  ollamaBaseUrl:
    process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",

  ollamaEmbeddingModel:
    process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma",

  ollamaChatModel:
    process.env.OLLAMA_CHAT_MODEL ?? "qwen3:4b-instruct",

  corpusPath: path.resolve(
    rootDir,
    process.env.CORPUS_PATH ?? "corpus",
  ),
};