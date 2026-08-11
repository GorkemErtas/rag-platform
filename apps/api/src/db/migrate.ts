import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "../config/env.js";

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is not defined");
}

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

const migrationsFolder = path.resolve(
  currentDir,
  "../../drizzle",
);

const pool = new Pool({
  connectionString: env.databaseUrl,
});

const db = drizzle(pool);

try {
  await migrate(db, {
    migrationsFolder,
  });

  console.log(
    "Database migrations completed successfully.",
  );
} finally {
  await pool.end();
}