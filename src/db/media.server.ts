/**
 * Media & product hạng nặng — tách khỏi crm.server.ts (đang 3.205 dòng).
 *
 * Gồm: product CRUD (createProduct/updateProduct), flat media (listFlatMediaImages)
 * và bulk room-tag/kind trên ảnh. Phụ thuộc ngược duy nhất là `getProduct`
 * (một chiều — KHÔNG tạo chu trình).
 */
import { getDb, type SqlValue } from "./index.server";
import { otherReferencesExistSql } from "@/db/image-references.server";
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

export type FlatMediaTab = "all" | "map" | "concept" | "featured" | "unassigned";
export type FlatMediaSort = "newest" | "oldest" | "code_asc" | "code_desc" | "priority";

export type FlatMediaItem = {
  id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  product_category: string;
  product_is_public: number;
  featured_rank: number | null;
  path: string;
  caption: string;
  is_primary: number;
  kind: ProductImageKind;
  room_tags: ProductImageRoomTag[];
  /** Trạng thái Lookbook (product_images.is_public) — cách biệt với product_is_public. */
  image_is_public: number;
  /** Mô tả concept (AI-generated, có thể sửa) — chỉ có nghĩa với kind=concept. */
  ai_description: string;
  created_at: string;
};
export type FlatMediaUsage = "all" | "in_use" | "unused" | "expiring";
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
  const db = getDb();
  const tab = opts?.tab ?? "all";
  const sort = opts?.sort ?? "newest";
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts?.pageSize ?? 48, 12), 120);
  const offset = (page - 1) * pageSize;

  // 1. Base filters (danh mục & search) dùng chung cho cả counts và items
  const baseWhere: string[] = ["i.path <> ''"];
  const baseParams: SqlValue[] = [];

  if (opts?.category && opts.category !== "all") {
    baseWhere.push("LOWER(p.category) = LOWER(?)");
    baseParams.push(opts.category);
  }

  if (opts?.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    baseWhere.push("(p.code ILIKE ? OR p.name ILIKE ? OR i.caption ILIKE ?)");
    baseParams.push(q, q, q);
  }

  if (opts?.roomSlug) {
    baseWhere.push(
      "EXISTS (SELECT 1 FROM product_image_room_tags rt WHERE rt.product_image_id = i.id AND rt.room_slug = ?)",
    );
    baseParams.push(opts.roomSlug);
  }
  if (opts?.publicFilter && opts.publicFilter !== "all") {
    baseWhere.push(opts.publicFilter === "public" ? "p.is_public = 1" : "p.is_public = 0");
  }

  if (opts?.colors && opts.colors.length > 0) {
    const placeholders = opts.colors.map(() => "?").join(", ");
    baseWhere.push(`p.color IN (${placeholders})`);
    baseParams.push(...opts.colors);
  }

  if (opts?.surfaces && opts.surfaces.length > 0) {
    const placeholders = opts.surfaces.map(() => "?").join(", ");
    baseWhere.push(`p.surface IN (${placeholders})`);
    baseParams.push(...opts.surfaces);
  }

  if (opts?.shapes && opts.shapes.length > 0) {
    const placeholders = opts.shapes.map(() => "?").join(", ");
    baseWhere.push(`p.shape IN (${placeholders})`);
    baseParams.push(...opts.shapes);
  }

  if (opts?.textures && opts.textures.length > 0) {
    const placeholders = opts.textures.map(() => "?").join(", ");
    baseWhere.push(`p.texture IN (${placeholders})`);
    baseParams.push(...opts.textures);
  }

  if (opts?.collections && opts.collections.length > 0) {
    const placeholders = opts.collections.map(() => "?").join(", ");
    baseWhere.push(`p.collections IN (${placeholders})`);
    baseParams.push(...opts.collections);
  }
  const baseWhereSql = `WHERE ${baseWhere.join(" AND ")}`;
  // 2. Counts trên các Tabs (Đếm chính xác theo số lượng Ảnh)
  const statsSql = `
    SELECT
      COUNT(*)::int AS all_count,
      COUNT(CASE WHEN i.kind = 'map' THEN 1 END)::int AS map_count,
      COUNT(CASE WHEN i.kind = 'concept' THEN 1 END)::int AS concept_count,
      COUNT(DISTINCT CASE WHEN p.featured_rank IS NOT NULL AND p.featured_rank BETWEEN 1 AND 12 THEN p.featured_rank END)::int AS featured_count,
      COUNT(CASE WHEN i.kind = 'normal' OR i.kind IS NULL OR i.kind = '' THEN 1 END)::int AS unassigned_count
    FROM product_images i
    JOIN products p ON p.id = i.product_id
    ${baseWhereSql}
  `;

  const countRow = (await db.prepare(statsSql).get<{
    all_count: number;
    map_count: number;
    concept_count: number;
    featured_count: number;
    unassigned_count: number;
  }>(...baseParams)) ?? {
    all_count: 0,
    map_count: 0,
    concept_count: 0,
    featured_count: 0,
    unassigned_count: 0,
  };

  const counts = {
    all: Number(countRow.all_count) || 0,
    map: Number(countRow.map_count) || 0,
    concept: Number(countRow.concept_count) || 0,
    featured: Number(countRow.featured_count) || 0,
    unassigned: Number(countRow.unassigned_count) || 0,
  };

  // 2.1 Public counts (Thống kê trạng thái Thư viện Web)
  // Tạo query đếm trạng thái web dựa trên base filters trừ publicFilter
  const publicStatsWhere: string[] = ["i.path <> ''"];
  const publicStatsParams: SqlValue[] = [];
  if (opts?.category && opts.category !== "all") {
    publicStatsWhere.push("p.category = ?");
    publicStatsParams.push(opts.category);
  }
  if (opts?.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    publicStatsWhere.push("(p.code ILIKE ? OR p.name ILIKE ? OR i.caption ILIKE ?)");
    publicStatsParams.push(q, q, q);
  }
  if (opts?.roomSlug) {
    publicStatsWhere.push(
      "EXISTS (SELECT 1 FROM product_image_room_tags rt WHERE rt.product_image_id = i.id AND rt.room_slug = ?)",
    );
    publicStatsParams.push(opts.roomSlug);
  }
  if (tab === "map") {
    publicStatsWhere.push("i.kind = 'map'");
  } else if (tab === "concept") {
    publicStatsWhere.push("i.kind = 'concept'");
  } else if (tab === "featured") {
    publicStatsWhere.push("p.featured_rank IS NOT NULL AND p.featured_rank BETWEEN 1 AND 12");
  } else if (tab === "unassigned") {
    publicStatsWhere.push("(i.kind = 'normal' OR i.kind IS NULL OR i.kind = '')");
  }
  const publicStatsSql = `
    SELECT
      COUNT(*)::int AS all_count,
      COUNT(CASE WHEN p.is_public = 1 THEN 1 END)::int AS public_count,
      COUNT(CASE WHEN p.is_public = 0 OR p.is_public IS NULL THEN 1 END)::int AS hidden_count
    FROM product_images i
    JOIN products p ON p.id = i.product_id
    WHERE ${publicStatsWhere.join(" AND ")}
  `;
  const publicCountRow = (await db.prepare(publicStatsSql).get<{
    all_count: number;
    public_count: number;
    hidden_count: number;
  }>(...publicStatsParams)) ?? { all_count: 0, public_count: 0, hidden_count: 0 };

  const publicCounts = {
    all: Number(publicCountRow.all_count) || 0,
    public: Number(publicCountRow.public_count) || 0,
    hidden: Number(publicCountRow.hidden_count) || 0,
  };

  // 2.2 Room counts (đếm số lượng ảnh cho từng tag không gian)
  const roomCountsSql = `
    SELECT
      rt.room_slug,
      COUNT(DISTINCT i.id)::int AS count
    FROM product_images i
    JOIN products p ON p.id = i.product_id
    JOIN product_image_room_tags rt ON rt.product_image_id = i.id
    ${baseWhereSql}
    GROUP BY rt.room_slug
  `;

  const roomCountRows =
    (await db.prepare(roomCountsSql).all<{
      room_slug: string;
      count: number | string;
    }>(...baseParams)) ?? [];

  const roomCounts: Record<string, number> = {};
  for (const r of roomCountRows) {
    roomCounts[r.room_slug] = Number(r.count) || 0;
  }
  // 3. Filter theo Tab (Chỉ trả về ĐÚNG loại ảnh được chọn)
  const listWhere = [...baseWhere];
  const listParams = [...baseParams];

  if (tab === "map") {
    listWhere.push("i.kind = 'map'");
  } else if (tab === "concept") {
    listWhere.push("i.kind = 'concept'");
  } else if (tab === "featured") {
    listWhere.push("p.featured_rank IS NOT NULL AND p.featured_rank BETWEEN 1 AND 12");
  } else if (tab === "unassigned") {
    listWhere.push("(i.kind = 'normal' OR i.kind IS NULL OR i.kind = '')");
  }

  // Tuyển chọn Trang chủ — secondary filter, CHỈ hợp lệ ở tab MAP (UI ẩn ở tab khác).
  const selectionKey = opts?.tab === "map" ? opts.selected : undefined;
  if (selectionKey === "yes") {
    listWhere.push("p.featured_rank IS NOT NULL AND p.featured_rank BETWEEN 1 AND 12");
  } else if (selectionKey === "no") {
    listWhere.push("p.featured_rank IS NULL");
  }

  // Sử dụng / lifecycle — reuse Reference Resolver (same 7 nguồn, không nhân bản).
  // UI expose 2 trạng thái: in_use (Đang dùng) và expiring (Chờ xóa).
  // Active = ảnh đang được dùng (bản ghi media của chính nó là ref) → không lọc.
  // To Delete = không còn ref NÀO KHÁC ngoài bản ghi hiện tại → vào GC sau.
  // Mặc định (không truyền) = "all" — tuyệt đối không làm trống tab khi mở.
  const usage = opts?.usage ?? "all";
  if (usage === "expiring" || usage === "unused") {
    listWhere.push(
      `NOT EXISTS ${otherReferencesExistSql("i", "substring(i.path from '([^/]+)$')")}`,
    );
  }

  const listWhereSql = `WHERE ${listWhere.join(" AND ")}`;

  // 4. Sort mà ảnh hưởng total: usage/selected làm lệch counts[tab] (bị "không chạy").
  //    Tính COUNT đúng theo bộ lọc hiện tại; tab featured giữ counts.featured (DISTINCT ON).
  let total =
    tab === "featured"
      ? counts.featured
      : tab === "map"
        ? counts.map
        : tab === "concept"
          ? counts.concept
          : tab === "unassigned"
            ? counts.unassigned
            : counts.all;
  if (tab !== "featured" && (usage !== "all" || selectionKey !== undefined)) {
    const countRow = await db
      .prepare(
        `SELECT COUNT(*) AS n
           FROM product_images i
           JOIN products p ON p.id = i.product_id
           LEFT JOIN image_assets ast ON ast.storage_key = substring(i.path from '([^/]+)$')
           ${listWhereSql}`,
      )
      .get<{ n: number }>(...listParams);
    total = Number(countRow?.n) || 0;
  }

  // Sort
  let orderBySql = "i.id DESC";
  if (tab === "featured") {
    orderBySql = "p.featured_rank ASC, i.is_primary DESC, i.id ASC";
  } else if (sort === "oldest") {
    orderBySql = "i.id ASC";
  } else if (sort === "code_asc") {
    orderBySql = "p.code ASC, i.is_primary DESC, i.sort_order ASC, i.id ASC";
  } else if (sort === "code_desc") {
    orderBySql = "p.code DESC, i.is_primary DESC, i.sort_order ASC, i.id ASC";
  } else if (sort === "priority") {
    orderBySql = "p.featured_rank ASC NULLS LAST, i.is_primary DESC, i.id ASC";
  }

  // 5. Query danh sách ảnh phân trang theo Ảnh
  // Featured tab: DISTINCT ON (p.featured_rank) — 1 representative image per slot
  let items: FlatMediaItem[];
  if (tab === "featured") {
    items = await db
      .prepare(
        `SELECT DISTINCT ON (p.featured_rank)
          i.id,
          i.product_id,
          p.code AS product_code,
          p.name AS product_name,
          p.category AS product_category,
          p.is_public AS product_is_public,
          p.featured_rank,
          i.path,
          i.caption,
          i.is_primary,
          i.is_public AS image_is_public,
          CASE WHEN i.kind = 'map' THEN 'map' WHEN i.kind = 'concept' THEN 'concept' ELSE 'normal' END AS kind,
          COALESCE(i.ai_description, '') AS ai_description,
          i.created_at
        FROM product_images i
        JOIN products p ON p.id = i.product_id
        LEFT JOIN image_assets ast ON ast.storage_key = substring(i.path from '([^/]+)$')
        ${listWhereSql}
        ORDER BY p.featured_rank ASC, (i.kind = 'map') DESC, i.is_primary DESC, i.id ASC
        LIMIT ? OFFSET ?`,
      )
      .all<FlatMediaItem>(...listParams, pageSize, offset);
  } else {
    items = await db
      .prepare(
        `SELECT
          i.id,
          i.product_id,
          p.code AS product_code,
          p.name AS product_name,
          p.category AS product_category,
          p.is_public AS product_is_public,
          p.featured_rank,
          i.path,
          i.caption,
          i.is_primary,
          i.is_public AS image_is_public,
          CASE WHEN i.kind = 'map' THEN 'map' WHEN i.kind = 'concept' THEN 'concept' ELSE 'normal' END AS kind,
          COALESCE(i.ai_description, '') AS ai_description,
          i.created_at
        FROM product_images i
        JOIN products p ON p.id = i.product_id
        LEFT JOIN image_assets ast ON ast.storage_key = substring(i.path from '([^/]+)$')
        ${listWhereSql}
        ORDER BY ${orderBySql}
        LIMIT ? OFFSET ?`,
      )
      .all<FlatMediaItem>(...listParams, pageSize, offset);
  }
  const tagsByImage = await loadProductImageRoomTags(items.map((item) => item.id));
  const itemsWithTags = items.map((item) => ({
    ...item,
    room_tags: tagsByImage.get(item.id) ?? [],
  }));

  return { items: itemsWithTags, total, counts, publicCounts, roomCounts };
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
