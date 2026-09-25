/**
 * Media Asset Registry — Option 2 (asset-centric).
 *
 *  - 1 physical file = 1 `media_assets` row (storage_key content-addressed).
 *  - `product_images` vẫn là bảng product-usage (legacy giữ nguyên, chỉ có cột
 *    `media_asset_id`); write path KHÔNG đổi hành vi cũ.
 *  - Chỉ thêm 2 bảng consumer mới: `mapping_media_usages`, `landing_page_media_usages`.
 *  - Đọc asset-centric: dedupe theo file, usage groups, 3 trạng thái.
 *
 * Quy ước query: placeholder `?`, không ILIKE / substring-from / DISTINCT ON /
 * JSON (chạy được trên cả PG lẫn SQLite — test dùng fake AsyncDb node:sqlite).
 * Storage-key luôn tính bằng JS (`storageKeyOf`).
 */
import { type AsyncDb, type SqlValue } from "./driver.ts";
import {
  classifyAssetStatus,
  planBackfill,
  storageKeyOf,
  summarizeUsages,
  usageGroups,
  type BackfillSource,
  type MediaAssetStatus,
  type MediaUsageGroupKey,
} from "../lib/media-assets.ts";
import { type ImageRoomTagSlug, type ProductImageKind, type ProductImageRoomTag } from "../lib/types.ts";

export interface MediaAssetRow {
  id: number;
  storage_key: string;
  path: string;
  width: number | null;
  height: number | null;
  mime_type: string;
  file_size: number | null;
  created_at: string;
  updated_at: string;
}

export interface MediaUsageGroupCounts {
  product: number;
  lookbook: number;
  featured: number;
  hero: number;
  mapping: number;
}

export interface AssetUsageSummary {
  asset_id: number;
  storage_key: string;
  groups: MediaUsageGroupCounts;
  status: MediaAssetStatus;
}

export type FlatMediaTab = "all" | "map" | "concept" | "featured" | "unassigned";
export type FlatMediaSort =
  | "newest"
  | "oldest"
  | "code_asc"
  | "code_desc"
  | "name_asc"
  | "name_desc"
  | "priority";
export type FlatMediaUsage = "all" | "used" | "unused";

export type FlatMediaItem = {
  /** asset id (media_assets.id) — key card + delete asset */
  asset_id: number;
  storage_key: string;
  path: string;
  created_at: string;
  /** metadata file vật lý (NULL nếu chưa đo — vd asset backfill từ legacy) */
  width: number | null;
  height: number | null;
  mime_type: string;
  file_size: number | null;
  /** representative product usage id (product_images.id) — cho action cũ; 0 nếu không có */
  id: number;
  /** representative product usage — 0 khi asset không có product usage */
  product_id: number;
  product_code: string;
  product_name: string;
  product_category: string;
  product_is_public: number;
  featured_rank: number | null;
  caption: string;
  is_primary: number;
  kind: ProductImageKind;
  image_is_public: number;
  ai_description: string;
  room_tags: ProductImageRoomTag[];
  usage_count: number;
  usage_groups: Record<MediaUsageGroupKey, number>;
  status: MediaAssetStatus;
};

const nowUtc = () =>
  new Date().toISOString().replace("T", " ").slice(0, 19) || new Date().toISOString();

function normalizeKind(v: unknown): ProductImageKind {
  if (v === "map" || v === "concept") return v;
  return "normal";
}

/**
 * Tìm asset theo storage_key; tạo mới nếu chưa có (idempotent). Kernel của
 * "1 file = 1 asset": cùng storage_key luôn trả về CÙNG asset id.
 */
