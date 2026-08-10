import type { SearchResponse } from "@playable-factory/shared";
import { Router } from "express";

import { requireAuth } from "../middleware/auth-middleware.js";
import { searchDocuments } from "../services/retrieval-service.js";

export const searchRouter = Router();

searchRouter.post("/", requireAuth, async (req, res) => {
  try {
    const query =
      typeof req.body?.query === "string"
        ? req.body.query.trim()
        : "";

    const limit =
      typeof req.body?.limit === "number"
        ? req.body.limit
        : 5;

    if (!query) {
      res.status(400).json({
        error: "Search query is required",
      });
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