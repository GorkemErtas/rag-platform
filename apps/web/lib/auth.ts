"use client";

import { useMemo, useSyncExternalStore } from "react";
import type {
  AuthResponse,
  AuthUser,
} from "@playable-factory/shared";

const TOKEN_KEY = "lumen_auth_token";
const USER_KEY = "lumen_auth_user";
const AUTH_EVENT = "lumen-auth-change";

function storage(): Storage {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? sessionStorage : localStorage;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function saveAuthSession(
  auth: AuthResponse,
): void {
  if (!isBrowser()) {
    return;
  }

  storage().setItem(TOKEN_KEY, auth.token);
  storage().setItem(
    USER_KEY,
    JSON.stringify(auth.user),
  );
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function getAuthToken(): string | null {
  if (!isBrowser()) {
    return null;
  }

  return storage().getItem(TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  if (!isBrowser()) {
    return null;
  }

  const value = storage().getItem(USER_KEY);

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

  storage().removeItem(TOKEN_KEY);
  storage().removeItem(USER_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(AUTH_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(AUTH_EVENT, callback);
  };
}

export function useAuthUser(): { user: AuthUser | null; isReady: boolean } {
  const value = useSyncExternalStore(subscribe, () => storage().getItem(USER_KEY), () => undefined);
  const user = useMemo(() => {
    try { return value ? JSON.parse(value) as AuthUser : null; } catch { return null; }
  }, [value]);
  return { user, isReady: value !== undefined };
}
