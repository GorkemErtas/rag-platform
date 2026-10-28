export interface HealthResponse {
  status: "ok";
  service: string;
}

export interface SearchResult {
  chunkId: number;
  documentId: number;
  documentPath: string;
  documentTitle: string | null;
  chunkIndex: number;
  content: string;
  similarity: number;
  /** Ranking score only: cosine for dense, raw RRF for hybrid. Not confidence. */
  relevance: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export interface ChatRequest {
  question: string;
}

export interface ChatSource {
  /** Stable within the retrieved index snapshot, independent of ranking order. */
  sourceId?: string;
  quotes?: string[];
  path: string;
  title: string | null;
  chunkIndex: number;
  similarity: number;
  relevance: number;
}

export interface ChatResponse {
  answer: string;
  answered: boolean;
  sources: ChatSource[];
  missingInformation?: string;
}

export type UserRole = "USER" | "ADMIN";

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface DashboardStats {
  totalDocuments: number;
  indexedDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  totalSearches: number;
  answeredSearches: number;
}

export interface DashboardDocument {
  id: number;
  path: string;
  title: string | null;
  status: "PENDING" | "INDEXED" | "FAILED";
  indexedAt: string | null;
  errorMessage: string | null;
}

export interface DashboardIngestionRun {
  id: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  documentsProcessed: number;
  documentsFailed: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface DashboardSearch {
  id: number;
  query: string;
  resultCount: number;
  answered: boolean;
  createdAt: string;
}

export interface DashboardResponse {
  stats: DashboardStats;
  documents: DashboardDocument[];
  ingestionRuns: DashboardIngestionRun[];
  recentSearches: DashboardSearch[];
}
