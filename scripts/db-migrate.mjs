/**
 * Áp dụng schema PostgreSQL lên cơ sở dữ liệu đích.
 * Run: npm run db:migrate   (đọc DATABASE_URL_UNPOOLED || DATABASE_URL)
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const schemaPath = path.join(root, "src", "db", "schema-pg.sql");

/** Nạp .env / .env.local giống scripts/enable-rls.mjs — env thật vẫn thắng. */
function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

loadDotEnvFile(path.join(root, ".env"));
loadDotEnvFile(path.join(root, ".env.local"));

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
