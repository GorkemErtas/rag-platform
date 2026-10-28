import type { ChatResponse, ChatSource, SearchResult } from "@playable-factory/shared";
import { RAG_CONFIG } from "../config/constants.js";

export interface EvidencePassage {
  passageId: string;
  sourceId: string;
  content: string;
}

export interface EvidenceSource {
  sourceId: string;
  result: SearchResult;
  passages: EvidencePassage[];
}

export type GroundingFailureReason =
  | "invalid-json" | "invalid-response-shape" | "inconsistent-answer"
  | "invalid-claim" | "missing-citations" | "unknown-passage"
  | "invalid-citation" | "unknown-source" | "quote-not-found"
  | "citation-in-missing-information";

export function noAnswerResponse(
  reason: NonNullable<ChatResponse["reason"]> = "insufficient-evidence",
): ChatResponse {
  const messages = {
    "insufficient-evidence": "I couldn't find enough information in the retrieved sources to answer that question.",
    "index-not-ready": "No searchable documents are available. Index the corpus and try again.",
    "context-unavailable": "The retrieved documents could not be prepared for this answer. Please try again.",
    "invalid-generation": "I couldn't verify the generated answer against the retrieved sources. Please try again.",
  };
  return {
    answered: false, answer: messages[reason], sources: [], reason,
    status: reason === "insufficient-evidence" ? "unanswered" : "error",
  };
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
    const sourceId = `chunk-${result.chunkId}`;
    const passages = result.content.replace(/\r\n/g, "\n").split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim()).filter(Boolean)
      .map((paragraph, index) => ({ sourceId, passageId: `${sourceId}:p${index + 1}`, content: paragraph }));
    sources.push({ sourceId, result, passages });
    characters += result.content.length;
  }
  return sources;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolve server-issued passage IDs into actual quotations. The model selects
 * evidence instead of copying it, avoiding false rejections from quote spelling.
 * Legacy sourceId/quote responses remain accepted only after exact provenance
 * checks, so existing saved responses can still be inspected.
 * Neither protocol by itself proves semantic entailment.
 */
export function parseGroundedAnswer(raw: string, sources: EvidenceSource[]): {
  response: ChatResponse;
  validation: "valid" | "insufficient-evidence" | "invalid-grounding";
  validationReason?: GroundingFailureReason;
} {
  const invalid = (validationReason: GroundingFailureReason) => ({
    response: noAnswerResponse("invalid-generation"), validation: "invalid-grounding" as const, validationReason,
  });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return invalid("invalid-json"); }
  if (!record(body) || typeof body.answered !== "boolean" || !Array.isArray(body.claims) ||
      typeof body.missingInformation !== "string") return invalid("invalid-response-shape");
  if (!body.answered) {
    if (body.claims.length !== 0) return invalid("inconsistent-answer");
    return { response: noAnswerResponse(), validation: "insufficient-evidence" };
  }
  if (!body.claims.length || body.claims.length > 30 || body.missingInformation.length > 2000) {
    return invalid("invalid-response-shape");
  }
  const available = new Map(sources.map((source) => [source.sourceId, source.result]));
  const passages = new Map(sources.flatMap((source) => source.passages).map((passage) => [passage.passageId, passage]));
  const cited = new Map<string, ChatSource>();
  const lines: string[] = [];
  for (const claim of body.claims) {
    if (!record(claim) || typeof claim.text !== "string" || !claim.text.trim() ||
        claim.text.length > 4000 || /\[Source\b/i.test(claim.text)) return invalid("invalid-claim");
    const references: { sourceId: string; quote: string }[] = [];
    if (Array.isArray(claim.citationIds) && claim.citationIds.length > 0) {
      if (claim.citations !== undefined) return invalid("invalid-citation");
      for (const id of claim.citationIds) {
        if (typeof id !== "string") return invalid("invalid-citation");
        const passage = passages.get(id);
        if (!passage) return invalid("unknown-passage");
        references.push({ sourceId: passage.sourceId, quote: passage.content });
      }
    } else if (Array.isArray(claim.citations) && claim.citations.length > 0 && claim.citationIds === undefined) {
      for (const citation of claim.citations) {
        if (!record(citation) || typeof citation.sourceId !== "string" || typeof citation.quote !== "string") return invalid("invalid-citation");
        const result = available.get(citation.sourceId);
        if (!result) return invalid("unknown-source");
        const quote = normalizePassage(citation.quote);
        if (!quote || !normalizePassage(result.content).includes(quote)) return invalid("quote-not-found");
        references.push({ sourceId: citation.sourceId, quote: citation.quote });
      }
    } else {
      return invalid("missing-citations");
    }
    const claimSources = new Set<string>();
    for (const citation of references) {
      const result = available.get(citation.sourceId);
      if (!result) return invalid("unknown-source");
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
  if (/\[Source\b/i.test(missing)) return invalid("citation-in-missing-information");
  if (missing) lines.push(`Not established by the retrieved sources: ${missing}`);
  return {
    response: {
      answered: true, status: missing ? "partial" : "answered", answer: lines.join("\n\n"),
      sources: [...cited.values()], ...(missing ? { missingInformation: missing } : {}),
    },
    validation: "valid",
  };
}
