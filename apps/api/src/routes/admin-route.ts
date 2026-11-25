import type { DashboardResponse } from "@playable-factory/shared";
import {
  count,
  desc,
  eq,
  sql,
} from "drizzle-orm";
import { Router } from "express";

import { db } from "../db/index.js";
import {
  documentChunks,
  documents,
  ingestionRuns,
  searchLogs,
} from "../db/schema.js";
import { requireAuth } from "../middleware/auth-middleware.js";
import { requireAdmin } from "../middleware/role-middleware.js";
import { ingestCorpus } from "../services/ingestion-service.js";
import { logFailure } from "../utils/log.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/dashboard", async (_req, res) => {
  try {
    const [
      [totalDocumentsRow],
      [indexedDocumentsRow],
      [failedDocumentsRow],
      [totalChunksRow],
      [searchStatsRow],
      documentRows,
      ingestionRows,
      recentSearchRows,
    ] = await Promise.all([
      db
        .select({ value: count() })
        .from(documents),

      db
        .select({ value: count() })
        .from(documents)
        .where(eq(documents.status, "INDEXED")),

      db
        .select({ value: count() })
        .from(documents)
        .where(eq(documents.status, "FAILED")),

      db
        .select({ value: count() })
        .from(documentChunks),

      db
        .select({
          total: count(),
          answered: sql<number>`
            count(*) filter (where ${searchLogs.answered} = true)
          `,
        })
        .from(searchLogs),

      db
        .select({
          id: documents.id,
          path: documents.path,
          title: documents.title,
          status: documents.status,
          indexedAt: documents.indexedAt,
          errorMessage: documents.errorMessage,
        })
        .from(documents)
        .orderBy(documents.path),

      db
        .select()
        .from(ingestionRuns)
        .orderBy(desc(ingestionRuns.id))
        .limit(10),

      db
        .select({
          id: searchLogs.id,
          query: searchLogs.query,
          resultCount: searchLogs.resultCount,
          answered: searchLogs.answered,
          createdAt: searchLogs.createdAt,
        })
        .from(searchLogs)
        .orderBy(desc(searchLogs.id))
        .limit(10),
    ]);

    const response: DashboardResponse = {
      stats: {
        totalDocuments: Number(totalDocumentsRow?.value ?? 0),
        indexedDocuments: Number(indexedDocumentsRow?.value ?? 0),
        failedDocuments: Number(failedDocumentsRow?.value ?? 0),
        totalChunks: Number(totalChunksRow?.value ?? 0),
        totalSearches: Number(searchStatsRow?.total ?? 0),
        answeredSearches: Number(searchStatsRow?.answered ?? 0),
      },

      documents: documentRows.map((document) => ({
        ...document,
        indexedAt: document.indexedAt?.toISOString() ?? null,
      })),

      ingestionRuns: ingestionRows.map((run) => ({
        id: run.id,
        status: run.status,
        documentsProcessed: run.documentsProcessed,
        documentsFailed: run.documentsFailed,
        startedAt: run.startedAt?.toISOString() ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
        errorMessage: run.errorMessage,
      })),

      recentSearches: recentSearchRows.map((search) => ({
        ...search,
        createdAt: search.createdAt.toISOString(),
      })),
    };

    res.json(response);
  } catch (error) {
    logFailure("Dashboard request failed", error);

    res.status(500).json({
      error: "Failed to load dashboard",
    });
  }
});

adminRouter.post("/ingestion", async (_req, res) => {
  try {
    const result = await ingestCorpus();

    res.json({
      message: "Corpus ingestion completed",
      ...result,
    });
  } catch (error) {
    logFailure("Admin ingestion failed", error);

    res.status(500).json({
      error: "Corpus ingestion failed",
    });
  }
});
