# RAG architecture audit

Audit date: 2026-10-28. Incoming workspace: `6cac430`; original main:
`bf5191f`. Incoming experiments were committed before changes so they remain
reviewable. No changes were merged into main or deployed to production.

A subsequent user-generated run completed 33 RAG cases. Its analysis and the
follow-up changes are recorded in [the user-run analysis](evaluation/2026-10-28-user-run-analysis.md).
Historical measurements below remain tied to their original revisions.

## Findings and evidence

| Finding | Evidence in incoming revision | Consequence | Resolution |
| --- | --- | --- | --- |
| Evidence fragmentation | `chunking-service.ts`: size changed from 1200 to 400, overlap from 200 to 80 | Most small documents lose their title/qualifiers or related facts when only one chunk is selected | Preserve short documents; pack paragraphs and headings, split oversized blocks at line/word boundaries; no default overlap |
| Arbitrary intent boosts | `retrieval-service.ts`: `getQueryAwareMultiplier`, fixed 1.15/0.85 boosts based on substring matches | Broad words such as “why” favor incident documents even when the question concerns a delivery report; mentioning deprecation in a current migration guide can penalize that guide | Remove runtime question classifiers and boosts |
| Misleading score scale | RRF winner normalized to 1, then mixed with cosine; multi-query adds a second normalization | Query-relative rank looks like calibrated confidence; the highest-ranked result receives a fixed boost even for unrelated questions | Keep cosine and raw RRF ranking scores separate; UI explicitly labels cosine |
| Pipelines disagree | Chat uses multi-query without a cutoff; search/MCP uses hybrid then filters cosine >=0.65 | Same question can receive different evidence across integrations | One authoritative dense retrieval entry point; search returns candidates; chat validates evidence |
| Rewrite risk and cost | `query-rewrite-service.ts`: three generated alternatives plus original; equal votes | Rewrites can change names, dates and intent; consensus favors repeated generic documents | Remove automatic rewriting; one query embedding |
| Context reconstruction | `rag-service.ts`: select eight chunks, cap at two per document without backfill, then fetch neighbors separately | Missing evidence, repeated overlap and up to eight extra queries; neighbor content may belong to a later reindex than the selected hit | Pass retrieved passage snapshots directly to generation; deduplicate identical content; bounded context |
| Invalid source attribution | Model emits free text; every diversified document returned even if uncited; document dedup does not preserve source numbering | Sources do not establish which passages support which claims | Stable chunk IDs, structured claims/citations, exact quotation checks and cited sources only |
| Search outage on reindex | `ingestion-service.ts`: set PENDING before embedding; retrieval requires INDEXED | Valid old chunks disappear for the whole embedding operation; failure leaves them hidden as FAILED | Prepare before publishing; atomically swap metadata/chunks; preserve last successful version on failure |
| No real skip/config tracking | Checksum overwritten before publication and never used to skip; model/chunk configuration not recorded | Repeated cost, stale embeddings, incorrect status after failure | Skip only matching successful checksum + fingerprint; persist embedding model/dimensions |
| Concurrent/abandoned ingestion | No process-wide lock or interrupted-run recovery | Admin and CLI can interleave; RUNNING can persist after a crash | PostgreSQL advisory session lock on the same connection used for publishing; progress checkpoints; abandoned runs marked failed by next lock owner |
| Weak evaluation | “Top-3 recall” means any expected source, negative abstention uses only cosine; versioned runners duplicate logic | A partial multi-document result passes; hallucinations and citation mistakes go unmeasured | One runner; gold passages, source recall/precision/MRR, passage coverage, separate generation and abstention metrics |

These are confirmed code behaviors and measured fragmentation. Their exact
contribution to the reported end-to-end accuracy loss remains unquantified:
the configured Gemini credentials returned HTTP 401 before live retrieval.

## Historical comparison

- `a1bb8e6`: simple dense search, five chunks; embeddings lacked retrieval task
  types and manual normalization. Do not restore that embedding configuration.
