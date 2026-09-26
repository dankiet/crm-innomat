/**
 * Media Asset Verify — đối chiếu LEGACY (product_images / products / mapping /
 * lp_settings) với NEW (media_assets + usage tables). READ-ONLY.
 *
 * Run: npm run db:media-verify   (đọc DATABASE_URL_UNPOOLED || DATABASE_URL)
 * Chỉ đọc — không ghi. Exit 0 = toàn bộ PASS; exit 1 = có lệch (JSON chi tiết).
 *
 * Các hạng mục DoD §4 (đo ngày 2026-09-24): distinct keys, tổng ref,
 * product usages, MAP, Concept, Lookbook-public, Featured, Hero, Mapping,
 * Custom Mapping, shared keys (1 key nhiều product), duplicate rows
 * (cùng path trong cùng product), 66 mapping-only assets.
 */
import pg from "pg";

import { loadEnv } from "./lib/env.mjs";

loadEnv();

const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Missing DATABASE_URL (hoặc DATABASE_URL_UNPOOLED).");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

const fail = (label, old, fresh) => {
  console.error(`  ✗ ${label}: legacy=${old} new=${fresh}`);
  return false;
};
const pass = (label, old, fresh) => {
  console.log(`  ✓ ${label}: legacy=${old} new=${fresh}`);
  return true;
};
const cmp = (label, old, fresh) => (Number(old) === Number(fresh) ? pass(label, old, fresh) : fail(label, old, fresh));

async function scalar(sql, params) {
  const { rows } = await client.query(sql, params);
  const row = rows[0];
  if (!row) return 0;
  const v = row.n ?? row.c ?? row.v;
  return Number(v) || 0;
}

