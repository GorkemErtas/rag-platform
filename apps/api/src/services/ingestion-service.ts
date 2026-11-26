import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { env } from "../config/env.js";
import { EMBEDDING_CONFIG } from "../config/constants.js";
import { db, pool } from "../db/index.js";
import { documentChunks, documents, ingestionRuns } from "../db/schema.js";
import { chunkDocument } from "./chunking-service.js";
import { loadCorpus, type CorpusDocument } from "./corpus-service.js";
import { generateEmbedding } from "./embedding-service.js";
import { createChecksum, indexingFingerprint, isIndexCurrent } from "./indexing-profile.js";
import { sleep } from "../utils/async.js";
import { assertDemoDatabase } from "./demo-service.js";
import { logFailure } from "../utils/log.js";
import { invalidateQueryCaches } from "./query-cache.js";

export interface IngestionResult {
  runId: number;
  documentsProcessed: number;
  documentsSkipped: number;
  documentsFailed: number;
  /** Retain missing documents until an operator explicitly approves removal. */
  missingPaths: string[];
}

// A document's visible row and chunks change only in the publishing transaction.
// Injection allows transaction tests against an isolated PostgreSQL schema.
export async function indexDocument(
  source: CorpusDocument,
  database: NodePgDatabase = db,
  embed: typeof generateEmbedding = generateEmbedding,
  delayMs: number = EMBEDDING_CONFIG.ingestionDelayMs,
): Promise<"indexed" | "skipped"> {
  const checksum = createChecksum(source.content);
  const fingerprint = indexingFingerprint(env.geminiEmbeddingModel);
  const [previous] = await database.select().from(documents).where(eq(documents.path, source.path));
  if (isIndexCurrent(previous, checksum, fingerprint)) return "skipped";

  try {
    const chunks = chunkDocument(source.content);
    if (chunks.length === 0) throw new Error(`Document contains no indexable content: ${source.path}`);
    const prepared: { chunkIndex: number; content: string; embedding: number[] }[] = [];
    for (const chunk of chunks) {
      // Title already has a dedicated embedding field. Repeating paths and
      // titles in every short chunk distorts the evidence representation.
      const embedding = await embed(chunk.content, { type: "document", title: source.title });
      prepared.push({ chunkIndex: chunk.index, content: chunk.content, embedding });
      if (delayMs > 0) await sleep(delayMs);
    }
    await database.transaction(async (tx) => {
      const metadata = {
        title: source.title, checksum, indexingFingerprint: fingerprint,
        embeddingModel: env.geminiEmbeddingModel,
        embeddingDimensions: EMBEDDING_CONFIG.dimensions,
        status: "INDEXED" as const, errorMessage: null,
        indexedAt: new Date(), updatedAt: new Date(),
      };
      const [document] = await tx.insert(documents).values({ path: source.path, ...metadata })
        .onConflictDoUpdate({ target: documents.path, set: metadata }).returning({ id: documents.id });
      if (!document) throw new Error(`Failed to publish ${source.path}`);
      await tx.delete(documentChunks).where(eq(documentChunks.documentId, document.id));
      await tx.insert(documentChunks).values(prepared.map((chunk) => ({ documentId: document.id, ...chunk })));
    });
    invalidateQueryCaches();
    return "indexed";
  } catch (error) {
    const errorMessage = "Document indexing failed; previous content was retained";
    await database.insert(documents).values({ path: source.path, title: source.title, status: "FAILED", errorMessage })
      .onConflictDoUpdate({
        target: documents.path,
        // Preserve the last successful status, content checksum, model and time.
        set: { errorMessage, updatedAt: new Date() },
      });
    throw error;
  }
}

export async function ingestCorpus(): Promise<IngestionResult> {
  if (env.production && !process.env.CORPUS_PATH) throw new Error("Production requires explicit CORPUS_PATH");
  // Verify isolation before taking a lock or updating any rows.
  await assertDemoDatabase();
  // Session lock serializes CLI and admin runs across processes, without holding
  // a transaction open during slow embedding/API requests.
  const lock = await pool.connect();
  const indexingDb = drizzle(lock);
  let runId: number | undefined;
  let acquired = false;
  const counts = { documentsProcessed: 0, documentsSkipped: 0, documentsFailed: 0 };
  try {
    const result = await lock.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock(hashtext('playable-factory-corpus-ingestion')) as acquired",
    );
    acquired = result.rows[0]?.acquired === true;
    if (!acquired) throw new Error("Another ingestion is already running");
    // A RUNNING row without this exclusive lock owner was interrupted.
    await db.update(ingestionRuns).set({ status: "FAILED", completedAt: new Date(), errorMessage: "Ingestion interrupted before completion; safe to retry" })
      .where(eq(ingestionRuns.status, "RUNNING"));
    const [run] = await db.insert(ingestionRuns).values({ status: "RUNNING", startedAt: new Date() }).returning({ id: ingestionRuns.id });
    if (!run) throw new Error("Failed to create ingestion run");
    runId = run.id;
    const corpus = await loadCorpus(env.corpusPath);
    const present = new Set(corpus.map((document) => document.path));
    const stored = await db.select({ path: documents.path }).from(documents);
    const missingPaths = stored.map((row) => row.path).filter((path) => !present.has(path)).sort();
    if (missingPaths.length) console.warn("[ingestion] Missing files retained (no automatic deletion):", missingPaths);

    for (const source of corpus) {
      // Lock connection loss aborts the run, rather than admitting concurrent publishers.
      await lock.query("select 1");
      try {
        const outcome = await indexDocument(source, indexingDb);
        if (outcome === "skipped") counts.documentsSkipped += 1;
        else counts.documentsProcessed += 1;
        console.log(`[${outcome}] ${source.path}`);
      } catch (error) {
        counts.documentsFailed += 1;
        logFailure(`[failed] ${source.path}`, error);
      }
      await db.update(ingestionRuns).set(counts).where(eq(ingestionRuns.id, runId));
    }
    await db.update(ingestionRuns).set({
      ...counts, status: counts.documentsFailed ? "FAILED" : "COMPLETED", completedAt: new Date(),
      errorMessage: counts.documentsFailed ? `${counts.documentsFailed} document(s) failed; previous indexed versions retained` : null,
    }).where(eq(ingestionRuns.id, runId));
    return { runId, ...counts, missingPaths };
  } catch (error) {
    if (runId !== undefined) {
      await db.update(ingestionRuns).set({ ...counts, status: "FAILED", completedAt: new Date(), errorMessage: "Ingestion failed; check configuration and provider availability" })
        .where(eq(ingestionRuns.id, runId));
    }
    throw error;
  } finally {
    try {
      if (acquired) await lock.query("select pg_advisory_unlock(hashtext('playable-factory-corpus-ingestion'))");
    } finally {
      lock.release();
    }
  }
}
