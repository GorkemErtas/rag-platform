import assert from "node:assert/strict";
import { test } from "node:test";
import type { SearchResult } from "@playable-factory/shared";
import { buildEvidenceContext, parseGroundedAnswer } from "../services/grounding-service.js";
import { fuseRankings, validateSearch } from "../services/retrieval-ranking.js";

const passage = (id: number, content = "Maximum file size: 5 MB for the final single HTML file.", similarity = 0.58): SearchResult => ({
  chunkId: id, documentId: id, documentPath: `doc-${id}.md`, documentTitle: `Document ${id}`,
  chunkIndex: 0, content, similarity, relevance: similarity,
});
const claim = (sourceId = "chunk-1", quote = "Maximum file size: 5 MB", text = "The final file is limited to 5 MB.") => ({
  text, citations: [{ sourceId, quote }],
});
const json = (claims: unknown[], answered = true, missingInformation = "") => JSON.stringify({ answered, claims, missingInformation });

test("moderate cosine does not exclude valid quoted evidence", () => {
  const context = buildEvidenceContext([passage(1)]);
  const parsed = parseGroundedAnswer(json([claim()]), context);
  assert.equal(parsed.response.answered, true);
  assert.match(parsed.response.answer, /\[Source chunk-1\]/);
  assert.equal(parsed.response.sources[0].sourceId, "chunk-1");
});

test("high similarity alone does not make a question answerable", () => {
  const context = buildEvidenceContext([passage(1, "No salary policy is documented.", 0.99)]);
  const parsed = parseGroundedAnswer(json([], false), context);
  assert.equal(parsed.response.answered, false);
  assert.deepEqual(parsed.response.sources, []);
});

test("only actually cited chunks are returned; stable IDs survive ranking changes", () => {
  const context = buildEvidenceContext([passage(7, "Other retrieved information."), passage(1)]);
  const parsed = parseGroundedAnswer(json([claim()]), context);
  assert.deepEqual(parsed.response.sources.map((source) => source.sourceId), ["chunk-1"]);
  assert.deepEqual(parsed.response.sources[0].quotes, ["Maximum file size: 5 MB"]);
});

test("unknown sources and fabricated, empty or mismatched quotations fail closed", () => {
  const context = buildEvidenceContext([passage(1)]);
  for (const citation of [claim("chunk-99"), claim("chunk-1", "Maximum file size: 50 MB"), claim("chunk-1", "")]) {
    const parsed = parseGroundedAnswer(json([citation]), context);
    assert.equal(parsed.validation, "invalid-grounding");
    assert.equal(parsed.response.answered, false);
    assert.deepEqual(parsed.response.sources, []);
  }
});

test("malformed or uncited claims cannot become grounded answers", () => {
  const context = buildEvidenceContext([passage(1)]);
  for (const raw of ["plain text", "null", "{}", json([]), json([{ text: "5 MB", citations: [] }]),
    json([claim(), { text: "Invented fact.", citations: [] }]), json([claim("chunk-1", "5 MB", "Fake [Source chunk-99]")]),
    json([claim()], false), json([claim()], true, "Fake [Source chunk-99]")]) {
    assert.equal(parseGroundedAnswer(raw, context).response.answered, false, raw);
  }
});

test("whitespace-normalized quotes retain provenance without changing identifiers", () => {
  const context = buildEvidenceContext([passage(1, "Call LumenSDK.init(config)\n before rendering.")]);
  const valid = claim("chunk-1", "LumenSDK.init(config) before rendering.", "Initialize before rendering.");
  assert.equal(parseGroundedAnswer(json([valid]), context).response.answered, true);
  assert.equal(parseGroundedAnswer(json([claim("chunk-1", "lumensdk.init(config)")]), context).response.answered, false);
});

test("multiple documents support separate claims and missing details remain explicit", () => {
  const context = buildEvidenceContext([passage(1), passage(2, "Meta has a 2 MB limit.")]);
  const parsed = parseGroundedAnswer(json([claim(), claim("chunk-2", "Meta has a 2 MB limit.", "Meta permits 2 MB.")], true, "No penalty amount is documented."), context);
  assert.equal(parsed.response.sources.length, 2);
  assert.equal(parsed.response.missingInformation, "No penalty amount is documented.");
  assert.match(parsed.response.answer, /Not established by the retrieved sources/);
});

test("duplicate context is suppressed without discarding distinct supporting passages", () => {
  const sources = buildEvidenceContext([passage(1), passage(2), passage(3, "Second independent fact.")]);
  assert.deepEqual(sources.map((source) => source.sourceId), ["chunk-1", "chunk-3"]);
});

test("oversized context is skipped without chopping source quotations", () => {
  const sources = buildEvidenceContext([passage(1, "x".repeat(12001)), passage(2)]);
  assert.deepEqual(sources.map((source) => source.sourceId), ["chunk-2"]);
  assert.equal(sources[0].result.content, passage(2).content);
});

test("RRF retains raw scores, leaves cosine unchanged and never normalizes the winner to one", () => {
  const a = passage(1), b = passage(2, "Second", 0.7);
  const fused = fuseRankings([[a, b], [b]], 5);
  assert.equal(fused[0].chunkId, 2);
  assert.equal(fused[0].relevance, 1 / 62 + 1 / 61);
  assert.equal(fused[0].similarity, 0.7);
  assert.ok(fused[0].relevance < 0.04);
});

test("duplicates in one ranking do not create extra fusion votes", () => {
  const fused = fuseRankings([[passage(1), passage(1)]], 5);
  assert.equal(fused.length, 1);
  assert.equal(fused[0].relevance, 1 / 61);
});

test("limits reject fractional, nonfinite and out-of-range values", () => {
  for (const limit of [0, -1, 1.5, NaN, Infinity, 21]) assert.throws(() => validateSearch("query", limit));
  assert.throws(() => validateSearch("  ", 5));
  assert.equal(validateSearch("  SDK v3  ", 5), "SDK v3");
});
