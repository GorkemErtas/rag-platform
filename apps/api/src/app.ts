import type { HealthResponse } from "@playable-factory/shared";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { env } from "./config/env.js";
import { pool } from "./db/index.js";
import { adminRouter } from "./routes/admin-route.js";
import { authRouter } from "./routes/auth-route.js";
import { createChatRouter } from "./routes/chat-route.js";
import { createSearchRouter } from "./routes/search-route.js";
import { memoryBudget, rateLimit } from "./middleware/rate-limit.js";
import { requireAuth } from "./middleware/auth-middleware.js";
import { requireSearchAccess } from "./middleware/search-auth-middleware.js";
import { assertDemoDatabase } from "./services/demo-service.js";
import type { ConsumeBudget } from "./services/usage-service.js";

let readinessCheck: Promise<void> | undefined;
let readinessTime = 0;
export async function checkReadiness(): Promise<void> {
  if (!readinessCheck || Date.now() - readinessTime > 3000) {
    readinessTime = Date.now();
    readinessCheck = (async () => {
      await pool.query(`select 'users'::regclass, 'documents'::regclass, 'document_chunks'::regclass,
        'request_budgets'::regclass, 'deployment_identity'::regclass, 'vector'::regtype`);
      await assertDemoDatabase();
    })();
  }
  await readinessCheck;
}

interface AppOptions {
  readiness?: typeof checkReadiness;
  consume?: ConsumeBudget;
  answer?: Parameters<typeof createChatRouter>[0];
  search?: Parameters<typeof createSearchRouter>[0];
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.trustProxyHops);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.get("/health", (_req, res) => {
    const response: HealthResponse = { status: "ok", service: "api" };
    res.json(response);
  });
  app.get("/health/ready", async (_req, res) => {
    try { await (options.readiness ?? checkReadiness)(); res.json({ status: "ok", service: "api" }); }
    catch { res.status(503).json({ error: "Service is not ready" }); }
  });
  app.use((req, res, next) => {
    const origin = req.header("origin");
    if (origin && origin !== env.corsOrigin) { res.status(403).json({ error: "Origin is not allowed" }); return; }
    next();
  });
  app.use(cors({ origin: env.corsOrigin, methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization", "X-MCP-Service-Token"] }));
  app.use("/api", rateLimit("requests", 120, 60000, memoryBudget()));
  app.use(express.json({ limit: "16kb" }));
  app.use("/api/auth", rateLimit("auth", 10, 900000, options.consume), authRouter);
  const paidLimit = rateLimit("paid", 5, 60000, options.consume);
  app.use("/api/chat", requireAuth, paidLimit, createChatRouter(options.answer));
  app.use("/api/search", requireSearchAccess, paidLimit, createSearchRouter(options.search));
  app.use("/api/admin", adminRouter);
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error?.type === "entity.too.large" ? 413 : error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ error: status === 413 ? "Request body is too large" : status === 400 ? "Invalid JSON" : "Request failed" });
  };
  app.use(errorHandler);
  return app;
}
