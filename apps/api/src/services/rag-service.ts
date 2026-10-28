import { GoogleGenAI } from "@google/genai";

import { env } from "../config/env.js";
import {
  getExpandedChunkContext,
  searchDocumentsMultiQuery,
} from "./retrieval-service.js";
import { RETRIEVAL_CONFIG } from "../config/constants.js";

if (!env.geminiApiKey) {
  throw new Error("GEMINI_API_KEY is not defined");
}

const ai = new GoogleGenAI({
  apiKey: env.geminiApiKey,
});

const NO_ANSWER_MESSAGE =
  "I couldn't find enough information in the provided corpus to answer that question.";

function createNoAnswerResponse(): RagResponse {
  return {
    answer: NO_ANSWER_MESSAGE,
    answered: false,
    sources: [],
  };
}

export interface RagSource {
  path: string;
  title: string | null;
  chunkIndex: number;
  similarity: number;
  relevance: number;
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

  const RAG_RETRIEVAL_LIMIT = 8;

  const results = await searchDocumentsMultiQuery(
  normalizedQuestion,
  RAG_RETRIEVAL_LIMIT,
);

  if (results.length === 0) {
  return createNoAnswerResponse();
}

const relevantResults = results;

  const MAX_CHUNKS_PER_DOCUMENT = 2;

const documentHitCounts = new Map<number, number>();

const diversifiedResults = relevantResults.filter(
  (result) => {
    const currentCount =
      documentHitCounts.get(result.documentId) ?? 0;

    if (currentCount >= MAX_CHUNKS_PER_DOCUMENT) {
      return false;
    }

    documentHitCounts.set(
      result.documentId,
      currentCount + 1,
    );

    return true;
  },
);

const expandedSources = await Promise.all(
  diversifiedResults.map(async (result) => ({
    result,
    content: await getExpandedChunkContext(
      result.documentId,
      result.chunkIndex,
    ),
  })),
);

const context = expandedSources
  .map(
    ({ result, content }, index) => `
[Source ${index + 1}]
Path: ${result.documentPath}
Title: ${result.documentTitle ?? "Untitled"}
Content:
${content}
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
  return createNoAnswerResponse();
}

  const uniqueSources = Array.from(
    new Map(
      diversifiedResults.map((result) => [
        result.documentId,
        result,
      ]),
    ).values(),
  );

  return {
    answer: text,
    answered: true,
    sources: uniqueSources.map((result) => ({
      path: result.documentPath,
      title: result.documentTitle,
      chunkIndex: result.chunkIndex,
      similarity: result.similarity,
      relevance: result.relevance,
    })),
  };
}