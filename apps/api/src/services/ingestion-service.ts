import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import { env } from "../config/env.js";
import { db } from "../db/index.js";
import {
  documentChunks,
  documents,
  ingestionRuns,
} from "../db/schema.js";
import { chunkDocument } from "./chunking-service.js";
import { loadCorpus } from "./corpus-service.js";
import { generateEmbedding } from "./embedding-service.js";

export interface IngestionResult {
  runId: number;
  documentsProcessed: number;
  documentsFailed: number;
}

interface ChunkWithEmbedding {
  documentId: number;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

function createChecksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown ingestion error";
}

export async function ingestCorpus(): Promise<IngestionResult> {
  const [run] = await db
    .insert(ingestionRuns)
    .values({
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning({
      id: ingestionRuns.id,
    });

  if (!run) {
    throw new Error("Failed to create ingestion run");
  }

  let documentsProcessed = 0;
  let documentsFailed = 0;

  try {
    const corpusDocuments = await loadCorpus(env.corpusPath);

    for (const sourceDocument of corpusDocuments) {
      try {
        const checksum = createChecksum(sourceDocument.content);

        const [document] = await db
          .insert(documents)
          .values({
            path: sourceDocument.path,
            title: sourceDocument.title,
            checksum,
            status: "PENDING",
            errorMessage: null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: documents.path,
            set: {
              title: sourceDocument.title,
              checksum,
              status: "PENDING",
              errorMessage: null,
              updatedAt: new Date(),
            },
          })
          .returning({
            id: documents.id,
          });

        if (!document) {
          throw new Error(
            `Failed to create document record for ${sourceDocument.path}`,
          );
        }

        const chunks = chunkDocument(sourceDocument.content);

        if (chunks.length === 0) {
          throw new Error(
            `Document contains no indexable content: ${sourceDocument.path}`,
          );
        }

        const chunksWithEmbeddings: ChunkWithEmbedding[] = [];

        for (const chunk of chunks) {
          const embedding = await generateEmbedding(
            chunk.content,
            {
              type: "document",
              title: sourceDocument.title,
            },
          );

          chunksWithEmbeddings.push({
            documentId: document.id,
            chunkIndex: chunk.index,
            content: chunk.content,
            embedding,
          });
        }

        await db.transaction(async (tx) => {
          await tx
            .delete(documentChunks)
            .where(eq(documentChunks.documentId, document.id));

          await tx.insert(documentChunks).values(chunksWithEmbeddings);

          await tx
            .update(documents)
            .set({
              status: "INDEXED",
              errorMessage: null,
              indexedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(documents.id, document.id));
        });

        documentsProcessed += 1;

        console.log(
          `[indexed] ${sourceDocument.path} (${chunks.length} chunk${
            chunks.length === 1 ? "" : "s"
          })`,
        );
      } catch (error) {
        documentsFailed += 1;

        const errorMessage = getErrorMessage(error);

        console.error(`[failed] ${sourceDocument.path}: ${errorMessage}`);

        await db
          .update(documents)
          .set({
            status: "FAILED",
            errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(documents.path, sourceDocument.path));
      }
    }

    const finalStatus =
      documentsFailed > 0 ? "FAILED" : "COMPLETED";

    await db
      .update(ingestionRuns)
      .set({
        status: finalStatus,
        documentsProcessed,
        documentsFailed,
        completedAt: new Date(),
        errorMessage:
          documentsFailed > 0
            ? `${documentsFailed} document(s) failed to ingest`
            : null,
      })
      .where(eq(ingestionRuns.id, run.id));

    return {
      runId: run.id,
      documentsProcessed,
      documentsFailed,
    };
  } catch (error) {
    await db
      .update(ingestionRuns)
      .set({
        status: "FAILED",
        documentsProcessed,
        documentsFailed,
        completedAt: new Date(),
        errorMessage: getErrorMessage(error),
      })
      .where(eq(ingestionRuns.id, run.id));

    throw error;
  }
}