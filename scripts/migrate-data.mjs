/**
 * Migrate toàn bộ dữ liệu từ SQLite (data/crm.db) → Supabase PostgreSQL, GIỮ NGUYÊN id.
 * Idempotent: INSERT ... ON CONFLICT DO NOTHING + setval identity sequence.
 *
 * Yêu cầu: schema đã áp (npm run db:migrate), env DATABASE_URL_UNPOOLED / DATABASE_URL.
 * Run: node scripts/migrate-data.mjs  (thêm --dry-run để chạy thử, không ghi)
 */
import Database from "better-sqlite3";
import pg from "pg";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const SQLITE_PATH = path.resolve("data/crm.db");
const url =
  process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Missing DATABASE_URL / DATABASE_URL_UNPOOLED.");
  process.exit(1);
}

// Thứ tự insert theo quan hệ FK (cha trước con).
const TABLE_ORDER = [
  "users",
  "products",
  "product_internal_codes",
  "inventory",
  "customers",
  "quotes",
  "quote_items",
  "orders",
  "payments",
  "notes",
  "product_images",
  "customer_mappings",
  "customer_mapping_items",
  "customer_mapping_quote_links",
  "customer_product_samples",
  "sessions",
  "audit_logs",
];
// Bảng không có cột PK tự tăng id (không setval).
const NO_IDENTITY = new Set(["customer_mapping_quote_links", "sessions"]);

const sqlite = new Database(SQLITE_PATH, { readonly: true });

// ─── Trợ giúp: lấy column metadata từ SQLite ─────────────────
function tableColumns(table) {
  const cols = sqlite.prepare(`PRAGMA table_info("${table}")`).all();
  return cols.map((c) => ({
    name: c.name,
    type: (c.type || "").toUpperCase(),
    notNull: c.notnull === 1,
    dflt: c.dflt_value,
  }));
}

function coerce(value, col) {
  if (value == null) return value;
  if (
    /INT|FLOAT|REAL|DOUBLE|NUMERIC|DECIMAL/.test(col.type) &&
    typeof value === "string"
  ) {
    const n = Number(value.replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return value;
}

async function migrateTable(client, table) {
  const cols = tableColumns(table);
  const qnames = cols.map((c) => `"${c.name}"`).join(", ");

  const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
  const MAX_PARAMS = 30000;
  const ROWS_PER_BATCH = Math.max(1, Math.floor(MAX_PARAMS / cols.length));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += ROWS_PER_BATCH) {
    const batch = rows.slice(i, i + ROWS_PER_BATCH);
    if (DRY_RUN) {
      inserted += batch.length;
      continue;
    }
    const placeholders = [];
    const flat = [];
    for (const row of batch) {
      const rowVals = [];
      for (const c of cols) rowVals.push(coerce(row[c.name], c));
      const base = flat.length;
      placeholders.push(
        `(${rowVals.map((_, j) => `$${base + j + 1}`).join(", ")})`,
      );
      flat.push(...rowVals);
    }
    const sql = `INSERT INTO "${table}" (${qnames}) VALUES ${placeholders.join(", ")} ON CONFLICT DO NOTHING`;
    const res = await client.query(sql, flat);
    inserted += res.rowCount ?? 0;
  }
  return rows.length;
}

async function resetSequences(client) {
  for (const table of TABLE_ORDER) {
    if (NO_IDENTITY.has(table)) continue;
    if (DRY_RUN) continue;
    await client.query(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST(COALESCE(MAX(id), 0) + 1, 1), false) FROM "${table}"`,
    );
  }
}

async function verifyCounts(client) {
  console.log("\n=== VERIFY COUNTS (sqlite → pg) ===");
  let ok = true;
  for (const table of TABLE_ORDER) {
    const a = sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
    const b = await client
      .query(`SELECT COUNT(*) AS n FROM "${table}"`)
      .then((r) => Number(r.rows[0].n));
    const mark = a === b ? "OK" : "MISMATCH";
    if (a !== b) ok = false;
    console.log(`  ${mark.padEnd(9)} ${table.padEnd(30)} sqlite=${a} pg=${b}`);
  }
  if (!ok) {
    console.error("\nCó bảng lệch dữ liệu — xem log trên.");
    process.exitCode = 1;
  } else {
    console.log("\nTất cả bảng khớp.");
  }
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  console.log(DRY_RUN ? "[DRY RUN] không ghi dữ liệu" : "Bắt đầu migrate…");
  for (const table of TABLE_ORDER) {
    const total = await migrateTable(client, table);
    console.log(`  ${table.padEnd(30)} ${total} rows`);
  }
  await resetSequences(client);
  await verifyCounts(client);
} catch (err) {
  console.error("MIGRATE FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
  sqlite.close();
}
