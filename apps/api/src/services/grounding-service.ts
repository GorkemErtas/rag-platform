import type { ChatResponse, ChatSource, SearchResult } from "@playable-factory/shared";
import { RAG_CONFIG } from "../config/constants.js";

export interface EvidenceSource {
  sourceId: string;
  result: SearchResult;
}

export function noAnswerResponse(): ChatResponse {
  return { answered: false, answer: "I couldn't find enough information in the provided corpus to answer that question.", sources: [] };
}

export function normalizePassage(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function buildEvidenceContext(results: SearchResult[]): EvidenceSource[] {
  const sources: EvidenceSource[] = [];
  const seen = new Set<string>();
  let characters = 0;
  for (const result of results) {
    const content = normalizePassage(result.content);
    if (!content || seen.has(content)) continue;
    if (sources.length >= RAG_CONFIG.maxContextChunks) break;
    if (characters + result.content.length > RAG_CONFIG.maxContextCharacters) continue;
    seen.add(content);
    sources.push({ sourceId: `chunk-${result.chunkId}`, result });
    characters += result.content.length;
  }
  return sources;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks citation existence and quote provenance, not semantic entailment. */
export function parseGroundedAnswer(raw: string, sources: EvidenceSource[]): {
  response: ChatResponse;
  validation: "valid" | "insufficient-evidence" | "invalid-grounding";
} {
  const invalid = () => ({ response: noAnswerResponse(), validation: "invalid-grounding" as const });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return invalid(); }
  if (!record(body) || typeof body.answered !== "boolean" || !Array.isArray(body.claims) ||
      typeof body.missingInformation !== "string") return invalid();
  if (!body.answered) {
    if (body.claims.length !== 0) return invalid();
    return { response: noAnswerResponse(), validation: "insufficient-evidence" };
  }
  if (!body.claims.length || body.claims.length > 30 || body.missingInformation.length > 2000) return invalid();
  const available = new Map(sources.map((source) => [source.sourceId, source.result]));
  const cited = new Map<string, ChatSource>();
  const lines: string[] = [];
  for (const claim of body.claims) {
    if (!record(claim) || typeof claim.text !== "string" || !claim.text.trim() ||
        claim.text.length > 4000 || /\[Source\b/i.test(claim.text) ||
        !Array.isArray(claim.citations) || !claim.citations.length) return invalid();
    const claimSources = new Set<string>();
    for (const citation of claim.citations) {
      if (!record(citation) || typeof citation.sourceId !== "string" || typeof citation.quote !== "string") return invalid();
      const result = available.get(citation.sourceId);
      const quote = normalizePassage(citation.quote);
      if (!result || !quote || !normalizePassage(result.content).includes(quote)) return invalid();
      const source: ChatSource = cited.get(citation.sourceId) ?? {
        sourceId: citation.sourceId, path: result.documentPath, title: result.documentTitle,
        chunkIndex: result.chunkIndex, similarity: result.similarity, relevance: result.relevance, quotes: [],
      };
      if (!source.quotes!.includes(citation.quote)) source.quotes!.push(citation.quote);
      cited.set(citation.sourceId, source);
      claimSources.add(citation.sourceId);
    }
    lines.push(`${claim.text.trim()} ${[...claimSources].map((id) => `[Source ${id}]`).join(" ")}`);
  }
  const missing = body.missingInformation.trim();
  if (missing) lines.push(`Not established by the retrieved sources: ${missing}`);
  return {
    response: { answered: true, answer: lines.join("\n\n"), sources: [...cited.values()], ...(missing ? { missingInformation: missing } : {}) },
    validation: "valid",
  };
}
