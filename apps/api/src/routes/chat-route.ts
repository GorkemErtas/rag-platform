import type {
  ChatResponse,
} from "@playable-factory/shared";
import { Router } from "express";

import { db } from "../db/index.js";
import { searchLogs } from "../db/schema.js";
import { answerQuestion } from "../services/rag-service.js";
import { requireAuth } from "../middleware/auth-middleware.js";

export const chatRouter = Router();

chatRouter.post("/", requireAuth, async (req, res) => {
  try {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";

    if (!question) {
      res.status(400).json({
        error: "Question is required",
      });
      return;
    }

    const result = await answerQuestion(question);

    try {
      await db.insert(searchLogs).values({
        userId: req.user!.id, query: question,
        resultCount: result.sources.length, answered: result.answered,
      });
    } catch (error) {
      console.error("Failed to record chat analytics:", error);
    }

    const response: ChatResponse = result;

    res.json(response);
  } catch (error) {
    console.error("Chat request failed:", error);

    res.status(500).json({
      error: "Failed to process the question",
    });
  }
});
