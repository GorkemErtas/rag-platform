import { pool } from "../db/index.js";
import { searchDocuments } from "../services/retrieval-service.js";

const query =
  process.argv.slice(2).join(" ").trim() ||
  "How do I initialize the current Lumen SDK?";

try {
  console.log(`Query: ${query}\n`);

  const results = await searchDocuments(query, 20);

  results.forEach((result, index) => {
    console.log(
      `${index + 1}. ${result.documentPath}`,
    );
    console.log(
      `   Similarity: ${result.similarity.toFixed(4)}`,
    );
    console.log(
      `   Relevance: ${result.relevance.toFixed(4)}`,
    );
    console.log(
      `   ${result.content.slice(0, 180).replace(/\n/g, " ")}...`,
    );
    console.log("");
  });
} finally {
  await pool.end();
}