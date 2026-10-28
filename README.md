# Playable Factory RAG Case

A full-stack Retrieval-Augmented Generation (RAG) application built for
the Playable Factory AI Software Engineer case study.

The application indexes the provided document corpus, retrieves relevant
passages using dense semantic search, and generates evidence-backed answers with
citations to source documents. It also includes role-based access
control, an admin dashboard, an MCP search interface, retrieval
evaluation, and a live deployment.

## Features

-   Repeatable document ingestion with observable ingestion status
-   Document chunking and Gemini embedding generation
-   PostgreSQL + pgvector vector storage
-   One dense retrieval path shared by chat, HTTP search and MCP
-   Experimental lexical + raw RRF hybrid retrieval for evaluation
-   Structured answers with validated source IDs and exact quotations
-   Evidence-based abstention and explicit limitations for partial answers
-   Atomic reindexing, unchanged-document skipping and configuration tracking
-   Authentication and role-based authorization for `USER` and `ADMIN`
-   Admin dashboard for documents, ingestion runs, index health, and
    search analytics
-   Admin-triggered corpus ingestion
-   MCP search tool for external clients
-   Forty corpus-verified evaluation cases with separate retrieval/generation metrics
-   Responsive Next.js + Tailwind CSS interface
-   Live deployment

## Retrieval Evaluation

The revised evaluation checks source recall/precision, MRR, supporting passage
coverage, generated fact coverage, citation validity and abstention errors.
It separates seven tuning cases from 33 held-out cases. Dense and hybrid use
the same embedding and index snapshot. Search scores are ranking signals;
answerability is decided from supporting evidence, without a cosine cutoff.

On the checked-in corpus, the incoming chunker produced 455 chunks and split
20 paragraphs across chunk boundaries. The revised chunker preserves all 142
documents and all 643 paragraphs intact, with 142 chunks. These are measured
fragmentation improvements, not retrieval or answer accuracy claims.

Live evaluation is currently unverified: the configured Gemini key returned
HTTP 401 before any case completed. Previous README accuracy figures came
from a much smaller historical suite and are not evidence for this revision.

``` bash
pnpm --filter @playable-factory/api test:evaluation
pnpm --filter @playable-factory/api test:rag:evaluation
```

See the [architecture audit](docs/RAG_ARCHITECTURE_AUDIT.md) for findings,
recorded before/after results and deployment requirements, and the
[evaluation guide](docs/evaluation/README.md) for metric definitions and commands.

## Technology Stack

**Frontend:** Next.js, React, TypeScript, Tailwind CSS\
**Backend:** Node.js, Express, TypeScript, Drizzle ORM\
**AI & Retrieval:** Google Gemini, PostgreSQL, pgvector, PostgreSQL
full-text search (experimental), cosine similarity, raw RRF\
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

Unchanged successful documents are skipped using content and configuration
checksums. New embeddings are prepared before atomically replacing each
document's searchable content. Failed replacements preserve the previous
index. Missing corpus files are reported and retained for explicit review.

Upgrading an existing installation requires migration
`0002_cultured_salo.sql` and one successful ingestion before switching to the
new API: legacy documents have unknown embedding metadata and are excluded
by the new retrieval implementation. See the audit's staged rollout steps.

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

The response contains supported claims and only their cited source passages,
with stable source IDs and exact quotations. Search results are candidates;
they are not automatically returned as authoritative answer sources.
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

### Retrieval

Dense semantic retrieval is the default across chat, search and MCP.
Body-text lexical search with equal-weight RRF remains an evaluation candidate.
It will require representative held-out evidence before becoming a default.
Query rewriting and question-specific ranking boosts were removed.

### Abstention

The generator must answer exclusively from retrieved evidence, cite every
claim and identify missing requested details. The server rejects malformed
claims, unknown source IDs and quotations absent from the cited passages.
Quote provenance is validated locally; factual correctness and semantic
entailment still require live evaluation and human review. Similarity and
RRF scores are never treated as calibrated answer confidence.

### Chunking

Documents below the configured chunk-size limit remain intact. Larger
documents are split at heading, paragraph and line/word boundaries before embedding, avoiding
unnecessary fragmentation of already-small source documents.

### Validation

```bash
pnpm --filter @playable-factory/shared build
pnpm --filter @playable-factory/api test
pnpm --filter @playable-factory/api lint
pnpm build
```

The database transaction integration test is skipped unless TEST_DATABASE_URL
points at an isolated PostgreSQL database with pgvector installed. The full
workspace production build passes. Frontend lint still reports two existing
React effect/state errors in the admin and chat pages; see the audit.

### Shared Contracts

Shared TypeScript interfaces live in the shared workspace package so the
frontend, API, and supporting services use consistent request and
response contracts.

### MCP Architecture

The MCP server is a lightweight local stdio process that delegates
retrieval to the API, keeping retrieval logic centralized.
