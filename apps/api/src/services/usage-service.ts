import { createHmac } from "node:crypto";
import { env } from "../config/env.js";

export class UsageLimitError extends Error {
  constructor(public retryAfter = 60) { super("Demo usage limit reached. Please try again later."); }
}

export type ConsumeBudget = (key: string, limit: number, windowMs: number) => Promise<boolean>;
let lastCleanup = 0;

// Atomic PostgreSQL counters survive restarts and are shared by all replicas.
export const consumeBudget: ConsumeBudget = async (key, limit, windowMs) => {
  const { pool } = await import("../db/index.js");
  const start = Math.floor(Date.now() / windowMs) * windowMs;
  const result = await pool.query(`
    insert into request_budgets (key, window_start, expires_at, used) values ($1, $2, $3, 1)
    on conflict (key, window_start) do update set used = request_budgets.used + 1
    where request_budgets.used < $4 returning used`,
  [key, new Date(start), new Date(start + windowMs), limit]);
  if (Date.now() - lastCleanup > 60000) {
    lastCleanup = Date.now();
    await pool.query(`delete from request_budgets where ctid in
      (select ctid from request_budgets where expires_at < now() - interval '1 day' limit 1000)`);
  }
  return result.rowCount === 1;
};

export function privateClientKey(ip: string): string {
  if (!env.jwtSecret) throw new Error("JWT_SECRET is required");
  return createHmac("sha256", env.jwtSecret).update(ip).digest("hex");
}

export async function reserveGeminiCall(consume: ConsumeBudget = consumeBudget): Promise<void> {
  if (!env.demoMode) return;
  if (!await consume("gemini:minute", env.demoMinuteCallLimit, 60000)) throw new UsageLimitError();
  if (!await consume("gemini:day", env.demoDailyCallLimit, 86400000)) throw new UsageLimitError(86400);
}
