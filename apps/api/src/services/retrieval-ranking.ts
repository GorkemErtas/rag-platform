import type { SearchResult } from "@playable-factory/shared";
import { RETRIEVAL_CONFIG } from "../config/constants.js";

export function validateSearch(query: string, limit: number): string {
  if (!query.trim()) throw new Error("Search query cannot be empty");
  if (!Number.isInteger(limit) || limit < 1 || limit > RETRIEVAL_CONFIG.maxSearchLimit) {
    throw new Error(`Search limit must be an integer between 1 and ${RETRIEVAL_CONFIG.maxSearchLimit}`);
  }
  return query.trim();
}

/** Equal-weight RRF produces an uncalibrated ranking score, not confidence. */
export function fuseRankings(rankings: SearchResult[][], limit: number): SearchResult[] {
  const fused = new Map<number, { result: SearchResult; score: number }>();
  for (const ranking of rankings) {
    const seen = new Set<number>();
    ranking.forEach((result, index) => {
      if (seen.has(result.chunkId)) return;
      seen.add(result.chunkId);
      const entry = fused.get(result.chunkId) ?? { result, score: 0 };
      entry.score += 1 / (RETRIEVAL_CONFIG.rrfK + index + 1);
      fused.set(result.chunkId, entry);
    });
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score || b.result.similarity - a.result.similarity || a.result.chunkId - b.result.chunkId)
    .slice(0, limit)
    .map(({ result, score }) => ({ ...result, relevance: score }));
}
