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

  geminiApiKey: process.env.GEMINI_API_KEY,

  geminiEmbeddingModel:
    process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",

  geminiChatModel:
    process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash",

  corpusPath: path.resolve(
    rootDir,
    process.env.CORPUS_PATH ?? "corpus",
  ),
};