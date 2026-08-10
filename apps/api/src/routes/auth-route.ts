import type {
  LoginRequest,
  RegisterRequest,
} from "@playable-factory/shared";
import { Router } from "express";

import {
  loginUser,
  registerUser,
} from "../services/auth-service.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  try {
    const body = req.body as Partial<RegisterRequest>;

    const email = body.email?.trim();
    const password = body.password;

    if (!email || !password) {
      res.status(400).json({
        error: "Email and password are required",
      });
      return;
    }

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

    console.error("Registration failed:", error);

    res.status(500).json({
      error: "Failed to register user",
    });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const body = req.body as Partial<LoginRequest>;

    const email = body.email?.trim();
    const password = body.password;

    if (!email || !password) {
      res.status(400).json({
        error: "Email and password are required",
      });
      return;
    }

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

    console.error("Login failed:", error);

    res.status(500).json({
      error: "Failed to log in",
    });
  }
});