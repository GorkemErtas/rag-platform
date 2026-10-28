export const AUTH_CONFIG = {
  passwordSaltRounds: 12,
} as const;

export const EMBEDDING_CONFIG = {
  dimensions: 768,
  maxRetries: 4,
  initialRetryDelayMs: 5_000,
  ingestionDelayMs: 700,
} as const;

export const RETRIEVAL_CONFIG = {
  defaultTopK: 5,
  maxSearchLimit: 20,

  rrfK: 60,
  maxCandidateCount: 50,
} as const;

export const RAG_CONFIG = {
  maxContextChunks: 8,
  maxContextCharacters: 12000,
} as const;

export const CHUNKING_CONFIG = {
  maxCharacters: 1200,
  overlap: 0,
  version: "paragraph-v2",
} as const;
