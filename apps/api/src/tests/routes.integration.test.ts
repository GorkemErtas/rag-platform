import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

test("chat/search preserve authentication and reject malformed requests before model or DB work", async () => {
  env.databaseUrl ??= "postgresql://unused:unused@127.0.0.1:1/unused";
  env.jwtSecret = "test-only-route-secret";
  env.mcpServiceToken = "test-only-mcp-token";
  const { chatRouter } = await import("../routes/chat-route.js");
  const { searchRouter } = await import("../routes/search-route.js");
  const { pool } = await import("../db/index.js");
  const app = express();
  app.use(express.json());
  app.use("/api/chat", chatRouter);
  app.use("/api/search", searchRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const token = jwt.sign({ sub: "1", email: "test@example.invalid", role: "USER" }, env.jwtSecret,
    { issuer: "rag-platform-api", audience: "rag-platform-web", expiresIn: "1h" });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await post("/api/chat", { question: "SDK?" })).status, 401);
    assert.equal((await post("/api/search", { query: "SDK?" })).status, 401);
    assert.equal((await post("/api/search", { query: "SDK?" }, { "X-MCP-Service-Token": "invalid" })).status, 401);
    const auth = { Authorization: `Bearer ${token}` };
    for (const body of [{}, { question: 123 }, { question: [] }, { question: "  " }]) {
      assert.equal((await post("/api/chat", body, auth)).status, 400);
    }
    for (const body of [{ query: "" }, { query: 12 }, { query: "SDK?", limit: 1.5 }, { query: "SDK?", limit: 21 }, { query: "SDK?", limit: "5" }, { query: "SDK?", limit: null }]) {
      assert.equal((await post("/api/search", body, auth)).status, 400);
    }
    assert.equal((await post("/api/search", { query: "SDK?", limit: 0 }, { "X-MCP-Service-Token": env.mcpServiceToken })).status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});
