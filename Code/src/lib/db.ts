import { Pool } from "../../node_modules/@types/pg";

// In a local network app, the database is running on the same Admin machine.
// You should set DATABASE_URL in your .env.local file:
// DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/yourdatabase"
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log(`Executed query: { text: ${text}, duration: ${duration}ms, rows: ${res.rowCount} }`);
  return res;
}