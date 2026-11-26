import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../config/env.js";
import { cacheNamespaceForRevision, getQueryCacheNamespace, invalidateQueryCaches, queryCacheKey, queryEmbeddings, ragResponses } from "../services/query-cache.js";

test("cache namespaces isolate corpus, model, retrieval, and demo contexts without changing query meaning", () => {
  const original = { ...env };
  try {
    const initial = cacheNamespaceForRevision("published-index-1");
    assert.notEqual(initial, cacheNamespaceForRevision("published-index-2"));
    for (const setting of ["geminiChatModel", "geminiEmbeddingModel", "corpusPath", "databaseUrl"] as const) {
      const before = env[setting];
      env[setting] = `different-${setting}`;
      assert.notEqual(initial, cacheNamespaceForRevision("published-index-1"));
      env[setting] = before!;
    }
    env.demoMode = !env.demoMode;
    assert.notEqual(initial, cacheNamespaceForRevision("published-index-1"));
    env.demoMode = original.demoMode;
    env.retrievalMode = original.retrievalMode === "dense" ? "hybrid" : "dense";
    assert.notEqual(initial, cacheNamespaceForRevision("published-index-1"));
    assert.equal(queryCacheKey("scope", "  SDK?  "), queryCacheKey("scope", "SDK?"));
    assert.notEqual(queryCacheKey("scope", "SDK?"), queryCacheKey("scope", "sdk?"));
    assert.notEqual(queryCacheKey("scope", "a  b"), queryCacheKey("scope", "a b"));
  } finally { Object.assign(env, original); }
});

test("every request checks published revision and invalidates both caches after other-process publication", async () => {
  invalidateQueryCaches();
  let revision = "before-ingestion";
  let reads = 0;
  const read = async () => { reads += 1; return revision; };
  const initial = await getQueryCacheNamespace(read);
  queryEmbeddings.set("vector", [1, 0]);
  ragResponses.set("answer", { answered: false, answer: "no evidence", sources: [] });
  assert.equal(await getQueryCacheNamespace(read), initial);
  assert.equal(queryEmbeddings.size, 1);
  revision = "after-ingestion";
  assert.notEqual(await getQueryCacheNamespace(read), initial);
  assert.equal(queryEmbeddings.size, 0);
  assert.equal(ragResponses.size, 0);
  assert.equal(reads, 3);
  await assert.rejects(getQueryCacheNamespace(async () => { throw new Error("database unavailable"); }));
});
