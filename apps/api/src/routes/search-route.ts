import type { SearchResponse } from "@playable-factory/shared";
import { Router } from "express";

import { requireSearchAccess } from "../middleware/search-auth-middleware.js";
import { searchDocuments } from "../services/retrieval-service.js";
import { RETRIEVAL_CONFIG } from "../config/constants.js";

export const searchRouter = Router();

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

    if (!query) {
      res.status(400).json({
        error: "Search query is required",
      });
      return;
    }

    if (req.body?.limit !== undefined &&
        (typeof req.body.limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > RETRIEVAL_CONFIG.maxSearchLimit)) {
      res.status(400).json({ error: "Search limit must be an integer between 1 and 20" });
      return;
    }

    const results = await searchDocuments(query, limit);

    const response: SearchResponse = {
      query,
      results,
    };

    res.json(response);
  } catch (error) {
    console.error("Search request failed:", error);

    res.status(500).json({
      error: "Failed to search documents",
    });
  }
});