- `34ca46f`: grounded prompt with a 0.55 cosine cutoff. Citation syntax and
  actual supporting evidence were not validated.
- `22353a6`: weighted hybrid and 0.65 cutoff. Raising the cutoff necessarily
  discards all evidence in [0.55, 0.65), irrespective of whether it answers a
  question. No held-out evidence here establishes that this was a sound tradeoff.
- `78ccc46` and incoming multi-query: normalized RRF blended with cosine. For a
  top-ranked hit, `0.7*cosine + 0.3` creates an apparent confidence floor. Another
  blend further distorts that scale. It cannot calibrate answerability.

The old ten-positive/five-negative suite repeatedly tests five main topics and
easy unrelated negatives. Its historical 90% dense / 100% hybrid top-1 results
do not establish better multi-document, version-sensitive or generated answers.
No historical result was reproduced in this audit, and no new live accuracy
improvement is claimed.

## Revised pipeline

```text
Corpus -> sorted Markdown loading -> paragraph chunks -> document embeddings
       -> atomic publication with checksum/configuration metadata

Question -> one query embedding -> dense + lexical candidates -> balanced selection
         -> paragraph snapshots with IDs -> one structured generation call
         -> server-side citation resolution -> full/partial answer, abstention or error
```

Search/API/MCP expose the same ranked candidates. They do not claim to have
answered the question and do not discard moderate-similarity evidence. Chat
uses eight candidates instead of search's default five, with the same ranking
algorithm. This is an explicit context budget, not a confidence threshold.

`similarity` remains cosine. The compatibility field `relevance` is an
uncalibrated ranking value: cosine for dense/balanced retrieval, raw RRF for `rrf`.
It is never used to decide whether evidence is sufficient.

The default is now balanced dense/lexical retrieval, addressing the observed
flood of similar meeting notes. PostgreSQL-normalized query terms are matched
with OR; candidates rank by term coverage, length-normalized text relevance,
and stable chunk ID. The two ranked lists are interleaved with duplicate IDs
removed. `dense` and `rrf` remain selectable comparisons. This algorithm change
has not been evaluated in a new live run; its quality impact is unverified.

There is no reranker, generated query expansion, agent orchestration, framework
adoption, filename weighting or question-specific runtime behavior. Gold
answers and expected passages are confined to evaluation and tests.

### Embedding compatibility

Retained: `gemini-embedding-001` configuration from the environment, 768
dimensions, RETRIEVAL_DOCUMENT for documents, RETRIEVAL_QUERY for queries,
document title in its dedicated field, and unit normalization. Nonfinite/zero
vectors are rejected. The fingerprint includes model, dimensions, task types,
normalization, title policy, chunking configuration and implementation version.