export async function ensureMediaAsset(
  db: AsyncDb,
  path: string,
  meta?: { width?: number | null; height?: number | null; mime_type?: string; file_size?: number | null },
): Promise<MediaAssetRow> {
  const key = storageKeyOf(path);
  if (!key) throw new Error(`Không thể trích storage_key từ đường dẫn ảnh: ${path}`);
  const existing = await db
    .prepare("SELECT * FROM media_assets WHERE storage_key = ?")
    .get<MediaAssetRow>(key);
  if (existing) {
    // Asset đã có: bù meta còn thiếu (backfill đời đầu để NULL) + path hiển thị.
    // Chỉ ghi khi có giá trị mới → idempotent, không ghi đè dữ liệu đã đo.
    const nextPath = existing.path !== path ? path : existing.path;
    const nextWidth = existing.width ?? meta?.width ?? null;
    const nextHeight = existing.height ?? meta?.height ?? null;
    const nextMime = existing.mime_type || meta?.mime_type || "";
    const nextSize = existing.file_size ?? meta?.file_size ?? null;
    const changed =
      nextPath !== existing.path ||
      nextWidth !== existing.width ||
      nextHeight !== existing.height ||
      nextMime !== existing.mime_type ||
      nextSize !== existing.file_size;
    if (changed) {
      await db
        .prepare(
          `UPDATE media_assets SET path = ?, width = ?, height = ?, mime_type = ?, file_size = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(nextPath, nextWidth, nextHeight, nextMime, nextSize, nowUtc(), existing.id);
      return {
        ...existing,
        path: nextPath,
        width: nextWidth,
        height: nextHeight,
        mime_type: nextMime,
        file_size: nextSize,
      };
    }
    return existing;
  }
  const info = await db
    .prepare(
      `INSERT INTO media_assets (storage_key, path, width, height, mime_type, file_size, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      key,
      path,
      meta?.width ?? null,
      meta?.height ?? null,
      meta?.mime_type ?? "image/webp",
      meta?.file_size ?? null,
      nowUtc(),
      nowUtc(),
    );
  const id = Number(info.lastInsertRowid);
  return {
    id,
    storage_key: key,
    path,
    width: meta?.width ?? null,
    height: meta?.height ?? null,
    mime_type: meta?.mime_type ?? "image/webp",
    file_size: meta?.file_size ?? null,
    created_at: "",
    updated_at: "",
  };
}

/** Gắn asset cho 1 product_images row (theo path của nó). */
export async function linkProductImageAsset(db: AsyncDb, productImage: {
  id: number;
  path: string;
  width?: number | null;
  height?: number | null;
  mime_type?: string;
  file_size?: number | null;
}): Promise<void> {
  const key = storageKeyOf(productImage.path);
  if (!key) return;
  const asset = await ensureMediaAsset(db, productImage.path, {
    width: productImage.width,
    height: productImage.height,
    mime_type: productImage.mime_type,
    file_size: productImage.file_size,
  });
  await db
    .prepare("UPDATE product_images SET media_asset_id = ? WHERE id = ? AND media_asset_id IS NULL")
    .run(asset.id, productImage.id);
}

/** Đồng bộ mapping usages cho 1 mapping item (delete + re-insert) — idempotent. */
export async function syncMappingItemUsage(
  db: AsyncDb,
  mappingItem: { id: number; image_path: string; custom_product_image_path: string },
): Promise<void> {
  await db.prepare("DELETE FROM mapping_media_usages WHERE mapping_item_id = ?").run(mappingItem.id);
  const imageKey = storageKeyOf(mappingItem.image_path);
  if (imageKey) {
    const asset = await ensureMediaAsset(db, mappingItem.image_path);
    await db
      .prepare(
        `INSERT OR IGNORE INTO mapping_media_usages (media_asset_id, mapping_item_id, col, created_at)
         VALUES (?, ?, 'image_path', ?)`,
      )
      .run(asset.id, mappingItem.id, nowUtc());
  }
  const customKey = storageKeyOf(mappingItem.custom_product_image_path);
  if (customKey) {
    const asset = await ensureMediaAsset(db, mappingItem.custom_product_image_path);
    await db
      .prepare(
        `INSERT OR IGNORE INTO mapping_media_usages (media_asset_id, mapping_item_id, col, created_at)
         VALUES (?, ?, 'custom_product_image_path', ?)`,
      )
      .run(asset.id, mappingItem.id, nowUtc());
  }
}

/** Đồng bộ hero usage (lp_settings 'hero_image'). */
export async function syncHeroUsage(db: AsyncDb, path: string): Promise<void> {
  await db.prepare("DELETE FROM landing_page_media_usages WHERE setting_key = 'hero_image'").run();
  const key = storageKeyOf(path);
  if (!key) return;
  const asset = await ensureMediaAsset(db, path);
  await db
    .prepare(
      `INSERT OR IGNORE INTO landing_page_media_usages (media_asset_id, setting_key, created_at, updated_at)
       VALUES (?, 'hero_image', ?, ?)`,
    )
    .run(asset.id, nowUtc(), nowUtc());
}

/**
 * Số usage còn lại của 1 asset trên toàn bộ bảng usage (product_images +
 * mapping_media_usages + landing_page_media_usages).
 */
export async function countAssetUsages(db: AsyncDb, assetId: number): Promise<number> {
  const prod = await db
    .prepare("SELECT COUNT(*) AS n FROM product_images WHERE media_asset_id = ?")
    .get<{ n: number }>(assetId);
  const map = await db
    .prepare("SELECT COUNT(*) AS n FROM mapping_media_usages WHERE media_asset_id = ?")
    .get<{ n: number }>(assetId);
  const hero = await db
    .prepare("SELECT COUNT(*) AS n FROM landing_page_media_usages WHERE media_asset_id = ?")
    .get<{ n: number }>(assetId);
  return (Number(prod?.n) || 0) + (Number(map?.n) || 0) + (Number(hero?.n) || 0);
}

/** Tổng hợp usage summary của 1 asset từ DB (dùng cho classify & usage dialog). */
export async function getAssetUsageSummary(db: AsyncDb, assetId: number): Promise<AssetUsageSummary> {
  const asset = await db
    .prepare("SELECT * FROM media_assets WHERE id = ?")
    .get<MediaAssetRow>(assetId);
  if (!asset) throw new Error(`Không tìm thấy MediaAsset #${assetId}`);
  const productRows = (await db
    .prepare(
      `SELECT pi.kind, pi.is_public AS image_public,
              p.is_public AS product_public, p.featured_rank
         FROM product_images pi
         JOIN products p ON p.id = pi.product_id
        WHERE pi.media_asset_id = ?`,
    )
    .all<{ kind: ProductImageKind; image_public: number; product_public: number; featured_rank: number | null }>(assetId)) ?? [];
  const mapCount = Number(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM mapping_media_usages WHERE media_asset_id = ?")
        .get<{ n: number }>(assetId)
    )?.n || 0,
  );
  const heroCount = Number(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM landing_page_media_usages WHERE media_asset_id = ?")
        .get<{ n: number }>(assetId)
    )?.n || 0,
  );
  const summary = summarizeUsages(
    productRows.map((r) => ({
      product_public: r.product_public,
      featured_rank: r.featured_rank,
      kind: normalizeKind(r.kind),
      image_public: r.image_public,
    })),
    mapCount,
    heroCount,
  );
  return {
    asset_id: asset.id,
    storage_key: asset.storage_key,
    groups: usageGroups(summary),
    status: classifyAssetStatus(summary),
  };
}

/** Số usage theo từng nhóm cho một tập asset (IN — 1 batch, không N+1). */
export async function batchesUsageSummaries(
  db: AsyncDb,
  assetIds: number[],
): Promise<Map<number, AssetUsageSummary>> {
  const result = new Map<number, AssetUsageSummary>();
  const clean = [...new Set(assetIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!clean.length) return result;

  const assetRows = await db
    .prepare(
      `SELECT id, storage_key, path FROM media_assets WHERE id IN (${clean.map(() => "?").join(", ")})`,
    )
    .all<{ id: number; storage_key: string; path: string }>(...clean);

  const productRows = (await db
    .prepare(
      `SELECT pi.media_asset_id,
              pi.kind, pi.is_public AS image_public,
              p.is_public AS product_public, p.featured_rank
         FROM product_images pi
         JOIN products p ON p.id = pi.product_id
        WHERE pi.media_asset_id IN (${clean.map(() => "?").join(", ")})`,
    )
    .all<{ media_asset_id: number; kind: ProductImageKind; image_public: number; product_public: number; featured_rank: number | null }>(...clean)) ?? [];

  const agg = new Map<number, { kind: ProductImageKind; image_public: number; product_public: number; featured_rank: number | null }[]>();
  for (const r of productRows) {
    const list = agg.get(r.media_asset_id) ?? [];
    list.push(r);
    agg.set(r.media_asset_id, list);
  }

  const mapRows = (await db
    .prepare(
      `SELECT media_asset_id, COUNT(*) AS n
         FROM mapping_media_usages
        WHERE media_asset_id IN (${clean.map(() => "?").join(", ")})
        GROUP BY media_asset_id`,
    )
    .all<{ media_asset_id: number; n: number }>(...clean)) ?? [];
  const mapCount = new Map(mapRows.map((r) => [r.media_asset_id, Number(r.n) || 0]));

  const heroRows = (await db
    .prepare(
      `SELECT media_asset_id, COUNT(*) AS n
         FROM landing_page_media_usages
        WHERE media_asset_id IN (${clean.map(() => "?").join(", ")})
        GROUP BY media_asset_id`,
    )
    .all<{ media_asset_id: number; n: number }>(...clean)) ?? [];
  const heroCount = new Map(heroRows.map((r) => [r.media_asset_id, Number(r.n) || 0]));

  for (const asset of assetRows) {
    const products = (agg.get(asset.id) ?? []).map((r) => ({
      product_public: r.product_public,
      featured_rank: r.featured_rank,
      kind: normalizeKind(r.kind),
      image_public: r.image_public,
    }));
    const summary = summarizeUsages(
      products,
      mapCount.get(asset.id) ?? 0,
      heroCount.get(asset.id) ?? 0,
    );
    result.set(asset.id, {
      asset_id: asset.id,
      storage_key: asset.storage_key,
      groups: usageGroups(summary),
      status: classifyAssetStatus(summary),
    });
  }
  return result;
}

/**
 * Backfill idempotent — chạy lại cho ra cùng trạng thái. Trả plan đã áp dụng.
 * Nhận db để test trên fake AsyncDb; production dùng `scripts/media-backfill.mjs`.
 */
export async function applyMediaBackfill(db: AsyncDb, sources: BackfillSource[]): Promise<{
  assetKeys: number;
  productUsages: number;
  mappingUsages: number;
  customMappingUsages: number;
  heroUsages: number;
}> {
  const plan = planBackfill(sources);
  // key → một path đại diện (để card render <img src>; backfill cũ để rỗng → lưới trắng).
  const keyToPath = new Map<string, string>();
  for (const s of sources) {
    const key = storageKeyOf(s.path);
    if (key && !keyToPath.has(key)) keyToPath.set(key, s.path);
  }
  let assetKeys = 0;
  for (const key of plan.assetKeys) {
    const res = await db
      .prepare(
        `INSERT OR IGNORE INTO media_assets (storage_key, path, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(key, keyToPath.get(key) ?? "", nowUtc(), nowUtc());
    if (Number(res.changes) > 0) assetKeys++;
    // Asset đã tồn tại mà path còn rỗng (backfill đời đầu) → điền lại path thật.
    const p = keyToPath.get(key);
    if (p) {
      await db
        .prepare("UPDATE media_assets SET path = ? WHERE storage_key = ? AND path = ''")
        .run(p, key);
    }
  }
  let productUsages = 0;
  for (const key of plan.productUsageKeys) {
    const asset = await db.prepare("SELECT id FROM media_assets WHERE storage_key = ?").get<{ id: number }>(key);
    if (!asset) continue;
    // product_images: set media_asset_id cho row có path tail khớp key.
    const up = await db
      .prepare(
        `UPDATE product_images SET media_asset_id = ?
         WHERE media_asset_id IS NULL AND path LIKE ?`,
      )
      .run(asset.id, `%/${key}`);
    productUsages += Number(up.changes) || 0;
  }
  let mappingUsages = 0;
  let customMappingUsages = 0;
  let heroUsages = 0;
  for (const key of plan.mappingUsageKeys) {
    const asset = await db.prepare("SELECT id FROM media_assets WHERE storage_key = ?").get<{ id: number }>(key);
    if (!asset) continue;
    const rows = (await db
      .prepare("SELECT id FROM customer_mapping_items WHERE image_path LIKE ?")
      .all<{ id: number }>(`%/${key}`)) ?? [];
    for (const row of rows) {
      const res = await db
        .prepare(
          `INSERT OR IGNORE INTO mapping_media_usages (media_asset_id, mapping_item_id, col, created_at)
           VALUES (?, ?, 'image_path', ?)`,
        )
        .run(asset.id, row.id, nowUtc());
      if (res.changes) mappingUsages++;
    }
  }
  for (const key of plan.mappingCustomUsageKeys) {
    const asset = await db.prepare("SELECT id FROM media_assets WHERE storage_key = ?").get<{ id: number }>(key);
    if (!asset) continue;
    const rows = (await db
      .prepare("SELECT id FROM customer_mapping_items WHERE custom_product_image_path LIKE ?")
      .all<{ id: number }>(`%/${key}`)) ?? [];
    for (const row of rows) {
      const res = await db
        .prepare(
          `INSERT OR IGNORE INTO mapping_media_usages (media_asset_id, mapping_item_id, col, created_at)
           VALUES (?, ?, 'custom_product_image_path', ?)`,
        )
        .run(asset.id, row.id, nowUtc());
      if (res.changes) customMappingUsages++;
    }
  }
  for (const key of plan.heroUsageKeys) {
    const asset = await db.prepare("SELECT id FROM media_assets WHERE storage_key = ?").get<{ id: number }>(key);
    if (!asset) continue;
    const res = await db
      .prepare(
        `INSERT OR IGNORE INTO landing_page_media_usages (media_asset_id, setting_key, created_at, updated_at)
         VALUES (?, 'hero_image', ?, ?)`,
      )
      .run(asset.id, nowUtc(), nowUtc());
    if (res.changes) heroUsages++;
  }
  return {
    assetKeys,
    productUsages,
    mappingUsages,
    customMappingUsages,
    heroUsages,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// READ PATH — asset-centric grid cho /luu-tru (thay thế predicate "unused").
// 1 file = 1 card. Usage groups + status tính theo media_assets/usages tables.
// Quy ước SQL portable (PG + SQLite fake): `?`, LOWER() thay ILIKE, không
// substring-from / DISTINCT ON / json_agg.
// ══════════════════════════════════════════════════════════════════════════

export interface ListMediaAssetsOpts {
  tab?: FlatMediaTab;
  category?: string;
  search?: string;
  roomSlug?: string;
  publicFilter?: "all" | "public" | "hidden";
  colors?: string[];
  surfaces?: string[];
  shapes?: string[];
  textures?: string[];
  collections?: string[];
  sort?: FlatMediaSort;
  page?: number;
  pageSize?: number;
  /** all | used | draft | orphan */
  usage?: FlatMediaUsage;
  selected?: "yes" | "no";
}

export interface ListMediaAssetsResult {
  items: FlatMediaItem[];
  total: number;
  counts: { all: number; map: number; concept: number; featured: number; unassigned: number };
  publicCounts: { all: number; public: number; hidden: number };
  roomCounts: Record<string, number>;
}

const LOWER_LIKE = (col: string) => `LOWER(${col}) LIKE LOWER(?)`;

/**
 * Asset-centric list — thay cho listFlatMediaImages cũ. `db` param để test
 * được trên fake SQLite; production gọi với `getDb()`.
 */
export async function listMediaAssets(
  db: AsyncDb,
  opts: ListMediaAssetsOpts = {},
): Promise<ListMediaAssetsResult> {
  const tab = opts.tab ?? "all";
  const sort = opts.sort ?? "newest";
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 48, 12), 120);
  const offset = (page - 1) * pageSize;
  const usage = opts.usage ?? "all";

  // WHERE tổng hợp trên media_assets (asset-level): asset có ≥1 usage thỏa filter.
  const where: string[] = [];
  const params: SqlValue[] = [];

  // ── Tab filter (tồn tại usage product thuộc loại) ──
  const addAssetProductWhere = (cond: string, ps: SqlValue[]) => {
    where.push(`EXISTS (
      SELECT 1 FROM product_images pi JOIN products p ON p.id = pi.product_id
       WHERE pi.media_asset_id = ma.id AND ${cond}
    )`);
    params.push(...ps);
  };

  if (tab === "map") {
    addAssetProductWhere("pi.kind = 'map'", []);
  } else if (tab === "concept") {
    addAssetProductWhere("pi.kind = 'concept'", []);
  } else if (tab === "featured") {
    addAssetProductWhere("p.featured_rank IS NOT NULL AND p.featured_rank BETWEEN 1 AND 12", []);
  } else if (tab === "unassigned") {
    addAssetProductWhere("(pi.kind = 'normal' OR pi.kind IS NULL OR pi.kind = '')", []);
  }

  // ── publicFilter (product-level) ──
  if (opts.publicFilter && opts.publicFilter !== "all") {
    addAssetProductWhere(
      opts.publicFilter === "public" ? "p.is_public = 1" : "(p.is_public = 0 OR p.is_public IS NULL)",
      [],
    );
  }

  // ── Facets (product-level) ──
  if (opts.category && opts.category !== "all") {
    addAssetProductWhere("LOWER(p.category) = LOWER(?)", [opts.category]);
  }
  const facet = (cols: readonly string[], vals?: string[], mapFn: (c: string) => string = (c) => c) => {
    if (vals && vals.length > 0) {
      const ph = vals.map(() => "?").join(", ");
      addAssetProductWhere(`${cols.map(mapFn).join(",")} IN (${ph})`, vals as SqlValue[]);
    }
  };
  facet(["p.color"], opts.colors);
  facet(["p.surface"], opts.surfaces);
  facet(["p.shape"], opts.shapes);
  facet(["p.texture"], opts.textures);
  facet(["p.collections"], opts.collections);

  // ── Search: code/name product hoặc caption ảnh ──
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    where.push(`EXISTS (
      SELECT 1 FROM product_images pi JOIN products p ON p.id = pi.product_id
       WHERE pi.media_asset_id = ma.id
         AND (${LOWER_LIKE("p.code")} OR ${LOWER_LIKE("p.name")} OR ${LOWER_LIKE("pi.caption")})
    )`);
    params.push(q, q, q);
  }

  // ── roomSlug: asset có usage product có room tag ──
  if (opts.roomSlug) {
    where.push(`EXISTS (
      SELECT 1 FROM product_image_room_tags rt
        JOIN product_images pi ON pi.id = rt.product_image_id
       WHERE pi.media_asset_id = ma.id AND rt.room_slug = ?
    )`);
    params.push(opts.roomSlug);
  }

  // ── selected (featured) — secondary, chỉ map tab ──
  const selectionKey = opts.tab === "map" ? opts.selected : undefined;
  if (selectionKey === "yes") {
    addAssetProductWhere("p.featured_rank IS NOT NULL AND p.featured_rank BETWEEN 1 AND 12", []);
  } else if (selectionKey === "no") {
    addAssetProductWhere("p.featured_rank IS NULL", []);
  }

  // ── Status filter (used/unused) — asset-level ──
  // used  = có ≥1 usage ở bất kỳ nguồn nào (product_images / mapping / hero).
  // unused = không nơi nào trỏ tới.
  if (usage !== "all") {
    const hasAnyUsageSql = `(
      EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_asset_id = ma.id)
      OR EXISTS (SELECT 1 FROM mapping_media_usages mu WHERE mu.media_asset_id = ma.id)
      OR EXISTS (SELECT 1 FROM landing_page_media_usages lu WHERE lu.media_asset_id = ma.id)
    )`;
    where.push(usage === "used" ? hasAnyUsageSql : `NOT ${hasAnyUsageSql}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const whereSqlProd = whereSql;

  // ── COUNT (asset-level) ──
  const countSql = `
    SELECT
      COUNT(*) AS all_count,
      COUNT(CASE WHEN EXISTS (
        SELECT 1 FROM product_images pi WHERE pi.media_asset_id = ma.id AND pi.kind = 'map'
      ) THEN 1 END) AS map_count,
      COUNT(CASE WHEN EXISTS (
        SELECT 1 FROM product_images pi WHERE pi.media_asset_id = ma.id AND pi.kind = 'concept'
      ) THEN 1 END) AS concept_count,
      COUNT(CASE WHEN EXISTS (
        SELECT 1 FROM product_images pi JOIN products p ON p.id = pi.product_id
         WHERE pi.media_asset_id = ma.id AND p.featured_rank IS NOT NULL AND p.featured_rank BETWEEN 1 AND 12
      ) THEN 1 END) AS featured_count,
      COUNT(CASE WHEN EXISTS (
        SELECT 1 FROM product_images pi WHERE pi.media_asset_id = ma.id
         AND (pi.kind = 'normal' OR pi.kind IS NULL OR pi.kind = '')
      ) THEN 1 END) AS unassigned_count
    FROM media_assets ma
    ${whereSqlProd}
  `;
  const countRow = (await db.prepare(countSql).get<Record<string, number>>(...params)) ?? {};
  const counts = {
    all: Number(countRow.all_count) || 0,
    map: Number(countRow.map_count) || 0,
    concept: Number(countRow.concept_count) || 0,
    featured: Number(countRow.featured_count) || 0,
    unassigned: Number(countRow.unassigned_count) || 0,
  };

  // ── publicCounts (asset-level: có ≥1 usage public product) ──
  const pubSql = `
    SELECT
      COUNT(*) AS all_count,
      COUNT(CASE WHEN EXISTS (
        SELECT 1 FROM product_images pi JOIN products p ON p.id = pi.product_id
         WHERE pi.media_asset_id = ma.id AND p.is_public = 1
      ) THEN 1 END) AS public_count
    FROM media_assets ma
    ${whereSqlProd}
  `;
  const pubRow = (await db.prepare(pubSql).get<Record<string, number>>(...params)) ?? {};
  const publicCounts = {
    all: Number(pubRow.all_count) || 0,
    public: Number(pubRow.public_count) || 0,
    hidden: (Number(pubRow.all_count) || 0) - (Number(pubRow.public_count) || 0),
  };

  // ── roomCounts (asset-level) ──
  const roomSql = `
    SELECT rt.room_slug, COUNT(DISTINCT ma.id) AS n
      FROM media_assets ma
      JOIN product_images pi ON pi.media_asset_id = ma.id
      JOIN product_image_room_tags rt ON rt.product_image_id = pi.id
      ${whereSql}
    GROUP BY rt.room_slug
  `;
  const roomRows = (await db.prepare(roomSql).all<{ room_slug: string; n: number }>(...params)) ?? [];
  const roomCounts: Record<string, number> = {};
  for (const r of roomRows) roomCounts[r.room_slug] = Number(r.n) || 0;

  // ── Sort + pagination (asset-level) ──
  // Representative code/name/rank qua scalar subquery (LIMIT 1) — portable PG+SQLite.
  const repRankSql = `(SELECT p.featured_rank FROM product_images pi JOIN products p ON p.id = pi.product_id
       WHERE pi.media_asset_id = ma.id ORDER BY (pi.kind = 'map') DESC, pi.is_primary DESC, pi.id ASC LIMIT 1)`;
  const repCodeSql = `(SELECT p.code FROM product_images pi JOIN products p ON p.id = pi.product_id
       WHERE pi.media_asset_id = ma.id ORDER BY (pi.kind = 'map') DESC, pi.is_primary DESC, pi.id ASC LIMIT 1)`;
  const repNameSql = `(SELECT p.name FROM product_images pi JOIN products p ON p.id = pi.product_id
       WHERE pi.media_asset_id = ma.id ORDER BY (pi.kind = 'map') DESC, pi.is_primary DESC, pi.id ASC LIMIT 1)`;
  // Hero usage (LP) — asset đang làm ảnh bìa trang chủ.
  const isHeroSql = `EXISTS (SELECT 1 FROM landing_page_media_usages lu
       WHERE lu.media_asset_id = ma.id AND lu.setting_key = 'hero_image')`;
  // Tuyển chọn #1–#12 — sản phẩm đang giữ vị trí.
  const isFeaturedSql = `EXISTS (SELECT 1 FROM product_images pi JOIN products p ON p.id = pi.product_id
       WHERE pi.media_asset_id = ma.id AND p.featured_rank IS NOT NULL AND p.featured_rank BETWEEN 1 AND 12)`;
  // Asset không có product usage (chỉ mapping/hero) → tên/mã SP rỗng. Xếp CUỐI ở
  // cả hai chiều sort (nếu không, ASC sẽ đẩy chuỗi rỗng lên đầu).
  const emptyLast = (col: string) =>
    `CASE WHEN COALESCE(${col}, '') = '' THEN 1 ELSE 0 END ASC,`;

  // Ưu tiên theo ngữ cảnh tab, RỒI mới tới sort người dùng chọn:
  //  - MAP  : ảnh Tuyển chọn (#1–#12, xếp theo rank) lên đầu.
  //  - Lookbook: ảnh đang làm Hero trang chủ lên đầu.
  //  - Còn lại : theo sort người dùng.
  const sortSql =
    sort === "oldest"
      ? "ma.id ASC"
      : sort === "code_asc"
        ? `${emptyLast(repCodeSql)} LOWER(COALESCE(${repCodeSql}, '')) ASC, ma.id ASC`
        : sort === "code_desc"
          ? `${emptyLast(repCodeSql)} LOWER(COALESCE(${repCodeSql}, '')) DESC, ma.id ASC`
          : sort === "name_asc"
            ? `${emptyLast(repNameSql)} LOWER(COALESCE(${repNameSql}, '')) ASC, ma.id ASC`
            : sort === "name_desc"
              ? `${emptyLast(repNameSql)} LOWER(COALESCE(${repNameSql}, '')) DESC, ma.id ASC`
              : sort === "priority"
                ? `COALESCE(${repRankSql}, 9999) ASC, ma.id ASC`
                : "ma.id DESC";

  let orderBySql: string;
  if (tab === "featured") {
    orderBySql = `COALESCE(${repRankSql}, 9999) ASC, ma.id ASC`;
  } else if (tab === "map") {
    // Ưu tiên ảnh Tuyển chọn lên đầu, rồi tới sort người dùng chọn.
    orderBySql = `CASE WHEN ${isFeaturedSql} THEN 0 ELSE 1 END ASC, COALESCE(${repRankSql}, 9999) ASC, ${sortSql}`;
  } else if (tab === "concept") {
    // Ưu tiên ảnh đang làm Hero trang chủ lên đầu.
    orderBySql = `CASE WHEN ${isHeroSql} THEN 0 ELSE 1 END ASC, ${sortSql}`;
  } else {
    orderBySql = sortSql;
  }

  const total = counts.all;

  const listSql = `
    SELECT ma.id, ma.storage_key, ma.path, ma.created_at,
           ma.width, ma.height, ma.mime_type, ma.file_size
      FROM media_assets ma
      ${whereSql}
      ORDER BY ${orderBySql}
      LIMIT ? OFFSET ?
  `;
  const rows = (await db.prepare(listSql).all<{
    id: number;
    storage_key: string;
    path: string;
    created_at: string;
    width: number | null;
    height: number | null;
    mime_type: string;
    file_size: number | null;
  }>(...params, pageSize, offset)) ?? [];

  // ── Representative product usage + room tags + usage summaries (batch, no N+1) ──
  const assetIds = rows.map((r) => r.id);
  const [repMap, tagsMap, usageMap] = await Promise.all([
    loadRepresentativeProductUsage(db, assetIds),
    loadAssetRoomTags(db, assetIds),
    batchesUsageSummaries(db, assetIds),
  ]);

  const items: FlatMediaItem[] = rows.map((row) => {
    const rep = repMap.get(row.id);
    const tags = tagsMap.get(row.id) ?? [];
    const usageSummary = usageMap.get(row.id);
    const groups: Record<MediaUsageGroupKey, number> = usageSummary
      ? usageSummary.groups
      : { product: 0, lookbook: 0, featured: 0, hero: 0, mapping: 0 };
    const status = usageSummary?.status ?? "unused";
    const usageCount = Object.values(groups).reduce((a, b) => a + b, 0);
    return {
      asset_id: row.id,
      storage_key: row.storage_key,
      path: row.path,
      created_at: row.created_at,
      width: row.width ?? null,
      height: row.height ?? null,
      mime_type: row.mime_type ?? "",
      file_size: row.file_size ?? null,
      id: rep?.rep_image_id ?? 0,
      product_id: rep?.product_id ?? 0,
      product_code: rep?.product_code ?? "",
      product_name: rep?.product_name ?? "",
      product_category: rep?.product_category ?? "",
      product_is_public: rep?.product_is_public ?? 0,
      featured_rank: rep?.featured_rank ?? null,
      caption: rep?.caption ?? "",
      is_primary: rep?.is_primary ?? 0,
      kind: rep?.kind ?? "normal",
      image_is_public: rep?.image_is_public ?? 0,
      ai_description: rep?.ai_description ?? "",
      room_tags: tags,
      usage_count: usageCount,
      usage_groups: groups,
      status,
    };
  });

  return { items, total, counts, publicCounts, roomCounts };
}

type RepProductUsage = {
  rep_image_id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  product_category: string;
  product_is_public: number;
  featured_rank: number | null;
  caption: string;
  is_primary: number;
  kind: ProductImageKind;
  image_is_public: number;
  ai_description: string;
};

async function loadRepresentativeProductUsage(
  db: AsyncDb,
  assetIds: number[],
): Promise<Map<number, RepProductUsage>> {
  const map = new Map<number, RepProductUsage>();
  const clean = [...new Set(assetIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!clean.length) return map;
  const rows = (await db
    .prepare(
      `SELECT pi.media_asset_id, pi.id AS rep_image_id,
              p.id AS product_id, p.code AS product_code, p.name AS product_name,
              p.category AS product_category, p.is_public AS product_is_public,
              p.featured_rank,
              pi.caption, pi.is_primary,
              CASE WHEN pi.kind = 'map' THEN 'map' WHEN pi.kind = 'concept' THEN 'concept' ELSE 'normal' END AS kind,
              pi.is_public AS image_is_public,
              COALESCE(pi.ai_description, '') AS ai_description
         FROM product_images pi
         JOIN products p ON p.id = pi.product_id
        WHERE pi.media_asset_id IN (${clean.map(() => "?").join(", ")})
        ORDER BY (pi.kind = 'map') DESC, pi.is_primary DESC, pi.id ASC`,
    )
    .all<{ media_asset_id: number } & RepProductUsage>(...clean)) ?? [];
  for (const r of rows) {
    if (!map.has(r.media_asset_id)) {
      map.set(r.media_asset_id, {
        rep_image_id: r.rep_image_id,
        product_id: r.product_id,
        product_code: r.product_code,
        product_name: r.product_name,
        product_category: r.product_category,
        product_is_public: r.product_is_public,
        featured_rank: r.featured_rank,
        caption: r.caption,
        is_primary: r.is_primary,
        kind: normalizeKind(r.kind),
        image_is_public: r.image_is_public,
        ai_description: r.ai_description,
      });
    }
  }
  return map;
}

async function loadAssetRoomTags(
  db: AsyncDb,
  assetIds: number[],
): Promise<Map<number, ProductImageRoomTag[]>> {
  const map = new Map<number, ProductImageRoomTag[]>();
  const clean = [...new Set(assetIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!clean.length) return map;
  const rows = (await db
    .prepare(
      `SELECT pi.media_asset_id, rt.room_slug, rt.source, rt.confidence, rt.model,
              rt.model_version, rt.created_at, rt.updated_at
         FROM product_image_room_tags rt
         JOIN product_images pi ON pi.id = rt.product_image_id
        WHERE pi.media_asset_id IN (${clean.map(() => "?").join(", ")})
        ORDER BY rt.room_slug ASC`,
    )
    .all<{
      media_asset_id: number;
      room_slug: string;
      source: string;
      confidence: number | null;
      model: string | null;
      model_version: string | null;
      created_at: string;
      updated_at: string;
    }>(...clean)) ?? [];
  for (const r of rows) {
    const list = map.get(r.media_asset_id) ?? [];
    list.push({
      product_image_id: 0,
      room_slug: r.room_slug as ImageRoomTagSlug,
      source: (r.source as "manual" | "vision") ?? "manual",
      confidence: r.confidence,
      model: r.model ?? "",
      model_version: r.model_version ?? "",
      created_at: r.created_at ?? "",
      updated_at: r.updated_at ?? "",
    });
    map.set(r.media_asset_id, list);
  }
  return map;
}

/**
 * Xoá MediaAsset theo asset_id — thao tác asset-centric trên /luu-tru.
 * Xoá mapping_media_usages + landing_page_media_usages + các row product_images
 * đang trỏ tới asset, rồi row media_assets. Trả số usage đã gỡ.
 * KHÔNG xoá file storage ở đây (xoá file là tác vụ riêng, chỉ khi cần thu hồi).
 */
export async function deleteMediaAsset(
  db: AsyncDb,
  assetId: number,
): Promise<{ deleted: boolean; usages_removed: number }> {
  const row = (await db
    .prepare("SELECT id, storage_key, path FROM media_assets WHERE id = ?")
    .get<{ id: number; storage_key: string; path: string }>(assetId)) as
    | { id: number; storage_key: string; path: string }
    | undefined;
  if (!row) return { deleted: false, usages_removed: 0 };

  let usagesRemoved = 0;
  await db.transaction(async (tx) => {
    const m = await tx
      .prepare("SELECT COUNT(*) AS n FROM mapping_media_usages WHERE media_asset_id = ?")
      .get<{ n: number }>(assetId);
    usagesRemoved += Number((m as { n: number } | undefined)?.n ?? 0);
    await tx.prepare("DELETE FROM mapping_media_usages WHERE media_asset_id = ?").run(assetId);

    const h = await tx
      .prepare("SELECT COUNT(*) AS n FROM landing_page_media_usages WHERE media_asset_id = ?")
      .get<{ n: number }>(assetId);
    usagesRemoved += Number((h as { n: number } | undefined)?.n ?? 0);
    await tx.prepare("DELETE FROM landing_page_media_usages WHERE media_asset_id = ?").run(assetId);

    const p = await tx
      .prepare("SELECT COUNT(*) AS n FROM product_images WHERE media_asset_id = ?")
      .get<{ n: number }>(assetId);
    usagesRemoved += Number((p as { n: number } | undefined)?.n ?? 0);
    // Tháo liên kết product_images trước rồi xoá asset (FK SET NULL tương đương).
    await tx
      .prepare("UPDATE product_images SET media_asset_id = NULL WHERE media_asset_id = ?")
      .run(assetId);
    await tx.prepare("DELETE FROM media_assets WHERE id = ?").run(assetId);
  })();

  return { deleted: true, usages_removed: usagesRemoved };
}