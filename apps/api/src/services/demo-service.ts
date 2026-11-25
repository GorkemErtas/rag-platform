import { env, validateDemoEnvironment } from "../config/env.js";

export const DEMO_IDENTITY = "synthetic-portfolio-v1";
export const DEMO_PATHS = ["demo/overview.md", "demo/releases.md", "demo/runbook.md"];

export async function assertDemoDatabase(): Promise<void> {
  if (!env.demoMode) return;
  validateDemoEnvironment();
  const { pool } = await import("../db/index.js");
  const identity = await pool.query("select value from deployment_identity where key = 'corpus'");
  if (identity.rows[0]?.value !== DEMO_IDENTITY) throw new Error("Demo database is not initialized");
  const unexpected = await pool.query("select 1 from documents where path <> all($1::text[]) limit 1", [DEMO_PATHS]);
  if (unexpected.rowCount) throw new Error("Demo database contains a different corpus");
}

// Only the explicit db:demo:init operator command writes the identity marker.
export async function initializeDemoDatabase(): Promise<void> {
  if (!env.demoMode) throw new Error("db:demo:init requires DEMO_MODE=true");
  validateDemoEnvironment();
  const { pool } = await import("../db/index.js");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("lock table deployment_identity, documents, users, ingestion_runs, search_logs in exclusive mode");
    const existing = await client.query("select value from deployment_identity where key = 'corpus'");
    if (existing.rows[0]?.value === DEMO_IDENTITY) {
      await client.query("commit");
      await assertDemoDatabase();
      return;
    }
    const data = await client.query(`select 1 from documents union all select 1 from users
      union all select 1 from ingestion_runs union all select 1 from search_logs limit 1`);
    if (existing.rowCount || data.rowCount) throw new Error("Demo initialization requires an empty dedicated database; existing data was preserved");
    await client.query("insert into deployment_identity (key, value) values ('corpus', $1)", [DEMO_IDENTITY]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
