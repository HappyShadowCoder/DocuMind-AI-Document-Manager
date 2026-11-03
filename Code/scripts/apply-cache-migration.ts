/**
 * scripts/apply-cache-migration.ts
 *
 * Applies the SemanticCache migration to the database specified in .env
 */

import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { readFile } from "node:fs/promises";
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined in .env");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  console.log("Connecting to database:", process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@"));

  const sqlPath = path.resolve(
    process.cwd(),
    "prisma/migrations/20261101000000_add_semantic_cache/migration.sql"
  );
  const sql = await readFile(sqlPath, "utf-8");

  console.log("Applying SemanticCache migration SQL...");
  await pool.query(sql);

  console.log("Verifying SemanticCache table exists...");
  const res = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'SemanticCache'
  `);

  if (res.rows.length > 0) {
    console.log("✅ Table 'SemanticCache' exists and is ready to use!");
  } else {
    console.error("❌ Table 'SemanticCache' was not found after running migration.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Failed to apply migration:", err);
  process.exit(1);
});

