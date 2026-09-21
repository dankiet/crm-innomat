/**
 * Backfill Image Asset Registry từ các cột path hiện có.
 *
 * Quét: product_images.path, products.image_path,
 *       customer_mapping_items.image_path, customer_mapping_items.custom_product_image_path,
 *       gallery_collection_items.path, gallery_collections.cover_path
 *
 * - Chỉ xử lý managed refs (/images/* hoặc supabase.co); path khác → warning, KHÔNG xoá.
 * - Dedup bằng sha256 + INSERT ... ON CONFLICT DO NOTHING → không tạo duplicate record.
 * - Đọc bytes 1 lần (fetch/local), lấy metadata qua sharp (header-only).
 *
 * Dùng: node scripts/backfill-image-assets.mjs [--dry-run]
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

for (const line of fs.readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = v;
}

const DRY_RUN = process.argv.includes("--dry-run");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sha256Hex = /^[0-9a-f]{64}$/;

function isManagedRef(ref) {
  if (!ref) return false;
  if (ref.startsWith("/images/")) return true;
  try {
    return new URL(ref).hostname.endsWith("supabase.co");
  } catch {
    return false;
  }
}

function fileNameFromRef(ref) {
  if (ref.startsWith("/images/")) return ref.slice("/images/".length);
  try {
    return new URL(ref).pathname.split("/").pop() ?? "";
  } catch {
    return "";
  }
}

async function readBytes(ref) {
  if (/^https?:\/\//.test(ref)) {
    try {
      const res = await fetch(ref, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  try {
    const file = path.join(process.cwd(), "public", ref.replace(/^\//, ""));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return fs.readFileSync(file);
  } catch {
    /* ignore */
  }
  return null;
}

let created = 0;
let deduped = 0;
let skipped = 0;
let readFailed = 0;
let metaFailed = 0;
const warnings = [];

async function main() {
  await client.connect();
  const src = await client.query(`
    SELECT path FROM product_images WHERE path <> ''
    UNION SELECT image_path FROM products WHERE image_path <> ''
    UNION SELECT image_path FROM customer_mapping_items WHERE image_path <> ''
    UNION SELECT custom_product_image_path FROM customer_mapping_items WHERE custom_product_image_path <> ''
    UNION SELECT path FROM gallery_collection_items WHERE path <> ''
    UNION SELECT cover_path FROM gallery_collections WHERE cover_path <> ''
  `);
  const paths = [...new Set(src.rows.map((r) => r.path))];
  console.log(`[backfill] quét ${paths.length} path unique`);

  const sharp = (await import("sharp")).default;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  let n = 0;
  for (const ref of paths) {
    n += 1;
    const key = fileNameFromRef(ref);
    if (!isManagedRef(ref)) {
      skipped += 1;
      if (skipped <= 20) warnings.push(`skip unmanaged ${key || ref.slice(0, 80)}`);
      continue;
    }
    const bytes = await readBytes(ref);
    if (!bytes) {
      readFailed += 1;
      warnings.push(`read_failed ${key}`);
      continue;
    }
    const sha = crypto.createHash("sha256").update(bytes).digest("hex");
    let width = 0;
    let height = 0;
    let format = "";
    try {
      const meta = await sharp(bytes).metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;
      format = meta.format ?? "";
    } catch {
      metaFailed += 1;
      warnings.push(`metadata_failed ${key}`);
    }
    const mime = format ? `image/${format}` : "";
    if (DRY_RUN) {
      created += 1;
      continue;
    }
    const res = await client.query(
      `INSERT INTO image_assets
        (sha256, storage_key, mime_type, byte_size, width, height,
         created_at, updated_at, last_referenced_at, orphaned_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $7, NULL)
       ON CONFLICT (sha256) DO NOTHING`,
      [sha, key, mime, bytes.length, width, height, now],
    );
    if (res.rowCount === 1) created += 1;
    else deduped += 1;
    if (n % 50 === 0 || n === paths.length) {
      console.log(`[backfill] ${n}/${paths.length} created=${created} deduped=${deduped}`);
    }
  }

  console.log(
    `[backfill] DONE${DRY_RUN ? " (dry-run)" : ""}: created=${created} deduped=${deduped} ` +
      `skipped_unmanaged=${skipped} read_failed=${readFailed} metadata_failed=${metaFailed}`,
  );
  if (warnings.length) {
    console.warn("[backfill] warnings:");
    for (const w of warnings.slice(0, 40)) console.warn("  " + w);
    if (warnings.length > 40) console.warn(`  … còn ${warnings.length - 40} dòng`);
  }
  await client.end();
}

main().catch((err) => {
  console.error("[backfill] FAILED:", err);
  process.exitCode = 1;
});