try {
  await client.connect();
  console.log("[media-verify] Bắt đầu đối chiếu legacy ⇄ media_assets …");

  let ok = true;
  const [oldKeys, newAssets] = [
    await scalar(`SELECT COUNT(*) n FROM (
      SELECT substring(i.path from '([^/]+)$') key FROM product_images i WHERE i.path IS NOT NULL AND i.path <> ''
      UNION SELECT substring(p.image_path from '([^/]+)$') FROM products p WHERE p.image_path IS NOT NULL AND p.image_path <> ''
      UNION SELECT substring(m.image_path from '([^/]+)$') FROM customer_mapping_items m WHERE m.image_path IS NOT NULL AND m.image_path <> ''
      UNION SELECT substring(m.custom_product_image_path from '([^/]+)$') FROM customer_mapping_items m WHERE m.custom_product_image_path IS NOT NULL AND m.custom_product_image_path <> ''
      UNION SELECT substring(s.value from '([^/]+)$') FROM lp_settings s WHERE s.key = 'hero_image' AND s.value IS NOT NULL AND s.value <> ''
    ) t WHERE key IS NOT NULL AND key <> ''`),
    await scalar(`SELECT COUNT(*) n FROM media_assets`),
  ];
  ok = cmp("#1 distinct keys ↔ media_assets rows", oldKeys, newAssets) && ok;

  const [prodRefsLegacy, prodRefsNew] = [
    await scalar(`SELECT COUNT(*) n FROM product_images WHERE path IS NOT NULL AND path <> ''`),
    await scalar(`SELECT COUNT(*) n FROM product_images WHERE media_asset_id IS NOT NULL`),
  ];
  ok = cmp("#2 product usages (product_images rows)", prodRefsLegacy, prodRefsNew) && ok;

  const [mapLegacy, mapNew] = [
    await scalar(`SELECT COUNT(*) n FROM product_images WHERE kind = 'map'`),
    await scalar(`SELECT COUNT(*) n FROM product_images pi JOIN media_assets a ON a.id = pi.media_asset_id WHERE pi.kind = 'map'`),
  ];
  ok = cmp("#3 MAP usages", mapLegacy, mapNew) && ok;

  const [conceptLegacy, conceptNew] = [
    await scalar(`SELECT COUNT(*) n FROM product_images WHERE kind = 'concept'`),
    await scalar(`SELECT COUNT(*) n FROM product_images pi JOIN media_assets a ON a.id = pi.media_asset_id WHERE pi.kind = 'concept'`),
  ];
  ok = cmp("#4 Concept usages", conceptLegacy, conceptNew) && ok;

  const [lbPublicLegacy, lbPublicNew] = [
    await scalar(`SELECT COUNT(*) n FROM product_images WHERE kind = 'concept' AND is_public = 1`),
    await scalar(`SELECT COUNT(*) n FROM product_images pi JOIN media_assets a ON a.id = pi.media_asset_id WHERE pi.kind = 'concept' AND pi.is_public = 1`),
  ];
  ok = cmp("#5 Lookbook-public usages", lbPublicLegacy, lbPublicNew) && ok;

  const [featuredLegacy, featuredNew] = [
    await scalar(`SELECT COUNT(DISTINCT featured_rank) n FROM products WHERE featured_rank BETWEEN 1 AND 12`),
    await scalar(`SELECT COUNT(DISTINCT p.featured_rank) n FROM products p JOIN product_images pi ON pi.product_id = p.id JOIN media_assets a ON a.id = pi.media_asset_id WHERE p.featured_rank BETWEEN 1 AND 12`),
  ];
  ok = cmp("#6 Featured slots (1..12)", featuredLegacy, featuredNew) && ok;

  const [heroLegacy, heroNew] = [
    await scalar(`SELECT COUNT(*) n FROM lp_settings WHERE key = 'hero_image' AND value <> ''`),
    await scalar(`SELECT COUNT(*) n FROM landing_page_media_usages WHERE setting_key = 'hero_image'`),
  ];
  ok = cmp("#7 Hero usages", heroLegacy, heroNew) && ok;

  const [mapItemLegacy, mapItemNew] = [
    await scalar(`SELECT COUNT(*) n FROM customer_mapping_items WHERE image_path <> ''`),
    await scalar(`SELECT COUNT(*) n FROM mapping_media_usages WHERE col = 'image_path'`),
  ];
  ok = cmp("#8 Mapping usages (tile)", mapItemLegacy, mapItemNew) && ok;

  const [mapCustomLegacy, mapCustomNew] = [
    await scalar(`SELECT COUNT(*) n FROM customer_mapping_items WHERE custom_product_image_path <> ''`),
    await scalar(`SELECT COUNT(*) n FROM mapping_media_usages WHERE col = 'custom_product_image_path'`),
  ];
  ok = cmp("#9 Custom Mapping usages", mapCustomLegacy, mapCustomNew) && ok;

  const [sharedLegacy] = [
    await scalar(`SELECT COUNT(*) n FROM (
      SELECT substring(path from '([^/]+)$') key
        FROM product_images WHERE path IS NOT NULL AND path <> ''
       GROUP BY 1 HAVING COUNT(DISTINCT product_id) > 1
    ) t`),
  ];
  const sharedNew = await scalar(`SELECT COUNT(*) n FROM (
    SELECT a.storage_key FROM media_assets a JOIN product_images pi ON pi.media_asset_id = a.id GROUP BY a.storage_key HAVING COUNT(DISTINCT pi.product_id) > 1
  ) t`);
  ok = cmp("#10 shared keys (≠ nhiều product)", sharedLegacy, sharedNew) && ok;

  const [dupLegacy, dupNew] = [
    await scalar(`SELECT COUNT(*) n FROM (
      SELECT i.path FROM product_images i GROUP BY i.product_id, i.path HAVING COUNT(*) > 1
    ) t`),
    await scalar(`SELECT COUNT(*) n FROM (
      SELECT pi.path FROM product_images pi GROUP BY pi.product_id, pi.path HAVING COUNT(*) > 1
    ) t`),
  ];
  ok = cmp("#11 duplicate rows (same product+path)", dupLegacy, dupNew) && ok;

  const mappingOnlyNew = await scalar(`SELECT COUNT(*) n FROM media_assets a
    WHERE NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_asset_id = a.id)
      AND (EXISTS (SELECT 1 FROM mapping_media_usages mu WHERE mu.media_asset_id = a.id)
        OR EXISTS (SELECT 1 FROM landing_page_media_usages lu WHERE lu.media_asset_id = a.id))`);
  console.log(`  ℹ mapping-only assets (không có product_images, dùng mapping/hero): ${mappingOnlyNew}`);

  // #12–#14 so SỐ LƯỢNG là chưa đủ: một usage row có thể trỏ nhầm asset (ref đổi từ
  // key A sang B mà row cũ không được cập nhật) — đếm vẫn khớp nhưng ảnh sai chỗ.
  // Mỗi usage phải trỏ đúng asset có storage_key bằng key của ref hiện tại.
  ok =
    cmp(
      "#12 product_images.media_asset_id khớp key của path",
      0,
      await scalar(`SELECT COUNT(*) n FROM product_images i
        JOIN media_assets a ON a.id = i.media_asset_id
        WHERE substring(i.path from '([^/]+)$') IS DISTINCT FROM a.storage_key`),
    ) && ok;

  ok =
    cmp(
      "#13 mapping usage trỏ đúng asset của ref hiện tại",
      0,
      await scalar(`SELECT COUNT(*) n FROM mapping_media_usages u
        JOIN customer_mapping_items m ON m.id = u.mapping_item_id
        JOIN media_assets a ON a.id = u.media_asset_id
        WHERE (u.col = 'image_path'
                 AND substring(m.image_path from '([^/]+)$') IS DISTINCT FROM a.storage_key)
           OR (u.col = 'custom_product_image_path'
                 AND substring(m.custom_product_image_path from '([^/]+)$') IS DISTINCT FROM a.storage_key)`),
    ) && ok;

  ok =
    cmp(
      "#14 hero usage trỏ đúng asset của hero hiện tại",
      0,
      await scalar(`SELECT COUNT(*) n FROM landing_page_media_usages u
        JOIN media_assets a ON a.id = u.media_asset_id
        WHERE u.setting_key = 'hero_image'
          AND (SELECT substring(s.value from '([^/]+)$') FROM lp_settings s WHERE s.key = 'hero_image')
              IS DISTINCT FROM a.storage_key`),
    ) && ok;

  // Lệch số lượng không tự chỉ ra chỗ sai. In rõ từng row để biết ngay phải sửa
  // gì: `products.image_path` là snapshot dẫn xuất, có thể trỏ tới ảnh không còn
  // row product_images nào (nền tảng của lỗi "ảnh vô hình" trên /luu-tru).
  if (!ok) {
    const offenders = (
      await client.query(`
        SELECT 'product_images #' || i.id AS what, i.path AS ref
          FROM product_images i
          LEFT JOIN media_assets a ON a.storage_key = substring(i.path from '([^/]+)$')
         WHERE i.path <> '' AND a.id IS NULL
        UNION ALL
        SELECT 'products #' || p.id || ' (' || p.code || ')', p.image_path
          FROM products p
          LEFT JOIN media_assets a ON a.storage_key = substring(p.image_path from '([^/]+)$')
         WHERE p.image_path <> '' AND a.id IS NULL
        UNION ALL
        SELECT 'mapping_item #' || m.id, m.image_path
          FROM customer_mapping_items m
          LEFT JOIN media_assets a ON a.storage_key = substring(m.image_path from '([^/]+)$')
         WHERE m.image_path <> '' AND a.id IS NULL
        UNION ALL
        SELECT 'mapping_item.custom #' || m.id, m.custom_product_image_path
          FROM customer_mapping_items m
          LEFT JOIN media_assets a ON a.storage_key = substring(m.custom_product_image_path from '([^/]+)$')
         WHERE m.custom_product_image_path <> '' AND a.id IS NULL
        UNION ALL
        SELECT 'hero', s.value
          FROM lp_settings s
          LEFT JOIN media_assets a ON a.storage_key = substring(s.value from '([^/]+)$')
         WHERE s.key = 'hero_image' AND s.value <> '' AND a.id IS NULL
      `)
    ).rows;
    console.log(`\n  → ref KHÔNG có row media_assets (${offenders.length}):`);
    for (const o of offenders.slice(0, 20)) console.log(`     · ${o.what} → ${o.ref}`);
    if (offenders.length > 20) console.log(`     … và ${offenders.length - 20} dòng nữa`);
    console.log("     Sửa: `npm run media:sync -- --apply` (reconcile), rồi chạy lại verify.");
  }

  console.log(ok ? "[media-verify] PASS — legacy ⇄ new khớp nhau." : "[media-verify] FAIL — có chênh lệch.");
  process.exitCode = ok ? 0 : 1;
} catch (err) {
  console.error("[media-verify] FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}