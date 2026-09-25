/**
 * Media Asset Backfill — Option 2 (1 file = 1 MediaAsset).
 *
 * Run: npm run db:media-backfill   (đọc DATABASE_URL_UNPOOLED || DATABASE_URL)
 *
 * IDEMPOTENT: chạy lại an toàn nhiều lần (ON CONFLICT DO NOTHING / chỉ set khi NULL).
 * Giai đoạn 1: tạo `media_assets` từ 5-nguồn key (same set "keys referenced elsewhere").
 * Giai đoạn 2: gắn `product_images.media_asset_id` theo path-tail.
 * Giai đoạn 3: điền `mapping_media_usages` + `landing_page_media_usages`.
 *
 * ⚠️ CHỈ PHÉP CHẠY KHI ĐÃ ĐƯỢC DUYỆT — script ghi vào DB (prod Vercel).
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
}
loadDotEnvFile(path.join(root, ".env"));
loadDotEnvFile(path.join(root, ".env.local"));

const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Missing DATABASE_URL (hoặc DATABASE_URL_UNPOOLED).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();

  // ── 1. Distinct các storage-key từ 5 nguồn reference ──────────────
  const keysSql = `
    SELECT key FROM (
        SELECT substring(i.path from '([^/]+)$') AS key FROM product_images i WHERE i.path IS NOT NULL AND i.path <> ''
      UNION SELECT substring(p.image_path from '([^/]+)$') FROM products p WHERE p.image_path IS NOT NULL AND p.image_path <> ''
      UNION SELECT substring(m.image_path from '([^/]+)$') FROM customer_mapping_items m WHERE m.image_path IS NOT NULL AND m.image_path <> ''
      UNION SELECT substring(m.custom_product_image_path from '([^/]+)$') FROM customer_mapping_items m WHERE m.custom_product_image_path IS NOT NULL AND m.custom_product_image_path <> ''
      UNION SELECT substring(s.value from '([^/]+)$') FROM lp_settings s WHERE s.key = 'hero_image' AND s.value IS NOT NULL AND s.value <> ''
    ) t WHERE key IS NOT NULL AND key <> ''
  `;
  const { rows: keyRows } = await client.query(keysSql);
  const keys = keyRows.map((r) => r.key);
  console.log(`[media-backfill] distinct storage keys từ 5 nguồn: ${keys.length}`);

  // ── 2. media_assets: create-or-ignore ─────────────────────────────
  await client.query("BEGIN");
  for (const key of keys) {
    await client.query(
      `INSERT INTO media_assets (storage_key, path, created_at, updated_at)
       VALUES ($1, '', now(), now())
       ON CONFLICT (storage_key) DO NOTHING`,
      [key],
    );
  }
  await client.query("COMMIT");
  console.log(`[media-backfill] media_assets rows ensured: ${keys.length}`);

  // ── 3. product_images.media_asset_id (chỉ khi NULL — idempotent) ──
  await client.query("BEGIN");
  const { rowCount: piRows } = await client.query(`
    UPDATE product_images i
       SET media_asset_id = a.id
      FROM media_assets a
     WHERE i.media_asset_id IS NULL
       AND substring(i.path from '([^/]+)$') = a.storage_key
  `);
  await client.query("COMMIT");
  console.log(`[media-backfill] product_images gắn media_asset_id: ${piRows ?? 0}`);

  // ── 4. mapping_media_usages (tile + custom product image) ──────────
  await client.query("BEGIN");
  const { rowCount: mapRows } = await client.query(`
    INSERT INTO mapping_media_usages (media_asset_id, mapping_item_id, col, created_at)
    SELECT a.id, m.id, 'image_path', now()
      FROM customer_mapping_items m
      JOIN media_assets a ON substring(m.image_path from '([^/]+)$') = a.storage_key
     WHERE m.image_path IS NOT NULL AND m.image_path <> ''
    ON CONFLICT (mapping_item_id, col) DO NOTHING
  `);
  const { rowCount: customRows } = await client.query(`
    INSERT INTO mapping_media_usages (media_asset_id, mapping_item_id, col, created_at)
    SELECT a.id, m.id, 'custom_product_image_path', now()
      FROM customer_mapping_items m
      JOIN media_assets a ON substring(m.custom_product_image_path from '([^/]+)$') = a.storage_key
     WHERE m.custom_product_image_path IS NOT NULL AND m.custom_product_image_path <> ''
    ON CONFLICT (mapping_item_id, col) DO NOTHING
  `);
  await client.query("COMMIT");
  console.log(`[media-backfill] mapping usages (image_path/custom): ${mapRows ?? 0}/${customRows ?? 0}`);

  // ── 5. landing_page_media_usages (hero_image) ──────────────────────
  await client.query("BEGIN");
  const { rowCount: heroRows } = await client.query(`
    INSERT INTO landing_page_media_usages (media_asset_id, setting_key, created_at, updated_at)
    SELECT a.id, 'hero_image', now(), now()
      FROM lp_settings s
      JOIN media_assets a ON substring(s.value from '([^/]+)$') = a.storage_key
     WHERE s.key = 'hero_image' AND s.value IS NOT NULL AND s.value <> ''
    ON CONFLICT (setting_key) DO NOTHING
  `);
  await client.query("COMMIT");
  console.log(`[media-backfill] hero usages: ${heroRows ?? 0}`);

  console.log("[media-backfill] DONE — idempotent, chạy lại an toàn.");
} catch (err) {
  try {
    await client.query("ROLLBACK");
  } catch {
    /* ignore */
  }
  console.error("[media-backfill] FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}