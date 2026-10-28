import { createHash } from "node:crypto";
import { CHUNKING_CONFIG, EMBEDDING_CONFIG } from "../config/constants.js";

export function createChecksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function indexingFingerprint(model: string): string {
  return createChecksum(JSON.stringify({
    model,
    dimensions: EMBEDDING_CONFIG.dimensions,
    documentTask: "RETRIEVAL_DOCUMENT",
    queryTask: "RETRIEVAL_QUERY",
    normalization: "unit-l2",
    titlePolicy: "embedding-title-only-v1",
    chunking: CHUNKING_CONFIG,
  }));
}

export function isIndexCurrent(
  previous: { status: string; checksum: string | null; indexingFingerprint: string | null } | undefined,
  checksum: string,
  fingerprint: string,
): boolean {
  return previous?.status === "INDEXED" && previous.checksum === checksum &&
    previous.indexingFingerprint === fingerprint;
}
