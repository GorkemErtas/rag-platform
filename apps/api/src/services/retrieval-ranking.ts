import type { SearchResult } from "@playable-factory/shared";
import { RETRIEVAL_CONFIG } from "../config/constants.js";

export function validateSearch(query: string, limit: number): string {
  if (!query.trim() || query.trim().length > 2000) throw new Error("Search query must contain 1 to 2000 characters");
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

/**
 * Alternate candidate lists, preserving each list's order and emitting chunks
 * only once. This protects lexical-only evidence from a crowd of dense hits
 * that repeat the same boilerplate. There are no document-name/intent boosts.
 */
export function balanceRankings(dense: SearchResult[], lexical: SearchResult[], limit: number): SearchResult[] {
  const denseRanks = new Map(dense.map((result, index) => [result.chunkId, index + 1]));
  const lexicalRanks = new Map(lexical.map((result, index) => [result.chunkId, index + 1]));
  const emitted = new Set<number>();
  const results: SearchResult[] = [];
  const queues = [dense, lexical];
  const positions = [0, 0];
  while (results.length < limit) {
    let added = false;
    for (const [lane, ranking] of queues.entries()) {
      while (positions[lane] < ranking.length && emitted.has(ranking[positions[lane]].chunkId)) positions[lane] += 1;
      const result = ranking[positions[lane]];
      if (!result) continue;
      positions[lane] += 1;
      emitted.add(result.chunkId);
      results.push({
        ...result, relevance: result.similarity, retrievalMethod: "hybrid",
        denseRank: denseRanks.get(result.chunkId), lexicalRank: lexicalRanks.get(result.chunkId),
      });
      added = true;
      if (results.length === limit) break;
    }
    if (!added) break;
  }
  return results;
}
