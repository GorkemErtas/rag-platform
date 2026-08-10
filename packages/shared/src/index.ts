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
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export interface ChatRequest {
  question: string;
}

export interface ChatSource {
  path: string;
  title: string | null;
  chunkIndex: number;
  similarity: number;
}

export interface ChatResponse {
  answer: string;
  answered: boolean;
  sources: ChatSource[];
}