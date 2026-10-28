import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatResponse, SearchResult } from "@playable-factory/shared";
import type { QualityCase } from "../evaluation/quality-cases.js";
import { retrievalMetrics, generationMetrics, summarizeGeneration } from "../evaluation/quality-metrics.js";

const gold: QualityCase = {
  id: "multi", split: "held-out", category: "multi-document", question: "Compare networks", answerability: "full",
  evidence: [{ path: "a.md", passages: ["5 MB", "single HTML"] }, { path: "b.md", passages: ["2 MB"] }],
  facts: [["5 MB"], ["2 MB"]],
};
const result = (id: number, path: string, content: string): SearchResult => ({
  chunkId: id, documentId: id, documentPath: path, documentTitle: path,
  chunkIndex: 0, content, similarity: 0.6, relevance: 0.6,
});

test("multi-document recall counts every required source, not any one hit", () => {
  const rows = [result(1, "noise.md", "Unrelated"), result(2, "a.md", "5 MB single HTML"), result(3, "a.md", "Duplicate")];
  const metrics = retrievalMetrics(rows, gold, 3)!;
  assert.equal(metrics.sourceRecallAtK, 0.5);
  assert.equal(metrics.sourcePrecisionAtK, 0.5);
  assert.equal(metrics.mrrAtK, 0.5);
  assert.equal(metrics.allSourcesFound, false);
  assert.equal(metrics.supportingPassageRecallAtK, 2 / 3);
});

test("correct source with wrong passage does not count as complete supporting evidence", () => {
  const metrics = retrievalMetrics([result(1, "a.md", "Unrelated section"), result(2, "b.md", "2 MB")], gold, 2)!;
  assert.equal(metrics.sourceRecallAtK, 1);
  assert.equal(metrics.supportingPassageRecallAtK, 1 / 3);
  assert.equal(metrics.mrrAtK, 0.5);
});

test("out-of-corpus retrieval is not reported as a correct abstention", () => {
  assert.equal(retrievalMetrics([result(1, "a.md", "5 MB")], { ...gold, answerability: "none", evidence: [], facts: [] }, 5), null);
});

test("answer evaluation requires all supporting documents and valid citation provenance", () => {
  const retrieved = [result(1, "a.md", "5 MB single HTML"), result(2, "b.md", "2 MB")];
  const response: ChatResponse = {
    answered: true, answer: "5 MB [Source chunk-1]", sources: [{ sourceId: "chunk-1", path: "a.md", title: "A", chunkIndex: 0, similarity: 0.6, relevance: 0.6, quotes: ["5 MB"] }],
  };
  const metrics = generationMetrics(response, retrieved, gold);
  assert.equal(metrics.expectedFactCoverageProxy, 0.5);
  assert.equal(metrics.allExpectedSourcesCited, false);
  assert.equal(metrics.citationValidity, true);
  assert.equal(metrics.quoteProvenance, true);
  assert.equal(metrics.semanticFaithfulness, null);
  assert.equal(generationMetrics({ ...response, answer: "5 MB [Source chunk-9]" }, retrieved, gold).citationValidity, false);
  assert.equal(generationMetrics({ ...response, sources: [{ ...response.sources[0], quotes: ["50 MB"] }] }, retrieved, gold).quoteProvenance, false);
});

test("abstention precision/recall distinguish both failure directions", () => {
  const abstain: ChatResponse = { answered: false, answer: "Insufficient evidence", sources: [] };
  const answer: ChatResponse = { answered: true, answer: "Unsupported answer", sources: [] };
  const negative: QualityCase = { ...gold, answerability: "none", evidence: [], facts: [] };
  const summary = summarizeGeneration([
    generationMetrics(abstain, [], negative), // correct abstention
    generationMetrics(abstain, [], gold), // answerable question incorrectly rejected
    generationMetrics(answer, [], negative), // unsupported answer
  ]);
  assert.equal(summary.abstentionPrecision, 0.5);
  assert.equal(summary.abstentionRecall, 0.5);
  assert.equal(summary.falsePositiveAbstentions, 1);
  assert.equal(summary.falseNegativeAbstentions, 1);
  assert.equal(summary.factualCorrectness, null);
});
