import assert from "node:assert/strict";
import { test } from "node:test";
import type { SearchResult } from "@playable-factory/shared";
import { env } from "../config/env.js";
import { getQueryCacheNamespace, invalidateQueryCaches } from "../services/query-cache.js";

test("embedding and grounded-answer caches avoid SDK requests without changing citation validation", async (t) => {
  env.databaseUrl = "postgresql://unused:unused@127.0.0.1:1/unused";
  env.geminiApiKey = "offline-test-key";
  env.demoMode = false; // Provider quotas are tested independently; no DB is accessed here.
  let embeddings = 0;
  let generations = 0;
  let failEmbedding = false;
  let invalidGeneration = false;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const url = String(_url);
    if (url.includes("generateContent")) {
      generations += 1;
      const body = JSON.parse(String(init?.body)) as { contents: { parts: { text: string }[] }[] };
      const prompt = JSON.parse(body.contents[0].parts[0].text) as { sources: { passages: { passageId: string; content: string }[] }[] };
      const passage = prompt.sources[0].passages[0];
      return Response.json({ candidates: [{ content: { parts: [{ text: invalidGeneration ? "invalid JSON" : JSON.stringify({
        answered: true, claims: [{ text: passage.content, citationIds: [passage.passageId] }], missingInformation: "",
      }) }] }, finishReason: "STOP" }] });
    }
    embeddings += 1;
    if (failEmbedding) return Response.json({ error: { message: "offline fixture", code: 401 } }, { status: 401 });
    const vector = { values: [1, ...Array<number>(767).fill(0)] };
    return Response.json({ embedding: vector, embeddings: [vector] });
  });
  const { generateEmbedding } = await import("../services/embedding-service.js");
  const { createQuestionAnswerer } = await import("../services/rag-service.js");
  const { pool } = await import("../db/index.js");
  try {
    await t.test("identical query misses coalesce; document and measured evaluation embeddings bypass caching", async () => {
      invalidateQueryCaches();
      const options = { type: "query" as const, cacheNamespace: "index-a" };
      const values = await Promise.all([generateEmbedding("SDK?", options), generateEmbedding("SDK?", options)]);
      assert.equal(embeddings, 1);
      values[0][0] = 99;
      assert.equal((await generateEmbedding("SDK?", options))[0], 1);
      assert.equal(embeddings, 1);
      await generateEmbedding("SDK?", { type: "document", cacheNamespace: "index-a" });
      await generateEmbedding("SDK?", { type: "document", cacheNamespace: "index-a" });
      let measured = 0;
      await generateEmbedding("SDK?", { ...options, onRequest: () => measured++ });
      await generateEmbedding("SDK?", { ...options, onRequest: () => measured++ });
      assert.equal(embeddings, 5);
      assert.equal(measured, 2);
      await generateEmbedding("SDK?", { ...options, cacheNamespace: "index-b" });
      const model = env.geminiEmbeddingModel;
      env.geminiEmbeddingModel = "offline-embedding-model-b";
      await generateEmbedding("SDK?", options);
      env.geminiEmbeddingModel = model;
      assert.equal(embeddings, 7);
      failEmbedding = true;
      await assert.rejects(generateEmbedding("retry failure?", options));
      failEmbedding = false;
      await generateEmbedding("retry failure?", options);
      assert.equal(embeddings, 9);
    });

    await t.test("repeated RAG answers retain verified citations and invalidate after corpus or model changes", async () => {
      let revision = "published-v1";
      let content = "This fictional garden supports English and Spanish.";
      let searches = 0;
      let rejectRevision = false;
      const answer = createQuestionAnswerer({
        namespace: () => getQueryCacheNamespace(async () => {
          if (rejectRevision) throw new Error("revision is unavailable");
          return revision;
        }),
        search: async (question, _limit, cacheNamespace) => {
          searches += 1;
          await generateEmbedding(question, { type: "query", cacheNamespace });
          const result: SearchResult = { chunkId: searches, documentId: 1, documentPath: "demo/overview.md",
            documentTitle: "Fictional project", chunkIndex: 0, content, similarity: 0.9, relevance: 0.9 };
          return [result];
        },
      });
      const start = { embeddings, generations };
      const first = await answer("Languages?");
      assert.equal(first.answered, true);
      assert.deepEqual(first.sources[0].quotes, [content]);
      const original = structuredClone(first);
      first.sources[0].quotes![0] = "caller mutation";
      assert.deepEqual(await answer("  Languages?  "), original);
      assert.equal(searches, 1);
      assert.equal(embeddings - start.embeddings, 1);
      assert.equal(generations - start.generations, 1);
      // Search can reuse the embedding populated by chat in the same namespace.
      const cacheNamespace = await getQueryCacheNamespace(async () => revision);
      await generateEmbedding("Languages?", { type: "query", cacheNamespace });
      assert.equal(embeddings - start.embeddings, 1);
      revision = "published-v2";
      content = "This fictional garden now also supports French.";
      const updated = await answer("Languages?");
      assert.deepEqual(updated.sources[0].quotes, [content]);
      assert.notDeepEqual(updated.sources, original.sources);
      assert.equal(searches, 2);
      const model = env.geminiChatModel;
      env.geminiChatModel = "offline-chat-model-b";
      await answer("Languages?");
      assert.equal(searches, 3);
      env.geminiChatModel = model;
      invalidGeneration = true;
      const badStart = generations;
      assert.equal((await answer("Invalid generation?")).status, "error");
      assert.equal((await answer("Invalid generation?")).status, "error");
      assert.equal(generations - badStart, 2);
      invalidGeneration = false;
      assert.equal((await answer("Invalid generation?")).answered, true);
      await answer("Invalid generation?");
      assert.equal(generations - badStart, 3);
      rejectRevision = true;
      await assert.rejects(answer("Invalid generation?"), /revision/);
    });
  } finally { await pool.end(); }
});
