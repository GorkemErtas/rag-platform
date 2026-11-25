import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = path.join(root, "apps/web/.next");
const standalone = path.join(build, "standalone/apps/web");
// Match the static-asset copy in railway/web.Dockerfile.
await cp(path.join(build, "static"), path.join(standalone, ".next/static"), { recursive: true });

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (entry.name.endsWith(".js")) {
      const content = await readFile(file, "utf8");
      for (const marker of ["BUILD_ONLY_SECRET_SENTINEL", "BUILD_ONLY_JWT_SENTINEL_NOT_A_REAL_SECRET"]) {
        assert.equal(content.includes(marker), false, "Server-only build marker reached client JavaScript");
      }
    }
  }
}
await scan(path.join(build, "static"));

const probe = createServer().listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const server = spawn(process.execPath, [path.join(standalone, "server.js")], {
  cwd: root, env: { ...process.env, NODE_ENV: "production", HOSTNAME: "0.0.0.0", PORT: String(port) },
  stdio: "ignore", windowsHide: true,
});
const base = `http://127.0.0.1:${port}`;
try {
  let health;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) }); break; }
    catch { await delay(250); }
  }
  assert.equal(health?.status, 200, "Standalone server did not start on the supplied PORT");
  assert.deepEqual(await health.json(), { status: "ok", service: "web" });
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.equal(page.headers.get("x-powered-by"), null);
  const html = await page.text();
  assert.ok(html.includes("Enter read-only demo"), "Build with NEXT_PUBLIC_DEMO_MODE=true");
  assert.ok(html.includes("fictional documents") || html.includes("Fictional documents"));
  assert.equal(html.includes('name="password"'), false, "Demo unexpectedly contains password login");
  const asset = html.match(/src="([^" ]*\/_next\/static\/[^" ]+\.js)"/)?.[1];
  assert.ok(asset, "No production JavaScript asset found");
  assert.equal((await fetch(new URL(asset, base))).status, 200, "Standalone static assets were not packaged");
  console.log("Web standalone smoke passed: PORT, health, demo entry, security headers, static assets and secret markers.");
} finally {
  if (server.exitCode === null) {
    const stopped = once(server, "exit");
    server.kill();
    await stopped;
  }
}
