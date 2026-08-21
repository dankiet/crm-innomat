/**
 * Bật RLS trên mọi bảng schema public (chặn PostgREST/anon).
 * Server app dùng DATABASE_URL (bypass RLS) nên không bị ảnh hưởng.
 *
 * Run: node scripts/enable-rls.mjs
 * Đọc DATABASE_URL_UNPOOLED || DATABASE_URL từ process env hoặc file .env
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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

const url =
  process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();

if (!url) {
  console.error("Missing DATABASE_URL (hoặc DATABASE_URL_UNPOOLED).");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const sql = `
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE 'pg_%'
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       (
         SELECT count(*)::int
         FROM pg_policy p
         WHERE p.polrelid = c.oid
       ) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;
`;

try {
  await client.connect();
  // Who am I / can we bypass?
  const who = await client.query(
    "select current_user, session_user, current_setting('role', true) as role_setting",
  );
  console.log("[enable-rls] connected as:", who.rows[0]);

  await client.query("BEGIN");
  const result = await client.query(sql);
  await client.query("COMMIT");

  // Last result set is the SELECT status
  const rows = result[result.length - 1]?.rows ?? result.rows ?? [];
  console.log("[enable-rls] public tables:");
  for (const row of rows) {
    console.log(
      `  - ${row.table_name}: rls=${row.rls_enabled} force=${row.rls_forced} policies=${row.policy_count}`,
    );
  }

  const open = rows.filter((r) => !r.rls_enabled);
  if (open.length) {
    console.error("[enable-rls] STILL OPEN:", open.map((r) => r.table_name).join(", "));
    process.exitCode = 1;
  } else {
    console.log(
      `[enable-rls] OK — ${rows.length} table(s) RLS enabled, no anon policies added.`,
    );
  }
} catch (err) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // ignore
  }
  console.error("[enable-rls] FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
