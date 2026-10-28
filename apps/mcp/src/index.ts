import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const rootDir = path.resolve(currentDir, "../../..");

config({
  path: path.join(rootDir, ".env"),
});

const apiBaseUrl =
  process.env.MCP_API_BASE_URL ?? "http://127.0.0.1:4000";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} must be provided`);
  }

  return value;
}

const serviceToken = getRequiredEnv("MCP_SERVICE_TOKEN");

async function callSearchApi(
  query: string,
  limit: number,
): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}/api/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MCP-Service-Token": serviceToken,
    },
    body: JSON.stringify({
      query,
      limit,
    }),
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Search API failed with ${response.status}: ${body}`,
    );
  }

  return response.json();
}

const server = new McpServer({
  name: "playable-factory-rag-search",
  version: "1.0.0",
});

server.tool(
  "search_documents",
  "Search indexed corpus passages by semantic relevance. Results are search candidates, not verified answers; similarity and relevance are ranking signals, not confidence.",
  {
    query: z.string().min(1),
    limit: z.number().int().min(1).max(20).default(5),
  },
  async ({ query, limit }) => {
    const data = await callSearchApi(query, limit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();

await server.connect(transport);
