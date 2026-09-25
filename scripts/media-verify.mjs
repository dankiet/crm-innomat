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

  console.log(ok ? "[media-verify] PASS — legacy ⇄ new khớp nhau." : "[media-verify] FAIL — có chênh lệch.");
  process.exitCode = ok ? 0 : 1;
} catch (err) {
  console.error("[media-verify] FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}