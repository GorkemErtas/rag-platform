import type {
  NextFunction,
  Request,
  Response,
} from "express";
import { env } from "../config/env.js";

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({
      error: "Authentication required",
    });
    return;
  }

  if (env.demoMode || req.user.role !== "ADMIN") {
    res.status(403).json({
      error: "Admin access required",
    });
    return;
  }

  next();
}
