import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkDocument } from "../services/chunking-service.js";
import { createChecksum, indexingFingerprint, isIndexCurrent } from "../services/indexing-profile.js";
import { normalizeEmbedding } from "../services/embedding-service.js";
import { qualityCases } from "../evaluation/quality-cases.js";
import { loadCorpus } from "../services/corpus-service.js";
import { env } from "../config/env.js";

test("short documents retain their complete evidence and line boundaries", () => {
  assert.deepEqual(chunkDocument("# Title\r\n\r\nFirst fact.\r\nSecond fact."), [
    { index: 0, content: "# Title\n\nFirst fact.\nSecond fact." },
  ]);
  assert.deepEqual(chunkDocument(" \n "), []);
});

test("zero overlap never duplicates the previous chunk (slice(-0) regression)", () => {
  const paragraphs = ["alpha ".repeat(8).trim(), "beta ".repeat(10).trim(), "gamma ".repeat(8).trim()];
  const chunks = chunkDocument(paragraphs.join("\n\n"), 60, 0);
  assert.deepEqual(chunks.map((chunk) => chunk.content), paragraphs);
  assert.deepEqual(chunks.map((chunk) => chunk.index), [0, 1, 2]);
});

test("long blocks split on word/line boundaries, without oversized chunks or lost words", () => {
  const text = Array.from({ length: 100 }, (_, i) => `identifier_${i}`).join(" ");
  const chunks = chunkDocument(text, 100, 0);
  assert.ok(chunks.every((chunk) => chunk.content.length > 0 && chunk.content.length <= 100));
  assert.equal(chunks.map((chunk) => chunk.content).join(" "), text);
  assert.ok(chunkDocument("x".repeat(310), 100).every((chunk) => chunk.content.length <= 100));
});

test("headings stay attached to their following paragraph when possible", () => {
  const chunks = chunkDocument(`${"intro ".repeat(9).trim()}\n\n## Fix\n\nUse the dedicated audio pass.`, 65);
  assert.equal(chunks[1].content, "## Fix\n\nUse the dedicated audio pass.");
});

test("invalid chunking options cannot hang ingestion", () => {
  for (const [size, overlap] of [[0, 0], [10, -1], [10, 10], [2.5, 0], [10, NaN]]) {
    assert.throws(() => chunkDocument("text", size, overlap));
  }
});

test("only a successful index with identical content and configuration may be reused", () => {
  const checksum = createChecksum("facts");
  const fingerprint = indexingFingerprint("model-a");
  const previous = { status: "INDEXED", checksum, indexingFingerprint: fingerprint };
  assert.equal(isIndexCurrent(previous, checksum, fingerprint), true);
  assert.equal(isIndexCurrent(previous, createChecksum("changed"), fingerprint), false);
  assert.equal(isIndexCurrent(previous, checksum, indexingFingerprint("model-b")), false);
  assert.equal(isIndexCurrent({ ...previous, indexingFingerprint: null }, checksum, fingerprint), false);
  assert.equal(isIndexCurrent({ ...previous, status: "FAILED" }, checksum, fingerprint), false);
});

test("768-dimensional normalization rejects invalid vectors instead of storing NaN", () => {
  assert.deepEqual(normalizeEmbedding([3, 4]), [0.6, 0.8]);
  for (const vector of [[], [0, 0], [NaN], [Infinity], [Number.MAX_VALUE]]) {
    assert.throws(() => normalizeEmbedding(vector));
  }
});

test("all gold evidence passages exist in the actual corpus", async () => {
  const corpus = new Map((await loadCorpus(env.corpusPath)).map((document) => [document.path, document.content]));
  const ids = new Set<string>();
  for (const item of qualityCases) {
    assert.ok(!ids.has(item.id), `Duplicate case ${item.id}`);
    ids.add(item.id);
    assert.equal(item.answerability === "none", item.evidence.length === 0, item.id);
    for (const evidence of item.evidence) {
      const document = corpus.get(evidence.path);
      assert.ok(document, `${item.id}: missing ${evidence.path}`);
      for (const passage of evidence.passages) assert.ok(document.includes(passage), `${item.id}: missing passage ${passage}`);
    }
  }
});
