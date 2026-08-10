/**
 * Convert toàn bộ ảnh tham chiếu .jpg/.jpeg thành .webp trên Supabase Storage
 * và cập nhật các cột ref trong PostgreSQL sang URL webp mới.
 *
 * Mô phỏng pipeline runtime (src/db/crm.server.ts): re-encode quality 85,
 * resize max 1600px, tên content-addressed theo SHA-256 của buffer webp.
 *
 * Mặc định là DRY RUN (không upload, không ghi DB). Thêm --apply để thực thi,
 * --delete-old để xoá object .jpg cũ sau khi đã hết refs tham chiếu.
 *
 * Yêu cầu env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   DATABASE_URL (hoặc DATABASE_URL_UNPOOLED)
 *   SUPABASE_STORAGE_BUCKET (mặc định crm-images), SUPABASE_STORAGE_PREFIX (mặc định crm)
 *   LOCAL_DATA_DIR (mặc định ./public) — đọc ảnh khi ref là /images/...
 *
 * Run:
 *   node scripts/convert-webp.mjs                 # dry run
 *   node scripts/convert-webp.mjs --apply         # upload + update DB
 *   node scripts/convert-webp.mjs --apply --delete-old
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { StorageClient } from "@supabase/storage-js";

const APPLY = process.argv.includes("--apply");
const DELETE_OLD = process.argv.includes("--delete-old");

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const BUCKET = (process.env.SUPABASE_STORAGE_BUCKET ?? "crm-images").replace(/^\//, "").replace(/\/+$/, "");
const PREFIX = (process.env.SUPABASE_STORAGE_PREFIX ?? "crm").replace(/\/+$/, "");
const LOCAL_IMAGES = path.resolve(process.env.LOCAL_DATA_DIR || "./public", "images");

const DB_URL = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();

const MAX_SIDE = 1600;
const WEBP_QUALITY = 85;
const CONCURRENCY = 8;

/** Các cột ref ảnh cần chuyển đổi. */
const REF_FIELDS = [
  ["products", "image_path"],
  ["product_images", "path"],
  ["customer_mapping_items", "image_path"],
  ["customer_mapping_items", "custom_product_image_path"],
];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  fail("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
}
if (!DB_URL) {
  fail("Missing DATABASE_URL (hoặc DATABASE_URL_UNPOOLED).");
}
if (!fs.existsSync(LOCAL_IMAGES)) {
  fail(`Không thấy thư mục ảnh local: ${LOCAL_IMAGES}`);
}

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
const storage = new StorageClient(`${SUPABASE_URL}/storage/v1`, {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
});

