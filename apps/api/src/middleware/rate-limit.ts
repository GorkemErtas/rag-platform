import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { consumeBudget, privateClientKey, type ConsumeBudget } from "../services/usage-service.js";

export function memoryBudget(): ConsumeBudget {
  const entries = new Map<string, { used: number; end: number }>();
  return async (key, limit, windowMs) => {
    const now = Date.now();
    const previous = entries.get(key);
    if (previous && previous.end > now) {
      if (previous.used >= limit) return false;
      previous.used += 1;
      return true;
    }
    if (entries.size >= 10000) {
      for (const [entryKey, value] of entries) if (value.end <= now) entries.delete(entryKey);
      if (entries.size >= 10000) return false;
    }
    entries.set(key, { used: 1, end: now + windowMs });
    return true;
  };
}

export function rateLimit(scope: string, limit: number, windowMs: number, consume?: ConsumeBudget): RequestHandler {
  const storage = consume ?? (env.production || env.demoMode ? consumeBudget : memoryBudget());
  return async (req, res, next) => {
    try {
      if (!await storage(`${scope}:${privateClientKey(req.ip ?? "unknown")}`, limit, windowMs)) {
        res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
        res.status(429).json({ error: "Too many requests. Please try again later." });
        return;
      }
      next();
    } catch {
      res.status(503).json({ error: "Request limits are temporarily unavailable" });
    }
  };
}
