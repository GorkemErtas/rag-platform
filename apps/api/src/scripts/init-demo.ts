import { pool } from "../db/index.js";
import { initializeDemoDatabase } from "../services/demo-service.js";

try {
  await initializeDemoDatabase();
  console.log("Synthetic demo database initialized; no documents ingested.");
} catch {
  console.error("Demo initialization refused. Use an empty, migrated, dedicated demo database and explicit demo configuration.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
