import type {
  LoginRequest,
  RegisterRequest,
} from "@playable-factory/shared";
import { Router } from "express";

import {
  loginUser,
  registerUser,
  createDemoSession,
} from "../services/auth-service.js";
import { env } from "../config/env.js";
import { logFailure } from "../utils/log.js";

export const authRouter = Router();

authRouter.post("/demo", (_req, res) => {
  if (!env.demoMode) { res.status(404).json({ error: "Demo is disabled" }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json(createDemoSession());
});

function credentials(body: Partial<LoginRequest> | undefined): { email: string; password: string } | null {
  if (typeof body?.email !== "string" || typeof body?.password !== "string") return null;
  const email = body.email.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      body.password.length === 0 || Buffer.byteLength(body.password) > 72) return null;
  return { email, password: body.password };
}

authRouter.post("/register", async (req, res) => {
  if (env.production || env.demoMode) { res.status(403).json({ error: "Public registration is disabled" }); return; }
  try {
    const body = req.body as Partial<RegisterRequest>;
    const input = credentials(body);
    if (!input) {
      res.status(400).json({
        error: "Email and password are required",
      });
      return;
    }

    const { email, password } = input;

    if (password.length < 8) {
      res.status(400).json({
        error: "Password must be at least 8 characters",
      });
      return;
    }

    const result = await registerUser(email, password);

    res.status(201).json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "EMAIL_ALREADY_EXISTS"
    ) {
      res.status(409).json({
        error: "An account with this email already exists",
      });
      return;
    }

    logFailure("Registration failed", error);

    res.status(500).json({
      error: "Failed to register user",
    });
  }
});

authRouter.post("/login", async (req, res) => {
  if (env.demoMode) { res.status(403).json({ error: "Use the read-only demo session" }); return; }
  try {
    const body = req.body as Partial<LoginRequest>;
    const input = credentials(body);
    if (!input) {
      res.status(400).json({
        error: "Email and password are required",
      });
      return;
    }
    const { email, password } = input;
    const result = await loginUser(email, password);

    res.json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "INVALID_CREDENTIALS"
    ) {
      res.status(401).json({
        error: "Invalid email or password",
      });
      return;
    }

    logFailure("Login failed", error);

    res.status(500).json({
      error: "Failed to log in",
    });
  }
});
