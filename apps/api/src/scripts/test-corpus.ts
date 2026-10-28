import { env } from "../config/env.js";
import { chunkDocument } from "../services/chunking-service.js";
import { loadCorpus } from "../services/corpus-service.js";

const documents = await loadCorpus(env.corpusPath);

console.log(`Documents found: ${documents.length}`);

let totalChunks = 0;

for (const document of documents) {
  const chunks = chunkDocument(document.content);

  totalChunks += chunks.length;

  console.log(
    `\n${document.path}: ${chunks.length} chunks`,
  );

  chunks.forEach((chunk) => {
    console.log(
      `\n--- Chunk ${chunk.index} (${chunk.content.length} chars) ---`,
    );
    console.log(chunk.content);
  });
}

console.log(`Total chunks: ${totalChunks}`);