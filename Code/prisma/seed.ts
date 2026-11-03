// seed.ts
import dotenv from "dotenv";
dotenv.config();

import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

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

  // Seed FileBlobs if table is empty and file_blobs.json exists
  const blobsJsonPath = path.resolve(__dirname, "file_blobs.json");
  if (fs.existsSync(blobsJsonPath) && process.env.DATABASE_URL) {
    try {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const countRes = await pool.query('SELECT count(*) FROM "FileBlob"');
      const blobCount = parseInt(countRes.rows[0].count, 10);
      if (blobCount === 0) {
        console.log("Seeding FileBlobs from file_blobs.json...");
        const raw = fs.readFileSync(blobsJsonPath, "utf8");
        const blobs = JSON.parse(raw);
        for (const b of blobs) {
          const buffer = Buffer.from(b.dataBase64, "base64");
          await pool.query(
            `INSERT INTO "FileBlob" (id, "fileId", data, "mimeType", "createdAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, NOW())
             ON CONFLICT ("fileId") DO NOTHING`,
            [b.fileId, buffer, b.mimeType]
          );
        }
        console.log(`Seeded ${blobs.length} FileBlobs successfully.`);
      } else {
        console.log(`FileBlob already has ${blobCount} records.`);
      }
      await pool.end();
    } catch (err: any) {
      console.warn("Notice: FileBlob seeding skipped or encountered error:", err.message);
    }
  }
}

main().catch((error) => {
  console.error("Error seeding database:", error);
  process.exit(1);
});