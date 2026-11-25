import { createApp, checkReadiness } from "./app.js";
import { env, validateServerEnvironment } from "./config/env.js";
import { pool } from "./db/index.js";

try {
  validateServerEnvironment();
  if (env.production || env.demoMode) await checkReadiness();
  const server = createApp().listen(env.port, "0.0.0.0", () => console.log(`API listening on port ${env.port}`));
  const shutdown = () => {
    server.close(() => { void pool.end().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} catch {
  console.error("API startup failed. Check required service variables, migrations, pgvector and demo database initialization.");
  await pool.end();
  process.exitCode = 1;
}
