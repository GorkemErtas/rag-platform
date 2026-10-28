import type { SearchResult } from "@playable-factory/shared";
import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  gte,
  lte,
  sql,
} from "drizzle-orm";

import { expandSearchQueries } from "./query-rewrite-service.js";

import { db } from "../db/index.js";
import {
  documentChunks,
  documents,
} from "../db/schema.js";
import { generateEmbedding } from "./embedding-service.js";
import { RETRIEVAL_CONFIG } from "../config/constants.js";

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

  if (limit < 1 || limit > RETRIEVAL_CONFIG.maxSearchLimit) {
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

  return results.map((result) => {
    const similarity = Number(result.similarity);

    return {
      ...result,
      similarity,
      relevance: similarity,
    };
  });
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

  return results.map((result) => {
    const similarity = Number(result.similarity);

    return {
      ...result,
      similarity,
      relevance: similarity,
      lexicalRank: Number(result.lexicalRank),
    };
  });
}

export async function searchDocumentsDense(
  query: string,
  limit: number = RETRIEVAL_CONFIG.defaultTopK,
): Promise<SearchResult[]> {
  const normalizedQuery = validateSearch(
    query,
    limit,
  );

  const queryEmbedding =
    await generateQueryEmbedding(normalizedQuery);

  return runDenseSearch(queryEmbedding, limit);
}

function getQueryAwareMultiplier(
  query: string,
  result: SearchResult,
): number {
  const normalizedQuery = query.toLowerCase();

  const searchableText = `
    ${result.documentTitle ?? ""}
    ${result.documentPath}
    ${result.content}
  `.toLowerCase();

  let multiplier = 1;

  // Current / latest intent
  const asksForCurrent =
    normalizedQuery.includes("current") ||
    normalizedQuery.includes("latest") ||
    normalizedQuery.includes("newest");

  if (asksForCurrent) {
    const isDeprecated =
      searchableText.includes("deprecated") ||
      searchableText.includes("legacy") ||
      searchableText.includes("do not use");

    const isCurrent =
      searchableText.includes("(current)") ||
      searchableText.includes("current sdk") ||
      searchableText.includes("current version") ||
      searchableText.includes("supersedes");

    if (isCurrent) {
      multiplier *= 1.15;
    }

    if (isDeprecated) {
      multiplier *= 0.85;
    }
  }

  // Incident / root-cause intent
  const asksForIncidentCause =
    normalizedQuery.includes("why") ||
    normalizedQuery.includes("caused") ||
    normalizedQuery.includes("cause") ||
    normalizedQuery.includes("rejected") ||
    normalizedQuery.includes("rejection") ||
    normalizedQuery.includes("incident") ||
    normalizedQuery.includes("what happened");

  if (asksForIncidentCause) {
    const isIncidentDocument =
      searchableText.includes("incident") ||
      searchableText.includes("postmortem") ||
      searchableText.includes("root cause");

    if (isIncidentDocument) {
      multiplier *= 1.15;
    }
  }

  return multiplier;
}

