import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

// Workspace scripts run from apps/web. Share the root .env with API and MCP.
const workspaceEnvFile = resolve(process.cwd(), "../../.env");
if (existsSync(workspaceEnvFile)) {
  loadEnvFile(workspaceEnvFile);
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  },
};

export default nextConfig;
