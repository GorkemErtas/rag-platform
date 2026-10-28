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
  // Historical threshold retained only until evaluation runners are replaced.
  defaultTopK: 5,
  minSimilarity: 0.65,
  maxSearchLimit: 20,

  rrfK: 60,
  vectorWeight: 1,
  lexicalWeight: 1.2,

  denseRelevanceWeight: 0.7,
  hybridRelevanceWeight: 0.3,

  candidateMultiplier: 4,
  minCandidateCount: 20,
  maxCandidateCount: 50,
} as const;

export const CHUNKING_CONFIG = {
  maxCharacters: 1200,
  overlap: 0,
  version: "paragraph-v2",
} as const;
