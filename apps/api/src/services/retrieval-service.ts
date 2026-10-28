import type { SearchResult } from "@playable-factory/shared";
import { and, asc, cosineDistance, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { documentChunks, documents } from "../db/schema.js";
import { env } from "../config/env.js";
import { EMBEDDING_CONFIG, RETRIEVAL_CONFIG } from "../config/constants.js";
import { generateEmbedding } from "./embedding-service.js";
import { fuseRankings, validateSearch } from "./retrieval-ranking.js";

const compatibleIndex = and(
  eq(documents.status, "INDEXED"),
  eq(documents.embeddingModel, env.geminiEmbeddingModel),
  eq(documents.embeddingDimensions, EMBEDDING_CONFIG.dimensions),
  isNotNull(documentChunks.embedding),
);

async function denseCandidates(embedding: number[], limit: number): Promise<SearchResult[]> {
  const distance = cosineDistance(documentChunks.embedding, embedding);
  const rows = await db.select({
    chunkId: documentChunks.id, documentId: documents.id,
    documentPath: documents.path, documentTitle: documents.title,
    chunkIndex: documentChunks.chunkIndex, content: documentChunks.content,
    similarity: sql<number>`1 - (${distance})`,
  }).from(documentChunks).innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(compatibleIndex)
    .orderBy(asc(distance), asc(documentChunks.id)).limit(limit);
  return rows.map((row) => ({ ...row, similarity: Number(row.similarity), relevance: Number(row.similarity) }));
}

async function lexicalCandidates(query: string, embedding: number[], limit: number): Promise<SearchResult[]> {
  // The passage is the evidence. Repeated filename/path metadata is not a vote.
  const passage = sql`to_tsvector('english', ${documentChunks.content})`;
  const terms = sql`websearch_to_tsquery('english', ${query})`;
  const rank = sql`ts_rank_cd(${passage}, ${terms})`;
  const rows = await db.select({
    chunkId: documentChunks.id, documentId: documents.id,
    documentPath: documents.path, documentTitle: documents.title,
    chunkIndex: documentChunks.chunkIndex, content: documentChunks.content,
    similarity: sql<number>`1 - (${cosineDistance(documentChunks.embedding, embedding)})`,
  }).from(documentChunks).innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(and(compatibleIndex, sql`${passage} @@ ${terms}`))
    .orderBy(desc(rank), asc(documentChunks.id)).limit(limit);
  return rows.map((row) => ({ ...row, similarity: Number(row.similarity), relevance: Number(row.similarity) }));
}

/** Allows dense/hybrid comparison with the exact same single query embedding. */
export async function retrieveWithEmbedding(
  query: string,
  embedding: number[],
  limit: number,
  mode: "dense" | "hybrid" = "dense",
): Promise<SearchResult[]> {
  validateSearch(query, limit);
  if (embedding.length !== EMBEDDING_CONFIG.dimensions || embedding.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid query embedding");
  }
  if (mode === "dense") return denseCandidates(embedding, limit);
  const candidateLimit = Math.min(RETRIEVAL_CONFIG.maxCandidateCount, Math.max(20, limit * 4));
  const [dense, lexical] = await Promise.all([
    denseCandidates(embedding, candidateLimit),
    lexicalCandidates(query, embedding, candidateLimit),
  ]);
  return fuseRankings([dense, lexical], limit);
}

export async function searchDocumentsDense(
  query: string,
  limit: number = RETRIEVAL_CONFIG.defaultTopK,
): Promise<SearchResult[]> {
  const normalized = validateSearch(query, limit);
  const embedding = await generateEmbedding(normalized, { type: "query" });
  return retrieveWithEmbedding(normalized, embedding, limit, "dense");
}

/** Evaluation candidate only. No demonstrated live improvement means no default switch. */
export async function searchDocumentsHybrid(
  query: string,
  limit: number = RETRIEVAL_CONFIG.defaultTopK,
): Promise<SearchResult[]> {
  const normalized = validateSearch(query, limit);
  const embedding = await generateEmbedding(normalized, { type: "query" });
  return retrieveWithEmbedding(normalized, embedding, limit, "hybrid");
}

// Chat, HTTP search and MCP delegate to this authoritative retrieval entry point.
export const searchDocuments = searchDocumentsDense;
