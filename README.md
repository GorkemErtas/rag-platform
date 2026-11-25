# RAG PLATFORM

A full-stack Retrieval-Augmented Generation (RAG) application built for
the Playable Factory AI Software Engineer case study.

The application indexes the provided document corpus, retrieves relevant
passages using balanced semantic and lexical search, and generates evidence-backed answers with
citations to source documents. It also includes role-based access
control, an admin dashboard, an MCP search interface and optional retrieval
evaluation. The current setup runs locally with Docker PostgreSQL, an Express
API and a Next.js frontend.

## Features

-   Repeatable document ingestion with observable ingestion status
-   Document chunking and Gemini embedding generation
-   PostgreSQL + pgvector vector storage
-   One configured retrieval path shared by chat, HTTP search and MCP
-   Balanced dense/lexical candidates, with dense and RRF comparison modes
-   Structured answers citing server-issued paragraph IDs and source quotations
-   Evidence-based abstention and explicit limitations for partial answers
-   Atomic reindexing, unchanged-document skipping and configuration tracking
-   Authentication and role-based authorization for `USER` and `ADMIN`
-   Admin dashboard for documents, ingestion runs, index health, and
    search analytics
-   Admin-triggered corpus ingestion
-   MCP search tool for external clients
-   Forty corpus-verified evaluation cases with separate retrieval/generation metrics
-   Responsive Next.js + Tailwind CSS interface
-   Local development with a shared root `.env` file

## Retrieval Evaluation

The revised evaluation checks source recall/precision, MRR, supporting passage
coverage, generated fact coverage, citation validity and abstention errors.
It separates eight tuning cases from 32 held-out cases. Dense and hybrid use
the same embedding and index snapshot. Search scores are ranking signals;
answerability is decided from supporting evidence, without a cosine cutoff.

On the checked-in corpus, the incoming chunker produced 455 chunks and split
20 paragraphs across chunk boundaries. The revised chunker preserves all 142
documents and all 643 paragraphs intact, with 142 chunks. These are measured
fragmentation improvements, not retrieval or answer accuracy claims.

The earlier audit's API evaluation used an outdated local Gemini key and stopped
before any case completed. A later user-generated RAG report completed 33 cases:
dense and the earlier RRF hybrid each found all required sources at K=5 in
26/27 answerable cases. `company-pods` missed its source even at K=8. Those are
results for the previous implementation, not measurements of the new changes.
See the [report analysis](docs/evaluation/2026-10-28-user-run-analysis.md).
Evaluation is optional and is not part of `pnpm run setup` or `pnpm dev`.

``` bash
pnpm --filter @playable-factory/api test:evaluation
pnpm --filter @playable-factory/api test:rag:evaluation
```

See the [architecture audit](docs/RAG_ARCHITECTURE_AUDIT.md) for findings,
recorded before/after results and local reindexing requirements, and the
[evaluation guide](docs/evaluation/README.md) for metric definitions and commands.

## Technology Stack

**Frontend:** Next.js, React, TypeScript, Tailwind CSS\
**Backend:** Node.js, Express, TypeScript, Drizzle ORM\
**AI & Retrieval:** Google Gemini, PostgreSQL, pgvector, PostgreSQL
full-text search, cosine similarity, balanced candidate selection, raw RRF\
**Local infrastructure:** pnpm workspaces, Docker Compose, Model Context Protocol (MCP)

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

-   Node.js 22.12 or later
-   pnpm
-   Docker / Docker Compose
-   Google Gemini API key for ingestion, search and chat

## Installation

### 1. Clone and install

``` bash
git clone <repository-url>
cd playable-factory-rag-case
pnpm install
```

### 2. Configure environment variables

For a new checkout, create the root `.env` from `.env.example`. Keep your
existing `.env` when updating this checkout. Set `JWT_SECRET` to a long random
value for login, and `MCP_SERVICE_TOKEN` if you will use MCP. The default
database and service URLs already target your machine.

``` powershell
Copy-Item .env.example .env
```

Set the required secrets:

- `GEMINI_API_KEY`: Google Gemini API key.
- `JWT_SECRET`: Any sufficiently long random string used to sign local JWTs.
- `MCP_SERVICE_TOKEN`: Any sufficiently long random string for local API/MCP authentication.

For local development, `JWT_SECRET` and `MCP_SERVICE_TOKEN` can be generated with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Only ingestion, search and chat need a current `GEMINI_API_KEY`. Local database
setup, demo user creation and server startup do not call Gemini. Next.js reads
`NEXT_PUBLIC_API_URL` from the same root `.env`; restart `pnpm dev` after changing
environment values.

