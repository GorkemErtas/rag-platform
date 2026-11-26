import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is not defined");
}

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.databasePoolMax,
  min: 0,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: env.databaseIdleTimeoutMs,
  allowExitOnIdle: true,
  keepAlive: false,
  statement_timeout: 5000,
});

pool.on("error", () => console.error("Database connection failed"));

export const db = drizzle(pool);
