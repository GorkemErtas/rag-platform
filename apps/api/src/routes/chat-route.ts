import type {
  ChatResponse,
} from "@playable-factory/shared";
import { Router } from "express";

import { db } from "../db/index.js";
import { searchLogs } from "../db/schema.js";
import { answerQuestion } from "../services/rag-service.js";
import { requireAuth } from "../middleware/auth-middleware.js";
import { env } from "../config/env.js";
import { logFailure } from "../utils/log.js";
import { UsageLimitError } from "../services/usage-service.js";

export function createChatRouter(answer = answerQuestion) {
  const chatRouter = Router();

  chatRouter.post("/", requireAuth, async (req, res) => {
    try {
      const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";

      if (!question || question.length > 2000) {
        res.status(400).json({
          error: "Question must contain 1 to 2000 characters",
        });
        return;
      }

      const result = await answer(question);

      try {
        if (!env.demoMode) await db.insert(searchLogs).values({
          userId: req.user!.id, query: question,
          resultCount: result.sources.length, answered: result.answered,
        });
      } catch (error) {
        logFailure("Failed to record chat analytics", error);
      }

      const response: ChatResponse = result;

      res.json(response);
    } catch (error) {
      if (error instanceof UsageLimitError) {
        res.setHeader("Retry-After", error.retryAfter);
        res.status(429).json({ error: error.message });
        return;
      }
      logFailure("Chat request failed", error);

      res.status(500).json({
        error: "Failed to process the question",
      });
    }
  });
  return chatRouter;
}

export const chatRouter = createChatRouter();
