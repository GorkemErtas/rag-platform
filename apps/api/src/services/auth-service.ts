import type {
  AuthResponse,
  AuthUser,
  UserRole,
} from "@playable-factory/shared";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import jwt, { type SignOptions } from "jsonwebtoken";

import { env } from "../config/env.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { AUTH_CONFIG } from "../config/constants.js";

export const JWT_ISSUER = "rag-platform-api";
export const JWT_AUDIENCE = "rag-platform-web";

function getJwtSecret(): string {
  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is not defined");
  }

  return env.jwtSecret;
}

function createToken(user: AuthUser, demo = false): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      demo,
    },
    getJwtSecret(),
    {
      algorithm: "HS256",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: demo ? "15m" : env.jwtExpiresIn as SignOptions["expiresIn"],
    },
  );
}

export function createDemoSession(): AuthResponse {
  if (!env.demoMode) throw new Error("Demo is disabled");
  const user: AuthUser = { id: 0, email: "visitor@portfolio.invalid", role: "USER" };
  return { token: createToken(user, true), user };
}

export async function registerUser(
  email: string,
  password: string,
  role: UserRole = "USER",
): Promise<AuthResponse> {
  if (env.demoMode || env.production) throw new Error("Registration is disabled in production and demo mode");
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUser.length > 0) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = await bcrypt.hash(
    password,
    AUTH_CONFIG.passwordSaltRounds,
  );

  const [createdUser] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      passwordHash,
      role,
    })
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
    });

  if (!createdUser) {
    throw new Error("Failed to create user");
  }

  const user: AuthUser = {
    id: createdUser.id,
    email: createdUser.email,
    role: createdUser.role,
  };

  return {
    token: createToken(user),
    user,
  };
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthResponse> {
  if (env.demoMode) throw new Error("Password login is disabled in demo mode");
  const normalizedEmail = email.trim().toLowerCase();
  if (env.production && ["user@demo.local", "admin@demo.local"].includes(normalizedEmail)) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const [userRecord] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!userRecord) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const passwordMatches = await bcrypt.compare(
    password,
    userRecord.passwordHash,
  );

  if (!passwordMatches) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const user: AuthUser = {
    id: userRecord.id,
    email: userRecord.email,
    role: userRecord.role,
  };

  return {
    token: createToken(user),
    user,
  };
}
