import type { SearchResult } from "@playable-factory/shared";
import { and, asc, cosineDistance, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { documentChunks, documents } from "../db/schema.js";
import { env } from "../config/env.js";
import { EMBEDDING_CONFIG, RETRIEVAL_CONFIG, type RetrievalMode } from "../config/constants.js";
import { generateEmbedding } from "./embedding-service.js";
import { balanceRankings, fuseRankings, validateSearch } from "./retrieval-ranking.js";

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
  return rows.map((row, index) => ({ ...row, similarity: Number(row.similarity), relevance: Number(row.similarity), retrievalMethod: "dense" as const, denseRank: index + 1 }));
}

async function lexicalCandidates(query: string, embedding: number[], limit: number): Promise<SearchResult[]> {
  // The passage is the evidence. Repeated filename/path metadata is not a vote.
  const passage = sql`to_tsvector('english', ${documentChunks.content})`;
  // Natural questions contain verbs/qualifiers absent from their answers.
  // AND-ing every word made the old lexical branch return no candidates.
  // PostgreSQL normalizes/stems terms; quote_literal safely builds OR syntax.
  const queryLexemes = sql`tsvector_to_array(to_tsvector('english', ${query}))`;
  const terms = sql`coalesce((
    select string_agg(quote_literal(term), ' | ')
    from unnest(${queryLexemes}) as query_terms(term)
  ), '')::tsquery`;
  const coverage = sql<number>`(
    select count(*) from unnest(${queryLexemes}) as query_terms(term)
    where ${passage} @@ quote_literal(term)::tsquery
  )`;
  const rank = sql`ts_rank_cd(${passage}, ${terms}, 2)`;
  const rows = await db.select({
    chunkId: documentChunks.id, documentId: documents.id,
    documentPath: documents.path, documentTitle: documents.title,
    chunkIndex: documentChunks.chunkIndex, content: documentChunks.content,
    similarity: sql<number>`1 - (${cosineDistance(documentChunks.embedding, embedding)})`,
  }).from(documentChunks).innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(and(compatibleIndex, sql`${passage} @@ ${terms}`))
    .orderBy(desc(coverage), desc(rank), asc(documentChunks.id)).limit(limit);
  return rows.map((row) => ({ ...row, similarity: Number(row.similarity), relevance: Number(row.similarity) }));
}

/** Allows dense/hybrid comparison with the exact same single query embedding. */
export async function retrieveWithEmbedding(
  query: string,
  embedding: number[],
  limit: number,
  mode: RetrievalMode = "dense",
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
  return mode === "rrf"
    ? fuseRankings([dense, lexical], limit).map((result) => ({ ...result, retrievalMethod: "rrf" as const }))
    : balanceRankings(dense, lexical, limit);
}

export async function searchDocumentsDense(
  query: string,
  limit: number = RETRIEVAL_CONFIG.defaultTopK,
): Promise<SearchResult[]> {
  const normalized = validateSearch(query, limit);
  const embedding = await generateEmbedding(normalized, { type: "query" });
  return retrieveWithEmbedding(normalized, embedding, limit, "dense");
}

/** Balanced dense/lexical retrieval with one shared query embedding. */
export async function searchDocumentsHybrid(
  query: string,
  limit: number = RETRIEVAL_CONFIG.defaultTopK,
): Promise<SearchResult[]> {
  const normalized = validateSearch(query, limit);
  const embedding = await generateEmbedding(normalized, { type: "query" });
  return retrieveWithEmbedding(normalized, embedding, limit, "hybrid");
}

// Chat, HTTP search and MCP use the same configured strategy.
export async function searchDocuments(
  query: string,
  limit: number = RETRIEVAL_CONFIG.defaultTopK,
): Promise<SearchResult[]> {
  const normalized = validateSearch(query, limit);
  const embedding = await generateEmbedding(normalized, { type: "query" });
  return retrieveWithEmbedding(normalized, embedding, limit, env.retrievalMode);
}
