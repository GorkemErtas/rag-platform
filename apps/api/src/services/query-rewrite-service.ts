import { GoogleGenAI } from "@google/genai";

import { env } from "../config/env.js";

if (!env.geminiApiKey) {
  throw new Error("GEMINI_API_KEY is not defined");
}

const ai = new GoogleGenAI({
  apiKey: env.geminiApiKey,
});

export async function expandSearchQueries(
  query: string,
): Promise<string[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    throw new Error("Search query cannot be empty");
  }

  const prompt = `
Generate 3 alternative search queries for an internal technical documentation corpus.

Rules:
- Preserve the user's original intent.
- Do not answer the question.
- Do not invent facts.
- Each query should express the same intent using different terminology.
- Expand conversational wording into likely documentation, operational, or policy terminology.
- Include useful synonyms.
- Preserve important names, dates, versions, products, and networks.
- Prefer concise keyword-style queries.
- Return EXACTLY 3 lines.
- Return only the queries, with no numbering or explanation.

User question:
${normalizedQuery}
`.trim();

  const response = await ai.models.generateContent({
    model: env.geminiChatModel,
    contents: prompt,
  });

  const text = response.text?.trim();

  if (!text) {
    return [normalizedQuery];
  }

  const queries = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  return [
    normalizedQuery,
    ...queries.filter(
      (expanded) =>
        expanded.toLowerCase() !==
        normalizedQuery.toLowerCase(),
    ),
  ];
}