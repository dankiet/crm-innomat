/**
 * Lõi reconcile MediaAsset — dùng chung cho `media-backfill.mjs` (nguồn key =
 * ref trong DB) và `media-sync.mjs` (nguồn key = ref trong DB ∪ file Storage).
 *
 * Mọi hàm ở đây IDEMPOTENT: chạy lại cho ra cùng trạng thái.
 */

/**
 * 5 nguồn ref ảnh của hệ thống — khớp `src/db/image-references.server.ts` và
 * `SOURCES` của media-verify. Mỗi dòng trả `key` (basename = storage_key) và
 * `path` (ref đầy đủ để hiển thị/lưu).
 */
const MEDIA_REF_SQL = `
  SELECT key, MIN(path) AS path FROM (
      SELECT substring(i.path from '([^/]+)$') AS key, i.path AS path
        FROM product_images i WHERE i.path IS NOT NULL AND i.path <> ''
    UNION ALL
      SELECT substring(p.image_path from '([^/]+)$'), p.image_path
        FROM products p WHERE p.image_path IS NOT NULL AND p.image_path <> ''
    UNION ALL
      SELECT substring(m.image_path from '([^/]+)$'), m.image_path
        FROM customer_mapping_items m WHERE m.image_path IS NOT NULL AND m.image_path <> ''
    UNION ALL
      SELECT substring(m.custom_product_image_path from '([^/]+)$'), m.custom_product_image_path
        FROM customer_mapping_items m
       WHERE m.custom_product_image_path IS NOT NULL AND m.custom_product_image_path <> ''
    UNION ALL
      SELECT substring(s.value from '([^/]+)$'), s.value
        FROM lp_settings s
       WHERE s.key = 'hero_image' AND s.value IS NOT NULL AND s.value <> ''
  ) t WHERE key IS NOT NULL AND key <> ''
  GROUP BY key
`;

/** storage_key = tên file content-addressed `<sha256>[.<ext>]`. */
export const STORAGE_KEY_RE = /^[0-9a-f]{64}(\.[a-z0-9]+)?$/i;

/** Đọc 5 nguồn ref → `[{ key, path }]` (đã GROUP BY key, path = MIN). */
export async function readMediaRefs(client) {
  const { rows } = await client.query(MEDIA_REF_SQL);
  return rows;
}

/**
 * Sửa `products.image_path` — cột này là SNAPSHOT DẪN XUẤT từ `product_images`
 * (nguồn: `syncPrimaryImagePath` trong `src/db/crm.server.ts`, và cùng biểu thức
 * ở `deleteMediaAsset`). UI không có input cho nó.
 *
 * Khi mọi ảnh của một sản phẩm bị gỡ mà không chạy lại sync, cột này giữ lại ref
 * cũ → trỏ tới ảnh không còn gắn với gì. Nếu reconcile tạo asset cho ref đó thì
 * sinh card "ma"; đúng phải là suy lại về ảnh primary hiện có, hoặc rỗng.
 *
 * @returns {Promise<number>} số sản phẩm đã sửa
 */
export async function repairDerivedProductImagePaths(client) {
  const { rowCount } = await client.query(`
    UPDATE products p
       SET image_path = COALESCE((
             SELECT i.path FROM product_images i
              WHERE i.product_id = p.id
              ORDER BY i.is_primary DESC, i.sort_order ASC, i.id ASC
              LIMIT 1
           ), '')
     WHERE p.image_path IS DISTINCT FROM COALESCE((
             SELECT i.path FROM product_images i
              WHERE i.product_id = p.id
              ORDER BY i.is_primary DESC, i.sort_order ASC, i.id ASC
              LIMIT 1
           ), '')
  `);
  return rowCount ?? 0;
}

/** Danh sách sản phẩm có `image_path` lệch với ảnh primary thật (chỉ đọc). */
export async function findDerivedDrift(client) {
  const { rows } = await client.query(`
    SELECT p.id, p.code, p.is_public, p.image_path,
           COALESCE((
             SELECT i.path FROM product_images i
              WHERE i.product_id = p.id
              ORDER BY i.is_primary DESC, i.sort_order ASC, i.id ASC
              LIMIT 1
           ), '') AS derived
      FROM products p
     WHERE p.image_path IS DISTINCT FROM COALESCE((
             SELECT i.path FROM product_images i
              WHERE i.product_id = p.id
              ORDER BY i.is_primary DESC, i.sort_order ASC, i.id ASC
              LIMIT 1
           ), '')
  `);
  return rows;
}

/**
 * Áp reconcile: tạo `media_assets` còn thiếu + gắn mọi usage row theo key.
 *
 * Tất cả là thao tác theo TẬP (một câu lệnh cho mỗi bảng), không lặp từng key —
 * 3.557 key × 5 query sẽ mất hàng chục giây, còn cách này là 6 query.
 *
 * KHÔNG tự mở transaction: ranh giới giao dịch thuộc về caller (script gom cả
 * sửa snapshot + reconcile vào một transaction, và test có thể ROLLBACK).
 *
 * @param {import("pg").Client} client
 * @param {Map<string, string>} keyToPath key → một ref đại diện (để card render)
 * @returns {Promise<{assetKeys:number, productUsages:number, mappingUsages:number, customMappingUsages:number, heroUsages:number}>}
 */
