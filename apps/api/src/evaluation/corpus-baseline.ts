import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { env } from "../config/env.js";
import { loadCorpus } from "../services/corpus-service.js";
import { chunkDocument } from "../services/chunking-service.js";

// Run on each revision to compare evidence fragmentation. This does not measure
// semantic retrieval or generated answer quality.
const documents = (await loadCorpus(env.corpusPath)).sort((a, b) => a.path.localeCompare(b.path));
const rows = documents.map((document) => {
  const chunks = chunkDocument(document.content);
  const paragraphs = document.content.replace(/\r\n/g, "\n").trim().split(/\n\s*\n/).filter(Boolean);
  return {
    path: document.path,
    characters: document.content.replace(/\r\n/g, "\n").trim().length,
    chunks: chunks.length,
    indexedCharacters: chunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
    paragraphs: paragraphs.length,
    intactParagraphs: paragraphs.filter((paragraph) => chunks.some((chunk) => chunk.content.includes(paragraph))).length,
  };
});
const report = {
  corpusHash: createHash("sha256").update(JSON.stringify(documents)).digest("hex"),
  documents: rows.length,
  chunks: rows.reduce((sum, row) => sum + row.chunks, 0),
  fragmentedDocuments: rows.filter((row) => row.chunks > 1).length,
  sourceCharacters: rows.reduce((sum, row) => sum + row.characters, 0),
  indexedCharacters: rows.reduce((sum, row) => sum + row.indexedCharacters, 0),
  paragraphs: rows.reduce((sum, row) => sum + row.paragraphs, 0),
  intactParagraphs: rows.reduce((sum, row) => sum + row.intactParagraphs, 0),
  rows,
};
const output = process.argv[2];
if (output) {
  const { dirname } = await import("node:path");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}
const { rows: _rows, ...summary } = report;
console.log(JSON.stringify(summary, null, 2));
