import { generateEmbedding } from "../services/embedding.service.js";

const embedding = await generateEmbedding(
  "How do I initialize the Lumen SDK?",
);

console.log("Embedding dimensions:", embedding.length);
console.log("First five values:", embedding.slice(0, 5));