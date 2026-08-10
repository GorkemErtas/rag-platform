import { pool } from "../db/index.js";
import { answerQuestion } from "../services/rag-service.js";

const question =
  process.argv.slice(2).join(" ").trim() ||
  "What changed in Lumen Build 4.2?";

try {
  const response = await answerQuestion(question);

  console.log("\nQuestion:");
  console.log(question);

  console.log("\nAnswered:");
  console.log(response.answered);

  console.log("\nAnswer:");
  console.log(response.answer);

  console.log("\nSources:");
  response.sources.forEach((source) => {
    console.log(
      `- ${source.path} (${source.similarity.toFixed(4)})`,
    );
  });
} finally {
  await pool.end();
}