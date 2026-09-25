/**
 * Media & product hạng nặng — tách khỏi crm.server.ts (đang 3.205 dòng).
 *
 * Gồm: product CRUD (createProduct/updateProduct), flat media (listFlatMediaImages)
 * và bulk room-tag/kind trên ảnh. Phụ thuộc ngược duy nhất là `getProduct`
 * (một chiều — KHÔNG tạo chu trình).
 */
import { getDb, type SqlValue } from "./index.server";
import { getProduct, loadProductImageRoomTags, normalizeRoomSlugs } from "./crm.server";
import { nowUtc } from "@/lib/format";
import type { ImageRoomTagSlug, Product, ProductImageKind, ProductImageRoomTag } from "@/lib/types";

// --- RECOVERED FUNCTIONS ---

export type ProductUpdate = {
  code?: string;
  /** Multi mã HHDV: "A|B|C" hoặc raw có dấu phẩy/xuống dòng */
  internal_codes?: string;
  name?: string;
  size?: string;
  material?: string;
  surface?: string;
  shape?: string;
  texture?: string;
  collections?: string;
  unit?: string;
  category?: string;
  supplier?: string;
  color?: string;
  area_per_tile_m2?: number | null;
  retail_price?: number;
  trade_price?: number | null;
  b2b_price?: number | null;
  discount_tp?: number | null;
  discount_b2b?: number | null;
  note?: string;
  is_hot?: number;
  /** Hiện trên landing page công khai (LP chỉ lấy product có ảnh). */
  is_public?: number;
  /** Thứ tự ưu tiên trên landing page; null = xếp sau, theo id. */
  featured_rank?: number | null;
  image_path?: string;
};

export async function updateProduct(id: number, input: ProductUpdate): Promise<Product> {
  const existing = await getProduct(id);
  if (!existing) throw new Error("Không tìm thấy sản phẩm");

  const code = ((input.code ?? existing.code ?? "") as string).trim();
  if (!code) throw new Error("Mã sản phẩm bắt buộc");

  if (code !== existing.code) {
    const clash = await getDb()
      .prepare("SELECT id FROM products WHERE code = ? AND id != ?")
      .get(code, id);
    if (clash) throw new Error(`Mã ${code} đã tồn tại`);
  }

  const retail =
    input.retail_price != null ? Math.round(Number(input.retail_price)) : existing.retail_price;
  if (retail == null || Number.isNaN(retail) || retail < 0) {
    throw new Error("Giá bán lẻ không hợp lệ (giá phải ≥ 0)");
  }

  const tradePrice =
    input.trade_price !== undefined
      ? input.trade_price == null
        ? null
        : Math.round(Number(input.trade_price))
      : (existing.trade_price ?? null);

  const b2bPrice =
    input.b2b_price !== undefined
      ? input.b2b_price == null
        ? null
        : Math.round(Number(input.b2b_price))
      : (existing.b2b_price ?? null);

  // Tự động tính % CK TP & CK B2B từ Đơn giá
  const discountTp =
    retail > 0 && tradePrice != null ? Math.round(((retail - tradePrice) / retail) * 100) : null;

  const discountB2b =
    retail > 0 && b2bPrice != null ? Math.round(((retail - b2bPrice) / retail) * 100) : null;

  await getDb()
    .prepare(
      `UPDATE products SET
        code = @code,
        name = @name,
        size = @size,
        material = @material,
        surface = @surface,
        shape = @shape,
        texture = @texture,
        collections = @collections,
        category = @category,
        supplier = @supplier,
        color = @color,
        area_per_tile_m2 = @area_per_tile_m2,
        retail_price = @retail_price,
        trade_price = @trade_price,
        b2b_price = @b2b_price,
        discount_tp = @discount_tp,
        discount_b2b = @discount_b2b,
        note = @note,
        is_hot = @is_hot,
        is_public = @is_public,
        featured_rank = @featured_rank,
        image_path = @image_path
       WHERE id = @id`,
    )
    .run({
      id,
      code,
      name: String(input.name ?? existing.name ?? "").trim() || code,
      size: String(input.size ?? existing.size ?? "").trim(),
      material: String(input.material ?? existing.material ?? "").trim(),
      surface: String(input.surface ?? existing.surface ?? "").trim(),
      shape: String(input.shape ?? existing.shape ?? "").trim(),
      texture: String(input.texture ?? existing.texture ?? "").trim(),
      collections: String(input.collections ?? existing.collections ?? "").trim(),
      category: String(input.category ?? existing.category ?? "").trim(),
      supplier: String(input.supplier ?? existing.supplier ?? "").trim(),
      color: String(input.color ?? existing.color ?? "").trim(),
      area_per_tile_m2:
        input.area_per_tile_m2 !== undefined
          ? input.area_per_tile_m2 != null && !Number.isNaN(Number(input.area_per_tile_m2))
            ? Number(input.area_per_tile_m2)
            : null
          : (existing.area_per_tile_m2 ?? null),
      retail_price: retail,
      trade_price: tradePrice,
      b2b_price: b2bPrice,
      discount_tp: discountTp,
      discount_b2b: discountB2b,
      note: String(input.note ?? existing.note ?? "").trim(),
      is_hot: input.is_hot !== undefined ? (input.is_hot ? 1 : 0) : existing.is_hot,
      is_public:
        input.is_public !== undefined ? (input.is_public ? 1 : 0) : (existing.is_public ?? 0),
      featured_rank:
        input.featured_rank !== undefined ? input.featured_rank : (existing.featured_rank ?? null),
      image_path: String(input.image_path ?? existing.image_path ?? "").trim(),
    } as unknown as SqlValue);

  return (await getProduct(id))!;
}

