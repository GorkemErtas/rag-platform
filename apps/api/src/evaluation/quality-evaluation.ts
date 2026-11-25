import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { env } from "../config/env.js";
import { EMBEDDING_CONFIG, RAG_CONFIG, type RetrievalMode } from "../config/constants.js";
import { db, pool } from "../db/index.js";
import { documents } from "../db/schema.js";
import { loadCorpus } from "../services/corpus-service.js";
import { generateEmbedding } from "../services/embedding-service.js";
import { createChecksum, indexingFingerprint } from "../services/indexing-profile.js";
import { retrieveWithEmbedding } from "../services/retrieval-service.js";
import { answerUsingEvidence } from "../services/rag-service.js";
import { qualityCases } from "./quality-cases.js";
import { generationMetrics, retrievalMetrics, summarizeGeneration } from "./quality-metrics.js";

const { values } = parseArgs({ options: {
  mode: { type: "string", default: "retrieval" },
  split: { type: "string", default: "held-out" },
  output: { type: "string" },
  baseline: { type: "string" },
  strategies: { type: "string", default: "dense,hybrid" },
  case: { type: "string" },
} });
if (!["retrieval", "rag"].includes(values.mode!) || !["tuning", "held-out", "all"].includes(values.split!)) {
  throw new Error("Use --mode retrieval|rag and --split tuning|held-out|all");
}
const requestedStrategies = [...new Set(values.strategies!.split(",").map((value) => value.trim()))];
if (requestedStrategies.some((mode) => !["dense", "hybrid", "rrf"].includes(mode))) throw new Error("Use --strategies dense,hybrid,rrf (any nonempty subset)");
const strategies = requestedStrategies as RetrievalMode[];
const evaluationKs = [...new Set([1, 3, 5, RAG_CONFIG.maxContextChunks])];
const selectedIds = values.case?.split(",").map((id) => id.trim());
if (selectedIds?.some((id) => !qualityCases.some((item) => item.id === id))) throw new Error("Unknown --case ID");
const cases = qualityCases.filter((item) => selectedIds ? selectedIds.includes(item.id) : values.split === "all" || item.split === values.split);
const output = resolve(values.output ?? `quality-report-${values.mode}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rows: Array<Record<string, unknown>> = [];
const retrievalRows: Record<string, Record<number, ReturnType<typeof retrievalMetrics>>[]> = Object.fromEntries(strategies.map((mode) => [mode, []]));
const generationRows: Record<string, ReturnType<typeof generationMetrics>[]> = Object.fromEntries(strategies.map((mode) => [mode, []]));
const report: Record<string, unknown> = {
  schemaVersion: 2, state: "running", createdAt: new Date().toISOString(),
  mode: values.mode, split: selectedIds ? "selected" : values.split, cases: cases.length,
  strategies, generationProtocol: "paragraph-citation-ids-v1",
  retrievalAlgorithms: { dense: "cosine-v1", hybrid: "balanced-or-coverage-v1", rrf: "rrf-or-coverage-v1" },
  datasetHash: hash(cases), embeddingModel: env.geminiEmbeddingModel,
  chatModel: env.geminiChatModel, dimensions: EMBEDDING_CONFIG.dimensions,
  indexingFingerprint: indexingFingerprint(env.geminiEmbeddingModel),
  context: RAG_CONFIG,
  notes: [
    "Strategies share one query embedding, corpus/index snapshot, K and generation settings.",
    "Negative retrieval cases have null relevance metrics; abstention is measured only after generation.",
    "Fact coverage is a lexical proxy. Factual correctness and semantic faithfulness require human review.",
    "Historical end-to-end revisions require their own recorded index and matching corpus. No historical accuracy is inferred here.",
    "Embedding token estimates use ceil(question characters / 4); generation tokens come from provider usage.",
  ],
  rows,
};

function optionalRate(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return null;
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 0) throw new Error(`Invalid evaluation rate: ${name}`);
  return rate;
}

async function main() {
  // Probe credentials before scanning a live index. Failing service access is
  // recorded as an incomplete run, never converted into model abstention.
  const corpus = (await loadCorpus(env.corpusPath)).sort((a, b) => a.path.localeCompare(b.path));
  report.corpusHash = hash(corpus);
  const inputRate = optionalRate("EVAL_INPUT_USD_PER_MILLION");
  const outputRate = optionalRate("EVAL_OUTPUT_USD_PER_MILLION");
  const embeddingRate = optionalRate("EVAL_EMBEDDING_USD_PER_MILLION");
  report.pricing = { inputRate, outputRate, embeddingRate, currency: "USD", source: "operator supplied, per million tokens" };
  let embeddingApiRequests = 0;
  const onEmbeddingRequest = () => { embeddingApiRequests += 1; report.embeddingApiRequests = embeddingApiRequests; };
  const firstStarted = performance.now();
  const firstEmbedding = await generateEmbedding(cases[0].question, { type: "query", onRequest: onEmbeddingRequest });
  const firstEmbeddingMs = performance.now() - firstStarted;
  const before = await db.select().from(documents);
  const indexHash = hash([...before].sort((a, b) => a.path.localeCompare(b.path)));
  report.indexHash = indexHash;
  for (const source of corpus) {
    const stored = before.find((row) => row.path === source.path);
    if (!stored || stored.status !== "INDEXED" || stored.checksum !== createChecksum(source.content) ||
        stored.indexingFingerprint !== indexingFingerprint(env.geminiEmbeddingModel) ||
        stored.embeddingModel !== env.geminiEmbeddingModel || stored.embeddingDimensions !== EMBEDDING_CONFIG.dimensions) {
      throw new Error(`Evaluation requires a current complete index; run migrations and ingestion: ${source.path}`);
    }
  }
  if (before.some((row) => !corpus.some((source) => source.path === row.path))) {
    throw new Error("Index includes retained files missing from this corpus; use an isolated evaluation database with a matching corpus");
  }
  for (const [index, gold] of cases.entries()) {
    const embedStarted = performance.now();
    const embedding = index === 0 ? firstEmbedding : await generateEmbedding(gold.question, { type: "query", onRequest: onEmbeddingRequest });
    const embeddingMs = index === 0 ? firstEmbeddingMs : performance.now() - embedStarted;
    for (const strategy of strategies) {
      const retrievalStarted = performance.now();
      const results = await retrieveWithEmbedding(gold.question, embedding, RAG_CONFIG.maxContextChunks, strategy);
      const retrievalMs = performance.now() - retrievalStarted;
      const retrieval = Object.fromEntries(evaluationKs.map((k) => [k, retrievalMetrics(results, gold, k)]));
      retrievalRows[strategy].push(retrieval);
      const row: Record<string, unknown> = {
        id: gold.id, split: gold.split, category: gold.category, question: gold.question,
        expectedAnswerability: gold.answerability, strategy, retrieval,
        embeddingMs, retrievalMs,
        estimatedEmbeddingTokens: Math.ceil(gold.question.length / 4),
        retrieved: results.map((result) => ({ ...result, sourceId: `chunk-${result.chunkId}` })),
      };
      rows.push(row);
      if (values.mode === "rag") {
        const { response, telemetry } = await answerUsingEvidence(gold.question, results, () => {
          report.generationApiRequests = Number(report.generationApiRequests ?? 0) + 1;
        });
        const metrics = generationMetrics(response, results, gold);
        generationRows[strategy].push(metrics);
        row.response = response;
        row.generation = metrics;
        row.telemetry = telemetry;
        row.endToEndMs = embeddingMs + retrievalMs + telemetry.latencyMs;
        row.estimatedCostUsd = inputRate !== null && outputRate !== null && embeddingRate !== null &&
          telemetry.promptTokens !== null && telemetry.totalTokens !== null
          ? (telemetry.promptTokens * inputRate + (telemetry.totalTokens - telemetry.promptTokens) * outputRate +
            Math.ceil(gold.question.length / 4) * embeddingRate) / 1_000_000 : null;
      }
      const generation = row.generation as ReturnType<typeof generationMetrics> | undefined;
      const telemetry = row.telemetry as { validation: string; validationReason?: string } | undefined;
      console.log(`${index + 1}/${cases.length} ${gold.id} ${strategy}: source recall@5=${retrieval[5]?.sourceRecallAtK ?? "n/a"}; recall@${RAG_CONFIG.maxContextChunks}=${retrieval[RAG_CONFIG.maxContextChunks]?.sourceRecallAtK ?? "n/a"}` +
        (generation ? `; answer=${generation.answerStatus}; complete=${generation.completeAnswerProxy ?? "n/a"}; validation=${telemetry?.validation}${telemetry?.validationReason ? `/${telemetry.validationReason}` : ""}` : ""));
    }
    report.embeddingApiRequests = embeddingApiRequests;
    // Preserve completed cases if a later request fails or a process is interrupted.
    await save();
  }
  const after = await db.select().from(documents);
  if (hash([...after].sort((a, b) => a.path.localeCompare(b.path))) !== indexHash) {
    throw new Error("Index changed during evaluation; this run is not a controlled comparison");
  }
  report.summaries = Object.fromEntries(strategies.map((strategy) => {
    const summarizeAt = (k: number) => {
      const relevant = retrievalRows[strategy].map((row) => row[k]).filter((row): row is NonNullable<typeof row> => row != null);
      const mean = (key: "sourceRecallAtK" | "sourcePrecisionAtK" | "mrrAtK" | "supportingPassageRecallAtK") => relevant.length ? relevant.reduce((sum, row) => sum + row[key], 0) / relevant.length : null;
      return {
        k, cases: relevant.length, recall: mean("sourceRecallAtK"), precision: mean("sourcePrecisionAtK"),
        mrr: mean("mrrAtK"), supportingPassageRecall: mean("supportingPassageRecallAtK"),
        allSourcesFound: relevant.filter((row) => row.allSourcesFound).length,
      };
    };
    return [strategy, {
      retrievalAt5: summarizeAt(5), retrievalAtContext: summarizeAt(RAG_CONFIG.maxContextChunks),
      ...(values.mode === "rag" ? { generation: summarizeGeneration(generationRows[strategy]) } : {}),
    }];
  }));
  if (values.baseline) {
    const baseline = JSON.parse(await readFile(resolve(values.baseline), "utf8"));
    const comparable = baseline.state === "complete" && baseline.schemaVersion === report.schemaVersion &&
      baseline.generationProtocol === report.generationProtocol && baseline.corpusHash === report.corpusHash &&
      baseline.datasetHash === report.datasetHash && baseline.mode === report.mode &&
      baseline.embeddingModel === report.embeddingModel && baseline.chatModel === report.chatModel &&
      baseline.dimensions === report.dimensions && JSON.stringify(baseline.context) === JSON.stringify(report.context);
    report.baselineComparison = { comparable, summaries: comparable ? baseline.summaries : null,
      reason: comparable ? "Same corpus, dataset, models, dimensions and context budget; inspect index revision differences before drawing conclusions" : "Incomplete run or differing evaluation conditions" };
  }
  report.state = "complete";
  console.log("\nEvaluation summary:", JSON.stringify(report.summaries, null, 2));
  console.log("Report:", output);
}

async function save() {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}

try {
  await main();
} catch {
  report.state = "failed";
  report.error = "Evaluation failed; check database connectivity, corpus selection and provider configuration";
  console.error("Evaluation failed; no quality improvement established. See report:", output);
  process.exitCode = 1;
} finally {
  try { await save(); } finally { await pool.end(); }
}
