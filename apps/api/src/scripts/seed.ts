import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { pool, db } from "../db/index.js";
import { users } from "../db/schema.js";
import { AUTH_CONFIG } from "../config/constants.js";
import type { UserRole } from "@playable-factory/shared";
import { env } from "../config/env.js";

interface DemoUser {
  email: string;
  password: string;
  role: UserRole;
}

const demoUsers: DemoUser[] = [
  {
    email: "user@demo.local",
    password: "User1234!",
    role: "USER",
  },
  {
    email: "admin@demo.local",
    password: "Admin1234!",
    role: "ADMIN",
  },
];

try {
  if (env.production || env.demoMode) throw new Error("Development seed is disabled in production and demo mode");
  for (const demoUser of demoUsers) {
    const passwordHash = await bcrypt.hash(
      demoUser.password,
      AUTH_CONFIG.passwordSaltRounds,
    );

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, demoUser.email))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[kept] ${demoUser.email}`);
      continue;
    }

    await db.insert(users).values({
      email: demoUser.email,
      passwordHash,
      role: demoUser.role,
    });

    console.log(`[created] ${demoUser.email}`);
  }

  console.log("Database seed completed successfully.");
} catch {
  console.error("Development seed refused or failed; existing credentials were preserved.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