export type ProductCreateInput = {
  code: string;
  internal_codes?: string;
  name?: string;
  size?: string;
  material?: string;
  surface?: string;
  shape?: string;
  texture?: string;
  collections?: string;
  unit?: string;
  category?: string;
  supplier?: string;
  color?: string;
  area_per_tile_m2?: number | null;
  retail_price: number;
  trade_price?: number | null;
  b2b_price?: number | null;
  discount_tp?: number | null;
  discount_b2b?: number | null;
  note?: string;
  is_hot?: number;
  is_public?: number;
  featured_rank?: number | null;
  image_path?: string;
};

export async function createProduct(input: ProductCreateInput): Promise<Product> {
  const code = (input.code ?? "").trim();
  if (!code) throw new Error("Mã sản phẩm bắt buộc");

  const clash = await getDb().prepare("SELECT id FROM products WHERE code = ?").get(code);
  if (clash) throw new Error(`Mã ${code} đã tồn tại`);

  const retail = Math.round(Number(input.retail_price) || 0);
  if (Number.isNaN(retail) || retail < 0) throw new Error("Giá bán lẻ không hợp lệ (giá phải ≥ 0)");
  const tradePrice =
    input.trade_price == null || input.trade_price === ("" as unknown)
      ? null
      : Math.round(Number(input.trade_price));

  const b2bPrice =
    input.b2b_price == null || input.b2b_price === ("" as unknown)
      ? null
      : Math.round(Number(input.b2b_price));

  // Tự động tính % CK TP & CK B2B từ Đơn giá
  const discountTp =
    retail > 0 && tradePrice != null ? Math.round(((retail - tradePrice) / retail) * 100) : null;

  const discountB2b =
    retail > 0 && b2bPrice != null ? Math.round(((retail - b2bPrice) / retail) * 100) : null;

  const info = await getDb()
    .prepare(
      `INSERT INTO products (
        code, name, size, material, surface, shape, texture, collections, category, supplier,
        color, area_per_tile_m2,
        retail_price, trade_price, b2b_price, discount_tp, discount_b2b,
        note, is_hot, is_public, featured_rank, image_path
      ) VALUES (
        @code, @name, @size, @material, @surface, @shape, @texture, @collections, @category, @supplier,
        @color, @area_per_tile_m2,
        @retail_price, @trade_price, @b2b_price, @discount_tp, @discount_b2b,
        @note, @is_hot, @is_public, @featured_rank, @image_path
      )`,
    )
    .run({
      code,
      name: (input.name ?? "").trim() || code,
      size: (input.size ?? "").trim(),
      material: (input.material ?? "").trim(),
      surface: (input.surface ?? "").trim(),
      shape: (input.shape ?? "").trim(),
      texture: (input.texture ?? "").trim(),
      collections: (input.collections ?? "").trim(),
      category: (input.category ?? "").trim(),
      supplier: (input.supplier ?? "").trim(),
      color: (input.color ?? "").trim(),
      area_per_tile_m2:
        input.area_per_tile_m2 != null && input.area_per_tile_m2 !== ("" as unknown)
          ? Number(input.area_per_tile_m2)
          : null,
      retail_price: retail,
      trade_price: tradePrice,
      b2b_price: b2bPrice,
      discount_tp: discountTp,
      discount_b2b: discountB2b,
      note: (input.note ?? "").trim(),
      is_public: input.is_public ? 1 : 0,
      featured_rank: input.featured_rank ?? null,
      is_hot: input.is_hot ? 1 : 0,
      image_path: (input.image_path ?? "").trim(),
    } as unknown as SqlValue);

  return (await getProduct(Number(info.lastInsertRowid)))!;
}

