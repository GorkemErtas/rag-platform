import assert from "node:assert/strict";
import { test } from "node:test";
import { TtlCache } from "../utils/ttl-cache.js";

test("TTL expires from insertion even when entries are read repeatedly", () => {
  let now = 0;
  const cache = new TtlCache<number>({ maxEntries: 2, maxBytes: 100, ttlMs: 10, now: () => now });
  cache.set("a", 1);
  now = 9;
  assert.equal(cache.get("a"), 1);
  now = 10;
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size, 0);
  assert.equal(cache.bytes, 0);
});

test("least-recently-used eviction and byte limits bound cache memory", () => {
  const cache = new TtlCache<string>({ maxEntries: 2, maxBytes: 20, ttlMs: 1000 });
  cache.set("a", "first");
  cache.set("b", "second");
  assert.equal(cache.get("a"), "first");
  cache.set("c", "third");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), "first");
  assert.equal(cache.size, 2);
  cache.set("large", "x".repeat(100));
  assert.equal(cache.get("large"), undefined);
  cache.set("d", "x".repeat(15));
  assert.equal(cache.size, 1);
  assert.ok(cache.bytes <= 20);
});

test("stored embeddings and nested response objects cannot be mutated by callers", async () => {
  const cache = new TtlCache<{ sources: { quotes: string[] }[] }>({ maxEntries: 2, maxBytes: 1000, ttlMs: 1000 });
  const original = { sources: [{ quotes: ["original evidence"] }] };
  cache.set("answer", original);
  original.sources[0].quotes[0] = "changed input";
  const first = await cache.getOrLoad("answer", async () => original);
  first.sources[0].quotes[0] = "changed output";
  assert.equal(cache.get("answer")!.sources[0].quotes[0], "original evidence");
});

test("simultaneous identical misses share work; rejected work is retried", async () => {
  const cache = new TtlCache<number[]>({ maxEntries: 2, maxBytes: 1000, ttlMs: 1000 });
  let complete!: (value: number[]) => void;
  let calls = 0;
  const load = () => { calls += 1; return new Promise<number[]>((resolve) => { complete = resolve; }); };
  const first = cache.getOrLoad("same", load);
  const second = cache.getOrLoad("same", load);
  assert.equal(calls, 1);
  complete([1, 0]);
  const values = await Promise.all([first, second]);
  values[0][0] = 2;
  assert.deepEqual(values[1], [1, 0]);
  await assert.rejects(cache.getOrLoad("failure", async () => { throw new Error("provider unavailable"); }));
  assert.equal(cache.get("failure"), undefined);
  assert.deepEqual(await cache.getOrLoad("failure", async () => [0, 1]), [0, 1]);
});

test("invalidation prevents old in-flight results from refilling the cache", async () => {
  const cache = new TtlCache<number>({ maxEntries: 2, maxBytes: 1000, ttlMs: 1000 });
  let oldComplete!: (value: number) => void;
  let newComplete!: (value: number) => void;
  const old = cache.getOrLoad("same", () => new Promise((resolve) => { oldComplete = resolve; }));
  cache.clear();
  const current = cache.getOrLoad("same", () => new Promise((resolve) => { newComplete = resolve; }));
  oldComplete(1);
  assert.equal(await old, 1);
  assert.equal(cache.get("same"), undefined);
  newComplete(2);
  assert.equal(await current, 2);
  assert.equal(cache.get("same"), 2);
});

test("in-flight tracking is bounded and transient results are not cached", async () => {
  const cache = new TtlCache<number>({ maxEntries: 1, maxBytes: 1000, ttlMs: 1000 });
  let complete!: (value: number) => void;
  const pending = cache.getOrLoad("first", () => new Promise((resolve) => { complete = resolve; }));
  assert.equal(await cache.getOrLoad("overflow", async () => 2), 2);
  assert.equal(cache.get("overflow"), undefined);
  complete(1);
  await pending;
  await cache.getOrLoad("transient", async () => 3, () => false);
  assert.equal(cache.get("transient"), undefined);
});
