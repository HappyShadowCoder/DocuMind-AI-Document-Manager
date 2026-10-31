// seed.ts
import dotenv from "dotenv";
dotenv.config();

import { execFileSync } from "node:child_process";
import path from "node:path";
import bcrypt from "bcryptjs";

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function runSql(sql: string): void {
  execFileSync("npx", ["prisma", "db", "execute", "--stdin"], {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    input: sql,
    stdio: "pipe",
    encoding: "utf8",
  });
}

async function main() {
  const commonPassword = await bcrypt.hash("password123", 10);
  const safePassword = escapeSql(commonPassword);

  const sql = `
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'admin@example.com') THEN
        INSERT INTO "User" (
          id,
          email,
          "fullName",
          "passwordHash",
          role,
          "mustChangePassword",
          "createdAt",
          "updatedAt"
        ) VALUES (
          gen_random_uuid()::text,
          'admin@example.com',
          'Admin User',
          '${safePassword}',
          'admin',
          false,
          NOW(),
          NOW()
        );
      ELSE
        UPDATE "User"
        SET "passwordHash" = '${safePassword}',
            "fullName" = 'Admin User',
            role = 'admin',
            "mustChangePassword" = false,
            "updatedAt" = NOW()
        WHERE email = 'admin@example.com';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'test@example.com') THEN
        INSERT INTO "User" (
          id,
          email,
          "fullName",
          "passwordHash",
          role,
          "mustChangePassword",
          "createdAt",
          "updatedAt"
        ) VALUES (
          gen_random_uuid()::text,
          'test@example.com',
          'Test User',
          '${safePassword}',
          'user',
          false,
          NOW(),
          NOW()
        );
      ELSE
        UPDATE "User"
        SET "passwordHash" = '${safePassword}',
            "fullName" = 'Test User',
            role = 'user',
            "mustChangePassword" = false,
            "updatedAt" = NOW()
        WHERE email = 'test@example.com';
      END IF;
    END $$;
  `;

  runSql(sql);
  console.log("Seeded admin and test users.");
}

main().catch((error) => {
  console.error("Error seeding database:", error);
  process.exit(1);
});