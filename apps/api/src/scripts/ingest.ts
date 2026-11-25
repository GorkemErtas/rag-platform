import { pool } from "../db/index.js";
import { ingestCorpus } from "../services/ingestion-service.js";

try {
  console.log("Starting corpus ingestion...");

  const result = await ingestCorpus();

  console.log("");
  console.log("Ingestion finished");
  console.log(`Run ID: ${result.runId}`);
  console.log(`Documents processed: ${result.documentsProcessed}`);
  console.log(`Documents skipped: ${result.documentsSkipped}`);
  console.log(`Missing files retained: ${result.missingPaths.length}`);
  console.log(`Documents failed: ${result.documentsFailed}`);

  if (result.documentsFailed > 0) {
    process.exitCode = 1;
  }
} catch {
  console.error("Corpus ingestion failed. Check corpus selection, demo database identity and provider configuration.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
