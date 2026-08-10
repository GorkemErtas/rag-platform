export interface DocumentChunk {
  index: number;
  content: string;
}

const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 200;

export function chunkDocument(
  content: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP,
): DocumentChunk[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return [];
  }

  if (overlap >= chunkSize) {
    throw new Error("Chunk overlap must be smaller than chunk size");
  }

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: DocumentChunk[] = [];
  let buffer = "";

  const pushChunk = () => {
    const chunk = buffer.trim();

    if (!chunk) {
      return;
    }

    chunks.push({
      index: chunks.length,
      content: chunk,
    });

    buffer = chunk.slice(-overlap);
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > chunkSize) {
      if (buffer.trim()) {
        pushChunk();
      }

      let start = 0;

      while (start < paragraph.length) {
        const end = Math.min(start + chunkSize, paragraph.length);
        const chunk = paragraph.slice(start, end).trim();

        if (chunk) {
          chunks.push({
            index: chunks.length,
            content: chunk,
          });
        }

        if (end === paragraph.length) {
          break;
        }

        start = end - overlap;
      }

      buffer = "";
      continue;
    }

    const candidate = buffer
      ? `${buffer}\n\n${paragraph}`
      : paragraph;

    if (candidate.length > chunkSize && buffer) {
      pushChunk();
      buffer = `${buffer}\n\n${paragraph}`;
    } else {
      buffer = candidate;
    }
  }

  if (buffer.trim()) {
    chunks.push({
      index: chunks.length,
      content: buffer.trim(),
    });
  }

  return chunks;
}