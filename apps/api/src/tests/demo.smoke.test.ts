import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import { env, rootDir, validateDemoEnvironment, validateServerEnvironment } from "../config/env.js";
import path from "node:path";
import { memoryBudget } from "../middleware/rate-limit.js";
import { reserveGeminiCall, UsageLimitError } from "../services/usage-service.js";
import { loadCorpus } from "../services/corpus-service.js";

test("portfolio API smoke: auth, health, permissions, bounded chat/search and CORS", async (t) => {
  env.databaseUrl = "postgresql://unused:unused@127.0.0.1:1/portfolio_demo";
  env.demoDatabaseName = "portfolio_demo";
  env.jwtSecret = "test-only-secret-at-least-thirty-two-bytes";
  env.demoMode = true;
  env.corpusPath = path.join(rootDir, "demo-corpus");
  env.corsOrigin = "https://portfolio.example.invalid";
  env.mcpServiceToken = "private-test-service-token";
  const { createApp } = await import("../app.js");
  const { pool } = await import("../db/index.js");
  let ready = true;
  let calls = 0;
  const app = createApp({
    consume: memoryBudget(),
    readiness: async () => { if (!ready) throw new Error("do not disclose a database URL"); },
    answer: async () => { calls += 1; return { answered: false, answer: "No evidence", sources: [] }; },
    search: async () => { calls += 1; return []; },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (route: string, body: unknown = {}, headers: Record<string, string> = {}) => fetch(`${base}${route}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  let token: string;
  try {
    await t.test("health separates liveness and readiness and hides errors", async () => {
      assert.equal((await fetch(`${base}/health`)).status, 200);
      assert.equal((await fetch(`${base}/health/ready`)).status, 200);
      ready = false;
      const failed = await fetch(`${base}/health/ready`);
      assert.equal(failed.status, 503);
      assert.deepEqual(await failed.json(), { error: "Service is not ready" });
      ready = true;
    });
    await t.test("public sessions contain expiring USER claims; registration and password login are blocked", async () => {
      assert.equal((await post("/api/auth/register", { email: "new@example.invalid", password: "test-password" })).status, 403);
      assert.equal((await post("/api/auth/login", { email: "admin@demo.local", password: "Admin1234!" })).status, 403);
      const session = await post("/api/auth/demo");
      assert.equal(session.status, 200);
      const auth = await session.json() as { token: string; user: { role: string } };
      token = auth.token;
      assert.equal(auth.user.role, "USER");
      const claims = jwt.verify(token, env.jwtSecret!, { algorithms: ["HS256"], issuer: "rag-platform-api", audience: "rag-platform-web" }) as jwt.JwtPayload;
      assert.equal(claims.role, "USER");
      assert.equal(claims.demo, true);
      assert.equal(claims.exp! - claims.iat!, 900);
      assert.equal(session.headers.get("cache-control"), "no-store");
    });
    await t.test("missing, forged, expired, wrong-audience and ADMIN tokens fail before model work", async () => {
      const sign = (payload: object, options: jwt.SignOptions = {}) => jwt.sign(payload, env.jwtSecret!, {
        issuer: "rag-platform-api", audience: "rag-platform-web", expiresIn: "15m", ...options,
      });
      for (const candidate of ["", "forged", sign({ sub: "0", email: "test@example.invalid", role: "USER", demo: true }, { expiresIn: -1 }),
        sign({ sub: "0", email: "test@example.invalid", role: "USER", demo: true }, { audience: "other" }),
        sign({ sub: "1", email: "admin@example.invalid", role: "ADMIN" }),
        sign({ sub: "0", email: "test@example.invalid", role: "USER", demo: true }, { algorithm: "HS384" })]) {
        assert.equal((await post("/api/chat", { question: "Hello?" }, { Authorization: `Bearer ${candidate}` })).status, 401);
      }
      assert.equal(calls, 0);
      const headers = { Authorization: `Bearer ${token}` };
      assert.equal((await fetch(`${base}/api/admin/dashboard`, { headers })).status, 403);
      assert.equal((await post("/api/admin/ingestion", {}, headers)).status, 403);
    });
    await t.test("exact CORS origin, invalid JSON and oversized bodies are enforced", async () => {
      const denied = await post("/api/chat", {}, { Origin: "https://attacker.example.invalid" });
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get("access-control-allow-origin"), null);
      const allowed = await post("/api/auth/demo", {}, { Origin: env.corsOrigin });
      assert.equal(allowed.headers.get("access-control-allow-origin"), env.corsOrigin);
      assert.equal((await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status, 400);
      assert.equal((await post("/api/chat", { question: "x".repeat(17000) })).status, 413);
    });
    await t.test("chat and MCP share an IP quota that cannot be reset with forged forwarded headers", async () => {
      const headers = { Authorization: `Bearer ${token}` };
      assert.equal((await post("/api/chat", { question: "x".repeat(2001) }, headers)).status, 400);
      const chat = await post("/api/chat", { question: "Which languages are supported?" }, headers);
      assert.equal(chat.status, 200);
      assert.equal((await chat.json() as { answered: boolean }).answered, false);
      assert.equal((await post("/api/search", { query: "Aurora?" }, { "X-MCP-Service-Token": env.mcpServiceToken! })).status, 200);
      assert.equal((await post("/api/search", { query: "Aurora?", limit: 1.5 }, headers)).status, 400);
      assert.equal((await post("/api/chat", { question: "Aurora?" }, headers)).status, 200);
      const limited = await post("/api/chat", { question: "Aurora?" }, { ...headers, "X-Forwarded-For": "198.51.100.55" });
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get("retry-after"), "60");
      assert.equal(calls, 3);
    });
    await t.test("authentication quota cannot be bypassed by requesting new demo sessions", async () => {
      let status = 200;
      for (let index = 0; index < 11; index++) status = (await post("/api/auth/demo")).status;
      assert.equal(status, 429);
    });
    await t.test("quota storage failures fail closed", async () => {
      const closedApp = createApp({ consume: async () => { throw new Error("database offline"); } });
      const closed = closedApp.listen(0, "127.0.0.1");
      await once(closed, "listening");
      try {
        const response = await fetch(`http://127.0.0.1:${(closed.address() as AddressInfo).port}/api/auth/demo`, { method: "POST" });
        assert.equal(response.status, 503);
      } finally { await new Promise<void>((resolve) => closed.close(() => resolve())); }
    });
    await t.test("only explicitly selected synthetic documents are loaded", async () => {
      validateDemoEnvironment();
      const corpus = await loadCorpus(env.corpusPath);
      assert.deepEqual(corpus.map((document) => document.path), ["demo/overview.md", "demo/releases.md", "demo/runbook.md"]);
      await assert.rejects(loadCorpus(path.join(rootDir, "corpus")), /selection/);
      env.demoDatabaseName = "original";
      assert.throws(validateDemoEnvironment, /dedicated/);
      env.demoDatabaseName = "portfolio_demo";
    });
    await t.test("each provider request consumes quota and exhausted quota stops further work", async () => {
      const consume = memoryBudget();
      env.demoMinuteCallLimit = 30;
      env.demoDailyCallLimit = 2;
      await reserveGeminiCall(consume);
      await reserveGeminiCall(consume);
      await assert.rejects(reserveGeminiCall(consume), UsageLimitError);
    });
    await t.test("development login validation and demo opt-out remain available", async () => {
      env.demoMode = false;
      const local = createApp({ consume: memoryBudget() }).listen(0, "127.0.0.1");
      await once(local, "listening");
      const origin = `http://127.0.0.1:${(local.address() as AddressInfo).port}`;
      try {
        assert.equal((await fetch(`${origin}/api/auth/demo`, { method: "POST" })).status, 404);
        const adminToken = jwt.sign({ sub: "1", email: "admin@example.invalid", role: "ADMIN" }, env.jwtSecret!, {
          issuer: "rag-platform-api", audience: "rag-platform-web", expiresIn: "1h",
        });
        // An unmatched admin path passes authorization without invoking DB handlers.
        assert.equal((await fetch(`${origin}/api/admin/permission-smoke`, { headers: { Authorization: `Bearer ${adminToken}` } })).status, 404);
        assert.equal((await fetch(`${origin}/api/admin/permission-smoke`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
        for (const body of [null, {}, { email: 42, password: [] }, { email: "invalid", password: "x" }, { email: "test@example.invalid", password: "x".repeat(73) }]) {
          assert.equal((await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).status, 400);
        }
        env.production = true;
        assert.equal((await fetch(`${origin}/api/auth/register`, { method: "POST" })).status, 403);
        assert.equal((await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "admin@demo.local", password: "Admin1234!" }) })).status, 401);
        env.corsOrigin = "*";
        assert.throws(validateServerEnvironment);
      } finally { await new Promise<void>((resolve) => local.close(() => resolve())); }
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});
