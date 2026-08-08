/**
 * Upload toàn bộ ảnh (public/images, ~3.403 file) lên Supabase Storage
 * và cập nhật các cột ref trong Supabase PostgreSQL từ /images/... → public URL.
 *
 * Content-addressed (sha256) trùng với storage.ts → tự chống trùng, idempotent:
 * chạy lại sẽ skip ảnh đã có (info) và không đổi rows đã là URL.
 *
 * Yêu cầu: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL (đã migrate data),
 * env LOCAL_DATA_DIR (mặc định ./public), BLOB_BUCKET (mặc định crm-images).
 * Run: node scripts/migrate-images.mjs   (--dry-run để xem kế hoạch)
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { StorageClient } from "@supabase/storage-js";

const DRY_RUN = process.argv.includes("--dry-run");
const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const BUCKET = (process.env.BLOB_BUCKET ?? "crm-images").replace(/^\//, "").replace(/\/+$/, "");
const PREFIX = (process.env.BLOB_STORE_PREFIX ?? "crm").replace(/\/+$/, "");
const LOCAL_IMAGES = path.resolve(process.env.LOCAL_DATA_DIR || "./public", "images");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Missing DATABASE_URL / DATABASE_URL_UNPOOLED.");
  process.exit(1);
}

const storage = new StorageClient(`${SUPABASE_URL}/storage/v1`, {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
});

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

function publicUrl(objectPath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

async function uploadOne(ref) {
  const name = ref.replace(/^\/images\//, "");
  const localFile = path.join(LOCAL_IMAGES, name);
  if (!fs.existsSync(localFile) || !fs.statSync(localFile).isFile()) return null;

  const objectPath = `${PREFIX}/${name}`;
  try {
    const { data, error } = await storage.from(BUCKET).info(objectPath);
    if (!error && data) return publicUrl(objectPath);
  } catch {
    /* chưa có → upload */
  }
  const buf = fs.readFileSync(localFile);
  const ext = path.extname(name).toLowerCase();
  const { error } = await storage.from(BUCKET).upload(objectPath, buf, {
    contentType: { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" }[ext] ?? "application/octet-stream",
    upsert: true,
  });
  if (error) throw new Error(`Upload ${objectPath} failed: ${error.message}`);
  return publicUrl(objectPath);
}

async function updateRefs(map) {
  const entries = [...map].filter(([, newUrl]) => newUrl);
  if (!entries.length) return;
  for (const [table, col] of REF_FIELDS) {
    const oldRefs = [];
    const newUrls = [];
    for (const [oldRef, newUrl] of entries) {
      oldRefs.push(oldRef);
      newUrls.push(newUrl);
    }
    const q = `
      UPDATE "${table}" AS t
      SET "${col}" = m.new_url
      FROM (SELECT unnest($1::text[]) AS old_ref, unnest($2::text[]) AS new_url) AS m
      WHERE t."${col}" = m.old_ref`;
    const { rowCount } = await client.query(q, [oldRefs, newUrls]);
    if (rowCount > 0) console.log(`  ${table}.${col}: cập nhật ${rowCount} rows`);
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
        const url = DRY_RUN ? publicUrl(`${PREFIX}/${ref.replace(/^\/images\//, "")}`) : await uploadOne(ref);
        return [ref, url];
      }),
    );
    for (const [ref, url] of results) {
      map.set(ref, url);
      if (url) done++;
      else skipped++;
    }
    if (i % 400 === 0 || i + LIMIT >= refs.length) {
      console.log(`  progress ${Math.min(i + LIMIT, refs.length)}/${refs.length} (done=${done} skip=${skipped})`);
    }
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] sẽ upload ${done} ảnh, bỏ ${skipped} (không có file local hoặc không phải /images/).`);
    await client.end();
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
