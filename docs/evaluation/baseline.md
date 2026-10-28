# Recorded baseline

Incoming changes are preserved at commit `6cac430`. Main was `bf5191f`.

Before runtime refactoring, the API TypeScript build passed. The live
`test:evaluation` runner stopped at its first Gemini embedding request with
HTTP 401 `UNAUTHENTICATED` / `API key not valid`. No retrieval, generation,
latency or cost accuracy figures could be established. Docker Desktop's
Linux engine was unavailable. This is not a passing live evaluation.

`before-chunking.json` is an actual deterministic run of `corpus-baseline.ts`
against the incoming 400-character / 80-overlap chunker and checked-in corpus:

| Measurement | Incoming |
| --- | ---: |
| Documents | 142 |
| Chunks | 455 |
| Documents split | 134 |
| Source characters | 113166 |
| Indexed characters | 136664 |
| Intact paragraphs | 623 / 643 |

These are fragmentation measurements, **not retrieval or answer accuracy**.
The corpus hash and per-document breakdown make the run reproducible.

The pre-existing README's 90%/100% scores cover ten positive questions
(several paraphrases of the same five topics) and five easy negatives.
They are historical claims, not a baseline reproduced during this audit.
The old evaluator calls an `any` source match "recall" and equates a cosine
cutoff with correct abstention without generating an answer. Those metrics
cannot establish multi-document completeness or actual answer correctness.
