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

function getJwtSecret(): string {
  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is not defined");
  }

  return env.jwtSecret;
}

function createToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    {
      expiresIn:
        env.jwtExpiresIn as SignOptions["expiresIn"],
    },
  );
}

export async function registerUser(
  email: string,
  password: string,
  role: UserRole = "USER",
): Promise<AuthResponse> {
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
  const normalizedEmail = email.trim().toLowerCase();

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