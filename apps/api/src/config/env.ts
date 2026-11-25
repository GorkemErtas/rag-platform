import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RETRIEVAL_CONFIG, type RetrievalMode } from "./constants.js";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
// Production uses service variables only; never load a developer's root secrets.
if (process.env.NODE_ENV !== "production") config({ path: path.join(rootDir, ".env"), quiet: true });

function integer(name: string, fallback: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`);
  return value;
}

if (process.env.DEMO_MODE && !["true", "false"].includes(process.env.DEMO_MODE)) {
  throw new Error("DEMO_MODE must be true or false");
}
if (process.env.TRUST_PROXY_HOPS && !["0", "1"].includes(process.env.TRUST_PROXY_HOPS)) {
  throw new Error("TRUST_PROXY_HOPS must be 0 or 1");
}

const retrievalMode = process.env.RETRIEVAL_MODE ?? RETRIEVAL_CONFIG.defaultMode;
if (!["dense", "hybrid", "rrf"].includes(retrievalMode)) {
  throw new Error("RETRIEVAL_MODE must be dense, hybrid or rrf");
}

export const env = {
  production: process.env.NODE_ENV === "production",
  demoMode: process.env.DEMO_MODE === "true",
  databaseUrl: process.env.DATABASE_URL,
  demoDatabaseName: process.env.DEMO_DATABASE_NAME,
  retrievalMode: retrievalMode as RetrievalMode,
  port: integer("PORT", 4000, 65535),

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
  trustProxyHops: process.env.TRUST_PROXY_HOPS === "1" ? 1 : 0,
  demoDailyCallLimit: integer("DEMO_DAILY_GEMINI_CALL_LIMIT", 100, 1000),
  demoMinuteCallLimit: integer("DEMO_MINUTE_GEMINI_CALL_LIMIT", 10, 30),
};

export function validateServerEnvironment(): void {
  if (!env.jwtSecret || Buffer.byteLength(env.jwtSecret) < 32) throw new Error("JWT_SECRET must contain at least 32 bytes");
  if (!env.databaseUrl) throw new Error("DATABASE_URL is required");
  if (env.production) {
    const origin = new URL(env.corsOrigin);
    if (origin.protocol !== "https:" || origin.origin !== env.corsOrigin || origin.username || origin.password) {
      throw new Error("CORS_ORIGIN must be the exact HTTPS frontend origin");
    }
    if (!process.env.CORPUS_PATH) throw new Error("Production requires explicit CORPUS_PATH");
    if (!env.geminiApiKey) throw new Error("GEMINI_API_KEY is required");
    if (env.mcpServiceToken && env.mcpServiceToken.length < 32) throw new Error("MCP_SERVICE_TOKEN must contain at least 32 characters");
  }
  validateDemoEnvironment();
}

export function validateDemoEnvironment(): void {
  if (!env.demoMode) return;
  if (!env.demoDatabaseName || !env.databaseUrl ||
      decodeURIComponent(new URL(env.databaseUrl).pathname.slice(1)) !== env.demoDatabaseName) {
    throw new Error("Demo requires an explicit DEMO_DATABASE_NAME matching a dedicated DATABASE_URL");
  }
  if (env.corpusPath !== path.join(rootDir, "demo-corpus")) {
    throw new Error("Demo CORPUS_PATH must be demo-corpus");
  }
}
