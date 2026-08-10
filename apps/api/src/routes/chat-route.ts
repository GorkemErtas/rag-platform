import type {
  ChatRequest,
  ChatResponse,
} from "@playable-factory/shared";
import { Router } from "express";

import { db } from "../db/index.js";
import { searchLogs } from "../db/schema.js";
import { answerQuestion } from "../services/rag-service.js";

export const chatRouter = Router();

chatRouter.post("/", async (req, res) => {
  try {
    const body = req.body as Partial<ChatRequest>;
    const question = body.question?.trim();

    if (!question) {
      res.status(400).json({
        error: "Question is required",
      });
      return;
    }

    const result = await answerQuestion(question);

    await db.insert(searchLogs).values({
      userId: null,
      query: question,
      resultCount: result.sources.length,
      answered: result.answered,
    });

    const response: ChatResponse = {
      answer: result.answer,
      answered: result.answered,
      sources: result.sources,
    };

    res.json(response);
  } catch (error) {
    console.error("Chat request failed:", error);

    res.status(500).json({
      error: "Failed to process the question",
    });
  }
});