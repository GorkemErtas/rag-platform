import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probe = createServer().listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const variables = {
  ...process.env, NODE_ENV: "development", DEMO_MODE: "false", PORT: String(port),
  DATABASE_URL: "postgresql://unused:UNUSED_PASSWORD_MARKER@127.0.0.1:1/unused_demo",
  JWT_SECRET: "SMOKE_ONLY_SECRET_AT_LEAST_THIRTY_TWO_BYTES",
  GEMINI_API_KEY: "SMOKE_ONLY_GEMINI_MARKER", CORPUS_PATH: "demo-corpus",
  DEMO_DATABASE_NAME: "unused_demo", CORS_ORIGIN: "https://frontend.example.invalid",
};
// Development startup permits liveness without DB connectivity. No paid route is called.
const server = spawn(process.execPath, ["apps/api/dist/index.js"], {
  cwd: root, env: variables, stdio: "ignore", windowsHide: true,
});
try {
  let response;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) }); break; }
    catch { await delay(250); }
  }
  assert.equal(response?.status, 200, "Compiled API did not bind to the supplied PORT");
  assert.deepEqual(await response.json(), { status: "ok", service: "api" });
  assert.equal(response.headers.get("x-powered-by"), null);
  const notReady = await fetch(`http://127.0.0.1:${port}/health/ready`);
  assert.equal(notReady.status, 503);
  assert.deepEqual(await notReady.json(), { error: "Service is not ready" });
} finally {
  if (server.exitCode === null) {
    const stopped = once(server, "exit");
    server.kill();
    await stopped;
  }
}

const production = spawnSync(process.execPath, ["apps/api/dist/index.js"], {
  cwd: root, env: { ...variables, NODE_ENV: "production", DEMO_MODE: "true" },
  encoding: "utf8", timeout: 10000, windowsHide: true,
});
assert.equal(production.status, 1, "Production must refuse startup without its prepared database");
for (const marker of ["UNUSED_PASSWORD_MARKER", variables.JWT_SECRET, variables.GEMINI_API_KEY]) {
  assert.equal(`${production.stdout}${production.stderr}`.includes(marker), false, "Startup logs disclosed a secret marker");
}
const seed = spawnSync(process.execPath, ["apps/api/dist/scripts/seed.js"], {
  cwd: root, env: { ...variables, NODE_ENV: "production" }, encoding: "utf8", timeout: 10000, windowsHide: true,
});
assert.equal(seed.status, 1, "Production must refuse development credentials before database access");
console.log("API compiled smoke passed: PORT, health/readiness, production startup refusal, safe logs and disabled production seeding.");
