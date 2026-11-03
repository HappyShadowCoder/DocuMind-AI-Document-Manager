import dotenv from "dotenv";
dotenv.config();
import { Pool } from "pg";
import fs from "fs";
import path from "path";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log("Exporting FileBlobs to Code/prisma/file_blobs.json...");
  const res = await pool.query('SELECT "fileId", encode(data, \'base64\') as b64, "mimeType" FROM "FileBlob"');
  
  const blobsData = res.rows.map((row) => ({
    fileId: row.fileId,
    mimeType: row.mimeType,
    dataBase64: row.b64,
  }));

  const outPath = path.resolve(__dirname, "../prisma/file_blobs.json");
  fs.writeFileSync(outPath, JSON.stringify(blobsData));
  console.log(`Successfully exported ${blobsData.length} blobs to ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB)`);
  await pool.end();
}

main().catch(console.error);
