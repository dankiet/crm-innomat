/**
 * Áp dụng schema PostgreSQL lên cơ sở dữ liệu đích.
 * Run: npm run db:migrate   (đọc DATABASE_URL_UNPOOLED || DATABASE_URL)
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "src", "db", "schema-pg.sql");
const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();

if (!url) {
  console.error("Missing DATABASE_URL (hoặc DATABASE_URL_UNPOOLED).");
  process.exit(1);
}

const sql = fs.readFileSync(schemaPath, "utf-8");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log(`[db:migrate] Schema applied (${schemaPath})`);
} catch (err) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Connection may already be closed or unusable.
  }
  console.error("[db:migrate] FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
