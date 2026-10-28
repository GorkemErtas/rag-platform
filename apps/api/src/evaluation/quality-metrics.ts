import type { ChatResponse, SearchResult } from "@playable-factory/shared";
import type { QualityCase } from "./quality-cases.js";
import { normalizePassage } from "../services/grounding-service.js";

const ratio = (a: number, b: number): number | null => b ? a / b : null;

export function retrievalMetrics(results: SearchResult[], gold: QualityCase, k: number) {
  const top = results.slice(0, k);
  const expectedPaths = new Set(gold.evidence.map((evidence) => evidence.path));
  if (!expectedPaths.size) return null; // Retrieval cannot establish abstention.
  const actualPaths = new Set(top.map((result) => result.documentPath));
  const hits = [...expectedPaths].filter((path) => actualPaths.has(path)).length;
  const firstRelevant = top.findIndex((result) => gold.evidence.some((evidence) =>
    result.documentPath === evidence.path && evidence.passages.some((passage) => normalizePassage(result.content).includes(normalizePassage(passage)))));
  const passages = gold.evidence.flatMap((evidence) => evidence.passages.map((text) => ({ path: evidence.path, text })));
  const passageHits = passages.filter((passage) => top.some((result) =>
    result.documentPath === passage.path && normalizePassage(result.content).includes(normalizePassage(passage.text)))).length;
  return {
    sourceRecallAtK: hits / expectedPaths.size,
    sourcePrecisionAtK: actualPaths.size ? hits / actualPaths.size : 0,
    mrrAtK: firstRelevant < 0 ? 0 : 1 / (firstRelevant + 1),
    correctTopSource: top[0] ? expectedPaths.has(top[0].documentPath) : false,
    allSourcesFound: hits === expectedPaths.size,
    supportingPassageRecallAtK: passageHits / passages.length,
  };
}

export function generationMetrics(response: ChatResponse, retrieved: SearchResult[], gold: QualityCase) {
  const shouldAnswer = gold.answerability !== "none";
  const systemFailure = response.status === "error" || ["invalid-generation", "index-not-ready", "context-unavailable"].includes(response.reason ?? "");
  const partialAnswer = response.status === "partial" || Boolean(response.missingInformation);
  const normalizedAnswer = normalizePassage(response.answer).toLowerCase();
  const matchedFacts = response.answered ? gold.facts.filter((group) => group.some((phrase) => normalizedAnswer.includes(phrase.toLowerCase()))).length : 0;
  const returned = new Map(response.sources.map((source) => [source.sourceId, source]));
  const available = new Map(retrieved.map((result) => [`chunk-${result.chunkId}`, result]));
  const inlineIds = [...response.answer.matchAll(/\[Source ([^\]]+)\]/g)].map((match) => match[1]);
  const citationValidity = response.answered ? inlineIds.length > 0 && inlineIds.every((id) => returned.has(id)) &&
    response.sources.every((source) => source.sourceId && inlineIds.includes(source.sourceId) && available.has(source.sourceId)) : null;
  const quoteProvenance = response.answered ? response.sources.length > 0 && response.sources.every((source) => {
    const result = source.sourceId ? available.get(source.sourceId) : undefined;
    return result && result.documentPath === source.path && source.quotes?.length && source.quotes.every((quote) =>
      normalizePassage(quote).length > 0 && normalizePassage(result.content).includes(normalizePassage(quote)));
  }) : null;
  const citedPaths = new Set(response.sources.map((source) => source.path));
  const allExpectedSourcesCited = shouldAnswer ? gold.evidence.every((evidence) => citedPaths.has(evidence.path)) : null;
  const forbiddenDetailsFound = (gold.forbidden ?? []).filter((phrase) => normalizedAnswer.includes(phrase.toLowerCase()));
  return {
    answerabilityCorrect: !systemFailure && response.answered === shouldAnswer,
    answerStatus: systemFailure ? "error" : partialAnswer ? "partial" : response.answered ? "answered" : "unanswered",
    systemFailure,
    requiresAbstention: !shouldAnswer,
    expectedFactCoverageProxy: ratio(matchedFacts, gold.facts.length),
    allExpectedSourcesCited,
    completeAnswerProxy: gold.answerability === "full"
      ? response.answered && !systemFailure && !partialAnswer && matchedFacts === gold.facts.length &&
        allExpectedSourcesCited === true && citationValidity === true && quoteProvenance === true && forbiddenDetailsFound.length === 0
      : null,
    partialAnswerToFullQuestion: gold.answerability === "full" && response.answered && partialAnswer,
    citationValidity,
    quoteProvenance,
    partialLimitationExplicit: gold.answerability === "partial" ? Boolean(response.missingInformation) : null,
    forbiddenDetailsFound,
    correctAbstention: !shouldAnswer && !response.answered && !systemFailure,
    falsePositiveAbstention: shouldAnswer && !response.answered && !systemFailure,
    falseNegativeAbstention: !shouldAnswer && response.answered,
    // Matching a quote proves provenance, not that the claim follows from it.
    factualCorrectness: null,
    semanticFaithfulness: null,
    humanReviewRequired: response.answered,
  };
}

export function summarizeGeneration(rows: ReturnType<typeof generationMetrics>[]) {
  const correct = rows.filter((row) => row.correctAbstention).length;
  const falsePositive = rows.filter((row) => row.falsePositiveAbstention).length;
  const falseNegative = rows.filter((row) => row.falseNegativeAbstention).length;
  const mean = (values: (number | null)[]) => {
    const present = values.filter((value): value is number => value !== null);
    return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
  };
  return {
    cases: rows.length,
    answerabilityAccuracy: mean(rows.map((row) => Number(row.answerabilityCorrect))),
    expectedFactCoverageProxy: mean(rows.map((row) => row.expectedFactCoverageProxy)),
    completeAnswerRateProxy: mean(rows.map((row) => row.completeAnswerProxy === null ? null : Number(row.completeAnswerProxy))),
    partialAnswersToFullQuestions: rows.filter((row) => row.partialAnswerToFullQuestion).length,
    systemFailures: rows.filter((row) => row.systemFailure).length,
    citationValidity: mean(rows.map((row) => row.citationValidity === null ? null : Number(row.citationValidity))),
    quoteProvenance: mean(rows.map((row) => row.quoteProvenance === null ? null : Number(row.quoteProvenance))),
    abstentionPrecision: ratio(correct, correct + falsePositive),
    abstentionRecall: ratio(correct, rows.filter((row) => row.requiresAbstention).length),
    falsePositiveAbstentions: falsePositive,
    falseNegativeAbstentions: falseNegative,
    factualCorrectness: null,
    semanticFaithfulness: null,
  };
}
