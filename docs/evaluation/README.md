# Reproducible quality evaluation

Evaluation is optional and separate from local setup. `pnpm run setup` and
`pnpm dev` do not run these commands or call Gemini. The API failure recorded
below came from the old local key during the earlier audit; it is historical,
not a check of your current credentials. A later completed user-generated run
is documented in [the follow-up analysis](2026-10-28-user-run-analysis.md).

The dataset in `apps/api/src/evaluation/quality-cases.ts` contains 40 cases:
8 tuning and 32 held-out cases, including technical identifiers, similar dated
reports, historical/current versions, supersession, two-document questions,
multiple facts, a partial question, misleading premises, ambiguity and
near-corpus negatives. Gold passages are literal substrings verified by the
offline tests. All expected paths are exact, relative corpus paths.

The initial split was declared before refactoring. After the user reported the
`company-pods` failure and it informed development, that case was moved to
tuning. It must not be counted as an untouched held-out success in a new run.
Held-out means no ranking weights,
thresholds or rewriting were tuned to its measured results; it is not an
independently blind external benchmark. Add new held-out cases for any future
tuning campaign rather than repeatedly optimizing against the same questions.

## Local checks (no Gemini or PostgreSQL required)

```bash
pnpm --filter @playable-factory/shared build
pnpm --filter @playable-factory/api test
pnpm --filter @playable-factory/api lint
pnpm --filter @playable-factory/api test:chunking ../../docs/evaluation/after-chunking.json
pnpm build
```

Offline tests cover boundary/overlap errors, embedding normalization, index
reuse decisions, gold evidence integrity, raw RRF, grounding, invalid source
IDs/quotes, metric arithmetic, multi-document completeness, abstention error
directions, and authenticated HTTP input handling. Passing those tests does
not establish semantic retrieval accuracy or generated answer quality.

To exercise real transaction rollback and atomic replacement, set
TEST_DATABASE_URL to a disposable PostgreSQL database with pgvector installed
and run the same test command. The test creates a random isolated schema and
removes only that schema. It never migrates or reindexes DATABASE_URL.
Without that variable, the integration test is explicitly skipped.

## Live evaluation

Use valid GEMINI_API_KEY, a migrated DATABASE_URL and a complete index produced
by the current ingestion configuration. Prefer an isolated evaluation database.
Ingestion requires a direct PostgreSQL connection for its session advisory
lock; do not run it through a transaction-pooling endpoint.

```bash
pnpm db:migrate
pnpm ingest
pnpm --filter @playable-factory/api test:evaluation --split tuning --output ../../docs/evaluation/tuning.json
pnpm --filter @playable-factory/api test:evaluation --output ../../docs/evaluation/retrieval.json
pnpm --filter @playable-factory/api test:rag:evaluation --output ../../docs/evaluation/rag.json
```

Optional focused diagnosis (not executed as part of the latest changes):

```bash
pnpm --filter @playable-factory/api test:rag:evaluation --case company-pods --strategies hybrid
```

`--case` accepts comma-separated IDs across the dataset and labels the report
split `selected`. `--strategies` accepts `dense`, `hybrid`, `rrf` or a
comma-separated subset. It defaults to `dense,hybrid`; adding RRF is explicit
so the comparison does not silently add a third generation call per question.
Without `--output`, timestamped reports preserve previous runs instead of
overwriting `quality-report.json`. No evaluation command runs automatically.

Default split is held-out. `--split all` is available for a comprehensive run,
but tuning and held-out cases should be reported separately when making a
selection. Strategies use the same query embedding, indexed corpus,
context budget and generation parameters. Retrieval is evaluated at K=1,3,5
and the configured context limit (currently 8). Dense is the direct baseline;
hybrid/RRF gather broader candidates. No strategy is enabled based on fixture
contents. Index checksum/configuration and retained-file mismatches fail the
run; index changes during the run invalidate the comparison.

Reports contain corpus/dataset/index hashes, model names/dimensions,
configuration, per-case ranked passages, responses, citations and failures.
An API/DB failure produces `state: failed`, a nonzero exit code and the partial
report. It is not converted into a correct abstention or zero-accuracy result.

