import type { SearchResult } from "@playable-factory/shared";
import {
  and,
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

const RRF_K = 60;
const VECTOR_WEIGHT = 1;
const LEXICAL_WEIGHT = 1.2;

interface RankedSearchResult extends SearchResult {
  lexicalRank?: number;
}

function validateSearch(
  query: string,
  limit: number,
): string {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    throw new Error("Search query cannot be empty");
  }

  if (limit < 1 || limit > 20) {
    throw new Error(
      "Search limit must be between 1 and 20",
    );
  }

  return normalizedQuery;
}

async function generateQueryEmbedding(
  query: string,
): Promise<number[]> {
  return generateEmbedding(query, {
    type: "query",
  });
}

async function runDenseSearch(
  queryEmbedding: number[],
  limit: number,
): Promise<SearchResult[]> {
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

async function runLexicalSearch(
  query: string,
  queryEmbedding: number[],
  limit: number,
): Promise<RankedSearchResult[]> {
  const searchDocument = sql`
    to_tsvector(
      'english',
      coalesce(${documents.title}, '') || ' ' ||
      ${documents.path} || ' ' ||
      ${documentChunks.content}
    )
  `;

  const searchQuery = sql`
    websearch_to_tsquery('english', ${query})
  `;

  const lexicalRank = sql<number>`
    ts_rank_cd(
      ${searchDocument},
      ${searchQuery}
    )
  `;

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
      lexicalRank,
    })
    .from(documentChunks)
    .innerJoin(
      documents,
      eq(documentChunks.documentId, documents.id),
    )
    .where(
      and(
        eq(documents.status, "INDEXED"),
        sql`${searchDocument} @@ ${searchQuery}`,
      ),
    )
    .orderBy(desc(lexicalRank))
    .limit(limit);

  return results.map((result) => ({
    ...result,
    similarity: Number(result.similarity),
    lexicalRank: Number(result.lexicalRank),
  }));
}

export async function searchDocumentsDense(
  query: string,
  limit = DEFAULT_TOP_K,
): Promise<SearchResult[]> {
  const normalizedQuery = validateSearch(
    query,
    limit,
  );

  const queryEmbedding =
    await generateQueryEmbedding(normalizedQuery);

  return runDenseSearch(queryEmbedding, limit);
}

export async function searchDocumentsHybrid(
  query: string,
  limit = DEFAULT_TOP_K,
): Promise<SearchResult[]> {
  const normalizedQuery = validateSearch(
    query,
    limit,
  );

  const queryEmbedding =
    await generateQueryEmbedding(normalizedQuery);

  const candidateLimit = Math.min(
    50,
    Math.max(limit * 4, 20),
  );

  const [vectorResults, lexicalResults] =
    await Promise.all([
      runDenseSearch(
        queryEmbedding,
        candidateLimit,
      ),
      runLexicalSearch(
        normalizedQuery,
        queryEmbedding,
        candidateLimit,
      ),
    ]);

  const fusedResults = new Map<
    number,
    {
      result: SearchResult;
      score: number;
    }
  >();

  vectorResults.forEach((result, index) => {
    const rank = index + 1;

    fusedResults.set(result.chunkId, {
      result,
      score:
        VECTOR_WEIGHT /
        (RRF_K + rank),
    });
  });

  lexicalResults.forEach((result, index) => {
    const rank = index + 1;

    const lexicalScore =
      LEXICAL_WEIGHT /
      (RRF_K + rank);

    const existing =
      fusedResults.get(result.chunkId);

    if (existing) {
      existing.score += lexicalScore;
      return;
    }

    fusedResults.set(result.chunkId, {
      result,
      score: lexicalScore,
    });
  });

  return [...fusedResults.values()]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return (
        right.result.similarity -
        left.result.similarity
      );
    })
    .slice(0, limit)
    .map(({ result }) => result);
}

export async function searchDocuments(
  query: string,
  limit = DEFAULT_TOP_K,
): Promise<SearchResult[]> {
  return searchDocumentsHybrid(query, limit);
}