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

import { loadEnv } from "./lib/env.mjs";
import { readMediaRefs, reconcileMediaKeys } from "./lib/media-reconcile.mjs";

loadEnv();

const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Missing DATABASE_URL (hoặc DATABASE_URL_UNPOOLED).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();

  // ── 1. Distinct storage-key + một path đại diện từ 5 nguồn reference ──────
  // Mỗi key lấy MIN(path) làm path hiển thị (path thật để card render <img src>).
  const keyRows = await readMediaRefs(client);
  console.log(`[media-backfill] distinct storage keys từ 5 nguồn: ${keyRows.length}`);

  // ── 2-5. Tạo asset + gắn usage (lõi dùng chung với media-sync) ────────────
  const keyToPath = new Map(keyRows.map((r) => [r.key, r.path]));
  const stats = await reconcileMediaKeys(client, keyToPath);
  console.log(`[media-backfill] media_assets rows ensured: ${stats.assetKeys}/${keyRows.length}`);
  console.log(`[media-backfill] product_images gắn media_asset_id: ${stats.productUsages}`);
  console.log(
    `[media-backfill] mapping usages (image_path/custom): ${stats.mappingUsages}/${stats.customMappingUsages}`,
  );
  console.log(`[media-backfill] hero usages: ${stats.heroUsages}`);

  console.log("[media-backfill] DONE — idempotent, chạy lại an toàn.");
} catch (err) {
  console.error("[media-backfill] FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}