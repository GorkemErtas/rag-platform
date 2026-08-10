import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

const rootDir = path.resolve(currentDir, "../../../..");

config({
  path: path.join(rootDir, ".env"),
});

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const migrationsFolder = path.resolve(currentDir, "../../drizzle");

const pool = new Pool({
  connectionString,
});

const db = drizzle(pool);

try {
  await migrate(db, {
    migrationsFolder,
  });

  console.log("Database migrations completed successfully.");
} finally {
  await pool.end();
}