export async function reconcileMediaKeys(client, keyToPath) {
  const keys = [...keyToPath.keys()];
  const paths = keys.map((k) => keyToPath.get(k) ?? "");
  const stats = {
    assetKeys: 0,
    productUsages: 0,
    mappingUsages: 0,
    customMappingUsages: 0,
    heroUsages: 0,
  };
  if (!keys.length) return stats;

  // 1. media_assets: tạo nếu thiếu; đã có mà path rỗng (backfill đời đầu) → điền.
  //    `xmax = 0` phân biệt INSERT thật với nhánh UPDATE (ON CONFLICT rowCount luôn 1).
  const ins = await client.query(
    `INSERT INTO media_assets (storage_key, path, created_at, updated_at)
     SELECT k, p, now(), now()
       FROM unnest($1::text[], $2::text[]) AS t(k, p)
     ON CONFLICT (storage_key) DO UPDATE
       SET path = CASE WHEN media_assets.path = '' THEN EXCLUDED.path ELSE media_assets.path END
     RETURNING (xmax = 0) AS inserted`,
    [keys, paths],
  );
  stats.assetKeys = ins.rows.filter((r) => r.inserted).length;

  // 2. product_images.media_asset_id — chỉ khi NULL (idempotent).
  const pi = await client.query(
    `UPDATE product_images i
        SET media_asset_id = a.id
       FROM media_assets a
      WHERE i.media_asset_id IS NULL
        AND i.path IS NOT NULL AND i.path <> ''
        AND substring(i.path from '([^/]+)$') = a.storage_key`,
  );
  stats.productUsages = pi.rowCount ?? 0;

  // 3. mapping usages — 2 cột, mỗi cặp (item, col) tối đa 1 row. Cũng phải REPLACE:
  //    ref đổi từ key A sang B thì row cũ conflict nên DO NOTHING sẽ để asset B
  //    thiếu usage và asset A giữ usage ma. App đã delete+re-insert vì lý do này
  //    (`syncMappingItemUsage`).
  const map = await client.query(
    `INSERT INTO mapping_media_usages (media_asset_id, mapping_item_id, col, created_at)
     SELECT a.id, m.id, 'image_path', now()
       FROM customer_mapping_items m
       JOIN media_assets a ON substring(m.image_path from '([^/]+)$') = a.storage_key
      WHERE m.image_path IS NOT NULL AND m.image_path <> ''
     ON CONFLICT (mapping_item_id, col) DO UPDATE
       SET media_asset_id = EXCLUDED.media_asset_id
     WHERE mapping_media_usages.media_asset_id IS DISTINCT FROM EXCLUDED.media_asset_id`,
  );
  stats.mappingUsages = map.rowCount ?? 0;

  const custom = await client.query(
    `INSERT INTO mapping_media_usages (media_asset_id, mapping_item_id, col, created_at)
     SELECT a.id, m.id, 'custom_product_image_path', now()
       FROM customer_mapping_items m
       JOIN media_assets a ON substring(m.custom_product_image_path from '([^/]+)$') = a.storage_key
      WHERE m.custom_product_image_path IS NOT NULL AND m.custom_product_image_path <> ''
     ON CONFLICT (mapping_item_id, col) DO UPDATE
       SET media_asset_id = EXCLUDED.media_asset_id
     WHERE mapping_media_usages.media_asset_id IS DISTINCT FROM EXCLUDED.media_asset_id`,
  );
  stats.customMappingUsages = custom.rowCount ?? 0;

  // 4. hero — `setting_key` là UNIQUE nên phải REPLACE chứ không DO NOTHING:
  //    hero đổi sang ảnh khác thì row cũ phải trỏ lại asset mới, nếu không
  //    asset mới thiếu usage còn asset cũ giữ usage ma.
  const hero = await client.query(
    `INSERT INTO landing_page_media_usages (media_asset_id, setting_key, created_at, updated_at)
     SELECT a.id, 'hero_image', now(), now()
       FROM lp_settings s
       JOIN media_assets a ON substring(s.value from '([^/]+)$') = a.storage_key
      WHERE s.key = 'hero_image' AND s.value IS NOT NULL AND s.value <> ''
     ON CONFLICT (setting_key) DO UPDATE
       SET media_asset_id = EXCLUDED.media_asset_id, updated_at = EXCLUDED.updated_at
     WHERE landing_page_media_usages.media_asset_id IS DISTINCT FROM EXCLUDED.media_asset_id`,
  );
  stats.heroUsages = hero.rowCount ?? 0;

  return stats;
}
