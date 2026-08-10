import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { pool, db } from "../db/index.js";
import { users } from "../db/schema.js";

const PASSWORD_SALT_ROUNDS = 12;

const demoUsers = [
  {
    email: "user@demo.local",
    password: "User1234!",
    role: "USER" as const,
  },
  {
    email: "admin@demo.local",
    password: "Admin1234!",
    role: "ADMIN" as const,
  },
];

try {
  for (const demoUser of demoUsers) {
    const passwordHash = await bcrypt.hash(
      demoUser.password,
      PASSWORD_SALT_ROUNDS,
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