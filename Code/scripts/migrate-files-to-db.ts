/**
 * scripts/migrate-files-to-db.ts
 *
 * One-shot migration: reads every file from public/uploads/ and inserts
 * its raw bytes into the FileBlob table in PostgreSQL.
 *
 * Run AFTER applying the 20261103000000_add_file_blob migration SQL.
 * Run BEFORE deploying the new code that sets File.path = null.
 *
 * Usage:
 *   npx tsx scripts/migrate-files-to-db.ts
 *
 * The script is idempotent — files that already have a FileBlob row are skipped.
 */

import path from "node:path";
import dotenv from "dotenv";

// Load environment variables (.env and .env.local)
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/** Guess MIME type from file extension. */
function guessMimeType(fileName: string, fileType: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    txt: "text/plain",
    csv: "text/csv",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    zip: "application/zip",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
  };
  return map[ext] ?? (fileType === "pdf" ? "application/pdf" : "application/octet-stream");
}

/** Resolve a stored /uploads/... path to an absolute filesystem path. */
function resolveUploadsPath(storedPath: string): string {
  const normalized = storedPath.replace(/\\/g, "/");
  if (normalized.startsWith("/uploads/")) {
    return path.join(process.cwd(), "public", normalized.slice(1));
  }
  if (normalized.startsWith("uploads/")) {
    return path.join(process.cwd(), "public", normalized);
  }
  if (path.isAbsolute(storedPath)) return storedPath;
  return path.join(process.cwd(), normalized.replace(/^\//, ""));
}

async function main() {
  console.log("=== DocuMind: Migrate files from disk → PostgreSQL FileBlob ===\n");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in the environment or .env file.");
  }

  // Query all files that still have a path (legacy disk files)
  const files = await prisma.file.findMany({
    where: { path: { not: null } },
    select: { id: true, name: true, type: true, path: true },
  });

  console.log(`Found ${files.length} file(s) with a stored disk path.\n`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    // Check if already migrated
    const existing = await prisma.fileBlob.findUnique({
      where: { fileId: file.id },
      select: { id: true },
    });

    if (existing) {
      console.log(`  SKIP (already in DB): ${file.name} [${file.id}]`);
      skipped++;
      continue;
    }

    if (!file.path) {
      console.warn(`  SKIP (no path): ${file.name} [${file.id}]`);
      skipped++;
      continue;
    }

    const absPath = resolveUploadsPath(file.path);

    if (!existsSync(absPath)) {
      console.warn(`  SKIP (missing on disk): ${file.name} → ${absPath}`);
      skipped++;
      continue;
    }

    try {
      const data = await readFile(absPath);
      const mimeType = guessMimeType(file.name, file.type);

      await prisma.fileBlob.create({
        data: {
          id: randomUUID(),
          fileId: file.id,
          data,
          mimeType,
        },
      });

      console.log(`  ✓ Migrated: ${file.name} (${(data.length / 1024).toFixed(1)} KB)`);
      migrated++;
    } catch (err) {
      console.error(`  ✗ FAILED: ${file.name} [${file.id}]:`, err);
      failed++;
    }
  }

  console.log(`\n=== Migration complete ===`);
  console.log(`  Migrated : ${migrated}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Failed   : ${failed}`);

  if (failed === 0 && migrated > 0) {
    console.log(`\n✅ All files migrated successfully.`);
    console.log(`   You can now safely delete public/uploads/ after verifying the app works.`);
  } else if (failed > 0) {
    console.log(`\n⚠️  Some files failed — check errors above before deleting uploads/.`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (err) => {
  console.error("Migration script crashed:", err);
  try {
    await prisma.$disconnect();
    await pool.end();
  } catch {}
  process.exit(1);
});
