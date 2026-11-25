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
  connectionTimeoutMillis: 5000,
});

const db = drizzle(pool);

try {
  const extension = await pool.query("select 1 from pg_available_extensions where name = 'vector'");
  if (!extension.rowCount) throw new Error("pgvector is not installed on this PostgreSQL server");
  await migrate(db, {
    migrationsFolder,
  });

  console.log(
    "Database migrations completed successfully.",
  );
} catch {
  console.error("Migration failed. Verify database connectivity, pgvector availability and migration permissions. No reset or rollback was attempted.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