### 3. Prepare the local database and demo users

Start Docker Desktop first, then run the project setup script:

``` bash
pnpm run setup
```

This starts Docker PostgreSQL, waits for its healthcheck, builds the shared
TypeScript package, applies migrations and seeds the demo users. It does not
ingest documents, call Gemini or run tests. Existing PostgreSQL data is kept
in the `postgres_data` Docker volume.

The database is available at `localhost:5433/playable_factory` with the local
Docker credentials in `.env.example`. To manage it separately:

``` bash
pnpm db:up
pnpm db:stop
```

### 4. Index the corpus when your Gemini key is ready

Update `GEMINI_API_KEY` in your root `.env`, then run:

``` bash
pnpm ingest
```

Ingestion is repeatable and records document/run status so progress and
failures can be observed from the admin dashboard.

Unchanged successful documents are skipped using content and configuration
checksums. New embeddings are prepared before atomically replacing each
document's searchable content. Failed replacements preserve the previous
index. Missing corpus files are reported and retained for explicit review.

For an existing local database, `pnpm run setup` applies migration
`0002_cultured_salo.sql`. Run `pnpm ingest` once after updating the key to rebuild
legacy embedding metadata. Until then, login and the dashboard are available,
but legacy chunks with unknown embedding metadata are excluded from search.

## Running the Application

Start the API and frontend together from the repository root:

```bash
pnpm dev
```

Local addresses:

- Frontend: http://localhost:3000
- API: http://localhost:4000
- API health: http://localhost:4000/health

To run each server in its own terminal instead:

```bash
pnpm dev:api
pnpm dev:web
```

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

Configure MCP to call the local API using the root `.env`:

``` env
MCP_API_BASE_URL=http://127.0.0.1:4000
MCP_SERVICE_TOKEN=<your-local-service-token>
```

If you choose to connect MCP to a separately deployed API, use that API's
service token provided via email (`MCP_SERVER_ACCESS.txt`) instead of the local
token, and set `MCP_API_BASE_URL` to its address.

Start the MCP server:

``` bash
pnpm --filter @playable-factory/mcp dev
```

To test the MCP server with MCP Inspector, open a second terminal and run:

```bash
npx @modelcontextprotocol/inspector
```

Then follow: connect -> list tools -> search_documents.

The MCP server runs locally over stdio and calls the local search API. The
service token authenticates MCP-to-API requests. MCP is optional and starts
separately from `pnpm dev`.

## Local Architecture

``` text
Browser
   |
   v
localhost:3000 (Next.js)
   |
   v
localhost:4000 (Express API)
   |
   v
localhost:5433 (Docker PostgreSQL + pgvector)
```

The root `.env` configures the API, frontend and MCP. CORS allows the local
frontend origin. Docker exposes PostgreSQL only on the local loopback address;
`pnpm db:stop` stops it without deleting the indexed corpus or user accounts.

## Design Decisions

### Retrieval

`RETRIEVAL_MODE=hybrid` is the default across chat, search and MCP. It alternates
dense and lexical candidates, emitting each chunk once. This gives lexical-only
evidence a place alongside dense hits rather than letting similar reports
occupy the entire context. Lexical search accepts any normalized query term,
ranks term coverage first, then length-normalized PostgreSQL text relevance.
It does not require every word in a natural question to appear in one document.

`RETRIEVAL_MODE=dense` retains the semantic baseline. `rrf` exposes equal-weight
RRF over the corrected candidate lists. No query rewriting, question-specific
ranking rules, generated summaries or additional model calls were added.
Balanced retrieval is a targeted correction for the observed failure; its
overall before/after quality has not been measured in this change.

### Abstention

The generator must answer exclusively from retrieved evidence, cite every
claim using a supplied paragraph ID and identify missing requested details.
The server resolves those IDs to the original paragraph text; it does not ask
the model to reproduce quotations. Unknown IDs and malformed output produce a
verification error, not an assertion that the knowledge base lacks an answer.
Partial answers are explicitly labeled. Quote provenance is guaranteed by
source lookup; factual correctness and semantic
entailment still require live evaluation and human review. Similarity and
ranking scores are never treated as calibrated answer confidence.

### Chunking

Documents below the configured chunk-size limit remain intact. Larger
documents are split at heading, paragraph and line/word boundaries before embedding, avoiding
unnecessary fragmentation of already-small source documents.

### Optional Validation

These commands are separate from local startup and only run when requested:

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