import type {
  FlatMediaItem,
  FlatMediaTab,
  FlatMediaSort,
  FlatMediaUsage,
} from "./media-assets.server";
import { listMediaAssets } from "./media-assets.server";
export type { FlatMediaItem, FlatMediaTab, FlatMediaSort, FlatMediaUsage } from "./media-assets.server";
export { listMediaAssets } from "./media-assets.server";

/**
 * Read path asset-centric — 1 file = 1 MediaAsset card.
 * Wrapper giữ signature cũ cho API/UI; logic thật ở `listMediaAssets` (testable
 * với fake AsyncDb). `usage` giờ là 3-trạng thái: used/draft/orphan.
 */
export async function listFlatMediaImages(opts?: {
  tab?: FlatMediaTab;
  category?: string;
  search?: string;
  roomSlug?: ImageRoomTagSlug;
  publicFilter?: "all" | "public" | "hidden";
  colors?: string[];
  surfaces?: string[];
  shapes?: string[];
  textures?: string[];
  collections?: string[];
  sort?: FlatMediaSort;
  page?: number;
  pageSize?: number;
  usage?: FlatMediaUsage;
  selected?: "yes" | "no";
}): Promise<{
  items: FlatMediaItem[];
  total: number;
  counts: { all: number; map: number; concept: number; featured: number; unassigned: number };
  publicCounts: { all: number; public: number; hidden: number };
  roomCounts: Record<string, number>;
}> {
  return await listMediaAssets(getDb(), opts);
}

