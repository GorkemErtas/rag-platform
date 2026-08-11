import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { pool, db } from "../db/index.js";
import { users } from "../db/schema.js";
import { AUTH_CONFIG } from "../config/constants.js";
import type { UserRole } from "@playable-factory/shared";

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
      await db
        .update(users)
        .set({
          passwordHash,
          role: demoUser.role,
        })
        .where(eq(users.email, demoUser.email));

      console.log(`[updated] ${demoUser.email}`);
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
} finally {
  await pool.end();
}