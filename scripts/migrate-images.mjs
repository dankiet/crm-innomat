/**
 * Upload toàn bộ ảnh (public/images, ~3.403 file) lên Vercel Blob
 * và cập nhật các cột ref trong Supabase PostgreSQL từ /images/... → blob URL.
 *
 * Content-addressed (sha256) trùng với storage.ts → tự chống trùng, idempotent:
 * chạy lại sẽ skip ảnh đã có (head) và không đổi rows đã là URL.
 *
 * Yêu cầu: BLOB_READ_WRITE_TOKEN, DATABASE_URL (đã migrate data), env LOCAL_DATA_DIR (mặc định ./public).
 * Run: node scripts/migrate-images.mjs   (--dry-run để xem kế hoạch)
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { head, put } from "@vercel/blob";

const DRY_RUN = process.argv.includes("--dry-run");
const TOKEN = (process.env.BLOB_READ_WRITE_TOKEN ?? "").trim();
const PREFIX = (process.env.BLOB_STORE_PREFIX ?? "crm").replace(/\/+$/, "");
const LOCAL_IMAGES = path.resolve(process.env.LOCAL_DATA_DIR || "./public", "images");

if (!TOKEN) {
  console.error("Missing BLOB_READ_WRITE_TOKEN.");
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Missing DATABASE_URL / DATABASE_URL_UNPOOLED.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

/** Các cột ref cần đồng bộ → ảnh. */
const REF_FIELDS = [
  ["products", "image_path"],
  ["product_images", "path"],
  ["customer_mapping_items", "image_path"],
  ["customer_mapping_items", "custom_product_image_path"],
];

async function distinctRefs() {
  const set = new Set();
  for (const [table, col] of REF_FIELDS) {
    const { rows } = await client.query(
      `SELECT DISTINCT "${col}" AS ref FROM "${table}" WHERE "${col}" IS NOT NULL AND "${col}" != ''`,
    );
    for (const r of rows) set.add(r.ref);
  }
  return [...set];
}

async function uploadOne(ref) {
  const name = ref.replace(/^\//, "");
  const localFile = path.join(LOCAL_IMAGES, name);
  if (!fs.existsSync(localFile) || !fs.statSync(localFile).isFile()) return null;

  const pathname = `${PREFIX}/${name}`;
  try {
    const existing = await head(pathname, { token: TOKEN });
    if (existing?.url) return existing.url;
  } catch {
    /* chưa có → put */
  }
  const buf = fs.readFileSync(localFile);
  const ext = path.extname(name).toLowerCase();
  const { url } = await put(pathname, buf, {
    access: "public",
    token: TOKEN,
    contentType: (() => {
      const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
      return mime[ext] ?? "application/octet-stream";
    })(),
  });
  return url;
}

async function updateRefs(map) {
  for (const [table, col] of REF_FIELDS) {
    for (const [oldRef, newUrl] of map) {
      if (!newUrl) continue;
      const q = `UPDATE "${table}" SET "${col}" = $1 WHERE "${col}" = $2`;
      const { rowCount } = await client.query(q, [newUrl, oldRef]);
      if (rowCount > 0) console.log(`  ${table}.${col}: ${oldRef} → ${newUrl} (${rowCount})`);
    }
  }
}

async function main() {
  await client.connect();
  const refs = await distinctRefs();
  console.log(`Tìm thấy ${refs.length} ref ảnh duy nhất trong DB.`);
  console.log(DRY_RUN ? "[DRY RUN] không upload / không ghi DB" : "Bắt đầu upload…");

  const map = new Map();
  const LIMIT = 8;
  let done = 0;
  let skipped = 0;

  for (let i = 0; i < refs.length; i += LIMIT) {
    const slice = refs.slice(i, i + LIMIT);
    const results = await Promise.all(
      slice.map(async (ref) => {
        if (!/^\/images\//.test(ref)) return [ref, null];
        const url = DRY_RUN ? `https://blob.vercel-storage.com/${PREFIX}/${ref.replace(/^\//, "")}` : await uploadOne(ref);
        return [ref, url];
      }),
    );
    for (const [ref, url] of results) {
      map.set(ref, url);
      if (url) done++;
      else skipped++;
    }
    console.log(`  progress ${Math.min(i + LIMIT, refs.length)}/${refs.length} (done=${done} skip=${skipped})`);
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] sẽ upload ${done} ảnh, bỏ ${skipped} (không có file local hoặc không phải /images/).`);
    process.exitCode = 0;
    return;
  }
  console.log(`\nCập nhật refs trong DB…`);
  await updateRefs(map);
  await client.end();
  console.log("Xong.");
}

main().catch((e) => {
  console.error("MIGRATE IMAGES FAILED:", e.message);
  process.exitCode = 1;
});
