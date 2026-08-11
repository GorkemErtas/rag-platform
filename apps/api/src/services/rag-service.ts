import { GoogleGenAI } from "@google/genai";

import { env } from "../config/env.js";
import { searchDocuments } from "./retrieval-service.js";

export const CURRENT_THRESHOLD = 0.65;
const TOP_K = 5;

if (!env.geminiApiKey) {
  throw new Error("GEMINI_API_KEY is not defined");
}

const ai = new GoogleGenAI({
  apiKey: env.geminiApiKey,
});

export interface RagSource {
  path: string;
  title: string | null;
  chunkIndex: number;
  similarity: number;
}

export interface RagResponse {
  answer: string;
  answered: boolean;
  sources: RagSource[];
}

export async function answerQuestion(
  question: string,
): Promise<RagResponse> {
  const normalizedQuestion = question.trim();

  if (!normalizedQuestion) {
    throw new Error("Question cannot be empty");
  }

  const results = await searchDocuments(
    normalizedQuestion,
    TOP_K,
  );

  const relevantResults = results.filter(
    (result) => result.similarity >= CURRENT_THRESHOLD,
  );

  if (relevantResults.length === 0) {
    return {
      answer:
        "I couldn't find enough information in the provided corpus to answer that question.",
      answered: false,
      sources: [],
    };
  }

  const context = relevantResults
    .map(
      (result, index) => `
[Source ${index + 1}]
Path: ${result.documentPath}
Title: ${result.documentTitle ?? "Untitled"}
Content:
${result.content}
`.trim(),
    )
    .join("\n\n");

  const prompt = `
You are a retrieval-augmented assistant.

Answer the user's question using ONLY the supplied context.

Rules:
- Do not use outside knowledge.
- Do not invent or infer unsupported facts.
- If the context does not contain enough information to answer the question, respond exactly with:
INSUFFICIENT_CONTEXT
- Prefer the most directly relevant and current source when sources conflict.
- Give a concise, factual answer.
- Cite supporting sources inline using [Source 1], [Source 2], etc.
- Every factual claim must be supported by the supplied context.

Question:
${normalizedQuestion}

Context:
${context}
`.trim();

  const response = await ai.models.generateContent({
    model: env.geminiChatModel,
    contents: prompt,
  });

  const text = response.text?.trim();

  if (!text || text.includes("INSUFFICIENT_CONTEXT")) {
    return {
      answer:
        "I couldn't find enough information in the provided corpus to answer that question.",
      answered: false,
      sources: [],
    };
  }

  return {
    answer: text,
    answered: true,
    sources: relevantResults.map((result) => ({
      path: result.documentPath,
      title: result.documentTitle,
      chunkIndex: result.chunkIndex,
      similarity: result.similarity,
    })),
  };
}