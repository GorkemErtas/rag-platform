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
    `${document.path}: ${chunks.length} chunks`,
  );
}

console.log(`Total chunks: ${totalChunks}`);