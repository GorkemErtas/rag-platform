import type {
  AuthUser,
  UserRole,
} from "@playable-factory/shared";
import type {
  NextFunction,
  Request,
  Response,
} from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Authentication required",
    });
    return;
  }

  const token = authorization.slice("Bearer ".length);

  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is not defined");
  }

  try {
    const payload = jwt.verify(
      token,
      env.jwtSecret,
    ) as JwtPayload;

    const userId = Number(payload.sub);

    if (
      !Number.isInteger(userId) ||
      !payload.email ||
      !["USER", "ADMIN"].includes(payload.role)
    ) {
      res.status(401).json({
        error: "Invalid authentication token",
      });
      return;
    }

    req.user = {
      id: userId,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch {
    res.status(401).json({
      error: "Invalid or expired authentication token",
    });
  }
}