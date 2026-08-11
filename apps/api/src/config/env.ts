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
    process.env.GEMINI_CHAT_MODEL ?? "gemini-3.6-flash",

  corpusPath: path.resolve(
    rootDir,
    process.env.CORPUS_PATH ?? "corpus",
  ),

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  mcpServiceToken: process.env.MCP_SERVICE_TOKEN,
  corsOrigin:
  process.env.CORS_ORIGIN ?? "http://localhost:3000",
};