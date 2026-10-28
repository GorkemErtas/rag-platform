import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { env } from "../config/env.js";
import { EMBEDDING_CONFIG, RAG_CONFIG } from "../config/constants.js";
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
  output: { type: "string", default: "quality-report.json" },
  baseline: { type: "string" },
} });
if (!["retrieval", "rag"].includes(values.mode!) || !["tuning", "held-out", "all"].includes(values.split!)) {
  throw new Error("Use --mode retrieval|rag and --split tuning|held-out|all");
}
const cases = qualityCases.filter((item) => values.split === "all" || item.split === values.split);
const output = resolve(values.output!);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rows: Array<Record<string, unknown>> = [];
const retrievalRows: Record<string, ReturnType<typeof retrievalMetrics>[]> = { dense: [], hybrid: [] };
const generationRows: Record<string, ReturnType<typeof generationMetrics>[]> = { dense: [], hybrid: [] };
const report: Record<string, unknown> = {
  schemaVersion: 1, state: "running", createdAt: new Date().toISOString(),
  mode: values.mode, split: values.split, cases: cases.length,
  datasetHash: hash(cases), embeddingModel: env.geminiEmbeddingModel,
  chatModel: env.geminiChatModel, dimensions: EMBEDDING_CONFIG.dimensions,
  indexingFingerprint: indexingFingerprint(env.geminiEmbeddingModel),
  context: RAG_CONFIG,
  notes: [
    "Both strategies share one query embedding, corpus/index snapshot, K and generation settings.",
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
    for (const strategy of ["dense", "hybrid"] as const) {
      const retrievalStarted = performance.now();
      const results = await retrieveWithEmbedding(gold.question, embedding, RAG_CONFIG.maxContextChunks, strategy);
      const retrievalMs = performance.now() - retrievalStarted;
      const retrieval = Object.fromEntries([1, 3, 5, 8].map((k) => [k, retrievalMetrics(results, gold, k)]));
      retrievalRows[strategy].push(retrieval[5]);
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
      console.log(`${index + 1}/${cases.length} ${gold.id} ${strategy}: source recall@5=${retrieval[5]?.sourceRecallAtK ?? "n/a"}`);
    }
    report.embeddingApiRequests = embeddingApiRequests;
    // Preserve completed cases if a later request fails or a process is interrupted.
    await save();
  }
  const after = await db.select().from(documents);
  if (hash([...after].sort((a, b) => a.path.localeCompare(b.path))) !== indexHash) {
    throw new Error("Index changed during evaluation; this run is not a controlled comparison");
  }
  report.summaries = Object.fromEntries(["dense", "hybrid"].map((strategy) => {
    const relevant = retrievalRows[strategy].filter((row): row is NonNullable<typeof row> => row !== null);
    const mean = (key: "sourceRecallAtK" | "sourcePrecisionAtK" | "mrrAtK" | "supportingPassageRecallAtK") => relevant.length ? relevant.reduce((sum, row) => sum + row[key], 0) / relevant.length : null;
    return [strategy, { retrievalAt5: {
      cases: relevant.length, recall: mean("sourceRecallAtK"), precision: mean("sourcePrecisionAtK"),
      mrr: mean("mrrAtK"), supportingPassageRecall: mean("supportingPassageRecallAtK"),
      allSourcesFound: relevant.filter((row) => row.allSourcesFound).length,
    }, ...(values.mode === "rag" ? { generation: summarizeGeneration(generationRows[strategy]) } : {}) }];
  }));
  if (values.baseline) {
    const baseline = JSON.parse(await readFile(resolve(values.baseline), "utf8"));
    const comparable = baseline.state === "complete" && baseline.corpusHash === report.corpusHash &&
      baseline.datasetHash === report.datasetHash && baseline.mode === report.mode &&
      baseline.embeddingModel === report.embeddingModel && baseline.chatModel === report.chatModel &&
      baseline.dimensions === report.dimensions && JSON.stringify(baseline.context) === JSON.stringify(report.context);
    report.baselineComparison = { comparable, summaries: comparable ? baseline.summaries : null,
      reason: comparable ? "Same corpus, dataset, models, dimensions and context budget; inspect index revision differences before drawing conclusions" : "Incomplete run or differing evaluation conditions" };
  }
  report.state = "complete";
}

async function save() {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}

try {
  await main();
} catch (error) {
  report.state = "failed";
  report.error = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[redacted database URL]") : "Unknown evaluation error";
  console.error("Evaluation failed; no quality improvement established. See report:", output);
  process.exitCode = 1;
} finally {
  try { await save(); } finally { await pool.end(); }
}
