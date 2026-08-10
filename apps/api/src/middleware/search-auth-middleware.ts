import { timingSafeEqual } from "node:crypto";
import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { env } from "../config/env.js";
import { requireAuth } from "./auth-middleware.js";

function isValidServiceToken(candidate: string): boolean {
  const expected = env.mcpServiceToken;

  if (!expected) {
    return false;
  }

  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function requireSearchAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const serviceToken = req.header("x-mcp-service-token");

  if (serviceToken && isValidServiceToken(serviceToken)) {
    next();
    return;
  }

  requireAuth(req, res, next);
}