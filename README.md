# Playable Factory RAG Case

A full-stack Retrieval-Augmented Generation (RAG) application built for
the Playable Factory AI Software Engineer case study.

The application indexes the provided document corpus, retrieves relevant
passages using hybrid search, and generates grounded answers with
citations to source documents. It also includes role-based access
control, an admin dashboard, an MCP search interface, retrieval
evaluation, and a live deployment.

## Features

-   Repeatable document ingestion with observable ingestion status
-   Document chunking and Gemini embedding generation
-   PostgreSQL + pgvector vector storage
-   Hybrid retrieval using vector similarity and PostgreSQL full-text
    search
-   Weighted Reciprocal Rank Fusion (RRF)
-   Grounded RAG answers with source attribution
-   Out-of-corpus abstention using an evaluated similarity threshold
-   Authentication and role-based authorization for `USER` and `ADMIN`
-   Admin dashboard for documents, ingestion runs, index health, and
    search analytics
-   Admin-triggered corpus ingestion
-   MCP search tool for external clients
-   Small retrieval evaluation suite
-   Responsive Next.js + Tailwind CSS interface
-   Live deployment

## Retrieval Evaluation

  Metric                           Dense   Hybrid
  ------------------------------ ------- --------
  Top-1 source accuracy              90%     100%
  Top-3 source recall               100%     100%
  Negative abstention accuracy      100%     100%

The evaluation showed clean separation between the tested answerable and
unanswerable queries. A dense similarity threshold of `0.65` is used to
reject unsupported questions before generation.

``` bash
pnpm --filter @playable-factory/api test:evaluation
```

## Technology Stack

**Frontend:** Next.js, React, TypeScript, Tailwind CSS\
**Backend:** Node.js, Express, TypeScript, Drizzle ORM\
**AI & Retrieval:** Google Gemini, PostgreSQL, pgvector, PostgreSQL
full-text search, cosine similarity, weighted RRF\
**Infrastructure:** pnpm workspaces, Docker Compose, Neon, Render,
Vercel, Model Context Protocol (MCP)

## Project Structure

``` text
apps/
  api/        Express API, auth, ingestion, retrieval, RAG and evaluation
  web/        Next.js frontend and admin dashboard
  mcp/        MCP server exposing corpus search

packages/
  shared/     Shared TypeScript interfaces and API contracts
```

## Prerequisites

-   Node.js
-   pnpm
-   Docker / Docker Compose
-   Google Gemini API key

## Installation

### 1. Clone and install

``` bash
git clone <repository-url>
cd playable-factory-rag-case
pnpm install
```

### 2. Configure environment variables

Create `.env` from the included `.env.example` and provide the required
values.

``` bash
cp .env.example .env
```

Set the required secrets:

- `GEMINI_API_KEY`: Google Gemini API key.
- `JWT_SECRET`: Any sufficiently long random string used to sign local JWTs.
- `MCP_SERVICE_TOKEN`: Any sufficiently long random string for local API/MCP authentication. When connecting the local MCP server to the deployed API, use the service token provided via email (MCP_SERVER_ACCESS.txt).

For local development, `JWT_SECRET` and `MCP_SERVICE_TOKEN` can be generated with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start PostgreSQL

``` bash
docker compose up -d
```

Docker Compose provides the local PostgreSQL environment with pgvector
support.

### 4. Run migrations and seed demo users

``` bash
pnpm db:migrate
pnpm db:seed
```

### 5. Index the corpus

Point the configured corpus path at the provided dataset, then run:

``` bash
pnpm ingest
```

Ingestion is repeatable and records document/run status so progress and
failures can be observed from the admin dashboard.

## Running the Application

Start the API from the repository root:

```bash
pnpm dev:api
```

In a second terminal, start the frontend:

```bash
pnpm dev:web
```

The API and frontend development URLs are printed in their respective terminals.

To run the MCP server separately:

```bash
pnpm dev:mcp
```

To test the MCP server with MCP Inspector, open a new terminal and run:

```bash
npx @modelcontextprotocol/inspector
```

and then follow the path:

connect -> list tools -> search_documents

## Demo Credentials

**Regular User**

``` text
Email: user@demo.local
Password: User1234!
```

**Admin**

``` text
Email: admin@demo.local
Password: Admin1234!
```

Regular users can access the grounded chat experience. Admins can
additionally access the dashboard, inspect corpus and ingestion status,
view search analytics, and trigger ingestion.

## API Overview

Authentication and authorization are enforced by the API. Admin
endpoints require an authenticated `ADMIN` user.

  Endpoint                      Purpose
  ----------------------------- -------------------------------------------------
  `GET /health`                 API health check
  `POST /api/auth/login`        Authenticate a user
  `POST /api/chat`              Retrieve context and generate a grounded answer
  `POST /api/search`            Search the indexed corpus
  `GET /api/admin/dashboard`    Retrieve dashboard data
  `POST /api/admin/ingestion`   Trigger corpus ingestion

Example chat request:

``` http
POST /api/chat
Content-Type: application/json
Authorization: Bearer <token>
```

``` json
{
  "question": "Why did AppLovin reject our playables in March 2026?"
}
```

The response contains a grounded answer and retrieved source documents.
If the corpus does not contain sufficient evidence, the system abstains
instead of generating an unsupported answer.

## MCP Search

The retrieval capability is also exposed through an MCP server for
external MCP-compatible clients.

For the deployed API, configure the local MCP process with:

``` env
MCP_API_BASE_URL=https://playable-factory-rag-case.onrender.com
MCP_SERVICE_TOKEN=<provided-service-token>
```

Start the MCP server:

``` bash
pnpm --filter @playable-factory/mcp dev
```

To test the MCP server with MCP Inspector, open a second terminal and run:

```bash
npx @modelcontextprotocol/inspector
```

The MCP server runs locally over stdio and calls the deployed search API
over HTTPS. It can be tested with an MCP-compatible client such as MCP
Inspector. The service token authenticates MCP-to-API requests.

## Deployment

``` text
Browser
   |
   v
Vercel (Next.js)
   |
   v
Render (Express API)
   |
   v
Neon (PostgreSQL + pgvector)
```

**Live frontend:**\
https://playable-factory-rag-case-web.vercel.app

**API health:**\
https://playable-factory-rag-case.onrender.com/health

Production secrets and connection strings are stored as environment
variables on the relevant hosting platforms. The frontend is configured
with the deployed API base URL, and the API CORS configuration allows
the production frontend origin.

## Design Decisions

### Hybrid Retrieval

Dense retrieval captures semantic similarity while PostgreSQL full-text
search captures lexical signals. The ranked result sets are combined
using weighted Reciprocal Rank Fusion. On the evaluation set, hybrid
retrieval improved Top-1 source accuracy from `90%` to `100%` while
preserving `100%` Top-3 recall.

### Abstention

Dense cosine similarity is used as an answerability signal. The `0.65`
threshold was selected using the evaluation set rather than chosen
arbitrarily. Queries without sufficiently relevant corpus evidence are
rejected before generation.

### Chunking

Documents below the configured chunk-size limit remain intact. Larger
documents are split into manageable chunks before embedding, avoiding
unnecessary fragmentation of already-small source documents.

### Shared Contracts

Shared TypeScript interfaces live in the shared workspace package so the
frontend, API, and supporting services use consistent request and
response contracts.

### MCP Architecture

The MCP server is a lightweight local stdio process that delegates
retrieval to the API, keeping retrieval logic centralized.
