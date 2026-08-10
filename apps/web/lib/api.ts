import type {
  AuthResponse,
  ChatRequest,
  ChatResponse,
  DashboardResponse,
  LoginRequest,
} from "@playable-factory/shared";

import { getAuthToken } from "./auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface ApiErrorResponse {
  error?: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);

    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = false,
): Promise<T> {
  const token = authenticated
    ? getAuthToken()
    : null;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = "Something went wrong";

    try {
      const body = (await response.json()) as ApiErrorResponse;

      if (body.error) {
        message = body.error;
      }
    } catch {
      // Keep fallback.
    }

    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export function login(
  credentials: LoginRequest,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
  
}

export function askQuestion(
  payload: ChatRequest,
): Promise<ChatResponse> {
  return request<ChatResponse>(
    "/api/chat",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    true,
  );
}

export function getDashboard(): Promise<DashboardResponse> {
  return request<DashboardResponse>(
    "/api/admin/dashboard",
    {
      method: "GET",
    },
    true,
  );
}

export interface IngestionResponse {
  message: string;
  runId: number;
  documentsProcessed: number;
  documentsFailed: number;
}

export function runIngestion(): Promise<IngestionResponse> {
  return request<IngestionResponse>(
    "/api/admin/ingestion",
    {
      method: "POST",
    },
    true,
  );
}