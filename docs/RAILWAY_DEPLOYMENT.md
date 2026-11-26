# Railway portfolio deployment

This is a deployment runbook for a reviewed branch. During preparation, no Railway
resources were created or changed, and no database migrations, ingestion or
deployment were performed. Deployment and data initialization remain explicit,
operator-approved steps.

## Service configuration

Keep exactly three Railway services: **web**, **api**, and **postgres**. Gemini
clients, query embedding, retrieval, generation and application caches all run
inside the API. Do not create a separate AI worker or MCP container. The optional
MCP stdio client remains a local tool that calls the existing API search route.

Create the two application services from the same reviewed Git commit. Keep **Root Directory
set to `/` for both**, so pnpm can resolve workspace packages and the lockfile.
Set each service's Config File path explicitly; Railway does not resolve this
path relative to the service root. See the official
[monorepo guide](https://docs.railway.com/deployments/monorepo) and
[Dockerfile configuration](https://docs.railway.com/builds/dockerfiles).

| Setting | API | Web |
| --- | --- | --- |
| Config File | `/railway/api.toml` | `/railway/web.toml` |
| Dockerfile | `railway/api.Dockerfile` | `railway/web.Dockerfile` |
| Build context | Repository root | Repository root |
| Install in build stage | `pnpm install --frozen-lockfile --filter @playable-factory/api...` | `pnpm install --frozen-lockfile --filter @playable-factory/web...` |
| Build in build stage | `pnpm build:api` | `pnpm build:web` |
| Production start, from `/app` | `node apps/api/dist/index.js` | `node apps/web/server.js` |
| Deployment health check | `/health/ready` | `/health` |
| Health timeout / replicas | 120 seconds / 1 | 120 seconds / 1 |
| Serverless | `sleepApplication = true` | `sleepApplication = true` |
| Runtime CPU / RAM ceiling | 0.5 vCPU / 512 MiB | 0.5 vCPU / 512 MiB |

The Dockerfiles supply Node 22 and pnpm 10.34.5. The API runtime installs
production dependencies only. The web runtime contains Next.js standalone
output and static assets; its start command refers to the **packaged** server,
not a source file. Do not replace it with `next dev` or `tsx watch`.

API and web bind to `0.0.0.0` and read Railway's injected `PORT`. Leave `PORT`
unset unless a fixed port is deliberately configured; the public domain's
target port must match it. `HOSTNAME=0.0.0.0` is supplied by the web image.
Railway checks the configured endpoint while promoting a deployment. Do not add
periodic uptime pings, cron requests or browser keep-alive calls for this demo:
their responses can prevent sleeping. Use deployment health checks and on-demand
diagnostics. See
[Railway health checks](https://docs.railway.com/deployments/healthchecks).

## Low-traffic serverless and resource configuration

Both application TOML files set `deploy.sleepApplication = true`, keep one
replica, and set `deploy.limitOverride.containers.cpu = 0.5` and
`memoryBytes = 536870912`. These are runtime ceilings; production builds run in
the build stage. The existing start commands and health check paths stay in place.

| Service | Serverless | Suggested runtime ceiling | Persistent storage |
| --- | --- | --- | --- |
| Web | On | 0.5 vCPU, 512 MiB RAM | None |
| API | On | 0.5 vCPU, 512 MiB RAM | None; caches are disposable |
| PostgreSQL/pgvector | **Off** | 1 vCPU, 1 GiB RAM | Existing database volume and backups |

Configure the PostgreSQL ceiling manually in its Railway service settings and
leave its Serverless switch off. No database resource is modified by this branch.
These are conservative starting ceilings for the three-document demo, not measured
Linux memory guarantees. Verify cold-start and ingestion peak RSS/CPU after review;
increase RAM if there are OOM restarts rather than removing safeguards. A ceiling
does not reserve that much memory or promise a fixed monthly cost. See
[Railway cost controls](https://docs.railway.com/pricing/cost-control).

Railway currently detects inactivity from outbound traffic after at least five
minutes; the first request wakes a sleeping service and can be slower or return
a transient 502. The setting takes effect on a newly deployed container, so these
files do not change a running service until an approved deployment. No automatic
chat retry or synthetic traffic is added. Avoid static outbound IPs and telemetry
agents that keep emitting traffic. See
[Railway Serverless](https://docs.railway.com/deployments/serverless).

The web image already disables Next telemetry. No application polling, cache
sweep timer, warm-up loop, or self health request runs in the background. The
ingestion advisory-lock check runs only during explicit ingestion and remains
necessary for safe indexing. RAG request summaries are off by default; set
`RAG_DIAGNOSTICS=true` temporarily when debugging. Sanitized error logs remain.

### PostgreSQL connections and idle memory

The API lazily opens at most **three** connections per process, keeps no minimum,
closes idle connections after **5,000 ms**, and disables client TCP keep-alive.
`allowExitOnIdle=true` releases pool event-loop references; the HTTP listener keeps
the API running until Railway sleeps it or sends SIGTERM. Existing 5-second
connection/statement timeouts remain. There are no database heartbeat queries.

Use `DATABASE_POOL_MAX=3` and `DATABASE_IDLE_TIMEOUT_MS=5000`. The pool minimum
allowed maximum is two because ingestion/initialization can hold a lock connection
while issuing another query. For a single low-traffic service, do not increase the
pool to the PostgreSQL connection limit. Allow room for rolling overlap (two API
replicas during promotion), CLI ingestion/migrations and operator connections.
See [node-postgres pooling](https://node-postgres.com/apis/pool).

For the dedicated PG16 demo database, optional conservative PostgreSQL settings
are `max_connections=20`, `shared_buffers=128MB`, `work_mem=4MB`, and
`maintenance_work_mem=64MB`. If your chosen image is the documented
`pgvector/pgvector:pg16`, its reviewed start command can be:

```sh
postgres -c max_connections=20 -c shared_buffers=128MB -c work_mem=4MB -c maintenance_work_mem=64MB
```

Apply those settings only through a reviewed database service change. Keep the
volume, `PGDATA`, WAL durability, autovacuum and backups intact. Do not reset the
database or disable vacuum/fsync to reduce idle usage. The database remains
persistent and awake while web/API may sleep. The proposed values are starting
settings for this small corpus; PostgreSQL documents their memory and connection
tradeoffs in [PG16 resource consumption](https://www.postgresql.org/docs/16/runtime-config-resource.html)
and [connection settings](https://www.postgresql.org/docs/16/runtime-config-connection.html).

Local production equivalents, from the monorepo root:

```sh
pnpm build:api
pnpm start:api
pnpm build:web
pnpm start:web
```

`pnpm start:web` runs the regular Next production server in the source checkout.
The Docker image uses the standalone start command in the table. All build
dependencies must be installed before building; do not use a production-only
install in the build stage. No build/start command runs migrations or ingestion.

## Environment variables

Set variables per service in Railway. Production does not load a root `.env`.
Never put secrets in `NEXT_PUBLIC_*`, Docker build arguments, source files,
command-line arguments, screenshots, or logs.

### API only

| Variable | Portfolio value / requirement |
| --- | --- |
| `NODE_ENV` | `production` (also set by the image) |
| `DEMO_MODE` | `true` (also the API image default) |
| `DATABASE_URL` | Private connection URL for a **new, dedicated** pgvector database, referenced from the database service |
| `DEMO_DATABASE_NAME` | Exact database name in that URL, e.g. `portfolio_demo`; it is not the Railway service name |
| `CORPUS_PATH` | `demo-corpus` (also the image default); any other demo path is rejected |
| `JWT_SECRET` | At least 32 random bytes; generate a new value for this deployment |
| `CORS_ORIGIN` | Exact public HTTPS web origin, e.g. `https://portfolio.example.com`, with no trailing slash, path or wildcard |
| `GEMINI_API_KEY` | Private, dedicated Gemini project/key with appropriate provider quotas |
| `GEMINI_EMBEDDING_MODEL` | Explicit model supported by your key; current code default is `gemini-embedding-001` |
| `GEMINI_CHAT_MODEL` | Explicit model supported by your key; confirm availability before release rather than assuming the existing code default is available |
| `RETRIEVAL_MODE` | `hybrid` (default), `dense`, or `rrf` |
| `TRUST_PROXY_HOPS` | `1` when public traffic reaches the API exclusively through Railway's direct edge proxy; otherwise `0` |
| `DEMO_DAILY_GEMINI_CALL_LIMIT` | `40` by default, integer 1–1000 |
| `DEMO_MINUTE_GEMINI_CALL_LIMIT` | `6` by default, integer 1–30 |
| `DATABASE_POOL_MAX` | `3` by default, integer 2–10; `min=0` connections are retained |
| `DATABASE_IDLE_TIMEOUT_MS` | `5000` by default, integer 1000–30000 |
| `QUERY_EMBEDDING_CACHE_TTL_MS` | `900000` (15 minutes), integer 1–3600000 |
| `QUERY_EMBEDDING_CACHE_MAX_ENTRIES` | `128`, integer 1–512; also capped at 2 MiB of stored key/value payloads |
| `RAG_RESPONSE_CACHE_TTL_MS` | `300000` (5 minutes), integer 1–1800000 |
| `RAG_RESPONSE_CACHE_MAX_ENTRIES` | `32`, integer 1–128; also capped at 2 MiB of stored key/value payloads |
| `RAG_DIAGNOSTICS` | `false` by default; set `true` only for temporary RAG request summaries |
| `MCP_SERVICE_TOKEN` | Optional private random token, at least 32 characters; leave unset if unused |
| `JWT_EXPIRES_IN` | Normal account sessions only; demo sessions always expire after 15 minutes |

Existing Railway variables override code defaults. When approving this change,
explicitly update any old `100`/`10` Gemini quota values to **40/day** and
**6/minute**. Persistent counters are retained; no quota reset is performed.

Generate a secret locally and transfer it directly to the service's private
variables; do not commit or share its output:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not attach the API's database credentials or Gemini/JWT/MCP secrets to the web
service. If TLS is required by your database endpoint, use its documented
certificate/SSL configuration; the application does not disable certificate
verification. Prefer Railway private networking for the API-to-database link.

### Web only

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Exact public HTTPS API origin, e.g. `https://api.example.com` |
| `NEXT_PUBLIC_DEMO_MODE` | `true` |
| `NODE_ENV` | `production` (image default) |
| `HOSTNAME` | `0.0.0.0` (image default) |

The two public variables are **build-time** values. The Dockerfile declares only
these public build arguments. Rebuild the web image when either changes. An
HTTPS API origin is required by the web Docker build. The browser calls the API
directly, so a Railway private hostname cannot be used as `NEXT_PUBLIC_API_URL`.

## Persistent PostgreSQL and pgvector

1. Provision a **new** database for this demo. Do not point the service at the
   local/original case-study database or restore its corpus into the demo.
2. Use a PostgreSQL image that includes pgvector, for example
   `pgvector/pgvector:pg16`, or an equivalent verified Railway pgvector service.
   Pin the image digest after reviewing it. A plain PostgreSQL image cannot
   install a missing extension binary just by running SQL.
3. For the example PG16 image, attach a persistent Railway volume at
   `/var/lib/postgresql/data`, set `POSTGRES_DB=portfolio_demo`, and configure a
   private database user and a fresh strong password. Match the database service
   connection variables to that user, database and port 5432. Use the chosen
   image's data directory if a different image/version is selected.
4. Enable database backups and verify a restore to a separate database before
   exposing the demo. Web/API filesystems need no persistent volumes.
5. With an operator database connection, check:

```sql
SELECT name, default_version, installed_version
FROM pg_available_extensions WHERE name = 'vector';
```

The migration runner checks extension availability first. Migration `0001`
enables `vector` and creates 768-dimensional embeddings. Its operator role must
be permitted to create the extension. If the provider requires an administrator,
have that administrator run `CREATE EXTENSION IF NOT EXISTS vector;` first.

## Reviewed migrations and initialization

Review every pending SQL file in `apps/api/drizzle` against a backup. Existing
migrations are unchanged. New migration `0003_warm_thor_girl.sql` only creates
`deployment_identity`, `request_budgets`, and an expiry index. It does not delete
or rewrite corpus rows, embeddings or credentials. Drizzle records applied
migrations; do not use `drizzle-kit push`, schema resets, or down migrations.

Bootstrap the new database using **one** of these operator-controlled methods:

- Build locally with `pnpm install --frozen-lockfile` and `pnpm build:api`, then
  set the API variables privately in an operator shell. For a local shell use
  the provider's externally reachable URL or an approved tunnel; a Railway
  private hostname is not reachable from your laptop. Run the commands below.
- Alternatively, after SQL review, temporarily set the API's Railway Pre-Deploy
  Command to `sh -c 'node apps/api/dist/db/migrate.js && node apps/api/dist/scripts/init-demo.js'`.
  Remove it after the approved bootstrap. It is intentionally absent from the
  checked-in configuration. This runs in the image with service variables and
  private networking; a failure stops promotion. See
  [pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command).

```sh
# Run only with privately configured DATABASE_URL, DEMO_MODE=true,
# DEMO_DATABASE_NAME=<the dedicated database name>, CORPUS_PATH=demo-corpus.
pnpm db:migrate:production
pnpm db:demo:init
```

`db:demo:init` refuses an unmarked database containing existing users, documents,
ingestion runs or search logs. It never clears them. It stamps an empty database
as `synthetic-portfolio-v1`; repeating it on that demo database is safe. API
startup/readiness require this marker and reject other corpus paths in the
database. Retrieval also filters to the three approved `demo/` paths. This is an
additional guard, not a substitute for a dedicated database.

Do **not** run `pnpm setup` or `pnpm db:seed` in production. Development seeding
is refused in production/demo mode. It now preserves existing local account
credentials on repeat runs. Public demo sessions require no seeded account.
Password login in demo mode is blocked, including previously issued ADMIN
tokens; normal production login also rejects the documented local demo accounts.

## Explicit synthetic ingestion

The original `corpus/` remains in the source repository for local development
and historical retrieval evaluation. It is excluded from **both Docker build
contexts**, along with case-study evaluation reports. The API runtime includes
only `demo-corpus/`; the web runtime contains no corpus. Repository visibility
and permission to share the original Git history are separate review decisions.

The three new documents contain only invented Aurora Garden project facts and
are explicitly marked synthetic. After initialization, start the API and run
ingestion once, explicitly:

```sh
# In the already configured API image/operator environment:
pnpm ingest:production
```

For an approved deployed service with Railway CLI access, the equivalent is:

```sh
railway ssh --service api -- node apps/api/dist/scripts/ingest.js
```

See [Railway SSH](https://docs.railway.com/cli/ssh). CLI authentication/linking
and SSH key registration are manual prerequisites. This runbook does not invoke
these commands on your account.

Ingestion requires the Gemini key and the same embedding model as retrieval. It
uses 768-dimensional normalized vectors. New embeddings are prepared before
atomic per-document replacement. Unchanged documents are skipped; failures keep
the previous successful index. Missing documents are retained for operator
review. Demo ingestion validates the exact three-file corpus and database marker
before any ingestion writes. It consumes the same provider call quota as chat.
No original corpus is ever ingested automatically. The demo UI/API cannot
trigger ingestion; the normal authenticated ADMIN workflow remains available
outside demo mode.

Verify using a private database console:

```sql
SELECT key, value FROM deployment_identity;
SELECT path, status, embedding_model, embedding_dimensions FROM documents ORDER BY path;
SELECT count(*) AS chunks FROM document_chunks;
SELECT status, documents_processed, documents_failed FROM ingestion_runs ORDER BY id DESC LIMIT 1;
```

Expected: exactly `demo/overview.md`, `demo/releases.md`, `demo/runbook.md`, each
`INDEXED`, with the configured model and 768 dimensions. A fresh ingestion creates
three chunks. Do not change the embedding model on a live index without an
explicit re-ingestion; incompatible vectors are excluded from retrieval.

## Demo permissions and usage bounds

- `POST /api/auth/demo` creates a 15-minute HS256 JWT restricted to USER demo
  claims, with issuer/audience/expiry checks. It accepts no requested role.
- Demo registration, password login, ADMIN dashboard and HTTP ingestion are
  denied on the server. No user accounts or question analytics are persisted in
  demo mode. Only internal usage counters change during public use.
- Auth endpoints share 10 requests per IP per fixed 15-minute window. Chat and
  search/MCP share 5 requests per IP per fixed minute. Counters are atomic in
  PostgreSQL, persist across restarts, and apply across API replicas. IP keys are
  HMAC hashes. A bounded in-memory admission limit adds 120 API requests per IP
  per minute per process. Local non-demo development uses in-memory counters.
- Every Gemini SDK request reserves a shared minute and UTC-day allowance in
  PostgreSQL first, including failed calls and CLI ingestion. Defaults are
  6/minute and 40/day. A cache-miss chat uses at most one query embedding and one
  generation; a cache-miss search uses one embedding. Cache hits skip the relevant
  provider calls but still require auth and consume the HTTP request quota.
  Quota reservations are conservative and are not
  refunded. Store failures block requests instead of permitting unmetered calls.
- Demo SDK retries and embedding retries are disabled. Provider requests have a
  15-second timeout, generation is limited to 1,024 output tokens, retrieved
  context to 12,000 characters/eight chunks, questions/queries to 2,000 characters,
  search results to 20, and JSON bodies to 16 KiB. No tools are enabled for Gemini.
- Expired quota rows are cleaned in bounded batches after a one-day retention.
  A fresh JWT or service restart does not reset counters. Confirm the edge's
  forwarding behavior before enabling `TRUST_PROXY_HOPS=1`; with `0`, all requests
  arriving from one proxy may share a stricter quota. Never use `trust proxy=true`.
- A private MCP service token authorizes only search and receives the same query
  bounds and budgets. The MCP server remains optional and runs locally over stdio.
  Never publish that token in browser settings or distribute it to demo visitors.

The call cap bounds application requests, not a promised currency amount.
Configure provider-side quotas/spending controls on a dedicated key as an
additional operator control. No live model quality or account availability is
claimed by offline smoke tests.

## Bounded embedding and RAG caches

Both caches live only in the API process. Default query embedding TTL is 15
minutes/128 entries and response TTL is 5 minutes/32 entries. Each cache also caps
stored key/value payloads at 2 MiB, with small bounded bookkeeping overhead.
Entries expire from insertion time; reads do not extend TTL. Least-recently-used
entries are evicted when full and oversized entries are skipped. Expiration is
lazy, so no background timer or traffic keeps the service awake. Restart/sleep
may discard caches; persistent quotas and the index remain in PostgreSQL.

Concurrent identical misses share one in-flight computation, whose tracking is
also bounded. Cached values are defensively copied, failures are not retained,
and invalid-grounding/temporary empty-index responses are not cached. Valid
evidence-based abstentions can be cached. Document embeddings and measured
evaluation callbacks bypass caching; retrieval ranking, top-K, context size and
citation validation are unchanged.

Before using a cache, every chat/search reads a compact ordered fingerprint of
the selected corpus's **published document metadata** from PostgreSQL: IDs,
paths, titles, status, content checksums, indexing fingerprints, models,
dimensions and publication timestamps. That fingerprint and the database/corpus,
demo mode, embedding/chat model, normalization/chunking profile, retrieval mode,
and generation/context settings scope the cache keys. Questions match exactly
after trimming outer whitespace; no lowercasing, fuzzy matching or query rewriting
is performed.

Successful atomic ingestion clears local caches after commit. A CLI or another
process publishing changed/added/deleted documents changes the on-demand
fingerprint and invalidates both caches on the next request. No new migration,
PostgreSQL notification listener or revision polling is required. In-flight work
cannot refill a cache that was invalidated. Model/environment changes require a
service restart as usual and use a separate namespace. Changing the embedding
model still requires explicit ingestion of compatible vectors.

Only the existing ingestion path should publish corpus changes: it updates
checksums/publication metadata in the same transaction as chunks. For a manual
SQL repair that bypasses that metadata, restart the API after committing the
repair. Source-file edits become searchable only after explicit ingestion.

Cache keys are hashes; no question, vector, answer, JWT or secret is logged by
the cache. Responses contain only the shared authorized corpus context, so
USER/ADMIN token data are not stored in cache entries. Authentication, exact
CORS checks and all per-IP quotas run **before** cache lookup. A database revision
read failure does not serve an old cached answer. If per-document/user ACLs are
introduced later, their permission scope must also be added to the keys.

## Health and release smoke checks

`GET /health` is API liveness. `GET /health/ready` checks connectivity, migrated
tables, the vector type, and demo identity; errors return 503 without internal
details. Readiness is cached for three seconds and does not call Gemini. An
empty initialized index is ready but answers abstain until ingestion completes.
Web `GET /health` returns `{ "status": "ok", "service": "web" }`.

After the operator approves a deployment:

1. Check both configured health URLs and verify HTTPS origins/CORS.
2. Enter the demo without credentials and ask which languages Aurora Garden 1.1
   supports. Inspect citations to the synthetic documents.
3. Ask for Aurora Garden revenue; the corpus has no revenue data, so the model
   should abstain. This live behavior still needs manual verification.
4. Confirm unauthenticated chat/search return 401; demo registration/login return
   403; the demo JWT gets 403 on dashboard and ingestion endpoints.
5. Confirm overlong input returns 400, malformed JSON 400, oversized bodies 413,
   denied origins 403, and exhausted limits 429 with `Retry-After`.
6. Send a forged `X-Forwarded-For` from outside Railway and confirm it cannot reset
   the effective client quota. Verify counters survive an API restart.

Local verification commands:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm audit --prod --audit-level low
```

For the portfolio production build, configure the two public web variables.
PowerShell example (the URLs and secret markers below are test values only):

```powershell
$env:NEXT_PUBLIC_API_URL = 'https://api.example.invalid'
$env:NEXT_PUBLIC_DEMO_MODE = 'true'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:GEMINI_API_KEY = 'BUILD_ONLY_SECRET_SENTINEL'
$env:JWT_SECRET = 'BUILD_ONLY_JWT_SENTINEL_NOT_A_REAL_SECRET'
pnpm build
pnpm test:smoke:api
pnpm test:smoke:web
```

The web smoke starts/stops the compiled standalone server on an available local
port, verifies static asset packaging and security headers, and checks client JS
for the artificial server-secret markers. It performs no API/database/model calls.

The API compiled smoke uses an unreachable dummy database URL. It verifies
injected PORT/liveness, a 503 readiness response, production refusal to start
without a prepared database, sanitized startup logs, and disabled production
seeding. It does not run migrations, ingest data or call Gemini.

With a disposable, isolated PostgreSQL/pgvector test database, set
`TEST_DATABASE_URL` privately and rerun `pnpm test`. Integration tests create and
drop only randomly named test schemas; they do not migrate/truncate/reindex the
application database. Do not use the original corpus or public demo database as
the test database.

Before release, also build and smoke the actual Linux containers:

```sh
docker build -f railway/api.Dockerfile -t rag-portfolio-api .
docker build -f railway/web.Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.invalid --build-arg NEXT_PUBLIC_DEMO_MODE=true -t rag-portfolio-web .
```

Use real reviewed public origins for deployment builds. Container tests must use
the isolated test/demo database and private runtime environment variables; do not
pass secrets as Docker build arguments.

## Rollback

Record the reviewed Git SHA, image digests, configured model IDs and current
database backup before release. If health or permissions fail, remove public
access or restore the prior **reviewed secure demo** image/configuration for both
services. Do not roll back to the original insecure defaults or disable demo mode
to get a healthy check. Rebuild web with the matching API origin when necessary.

Keep the database volume and quota counters. The new migration is additive; leave
its tables in place during an application rollback. Never reset/truncate the
database, run down migrations, or replace the demo index with the original
corpus. Restore a backup into a separate database only after operator review.
Rotate JWT/MCP/Gemini secrets if exposure is suspected; JWT rotation invalidates
current sessions. This implementation has not performed any rollback or resource
operation.

## Low-traffic optimization verification — 25 November 2026

Branch `codex/railway-low-traffic` starts from fetched `origin/main` commit
`85ebf88`, which already contains the security preparation. During implementation,
no merge, Railway deployment, database setting change, migration or ingestion was
performed. No new dependency or database migration is needed.

| Command/check | Result |
| --- | --- |
| `pnpm test` | 49 passed, 2 PostgreSQL integration tests skipped without `TEST_DATABASE_URL` |
| `pnpm lint` | API and web passed |
| `pnpm build` with the public test environment above | Shared, API, local MCP package and Next production builds passed; MCP is not deployed |
| `pnpm test:smoke:api` | Passed: compiled PORT/health/readiness, safe startup failure and refused production seeding |
| `pnpm test:smoke:web` | Passed: standalone PORT/health/demo/assets/headers/client secret markers |
| `git diff --check` | Passed |
| Live pgvector/idle sockets, Railway sleep/wake, Linux container resource peaks | Not measured: no isolated test DB; Docker Desktop engine unavailable; Railway resources left unchanged |

New offline tests cover absolute TTL expiry, LRU/byte/in-flight bounds, defensive
copies, request coalescing, failure retries, invalidation during in-flight work,
corpus/model/scope changes, real SDK request avoidance using mocked fetch,
unchanged citation validation, evaluation bypass, and authorization/rate limits on
cached answers. Optional PostgreSQL tests additionally verify published revision
changes, bounded pool concurrency, closing idle connections and reconnecting on
demand. Those database assertions remain unexecuted until `TEST_DATABASE_URL` is
provided for a disposable pgvector database.

Before approving release: run both database integrations and Linux image builds;
verify the configured 512 MiB application ceilings under cold start and ingestion;
configure PostgreSQL Serverless **off**, its persistent volume/backups, and the
suggested 1 GiB ceiling; set existing Gemini variables to 40/6; then verify actual
sleep/wake without uptime pings and that cache hits/reindexing behave correctly.
Changing service settings or deploying this branch still requires review.

## Initial security preparation — 25 November 2026

Local checks ran on Windows with Node 26.13.0 and pnpm 10.34.5. Linux container
checks with the images' Node 22 runtime remain a required release gate.

Reviewed workspace scripts/dependencies, Next production output, API routes,
JWT/MCP authorization, input/CORS/error handling, Drizzle migrations, ingestion,
retrieval/generation/evaluation boundaries and corpus packaging. RAG ranking,
grounding/citation validation and existing evaluation datasets are preserved.
Development remains opt-in to demo mode and retains normal USER/ADMIN workflows.

| Command/check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --offline=false` | Passed; initial sandbox-only offline attempt could not fetch missing packages |
| `pnpm install --frozen-lockfile --offline` after updates | Passed; manifests and lockfile agree |
| `pnpm --filter @playable-factory/api db:generate` | Passed using an unused dummy database URL; only generated additive SQL/snapshot files, no DB connection |
| `pnpm test` | 37 passed, 2 PostgreSQL integration tests skipped without `TEST_DATABASE_URL` |
| `pnpm lint` | API and web passed; existing React effect/state lint errors fixed |
| `pnpm build` with the public test variables above | Shared, API, MCP and Next production builds passed |
| `pnpm test:smoke:web` | Passed: standalone PORT/health/demo/static assets/headers/client secret-marker checks |
| `pnpm test:smoke:api` | Passed: compiled PORT/liveness/readiness, production fail-closed startup, safe logs and refused production seeding |
| `pnpm audit --prod --audit-level low` | No known production vulnerabilities; initial audit found 62 advisories |
| Full `pnpm audit` | Two moderate development-only advisories remain in esbuild (Drizzle tooling) and minimatch (lint tooling); no high/critical advisories |
| Docker / live database / Gemini | Not run: Docker Desktop engine unavailable; no isolated test DB or live model calls used |

Next.js/ESLint config were updated together to 16.4.5, Express to 5.3.0, MCP SDK
to 1.32.2 and Zod to 4.6.7. Narrow version-qualified pnpm overrides pin patched
transitive packages. The two remaining development-tool advisories are excluded
from the production images; resolving their major/toolchain changes is deferred
to a separate tooling review. pnpm also reports blocked dependency lifecycle
scripts; the tested lint/build/test commands succeed without enabling them.

**Manual release gates:** review this branch/SQL; run Linux image builds and both
database integration tests; provision/verify a persistent pgvector database;
configure private secrets and exact public origins; explicitly migrate,
initialize, and ingest only synthetic data; verify model access, live citations,
forwarded IP behavior and persistent quotas; then review/approve deployment.
