import type { SearchResponse } from "@playable-factory/shared";
import { Router } from "express";

import { requireSearchAccess } from "../middleware/search-auth-middleware.js";
import { searchDocuments } from "../services/retrieval-service.js";
import { RETRIEVAL_CONFIG } from "../config/constants.js";
import { logFailure } from "../utils/log.js";
import { UsageLimitError } from "../services/usage-service.js";

export function createSearchRouter(search = searchDocuments) {
  const searchRouter = Router();

  searchRouter.post("/", requireSearchAccess, async (req, res) => {
    try {
      const query =
        typeof req.body?.query === "string"
          ? req.body.query.trim()
          : "";

      const limit =
        typeof req.body?.limit === "number"
          ? req.body.limit
          : RETRIEVAL_CONFIG.defaultTopK;

      if (!query || query.length > 2000) {
        res.status(400).json({
          error: "Search query must contain 1 to 2000 characters",
        });
        return;
      }

      if (req.body?.limit !== undefined &&
          (typeof req.body.limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > RETRIEVAL_CONFIG.maxSearchLimit)) {
        res.status(400).json({ error: "Search limit must be an integer between 1 and 20" });
        return;
      }

      const results = await search(query, limit);

      const response: SearchResponse = {
        query,
        results,
      };

      res.json(response);
    } catch (error) {
      if (error instanceof UsageLimitError) {
        res.setHeader("Retry-After", error.retryAfter);
        res.status(429).json({ error: error.message });
        return;
      }
      logFailure("Search request failed", error);

      res.status(500).json({
        error: "Failed to search documents",
      });
    }
  });
  return searchRouter;
}

export const searchRouter = createSearchRouter();
