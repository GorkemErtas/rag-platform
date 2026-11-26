import type { ChatResponse } from "@playable-factory/shared";
import type { Pool } from "pg";
import { env } from "../config/env.js";
import { EMBEDDING_CONFIG, RAG_CONFIG, RETRIEVAL_CONFIG } from "../config/constants.js";
import { TtlCache } from "../utils/ttl-cache.js";
import { DEMO_PATHS } from "./demo-service.js";
import { createChecksum, indexingFingerprint } from "./indexing-profile.js";

const maxBytes = 2 * 1024 * 1024;
export const queryEmbeddings = new TtlCache<number[]>({
  maxEntries: env.embeddingCacheMaxEntries, ttlMs: env.embeddingCacheTtlMs, maxBytes,
});
export const ragResponses = new TtlCache<ChatResponse>({
  maxEntries: env.ragCacheMaxEntries, ttlMs: env.ragCacheTtlMs, maxBytes,
});
let activeNamespace: string | undefined;

export function invalidateQueryCaches(): void {
  queryEmbeddings.clear();
  ragResponses.clear();
  activeNamespace = undefined;
}

export function cacheNamespaceForRevision(revision: string): string {
  return createChecksum(JSON.stringify({
    revision, database: createChecksum(env.databaseUrl ?? ""), corpus: env.corpusPath,
    demo: env.demoMode, embeddingModel: env.geminiEmbeddingModel, chatModel: env.geminiChatModel,
    embeddingProfile: indexingFingerprint(env.geminiEmbeddingModel), dimensions: EMBEDDING_CONFIG.dimensions,
    retrievalMode: env.retrievalMode, retrieval: RETRIEVAL_CONFIG, context: RAG_CONFIG,
    generation: "grounded-json-v1", maxOutputTokens: env.demoMode ? 1024 : null,
  }));
}

// Read published metadata on demand so CLI/other-process ingestion is observed.
// indexDocument atomically updates checksum, fingerprint and indexed_at with chunks.
// No revision polling, new schema, or scan of embedding/content payloads is needed.
export async function readIndexRevision(database?: Pool): Promise<string> {
  const pool = database ?? (await import("../db/index.js")).pool;
  const result = await pool.query<{ revision: string }>(`
    select coalesce(jsonb_agg(jsonb_build_array(
      id, path, title, status, checksum, indexing_fingerprint, embedding_model,
      embedding_dimensions, indexed_at
    ) order by id)::text, '[]') as revision
    from documents where ($1::boolean = false or path = any($2::text[]))`, [env.demoMode, DEMO_PATHS]);
  return result.rows[0].revision;
}

export async function getQueryCacheNamespace(readRevision = readIndexRevision): Promise<string> {
  const namespace = cacheNamespaceForRevision(await readRevision());
  if (activeNamespace !== namespace) {
    invalidateQueryCaches();
    activeNamespace = namespace;
  }
  return namespace;
}

export function queryCacheKey(namespace: string, question: string): string {
  // Preserve spelling/case/interior whitespace and never put raw queries in keys/logs.
  return createChecksum(JSON.stringify([namespace, question.trim()]));
}
