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
  minSimilarity: 0.65,
  maxSearchLimit: 20,
  rrfK: 60,
  vectorWeight: 1,
  lexicalWeight: 1.2,
  candidateMultiplier: 4,
  minCandidateCount: 20,
  maxCandidateCount: 50,
} as const;