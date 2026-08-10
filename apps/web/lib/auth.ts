import type {
  AuthResponse,
  AuthUser,
} from "@playable-factory/shared";

const TOKEN_KEY = "lumen_auth_token";
const USER_KEY = "lumen_auth_user";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function saveAuthSession(
  auth: AuthResponse,
): void {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(TOKEN_KEY, auth.token);
  localStorage.setItem(
    USER_KEY,
    JSON.stringify(auth.user),
  );
}

export function getAuthToken(): string | null {
  if (!isBrowser()) {
    return null;
  }

  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  if (!isBrowser()) {
    return null;
  }

  const value = localStorage.getItem(USER_KEY);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as AuthUser;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function clearAuthSession(): void {
  if (!isBrowser()) {
    return;
  }

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}