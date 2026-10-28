# AI Usage Log

> The sections below describe the original implementation and historical
> benchmarks. The 2026-10-28 architecture audit replaced the default hybrid
> pipeline, cosine answerability cutoff and normalized relevance scores.
> Those historical scores were not reproduced for the revised implementation.
> Current behavior, actual checks, limitations and failed live evaluation are
> recorded in [the audit](docs/RAG_ARCHITECTURE_AUDIT.md) and
> [evaluation reports](docs/evaluation/README.md). Codex assisted with this audit,
> refactoring, test implementation and documentation; no live answer-quality
> improvement was established in that audit: its API request used the outdated
> local key. Evaluation is optional and separate from the current local setup.

AI tools (Claude, Cursor, Copilot) were used heavily as an active pair-programming companion throughout this project. We worked side-by-side to write code, design the RAG pipeline, build components, iterate on complex logic, and debug deployment issues.

## What AI Did (Co-authored & Generated)
- **Boilerplate & Feature Code:** Generated initial API endpoints, React frontend components, Tailwind layouts, and database schemas.
- **RAG & Search Logic:** Co-authored the vector search queries (pgvector), hybrid search logic (dense + lexical FTS with RRF), and Gemini integration for answer generation.
- **MCP Server Setup:** Drafted the Model Context Protocol (MCP) server structure and search tool definitions.
- **Troubleshooting:** Provided fixes for pnpm monorepo setup, CORS errors, and Render/Vercel deployment configuration issues.

## What I Drove, Configured & Refined Myself
- **Architecture & Shared Contracts:** Defined the overall monorepo structure (`api`, `web`, `mcp`) and established shared TypeScript interfaces across the stack.
- **Threshold Calibration & Abstention Policy:** Designed the negative evaluation strategy to identify hallucinations, tested score distributions, and selected the strict `0.65` similarity threshold for out-of-corpus queries.
- **Evaluation Dataset & Benchmark Design:** Created a test suite of answerable and unanswerable queries to measure Top-1 accuracy, Top-3 recall, and negative abstention rates.
- **RAG Refinement & Prompt Tuning:** Iterated with AI on RAG prompt structures, score normalization, and hybrid ranking weights to ensure grounded citations.

## Where AI Got It Wrong & How We Iterated
- **Retrieval Threshold:** AI's initial retrieval logic passed low-confidence matches to the LLM, leading to hallucinations on unsupported questions. I caught this during testing, analyzed score distributions, and implemented the `0.65` cutoff.
- **Dense Retrieval Limitations:** AI's initial vector-only search missed placing a key document (*March 2026 AppLovin rejection*) at Top-1. I caught this in evaluation, worked with AI to integrate lexical FTS, and tuned the weighted RRF parameters to achieve 100% Top-1 accuracy.
- **MCP Endpoint Gap:** AI omitted similarity filtering on the MCP search endpoint, allowing irrelevant results. I noticed the inconsistency with the chat flow during testing and updated the MCP endpoint logic.
- **Hybrid Score UI Display:** AI suggested a display score that either normalized top results artificially to `1.000` or showed raw vector scores mismatched with RRF order. I refactored the UI code to correctly reflect actual ranking.

## Verification & Final Metrics
All co-written code and AI suggestions were validated through TypeScript builds, production smoke tests, MCP Inspector runs, and benchmark evaluations.

- **Corpus Ingestion:** 142 documents ingested with 0 failures.
- **Retrieval Benchmark:**

| Metric | Dense | Hybrid (Final) |
| :--- | :---: | :---: |
| Top-1 Source Accuracy | 90% | **100%** |
| Top-3 Source Recall | 100% | **100%** |
| Negative Abstention Accuracy | 100% | **100%** |

## Summary
AI was heavily leveraged to accelerate both code generation and RAG design. However, system reliability, evaluation design, threshold calibrations, bug catching, and final quality control were strictly driven by my testing and validation process.
