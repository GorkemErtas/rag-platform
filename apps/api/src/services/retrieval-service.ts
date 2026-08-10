import type { SearchResult } from "@playable-factory/shared";
import {
  cosineDistance,
  desc,
  eq,
  sql,
} from "drizzle-orm";

import { db } from "../db/index.js";
import {
  documentChunks,
  documents,
} from "../db/schema.js";
import { generateEmbedding } from "./embedding-service.js";

const DEFAULT_TOP_K = 5;

export async function searchDocuments(
  query: string,
  limit = DEFAULT_TOP_K,
): Promise<SearchResult[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    throw new Error("Search query cannot be empty");
  }

  if (limit < 1 || limit > 20) {
    throw new Error("Search limit must be between 1 and 20");
  }

  const queryEmbedding = await generateEmbedding(normalizedQuery);

  const similarity = sql<number>`
    1 - (${cosineDistance(
      documentChunks.embedding,
      queryEmbedding,
    )})
  `;

  const results = await db
    .select({
      chunkId: documentChunks.id,
      documentId: documents.id,
      documentPath: documents.path,
      documentTitle: documents.title,
      chunkIndex: documentChunks.chunkIndex,
      content: documentChunks.content,
      similarity,
    })
    .from(documentChunks)
    .innerJoin(
      documents,
      eq(documentChunks.documentId, documents.id),
    )
    .where(eq(documents.status, "INDEXED"))
    .orderBy(desc(similarity))
    .limit(limit);

  return results.map((result) => ({
    ...result,
    similarity: Number(result.similarity),
  }));
}