export async function bulkSetProductImageKind(
  imageIds: number[],
  kind: ProductImageKind,
): Promise<{ updated: number }> {
  const cleanIds = [...new Set(imageIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!cleanIds.length) return { updated: 0 };

  const db = getDb();
  let updated = 0;

  await db.transaction(async (tx) => {
    if (kind === "map") {
      // Map yêu cầu mỗi SP chỉ có tối đa 1 ảnh MAP.
      // Lấy danh sách ảnh cùng product_id và path
      const placeholders = cleanIds.map(() => "?").join(", ");
      const rows = await tx
        .prepare(
          `SELECT id, product_id, path FROM product_images WHERE id IN (${placeholders}) ORDER BY id ASC`,
        )
        .all<{ id: number; product_id: number; path: string }>(...cleanIds);

      // Nếu cùng 1 SP có nhiều ảnh được chọn, lấy ảnh cuối cùng làm MAP
      const targetImageByProduct = new Map<number, { id: number; path: string }>();
      for (const row of rows) {
        targetImageByProduct.set(row.product_id, { id: row.id, path: row.path });
      }

      for (const [productId, targetImg] of targetImageByProduct.entries()) {
        // Hạ các ảnh MAP cũ của SP này về normal
        await tx
          .prepare(
            "UPDATE product_images SET kind = 'normal' WHERE product_id = ? AND kind = 'map' AND id <> ?",
          )
          .run(productId, targetImg.id);
        // Set ảnh được chọn thành MAP
        const res = await tx
          .prepare("UPDATE product_images SET kind = 'map' WHERE id = ?")
          .run(targetImg.id);
        // Đồng bộ products.image_path và is_primary
        await tx
          .prepare("UPDATE products SET image_path = ? WHERE id = ?")
          .run(targetImg.path, productId);
        await tx
          .prepare("UPDATE product_images SET is_primary = 0 WHERE product_id = ? AND id <> ?")
          .run(productId, targetImg.id);
        await tx.prepare("UPDATE product_images SET is_primary = 1 WHERE id = ?").run(targetImg.id);
        updated += Number(res.changes) || 0;
      }
    } else {
      // Gán concept hoặc normal (blank) hàng loạt
      const chunkSize = 400;
      for (let i = 0; i < cleanIds.length; i += chunkSize) {
        const chunk = cleanIds.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(", ");
        const res = await tx
          .prepare(`UPDATE product_images SET kind = ? WHERE id IN (${placeholders})`)
          .run(kind, ...chunk);
        updated += Number(res.changes) || 0;
      }
    }
    await tx
      .prepare(
        `DELETE FROM product_image_room_tags
         WHERE product_image_id IN (
           SELECT id FROM product_images WHERE kind <> 'concept'
         )`,
      )
      .run();
  })();

  return { updated };
}

export async function setImageRoomTagsDirect(
  imageId: number,
  roomSlugs: ImageRoomTagSlug[],
): Promise<ProductImageRoomTag[]> {
  const db = getDb();
  const row = await db
    .prepare("SELECT id, kind, product_id FROM product_images WHERE id = ?")
    .get<{ id: number; kind: ProductImageKind; product_id: number }>(imageId);
  if (!row) throw new Error("Không tìm thấy ảnh này");
  const slugs = normalizeRoomSlugs(roomSlugs);
  const now = nowUtc();
  await db.transaction(async (tx) => {
    if (slugs.length > 0 && row.kind !== "concept") {
      await tx.prepare("UPDATE product_images SET kind = 'concept' WHERE id = ?").run(imageId);
    }
    await tx.prepare("DELETE FROM product_image_room_tags WHERE product_image_id = ?").run(imageId);
    for (const roomSlug of slugs) {
      await tx
        .prepare(
          `INSERT INTO product_image_room_tags
             (product_image_id, room_slug, source, created_at, updated_at)
           VALUES (?, ?, 'manual', ?, ?)
           ON CONFLICT (product_image_id, room_slug) DO UPDATE SET
             source = 'manual',
             updated_at = EXCLUDED.updated_at`,
        )
        .run(imageId, roomSlug, now, now);
    }
  })();
  const tags = await loadProductImageRoomTags([imageId]);
  return tags.get(imageId) ?? [];
}

export async function bulkSetProductImageRoomTags(
  imageIds: number[],
  roomSlugs: ImageRoomTagSlug[],
  mode: "replace" | "add" | "remove" = "replace",
): Promise<{ updated: number }> {
  const cleanIds = [...new Set(imageIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!cleanIds.length) return { updated: 0 };
  const slugs = normalizeRoomSlugs(roomSlugs);
  const db = getDb();
  const now = nowUtc();
  let updated = 0;

  await db.transaction(async (tx) => {
    if (slugs.length > 0 && mode !== "remove") {
      const placeholders = cleanIds.map(() => "?").join(", ");
      await tx
        .prepare(
          `UPDATE product_images SET kind = 'concept' WHERE id IN (${placeholders}) AND kind <> 'concept'`,
        )
        .run(...cleanIds);
    }

    if (mode === "replace") {
      const placeholders = cleanIds.map(() => "?").join(", ");
      await tx
        .prepare(`DELETE FROM product_image_room_tags WHERE product_image_id IN (${placeholders})`)
        .run(...cleanIds);
      for (const imgId of cleanIds) {
        for (const slug of slugs) {
          await tx
            .prepare(
              `INSERT INTO product_image_room_tags
                 (product_image_id, room_slug, source, created_at, updated_at)
               VALUES (?, ?, 'manual', ?, ?)
               ON CONFLICT (product_image_id, room_slug) DO NOTHING`,
            )
            .run(imgId, slug, now, now);
        }
      }
      updated = cleanIds.length;
    } else if (mode === "add") {
      for (const imgId of cleanIds) {
        for (const slug of slugs) {
          const res = await tx
            .prepare(
              `INSERT INTO product_image_room_tags
                 (product_image_id, room_slug, source, created_at, updated_at)
               VALUES (?, ?, 'manual', ?, ?)
               ON CONFLICT (product_image_id, room_slug) DO NOTHING`,
            )
            .run(imgId, slug, now, now);
          if (res.changes) updated++;
        }
      }
    } else if (mode === "remove") {
      if (slugs.length > 0) {
        const idPlaceholders = cleanIds.map(() => "?").join(", ");
        const slugPlaceholders = slugs.map(() => "?").join(", ");
        const res = await tx
          .prepare(
            `DELETE FROM product_image_room_tags
             WHERE product_image_id IN (${idPlaceholders})
               AND room_slug IN (${slugPlaceholders})`,
          )
          .run(...cleanIds, ...slugs);
        updated = Number(res.changes) || 0;
      }
    }
  })();

  return { updated };
}
