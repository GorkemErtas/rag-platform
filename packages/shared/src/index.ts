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