These choices follow [Google's embedding documentation](https://ai.google.dev/gemini-api/docs/embeddings).
No model or provider migration was introduced.

### Grounding and limits

Generation has a system instruction separate from the JSON containing the
untrusted question and retrieved text. It must preserve dates, project names,
identifiers and version scope; explain unresolved conflicts; use explicit
supersession evidence for current behavior; preserve historical behavior when
requested; and identify missing information for partial answers.

The single generation call uses structured output, following
[Google's structured output documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).
Every returned claim selects one or more server-issued paragraph IDs from a
schema-constrained enum. The server attaches the actual paragraph text from
the retrieved snapshot, avoiding model transcription errors. Unknown IDs or
malformed claims produce a verification error, distinct from evidence-based
abstention. Only cited chunks/paragraphs are returned. Partial evidence is
explicitly labeled. Legacy source/quote payloads still require provenance
validation and cannot bypass source checking.

Quote provenance **does not prove semantic entailment**: a model can attach a
real quote to an unsupported claim. Prompt adherence, conflict resolution,
factual correctness and semantic faithfulness need live evaluation and human
review. The report leaves those metrics null instead of relabeling substring
matches as correctness. The paragraph-ID protocol is intended to remove a
formatting failure mode; its end-to-end quality impact remains unverified.
Evaluation is separate from local startup.

## Measured before/after and validation

Same corpus hash: `006e511032561a03de1533d007c5ad64bbf7fbad43927d0173899e675c85482e`.

| Measurement | Incoming | Revised |
| --- | ---: | ---: |
| Documents | 142 | 142 |
| Chunks | 455 | 142 |
| Documents split | 134 | 0 |
| Indexed characters | 136664 | 113166 |
| Intact paragraphs | 623/643 | 643/643 |
| Live retrieval/answer accuracy | Unavailable: Gemini 401 | Unavailable: Gemini 401 |

Every checked-in document fits the 1200-character limit; there is one passage
per document and thus natural document diversity in this corpus. Larger future
documents are covered by chunk boundary tests but need representative live
retrieval evaluation. Context budgets and RRF K=60 remain explicit, untuned
resource/ranking parameters, not correctness guarantees.

Actual checks performed:

- Full `pnpm build`: shared, API, MCP and production Next.js build passed.
- API lint passed after adding the missing TypeScript ESLint configuration.
- API tests: 26 passed; one PostgreSQL/pgvector transaction integration test
  skipped because TEST_DATABASE_URL was not configured. No database transaction
  behavior is claimed to have been exercised live.
- Local HTTP tests exercised unauthenticated chat/search, JWT/MCP access, and
  malformed input rejection without invoking Gemini or a database.
- All gold passages in 40 cases were checked against their actual corpus files;
  7 are tuning cases and 33 are held out from metric-driven tuning.
- Live revised retrieval evaluation recorded a failed run, zero completed
  cases, one embedding API request and HTTP 401; no generated answers or costs.
- Frontend lint reports two pre-existing `react-hooks/set-state-in-effect`
  errors at `app/admin/page.tsx:41` and `app/chat/page.tsx:34`. Auth/state behavior
  was preserved. Production build and TypeScript checks still pass.

See [evaluation instructions and metric definitions](evaluation/README.md),
[incoming report](evaluation/before-chunking.json),
[revised report](evaluation/after-chunking.json), and
[failed live run](evaluation/live-retrieval.json).

## Local setup and reindexing

This project currently runs locally. No production rollout, parallel deployment
or evaluation gate is needed to start the development servers.

1. Run `pnpm install` and keep your root `.env` with the local URLs from
   `.env.example`. The API, frontend and optional MCP process use that file.
2. Start Docker Desktop, then run `pnpm run setup`: it starts Docker PostgreSQL, waits for its healthcheck,
   builds the shared package, applies migrations and seeds demo users. It does
   not call Gemini, ingest documents or run tests.
3. Run `pnpm dev` to start the API at localhost:4000 and frontend at
   localhost:3000. Login and the dashboard do not require a Gemini key.
4. When ready, replace the outdated `GEMINI_API_KEY` in `.env` and run
   `pnpm ingest` to rebuild the local corpus. Restart development servers after
   changing their environment. MCP starts separately with `pnpm dev:mcp`.

Migration `0002_cultured_salo.sql` is additive: it records model/configuration
metadata and skipped-document counts without deleting documents or embeddings.
Legacy rows require one rebuild because their embedding configuration is
unknown. Search excludes unknown or mismatched embedding metadata until that
rebuild completes. Repeated ingestion skips unchanged successful documents;
failed replacements preserve the previous index. Do not guess legacy model
metadata to bypass reindexing.

The local Docker database provides a direct PostgreSQL connection, which also
supports the ingestion session advisory lock. Changing the embedding model
requires another ingestion. Changing embedding dimensions additionally requires
a vector-column migration.

Missing corpus files are **retained**, reported in CLI/admin ingestion results
and logged. There is no automatic deletion. An operator must review and
explicitly remove obsolete content. Evaluation refuses mismatched retained
documents so they cannot silently skew corpus comparisons.

The current corpus is small and dense retrieval uses exact cosine ranking;
ANN/vector and lexical indexes were not introduced without scale measurements.
There is no live production migration, reindex or application deployment in
this branch publication. Authentication and roles remain enforced.