export async function searchDocumentsHybrid(
  query: string,
  limit: number = RETRIEVAL_CONFIG.defaultTopK,
): Promise<SearchResult[]> {
  const normalizedQuery = validateSearch(
    query,
    limit,
  );

  const queryEmbedding =
    await generateQueryEmbedding(normalizedQuery);

  const candidateLimit = Math.min(
    RETRIEVAL_CONFIG.maxCandidateCount,
    Math.max(
      limit * RETRIEVAL_CONFIG.candidateMultiplier,
      RETRIEVAL_CONFIG.minCandidateCount,
    ),
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
        RETRIEVAL_CONFIG.vectorWeight /
        (RETRIEVAL_CONFIG.rrfK + rank),
    });
  });

  lexicalResults.forEach((result, index) => {
    const rank = index + 1;

    const lexicalScore =
      RETRIEVAL_CONFIG.lexicalWeight /
      (RETRIEVAL_CONFIG.rrfK + rank);

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

    const rankedResults = [...fusedResults.values()]
  .map((entry) => ({
    ...entry,
    adjustedScore:
  entry.score *
  getQueryAwareMultiplier(
  normalizedQuery,
  entry.result,
)
  }))
  .sort((left, right) => {
    if (right.adjustedScore !== left.adjustedScore) {
      return right.adjustedScore - left.adjustedScore;
    }

    return (
      right.result.similarity -
      left.result.similarity
    );
  })
  .slice(0, limit);

const topHybridScore =
  rankedResults[0]?.adjustedScore ?? 0;

return rankedResults.map(
  ({ result, adjustedScore }) => {
  const normalizedHybridScore =
  topHybridScore > 0
    ? adjustedScore / topHybridScore
    : 0;

  const relevance =
    RETRIEVAL_CONFIG.denseRelevanceWeight *
      result.similarity +
    RETRIEVAL_CONFIG.hybridRelevanceWeight *
      normalizedHybridScore;

  return {
    ...result,
    relevance: Math.min(Math.max(relevance, 0), 1),
  };
});
}

export async function getExpandedChunkContext(
  documentId: number,
  chunkIndex: number,
  windowSize = 1,
): Promise<string> {
  const chunks = await db
    .select({
      chunkIndex: documentChunks.chunkIndex,
      content: documentChunks.content,
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.documentId, documentId),
        gte(
          documentChunks.chunkIndex,
          Math.max(0, chunkIndex - windowSize),
        ),
        lte(
          documentChunks.chunkIndex,
          chunkIndex + windowSize,
        ),
      ),
    )
    .orderBy(asc(documentChunks.chunkIndex));

  return chunks
    .map((chunk) => chunk.content)
    .join("\n\n");
}

export async function searchDocumentsMultiQuery(
  query: string,
  limit: number = RETRIEVAL_CONFIG.defaultTopK,
): Promise<SearchResult[]> {
  const normalizedQuery = validateSearch(
    query,
    limit,
  );

  const expandedQueries =
    await expandSearchQueries(normalizedQuery);

  const perQueryLimit = Math.min(
    RETRIEVAL_CONFIG.maxSearchLimit,
    Math.max(limit * 2, 10),
  );

  const resultSets = await Promise.all(
    expandedQueries.map((expandedQuery) =>
      searchDocumentsHybrid(
        expandedQuery,
        perQueryLimit,
      ),
    ),
  );

  const fusedResults = new Map<
    number,
    {
      result: SearchResult;
      score: number;
    }
  >();

  resultSets.forEach((results) => {
    results.forEach((result, index) => {
      const rank = index + 1;

      const score =
        1 /
        (RETRIEVAL_CONFIG.rrfK + rank);

      const existing =
        fusedResults.get(result.chunkId);

      if (existing) {
        existing.score += score;

        if (
          result.relevance >
          existing.result.relevance
        ) {
          existing.result = result;
        }

        return;
      }

      fusedResults.set(result.chunkId, {
        result,
        score,
      });
    });
  });

  const rankedResults = [
    ...fusedResults.values(),
  ]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return (
        right.result.relevance -
        left.result.relevance
      );
    })
    .slice(0, limit);

  const topScore =
    rankedResults[0]?.score ?? 0;

  return rankedResults.map(
    ({ result, score }) => {
      const normalizedFusionScore =
        topScore > 0
          ? score / topScore
          : 0;

      return {
        ...result,

        relevance: Math.min(
          Math.max(
            0.7 * result.relevance +
              0.3 *
                normalizedFusionScore,
            0,
          ),
          1,
        ),
      };
    },
  );
}

export async function searchDocuments(
  query: string,
  limit: number = RETRIEVAL_CONFIG.defaultTopK,
): Promise<SearchResult[]> {
  return searchDocumentsHybrid(query, limit);
}