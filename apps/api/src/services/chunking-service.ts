import { CHUNKING_CONFIG } from "../config/constants.js";

export interface DocumentChunk {
  index: number;
  content: string;
}

export function chunkDocument(
  content: string,
  chunkSize: number = CHUNKING_CONFIG.maxCharacters,
  overlap: number = CHUNKING_CONFIG.overlap,
): DocumentChunk[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 ||
      !Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) {
    throw new Error("Chunk size must be a positive integer and overlap must be between 0 and size - 1");
  }
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= chunkSize) return [{ index: 0, content: normalized }];

  // Keep a heading with its following paragraph/list where it fits.
  const blocks: string[] = [];
  let heading = "";
  for (const paragraph of normalized.split(/\n\s*\n/)) {
    const block = paragraph.trim();
    if (/^#{1,6} [^\n]+$/.test(block)) {
      heading = heading ? `${heading}\n\n${block}` : block;
    } else if (block) {
      blocks.push(heading ? `${heading}\n\n${block}` : block);
      heading = "";
    }
  }
  if (heading) blocks.push(heading);

  const pieces: string[] = [];
  for (const block of blocks) {
    let remaining = block;
    while (remaining.length > chunkSize) {
      const window = remaining.slice(0, chunkSize + 1);
      let end = window.lastIndexOf("\n", chunkSize);
      if (end < chunkSize / 2) end = window.lastIndexOf(" ", chunkSize);
      if (end <= overlap) end = chunkSize;
      pieces.push(remaining.slice(0, end).trim());
      remaining = remaining.slice(end - overlap).trimStart();
    }
    if (remaining) pieces.push(remaining);
  }

  const contents: string[] = [];
  let buffer = "";
  for (const piece of pieces) {
    const candidate = buffer ? `${buffer}\n\n${piece}` : piece;
    if (candidate.length <= chunkSize) {
      buffer = candidate;
      continue;
    }
    contents.push(buffer);
    const tail = overlap > 0 ? buffer.slice(-overlap) : "";
    buffer = tail && tail.length + 2 + piece.length <= chunkSize
      ? `${tail}\n\n${piece}` : piece;
  }
  if (buffer) contents.push(buffer);
  return contents.map((content, index) => ({ index, content }));
}
