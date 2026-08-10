import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is not defined");
}

export const pool = new Pool({
  connectionString: env.databaseUrl,
});

export const db = drizzle(pool);