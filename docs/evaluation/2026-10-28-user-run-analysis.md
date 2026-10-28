# Follow-up: complementary evidence and answer completeness

This follow-up uses the user's existing `apps/api/quality-report.json` and
screenshots. No new test suite, build, evaluation or Gemini call was run.
The original report is preserved locally; its SHA-256 and relevant measurements
are captured in [the committed summary](2026-10-28-user-run-summary.json).

## What the existing run establishes

The report completed 33 RAG cases on the earlier dense/RRF implementation.
For each strategy:

| Measurement | Recorded result |
| --- | ---: |
| Answerable cases with every required source found at K=5 | 26/27 |
| Correct answer/abstention decisions | 32/33 |
| Correct abstentions on the six out-of-corpus cases | 6/6 |
| `company-pods` source recall at K=5 and K=8 | 0 |
| `company-pods` generation outcome | invalid-grounding |

Dense and hybrid returned the same ordered chunk IDs for 32/33 questions.
These numbers describe source identification and decision behavior, **not
independently verified factual answer accuracy**. In particular, the hybrid
answer to `wrong-march-premise` matched only two of three expected fact groups.

For `company-pods`, all eight candidates were production-sync meeting notes.
Their similarities ranged from roughly 0.641 to 0.646. They name Nova, Orbit
and Flare but do not establish which team owns network compliance. The actual
answer is present in `corpus/company-overview.md`, which was missing from the
context. The screenshot's partial answer is consistent with that missing
evidence. A different generator cannot be expected to supply the missing
responsibility without violating the evidence-only requirement.

The report's `invalid-grounding` label does not identify the exact validation
failure; the old runner did not record raw claims or a detailed failure code.
It would be incorrect to assert that a particular quote or ID caused it.

## Root causes addressed

1. **Lexical query semantics.** The implementation passed the full natural
   question to `websearch_to_tsquery`. Unquoted words are combined with AND,
   as documented by [PostgreSQL](https://www.postgresql.org/docs/current/textsearch-controls.html).
   The overview does not contain every word of "Name the production pods and
   the team responsible for network compliance", even though it answers the
   question. The old RRF scores for the first eight hits were single-list
   votes. Hybrid was not supplying the missing complementary evidence.
2. **Crowded context.** Dense similarity selected eight related meeting notes
   without the document establishing the second requested fact. Ranking
   agreement on repeated language does not establish complete evidence.
3. **Fragile generation protocol.** The model had to reproduce exact quotes;
   formatting mistakes and invalid citations were all returned as the same
   "not enough information" message. That hid the failure stage.
4. **Incomplete success signals.** `answered=true` could describe a partial
   answer; the UI labeled it grounded, and console output showed only retrieval
   recall even in a RAG run. A positive recall or answer flag is not a complete
   answer check.

## Implemented changes

### Retrieval

The default `RETRIEVAL_MODE=hybrid` now builds two candidate lists using one
query embedding. Lexical search uses PostgreSQL-normalized OR terms, ranks
matched-term coverage first and length-normalized text relevance second, and
uses chunk IDs for deterministic ties. It searches passage content without
filename or question-intent boosts.

Dense and lexical lists are interleaved, with duplicate chunk IDs emitted once.
This preserves a position for the best lexical-only candidate even when many
dense hits repeat similar wording. No rules mention company documents, pod
names, dates, filenames or expected answers. The corpus and expected facts
were not edited to make retrieval easier. Historical/version distinctions
remain in the evidence rather than being guessed from a document category.

`dense` remains available as a baseline. `rrf` uses equal-weight fusion over
the corrected OR candidate lists. The latter is versioned separately from the
old AND-based RRF run; it is not presented as an identical historical replay.
The compatibility `relevance` value is cosine for balanced/dense selection,
raw RRF for `rrf`; result order is authoritative. Neither is confidence.

### Generation and user-facing results

Retrieved snapshots are split into paragraphs with server-issued IDs.
Structured generation selects those IDs from an enum instead of transcribing
quotes. The server resolves them to the actual source text and returns only
cited paragraphs. Legacy source/quote payloads still undergo exact provenance
checks. Unknown IDs and malformed claims cannot bypass validation.

Responses distinguish full answers, partial answers, insufficient evidence,
an unavailable index/context, and invalid generation. The UI marks partial
answers explicitly. Verification errors no longer claim the knowledge base
does not contain an answer. Telemetry records context counts, provider finish
reason and detailed validation failures without logging the source text or
question to the server console. A search-analytics insert failure no longer
discards a successfully generated response.

This still does not prove that every claim follows from its cited paragraph.
Semantic faithfulness and factual correctness need independent review. No
reranker, agent, query rewrite, additional generation pass or new dependency
was introduced. Normal chat still makes one embedding request and one
generation request; balanced retrieval adds a local lexical database query.

### Evaluation

The console now shows context recall, response status, completeness proxy and
validation reason. Summaries include retrieval at the actual context budget,
partial answers to full questions, system failures and completeness checks.
System failures are not credited as correct abstentions; they also reduce
decision accuracy and abstention recall where applicable.

Completeness remains a labeled proxy: expected fact groups, all required cited
sources, citation/provenance checks, no missing-information flag and no flagged
unsupported detail. Phrase matches do not verify negation or entailment.

`--case` supports focused diagnosis and `--strategies` controls comparison cost.
Timestamped default output preserves previous reports. Protocol/metric version
changes and the changed dataset hash prevent automatic comparison with
incompatible old reports.

Because the reported `company-pods` failure informed this implementation, it
was moved from held-out to tuning: there are now 8 tuning and 32 held-out cases.
Future selection should also include fresh, independently reviewed questions
covering repeated reports, paraphrases, dates/versions, conflicting guidance,
partial answers and unknown facts.

## Local use and verification limits

These changes do not modify the embedding/indexing profile, schema or corpus.
The current index from the completed user run does not require re-ingestion.
Restart `pnpm dev` to load the updated shared contracts and runtime code.
The default is balanced hybrid unless `.env` explicitly sets another
`RETRIEVAL_MODE`. Existing API keys and local settings were not changed.

Only source files, the existing report and its contents were inspected during
this follow-up. New SQL behavior, generation schema compatibility, TypeScript
build and end-to-end accuracy have not been exercised. No improved after-change
accuracy, latency or cost is claimed. The old 26/27 and 32/33 measurements must
not be relabeled as results of these changes.

Further additions should follow new failure evidence: evaluate a reranker only
if candidate selection still misses facts; add a bounded model/dimension-aware
query-embedding cache if repeated-request latency justifies it; consider vector
and lexical indexes when corpus scale warrants them. None is needed merely to
increase the number of retrieval techniques.