## Metrics and interpretation

| Metric | Definition |
| --- | --- |
| Source recall@K | Distinct required source documents found / all required source documents |
| Source precision@K | Required source documents found / distinct retrieved documents within top K chunks |
| MRR@K | Reciprocal rank of the first correct source chunk containing a gold supporting passage |
| Correct top source | Whether the first hit's exact path is a required source |
| All sources found | Every required source document retrieved, not merely one of them |
| Supporting passage recall@K | Gold passages present in matching retrieved chunks / all gold passages |
| Expected fact coverage proxy | Fraction of expected phrase groups found in the answer; not factual correctness |
| Citation validity | Every inline source ID resolves to a returned, actually retrieved chunk and every returned source is cited |
| Quote provenance | Every returned quotation occurs in that retrieved source snapshot |
| Source completeness | Every required source actually cited |
| Partial limitation explicit | A partial response includes an explicit missingInformation field |
| Complete answer rate proxy | Full question answered without missing information, all expected fact groups/sources present, valid citations and quote provenance, no flagged unsupported details |
| Partial answers to full questions | A question requiring a full answer received an explicit partial response |
| System failures | Invalid generation, unavailable context or unavailable index; never credited as a correct abstention |
| Abstention precision | Correct abstentions / all abstentions |
| Abstention recall | Correct abstentions / all questions requiring abstention |
| False-positive abstention | An answerable question incorrectly rejected |
| False-negative abstention | An unanswerable question answered |

Retrieval relevance metrics are null for out-of-corpus cases. Relevance cannot
establish abstention without generating and checking an answer. Multi-source
metrics count all sources/passages. An expected file appearing alongside an
unrelated passage does not establish passage coverage or answer completeness.

Factual correctness and semantic faithfulness remain null until independently
reviewed. Review every claim against its cited quotation and wider source;
check missing facts, dates, versions, negation, cross-document synthesis and
unresolved contradictions. Do not replace those checks with phrase matches or
another label for quotation existence. Store human review alongside the report
with case ID, strategy, factual verdict, completeness and rationale.

Operational rows include embedding/retrieval/generation latency, exact embedding
request count (including retries), generation request count and provider token
usage including total tokens. Embedding tokens are estimated as characters/4.
Per-question cost estimates are null unless the operator supplies current
EVAL_INPUT_USD_PER_MILLION, EVAL_OUTPUT_USD_PER_MILLION and
EVAL_EMBEDDING_USD_PER_MILLION. Each strategy's per-question estimate includes
one embedding; the actual comparison reuses that embedding across strategies.
Cost estimates charge all prompt tokens at the supplied input rate and all
remaining provider total tokens at the output rate; cached-token discounts are
not modeled. No rates or costs are guessed.

## Historical comparisons

The incoming experiments are preserved at `6cac430`, and original main is
`bf5191f`. Older dense/grounded/hybrid baselines are `a1bb8e6`, `34ca46f` and
`22353a6`. Those revisions have different indexing/embedding configurations;
do not run their query embeddings against the revised index and call it a
controlled end-to-end comparison.

Use separate checkouts and isolated databases for each historical index,
keep the corpus, verified questions, model versions and resource budgets fixed,
and record their hashes/configuration. Adapt legacy entry points to export the
same report schema; the archived legacy runners alone use the old small suite
and are not comparable to the new held-out results. This audit did not execute
historical end-to-end comparisons because credentials were invalid.

For future reports from this runner, `--baseline path/to/report.json` checks
dataset/corpus/models/dimensions/context compatibility and includes the prior
summaries only when the prior run completed. Index-revision differences still
need review. Failed runs are never an accuracy baseline.

## Recorded results

The [baseline](baseline.md) and before/after chunking reports contain actual
local measurements. [live-retrieval.json](live-retrieval.json) records the earlier
Gemini HTTP 401. The later [user-run summary](2026-10-28-user-run-summary.json)
records completed retrieval and generation decisions. It does not establish
factual correctness or semantic faithfulness. No new tests, build or model
requests were run for the subsequent balanced-retrieval/paragraph-ID changes;
there are no measured after-change improvements to report.