function publicUrl(objectPath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

function filenameFor(buffer, ext) {
  const hash = createHash("sha256").update(buffer).digest("hex");
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
  return `${hash}${safeExt.toLowerCase()}`;
}

/** Lấy bytes ảnh từ ref (URL http hoặc đường dẫn /images/...). */
async function readRefBytes(ref) {
  if (/^https?:\/\//.test(ref)) {
    try {
      const res = await fetch(ref, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  if (ref.startsWith("/images/")) {
    const file = path.join(LOCAL_IMAGES, ref.replace(/^\/images\//, ""));
    try {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return fs.readFileSync(file);
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Re-encode bytes sang webp (resize max 1600px, quality 85) — khớp pipeline runtime. */
async function encodeWebp(buffer) {
  let pipeline = sharp(buffer, { failOn: "none" });
  const meta = await pipeline.metadata();
  if ((meta.width ?? 0) > MAX_SIDE || (meta.height ?? 0) > MAX_SIDE) {
    pipeline = pipeline.resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  return pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
}

/** Đảm bảo object webp tồn tại trên Storage (idempotent theo content-addressed). */
async function ensureUploaded(objectPath, buffer, mime) {
  try {
    const { data, error } = await storage.from(BUCKET).info(objectPath);
    if (!error && data) return publicUrl(objectPath);
  } catch {
    /* chưa tồn tại → upload */
  }
  const { error } = await storage.from(BUCKET).upload(objectPath, buffer, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  return publicUrl(objectPath);
}

/** Distinct ref .jpg/.jpeg hiện đang được DB tham chiếu. */
async function distinctJpegRefs() {
  const set = new Map(); // ref → count (số bản ghi)
  for (const [table, col] of REF_FIELDS) {
    const { rows } = await client.query(
      `SELECT "${col}" AS ref, COUNT(*)::int AS n FROM "${table}"
       WHERE "${col}" IS NOT NULL AND "${col}" != ''
         AND (LOWER("${col}") LIKE '%.jpg' OR LOWER("${col}") LIKE '%.jpeg')
       GROUP BY "${col}"`,
    );
    for (const r of rows) {
      set.set(r.ref, (set.get(r.ref) ?? 0) + r.n);
    }
  }
  return [...set.entries()].map(([ref, n]) => ({ ref, rows: n }));
}

/** Cập nhật ref trong DB theo map cũ → mới. */
async function updateRefs(map) {
  const entries = [...map].filter(([, newUrl]) => newUrl);
  if (!entries.length) return 0;
  let updated = 0;
  for (const [table, col] of REF_FIELDS) {
    for (const [oldRef, newUrl] of entries) {
      const { rowCount } = await client.query(
        `UPDATE "${table}" SET "${col}" = $1 WHERE "${col}" = $2`,
        [newUrl, oldRef],
      );
      if (rowCount) {
        updated += rowCount;
        console.log(`  ${table}.${col}: ${oldRef} → ${newUrl} (${rowCount})`);
      }
    }
  }
  return updated;
}

/** Số bản ghi còn lại trỏ vào từng oldRef (sau khi update). */
async function remainingRefs(oldRefs) {
  const remaining = new Map(oldRefs.map((r) => [r, 0]));
  for (const [table, col] of REF_FIELDS) {
    const { rows } = await client.query(
      `SELECT "${col}" AS ref, COUNT(*)::int AS n FROM "${table}"
       WHERE "${col}" = ANY($1::text[]) GROUP BY "${col}"`,
      [oldRefs],
    );
    for (const r of rows) remaining.set(r.ref, (remaining.get(r.ref) ?? 0) + r.n);
  }
  return remaining;
}

/** Xoá object .jpg khỏi Storage cho các ref đã hết tham chiếu. */
async function deleteOldJpegs(groups, remaining) {
  let deleted = 0;
  for (const { jpgObjectPath, refs } of groups) {
    const stillReferenced = refs.some((r) => (remaining.get(r) ?? 0) > 0);
    if (stillReferenced) continue;
    const { error } = await storage.from(BUCKET).remove([jpgObjectPath]);
    if (error) {
      console.warn(`  [skip] xoá ${jpgObjectPath}: ${error.message}`);
    } else {
      deleted += 1;
      console.log(`  Đã xoá ${jpgObjectPath}`);
    }
  }
  return deleted;
}

async function main() {
  await client.connect();
  const refs = await distinctJpegRefs();
  console.log(`Tìm thấy ${refs.length} ref .jpg/.jpeg duy nhất (${refs.reduce((s, r) => s + r.rows, 0)} bản ghi).`);
  console.log(APPLY ? "Bắt đầu chuyển đổi…" : "[DRY RUN] không upload / không ghi DB. Thêm --apply để thực thi.");

  const map = new Map(); // oldRef → webpUrl
  const groups = new Map(); // jpgObjectPath → { jpgObjectPath, refs, bytes }
  let failed = 0;

  for (let i = 0; i < refs.length; i += CONCURRENCY) {
    const slice = refs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map(async ({ ref }) => {
        try {
          const buf = await readRefBytes(ref);
          if (!buf) return { ref, error: "không đọc được bytes (ref lỗi?)" };
          const jpgName = filenameFor(buf, ".jpg");
          const jpgObjectPath = `${PREFIX}/${jpgName}`;
          const webp = await encodeWebp(buf);
          const webpName = filenameFor(webp, ".webp");
          const webpObjectPath = `${PREFIX}/${webpName}`;
          const url = APPLY
            ? await ensureUploaded(webpObjectPath, webp, "image/webp")
            : publicUrl(webpObjectPath);
          if (!groups.has(jpgObjectPath)) groups.set(jpgObjectPath, { jpgObjectPath, refs: [] });
          groups.get(jpgObjectPath).refs.push(ref);
          return { ref, url };
        } catch (err) {
          return { ref, error: err.message };
        }
      }),
    );

    for (const r of results) {
      if (r.error || !r.url) {
        failed += 1;
        console.warn(`  [lỗi] ${r.ref}: ${r.error ?? "không có URL"}`);
        continue;
      }
      map.set(r.ref, r.url);
    }

    if ((i + CONCURRENCY) % 200 === 0 || i + CONCURRENCY >= refs.length) {
      console.log(`  progress ${Math.min(i + CONCURRENCY, refs.length)}/${refs.length} (lỗi=${failed})`);
    }
  }

  console.log(`\nChuyển đổi: ${map.size}/${refs.length} ref OK (lỗi=${failed}).`);
  if (APPLY) {
    console.log("Cập nhật refs trong DB…");
    const updated = await updateRefs(map);
    console.log(`Đã cập nhật ${updated} bản ghi.`);
    if (DELETE_OLD) {
      console.log("Kiểm tra refs còn lại và xoá object .jpg…");
      const oldRefs = [...map.keys()];
      const remaining = await remainingRefs(oldRefs);
      const deleted = await deleteOldJpegs([...groups.values()], remaining);
      console.log(`Đã xoá ${deleted}/${groups.size} object .jpg.`);
    }
  } else {
    console.log(`[DRY RUN] sẽ upload ${map.size} ảnh webp mới và cập nhật ${map.size} ref.`);
    const samples = [...map.entries()].slice(0, 3);
    for (const [oldRef, url] of samples) console.log(`  mẫu: ${oldRef}\n       → ${url}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("CONVERT WEBP FAILED:", err.message);
  process.exitCode = 1;
});
