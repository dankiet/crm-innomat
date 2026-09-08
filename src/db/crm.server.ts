import fs from "node:fs";
import { putImageBuffer, deleteImageRef, isManagedImageRef } from "@/lib/storage";
import { normalizeUploadImageBuffer } from "@/lib/image-upload.server";
import path from "node:path";
import { getDb, type SqlValue } from "./index.server";
import { unitPriceForProduct, effectiveDiscountPct } from "@/lib/pricing";
import type {
  Customer,
  CustomerDebt,
  CustomerDebtDetail,
  CustomerStatus,
  DiscountType,
  Note,
  Order,
  OrderStatus,
  Payment,
  Product,
  ProductImageRow,
  ProductImageKind,
  Quote,
  QuoteItem,
  QuoteStatus,
} from "@/lib/types";
import { isPhoneMatchable, phonesMatch } from "@/lib/phone";
import { statusMeta } from "@/lib/types";

function nowLocal() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/** Bỏ dấu tiếng Việt + chỉ giữ [A-Z0-9], viết hoa. VD "Kim Áo" → "KIMAO". */
function slugifyCode(raw: string): string {
  return (raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

/**
 * Sinh mã BG/ĐH theo quy tắc: {prefix}-{YYMMDD}-INM-{TÊN_VIẾT_TẮT}
 * VD: QT-260723-INM-KIMAO
 * - Tên viết tắt lấy từ short_name → company → name (đã bỏ dấu, viết hoa).
 * - Cột code là UNIQUE nên thêm hậu tố -2, -3… khi trùng.
 */
async function buildEntityCode(
  prefix: string,
  table: "quotes" | "orders" | "customer_mappings",
  customer: { short_name?: string; company?: string; name: string },
): Promise<string> {
  const db = getDb();
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateStr = `${yy}${mm}${dd}`;

  const rawName =
    (customer.short_name || "").trim() ||
    (customer.company || "").trim() ||
    (customer.name || "").trim();
  const slug = slugifyCode(rawName) || "KH";

  const base = `${prefix}-${dateStr}-INM-${slug}`;

  const exists = db.prepare(`SELECT 1 FROM ${table} WHERE code = ? LIMIT 1`);
  if (!(await exists.get(base))) return base;
  let n = 2;
  while (await exists.get(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// ─── Products ───────────────────────────────────────────────

export async function listProducts(opts?: {
  category?: string;
  search?: string;
  stockLocation?: string;
  limit?: number;
}): Promise<Product[]> {
  const db = getDb();
  const where: string[] = [];
  const joinParams: unknown[] = [];
  const params: unknown[] = [];
  const categoryLower = opts?.category?.trim().toLowerCase();
  if (categoryLower && categoryLower !== "all") {
    where.push("LOWER(p.category) = ?");
    params.push(categoryLower);
  }
  if (opts?.search?.trim()) {
    where.push(
      "(p.code ILIKE ? OR pic.multi_codes_list ILIKE ? OR p.name ILIKE ? OR p.size ILIKE ? OR p.supplier ILIKE ?)",
    );
    const q = likePattern(opts.search);
    params.push(q, q, q, q, q);
  }

  let stockJoin = "";
  if (opts?.stockLocation && opts.stockLocation !== "all") {
    stockJoin = " AND inv.stock_location = ?";
    joinParams.push(opts.stockLocation);
  }

  const hasLimit = opts?.limit != null && Number(opts.limit) > 0;
  if (hasLimit) params.push(Math.floor(Number(opts.limit)));

  const sql = `
    SELECT p.*,
      COALESCE((
        SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id
      ), 0) AS image_count,
      pic.total_stock,
      pic.multi_codes_list
    FROM products p
    LEFT JOIN (
      SELECT pic.product_id,
             SUM(inv.quantity_stock) as total_stock,
             GROUP_CONCAT(DISTINCT pic.internal_code) as multi_codes_list
      FROM product_internal_codes pic
      LEFT JOIN inventory inv ON inv.internal_code = pic.internal_code${stockJoin}
      GROUP BY pic.product_id
    ) pic ON pic.product_id = p.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY p.category, p.supplier, p.code
    ${hasLimit ? "LIMIT ?" : ""}
  `;
  return (await db
    .prepare(sql)
    .all<Product>(...(joinParams as SqlValue[]), ...(params as SqlValue[]))) as Product[];
}
export async function getProduct(id: number): Promise<Product | null> {
  return (
    ((await getDb()
      .prepare(
        `SELECT p.*,
          COALESCE((
            SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id
          ), 0) AS image_count,
          pic.total_stock,
          pic.multi_codes_list
         FROM products p
         LEFT JOIN (
           SELECT pic.product_id,
                  SUM(inv.quantity_stock) as total_stock,
                  GROUP_CONCAT(DISTINCT pic.internal_code) as multi_codes_list
           FROM product_internal_codes pic
           LEFT JOIN inventory inv ON inv.internal_code = pic.internal_code
           GROUP BY pic.product_id
         ) pic ON pic.product_id = p.id
         WHERE p.id = ?`,
      )
      .get<Product>(id)) as Product | undefined) ?? null
  );
}

/** Field cho phép gợi ý (datalist) & bulk apply — whitelist để tránh SQL injection */
const PRODUCT_SUGGEST_FIELDS = [
  "color",
  "supplier",
  "category",
  "surface",
  "shape",
  "collections",
  "material",
  "size",
] as const;
type ProductSuggestField = (typeof PRODUCT_SUGGEST_FIELDS)[number];

/** Lấy danh sách giá trị distinct đã dùng cho 1 field phân loại — dùng làm gợi ý datalist */
export async function listProductFieldValues(field: ProductSuggestField): Promise<string[]> {
  if (!PRODUCT_SUGGEST_FIELDS.includes(field)) {
    throw new Error("Field không hợp lệ");
  }
  const db = getDb();
  return (
    (await db
      .prepare(`SELECT DISTINCT ${field} AS v FROM products WHERE ${field} != '' ORDER BY ${field}`)
      .all<{ v: string }>()) as { v: string }[]
  ).map((r) => r.v);
}

/** Áp dụng 1 giá trị cho field phân loại của nhiều sản phẩm cùng lúc (bulk edit) */
export async function bulkUpdateProductField(
  ids: number[],
  field: ProductSuggestField,
  value: string,
): Promise<{ ok: true; updated: number }> {
  if (!PRODUCT_SUGGEST_FIELDS.includes(field)) {
    throw new Error("Field không hợp lệ");
  }
  const cleanIds = ids.filter((n) => Number.isInteger(n) && n > 0);
  if (cleanIds.length === 0) throw new Error("Chưa chọn sản phẩm nào");
  const trimmed = value.trim();
  const db = getDb();
  const placeholders = cleanIds.map(() => "?").join(",");
  const result = await db
    .prepare(`UPDATE products SET ${field} = ? WHERE id IN (${placeholders})`)
    .run(trimmed, ...cleanIds);
  return { ok: true, updated: result.changes };
}

/** Xóa hẳn 1 giá trị gợi ý sai/dư ra khỏi field phân loại — set về rỗng cho MỌI sản phẩm đang dùng giá trị này. */
export async function clearProductFieldValue(
  field: ProductSuggestField,
  value: string,
): Promise<{ ok: true; updated: number }> {
  if (!PRODUCT_SUGGEST_FIELDS.includes(field)) {
    throw new Error("Field không hợp lệ");
  }
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Giá trị không hợp lệ");
  const db = getDb();
  const result = await db
    .prepare(`UPDATE products SET ${field} = '' WHERE ${field} = ?`)
    .run(trimmed);
  return { ok: true, updated: result.changes };
}

export async function deleteProduct(id: number): Promise<{ ok: true; code: string }> {
  const db = getDb();
  const product = await getProduct(id);
  if (!product) throw new Error("Không tìm thấy sản phẩm");

  const inQuotes = (
    (await db
      .prepare("SELECT COUNT(*) AS n FROM quote_items WHERE product_id = ?")
      .get<{ n: number }>(id)) as { n: number }
  ).n;
  if (inQuotes > 0) {
    throw new Error(
      `Không xóa được: sản phẩm ${product.code} đang có trong ${inQuotes} dòng báo giá`,
    );
  }

  const imagePaths = (
    (await db
      .prepare("SELECT path FROM product_images WHERE product_id = ?")
      .all<{ path: string }>(id)) as Array<{ path: string }>
  ).map((r) => r.path);
  if (product.image_path) imagePaths.push(product.image_path);

  const runTx = getDb().transaction(async () => {
    await db.prepare("DELETE FROM product_images WHERE product_id = ?").run(id);
    await db.prepare("DELETE FROM products WHERE id = ?").run(id);
  });
  await runTx();

  for (const web of new Set(imagePaths)) {
    if (!web || !isManagedImageRef(web)) continue;
    if (await isPublicImagePathReferenced(db, web)) continue;
    await deleteImageRef(web);
  }

  return { ok: true, code: product.code };
}

// ─── Product images (nhiều ảnh / SP) ─────────────────────────

export async function isPublicImagePathReferenced(
  db: ReturnType<typeof getDb>,
  publicPath: string,
): Promise<boolean> {
  return Boolean(
    await db
      .prepare(
        `SELECT 1 FROM product_images WHERE path = ?
         UNION ALL SELECT 1 FROM products WHERE image_path = ?
         UNION ALL SELECT 1 FROM customer_mapping_items WHERE image_path = ?
         UNION ALL SELECT 1 FROM customer_mapping_items WHERE custom_product_image_path = ?
         UNION ALL SELECT 1 FROM gallery_collection_items WHERE path = ?
         LIMIT 1`,
      )
      .get(publicPath, publicPath, publicPath, publicPath, publicPath),
  );
}

async function syncPrimaryImagePath(productId: number) {
  const db = getDb();
  const primary = (await db
    .prepare(
      `SELECT path FROM product_images
       WHERE product_id = ?
       ORDER BY is_primary DESC, sort_order ASC, id ASC
       LIMIT 1`,
    )
    .get<{ path: string }>(productId)) as { path: string } | undefined;
  await db
    .prepare("UPDATE products SET image_path = ? WHERE id = ?")
    .run(primary?.path ?? "", productId);
}

export async function listProductImages(productId: number): Promise<ProductImageRow[]> {
  return (await getDb()
    .prepare(
      `SELECT * FROM product_images
       WHERE product_id = ?
       ORDER BY is_primary DESC, sort_order ASC, id ASC`,
    )
    .all<ProductImageRow>(productId)) as ProductImageRow[];
}

export async function addProductImage(input: {
  product_id: number;
  path: string;
  caption?: string;
  is_primary?: boolean;
  kind?: ProductImageKind;
}): Promise<ProductImageRow> {
  const db = getDb();
  if (!(await getProduct(input.product_id))) {
    throw new Error("Không tìm thấy sản phẩm");
  }
  const pathStr = input.path.trim();
  if (!pathStr) throw new Error("Đường dẫn ảnh bắt buộc");

  const kind: ProductImageKind = input.kind ?? "normal";

  const count = (
    (await db
      .prepare("SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?")
      .get<{ n: number }>(input.product_id)) as { n: number }
  ).n;

  const makePrimary = input.is_primary === true || count === 0;

  const maxSort = (
    (await db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM product_images WHERE product_id = ?")
      .get<{ m: number }>(input.product_id)) as { m: number }
  ).m;

  const runTx = db.transaction(async (tx) => {
    if (makePrimary) {
      await tx
        .prepare("UPDATE product_images SET is_primary = 0 WHERE product_id = ?")
        .run(input.product_id);
    }
    // Chỉ 1 ảnh MAP mỗi SP — hạ ảnh map cũ về 'normal' trước khi thêm map mới.
    if (kind === "map") {
      await tx
        .prepare("UPDATE product_images SET kind = 'normal' WHERE product_id = ? AND kind = 'map'")
        .run(input.product_id);
    }
    const info = await tx
      .prepare(
        `INSERT INTO product_images
          (product_id, path, sort_order, is_primary, caption, kind)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.product_id,
        pathStr,
        maxSort + 1,
        makePrimary ? 1 : 0,
        (input.caption ?? "").trim(),
        kind,
      );
    return Number(info.lastInsertRowid);
  });
  const newId = await runTx();

  await syncPrimaryImagePath(input.product_id);
  return (await db
    .prepare("SELECT * FROM product_images WHERE id = ?")
    .get<ProductImageRow>(newId)) as ProductImageRow;
}

/** Chuẩn ảnh SP khi upload: cạnh dài tối đa (giữ tỉ lệ). */

async function saveManagedImage(buffer: Buffer, ext: string): Promise<string> {
  return await putImageBuffer(buffer, ext);
}

/** Lưu file upload vào public/images theo hash nội dung sau normalize. */
export async function uploadProductImageFile(input: {
  product_id: number;
  filename: string;
  dataBase64: string;
  mimeType?: string;
  caption?: string;
  is_primary?: boolean;
  kind?: ProductImageKind;
}): Promise<ProductImageRow> {
  if (!getProduct(input.product_id)) {
    throw new Error("Không tìm thấy sản phẩm");
  }

  let b64 = input.dataBase64;
  const dataUrlMatch = b64.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    b64 = dataUrlMatch[2]!;
  }
  const rawBuf = Buffer.from(b64, "base64");
  if (rawBuf.length > 12 * 1024 * 1024) {
    throw new Error("Ảnh quá lớn (tối đa 12MB)");
  }

  const normalized = await normalizeUploadImageBuffer(rawBuf);
  const publicPath = await saveManagedImage(normalized, ".webp");
  return await addProductImage({
    product_id: input.product_id,
    path: publicPath,
    caption: input.caption,
    is_primary: input.is_primary,
    kind: input.kind,
  });
}

export async function setPrimaryProductImage(
  productId: number,
  imageId: number,
): Promise<ProductImageRow[]> {
  const db = getDb();
  const row = (await db
    .prepare("SELECT * FROM product_images WHERE id = ? AND product_id = ?")
    .get<ProductImageRow>(imageId, productId)) as ProductImageRow | undefined;
  if (!row) throw new Error("Không tìm thấy ảnh của sản phẩm này");

  const runTx = getDb().transaction(async () => {
    await db
      .prepare("UPDATE product_images SET is_primary = 0 WHERE product_id = ?")
      .run(productId);
    await db.prepare("UPDATE product_images SET is_primary = 1 WHERE id = ?").run(imageId);
  });
  await runTx();
  await syncPrimaryImagePath(productId);
  return await listProductImages(productId);
}

/**
 * Gán loại ('map' | 'concept' | 'normal') cho một ảnh sản phẩm.
 * 'map' là duy nhất mỗi SP — set map mới sẽ hạ ảnh map cũ về 'normal'.
 */
export async function setProductImageKind(
  productId: number,
  imageId: number,
  kind: ProductImageKind,
): Promise<ProductImageRow[]> {
  const db = getDb();
  const row = (await db
    .prepare("SELECT id FROM product_images WHERE id = ? AND product_id = ?")
    .get<{ id: number }>(imageId, productId)) as { id: number } | undefined;
  if (!row) throw new Error("Không tìm thấy ảnh của sản phẩm này");

  const runTx = db.transaction(async (tx) => {
    if (kind === "map") {
      await tx
        .prepare(
          "UPDATE product_images SET kind = 'normal' WHERE product_id = ? AND kind = 'map' AND id <> ?",
        )
        .run(productId, imageId);
    }
    await tx.prepare("UPDATE product_images SET kind = ? WHERE id = ?").run(kind, imageId);
  });
  await runTx();
  return await listProductImages(productId);
}

export async function deleteProductImage(imageId: number): Promise<{
  product_id: number;
  images: ProductImageRow[];
}> {
  const db = getDb();
  const row = (await db
    .prepare("SELECT * FROM product_images WHERE id = ?")
    .get<ProductImageRow>(imageId)) as ProductImageRow | undefined;
  if (!row) throw new Error("Không tìm thấy ảnh");

  // Gallery FK is ON DELETE SET NULL — also drop collection tiles that pointed at
  // this product photo so permanent delete from the library picker stays clean.
  const galleryRows = (await db
    .prepare(
      `SELECT id, collection_id, path FROM gallery_collection_items
       WHERE product_image_id = ? OR path = ?`,
    )
    .all<{ id: number; collection_id: number; path: string }>(imageId, row.path)) as Array<{
    id: number;
    collection_id: number;
    path: string;
  }>;
  const touchedCollectionIds = [...new Set(galleryRows.map((g) => g.collection_id))];

  await db.transaction(async (tx) => {
    if (galleryRows.length) {
      const placeholders = galleryRows.map(() => "?").join(", ");
      await tx
        .prepare(
          `DELETE FROM gallery_collection_items WHERE id IN (${placeholders})`,
        )
        .run(...galleryRows.map((g) => g.id));
      for (const collectionId of touchedCollectionIds) {
        const next = await tx
          .prepare(
            `SELECT path FROM gallery_collection_items
             WHERE collection_id = ? ORDER BY sort_order, id LIMIT 1`,
          )
          .get<{ path: string }>(collectionId);
        await tx
          .prepare(
            `UPDATE gallery_collections
             SET cover_path = CASE WHEN cover_path = ? THEN ? ELSE cover_path END,
                 updated_at = ?
             WHERE id = ?`,
          )
          .run(row.path, next?.path ?? "", nowLocal(), collectionId);
      }
    }

    await tx.prepare("DELETE FROM product_images WHERE id = ?").run(imageId);

    // If deleted primary, promote first remaining
    if (row.is_primary) {
      const next = (await tx
        .prepare(
          `SELECT id FROM product_images
           WHERE product_id = ?
           ORDER BY sort_order ASC, id ASC LIMIT 1`,
        )
        .get<{ id: number }>(row.product_id)) as { id: number } | undefined;
      if (next) {
        await tx.prepare("UPDATE product_images SET is_primary = 1 WHERE id = ?").run(next.id);
      }
    }
  })();

  await syncPrimaryImagePath(row.product_id);

  // Chỉ xóa file được CRM quản lý khi không còn bản ghi nào dùng chung path.
  if (isManagedImageRef(row.path) && !(await isPublicImagePathReferenced(db, row.path))) {
    await deleteImageRef(row.path);
  }

  return {
    product_id: row.product_id,
    images: await listProductImages(row.product_id),
  };
}

// ─── Customers ──────────────────────────────────────────────

/** Trần an toàn cho list UI (~100–500 KH). Dialog/combobox nên truyền limit nhỏ hơn. */
const DEFAULT_CUSTOMER_LIST_LIMIT = 500;
const DEFAULT_QUOTE_LIST_LIMIT = 500;
const DEFAULT_ORDER_LIST_LIMIT = 500;

type ListCustomersOptions = {
  search?: string;
  /** Mặc định DEFAULT_CUSTOMER_LIST_LIMIT; truyền <=0 để không LIMIT (nội bộ/dashboard). */
  limit?: number;
};

function clampListLimit(limit: number | undefined, fallback: number): number | null {
  if (limit != null && Number(limit) <= 0) return null;
  const n = limit != null && Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : fallback;
  return Math.min(Math.max(n, 1), 2000);
}

function likePattern(raw: string): string {
  // NFC để khớp dữ liệu đã lưu (DB lưu NFC); một số bàn phím gõ tiếng Việt cho ra NFD.
  return `%${raw.normalize("NFC").trim().replace(/[%_\\]/g, "")}%`;
}

/** ownerId = null → tất cả (admin); số → chỉ KH của sales đó */
export async function listCustomers(
  status?: CustomerStatus | "all",
  ownerId?: number | null,
  opts?: ListCustomersOptions,
): Promise<Customer[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (status && status !== "all") {
    where.push("c.status = ?");
    params.push(status);
  }
  if (ownerId != null) {
    where.push("c.owner_id = ?");
    params.push(ownerId);
  }
  const q = opts?.search?.trim();
  if (q) {
    where.push(
      `(c.name ILIKE ? OR c.phone ILIKE ? OR c.region ILIKE ? OR c.company ILIKE ?
        OR c.short_name ILIKE ? OR c.email ILIKE ? OR c.source ILIKE ?
        OR u.display_name ILIKE ?)`,
    );
    const pat = likePattern(q);
    params.push(pat, pat, pat, pat, pat, pat, pat, pat);
  }

  const limit = clampListLimit(opts?.limit, DEFAULT_CUSTOMER_LIST_LIMIT);

  const sql = `
    SELECT c.*, u.display_name AS owner_name
    FROM customers c
    LEFT JOIN users u ON u.id = c.owner_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY c.updated_at DESC
    ${limit != null ? "LIMIT ?" : ""}
  `;
  if (limit != null) params.push(limit);
  return (await db.prepare(sql).all<Customer>(...(params as SqlValue[]))) as Customer[];
}

export async function getCustomer(id: number): Promise<Customer | null> {
  return (
    ((await getDb()
      .prepare(
        `SELECT c.*, u.display_name AS owner_name
         FROM customers c
         LEFT JOIN users u ON u.id = c.owner_id
         WHERE c.id = ?`,
      )
      .get<Customer>(id)) as Customer | undefined) ?? null
  );
}

/** Tìm KH theo SĐT (toàn hệ thống, không lọc owner) — chống trùng lead. */
export async function findCustomerByPhone(
  phone: string,
  excludeId?: number,
): Promise<Customer | null> {
  if (!isPhoneMatchable(phone)) return null;
  const rows = (await getDb()
    .prepare(
      `SELECT c.*, u.display_name AS owner_name
       FROM customers c
       LEFT JOIN users u ON u.id = c.owner_id
       WHERE c.phone IS NOT NULL AND TRIM(c.phone) != ''
       ORDER BY c.id DESC`,
    )
    .all<Customer>()) as Customer[];

  for (const row of rows) {
    if (excludeId != null && row.id === excludeId) continue;
    if (phonesMatch(phone, row.phone)) return row;
  }
  return null;
}

export type PhoneConflict = {
  id: number;
  name: string;
  phone: string;
  status: CustomerStatus;
  status_label: string;
  owner_id: number | null;
  owner_name: string;
  updated_at: string;
};

export function phoneConflictPayload(c: Customer): PhoneConflict {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    status: c.status,
    status_label: statusMeta[c.status]?.label ?? c.status,
    owner_id: c.owner_id ?? null,
    owner_name: c.owner_name?.trim() || "Sales chưa gán",
    updated_at: c.updated_at,
  };
}

async function assertPhoneAvailable(
  phone: string,
  opts?: { excludeId?: number; requirePhone?: boolean },
): Promise<void> {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) {
    if (opts?.requirePhone) {
      throw new Error("Vui lòng nhập số điện thoại để tránh trùng khách giữa các sales");
    }
    return;
  }
  if (!isPhoneMatchable(trimmed)) {
    throw new Error("Số điện thoại không hợp lệ (cần ít nhất 9 chữ số)");
  }
  const hit = await findCustomerByPhone(trimmed, opts?.excludeId);
  if (!hit) return;

  const owner = hit.owner_name?.trim() || "Sales chưa gán";
  const statusLabel = statusMeta[hit.status]?.label ?? hit.status;
  throw new Error(
    `SĐT này đã có trên hệ thống — đang do ${owner} phụ trách (KH: ${hit.name}, ${statusLabel}). ` +
      `Không tạo trùng. Liên hệ admin nếu cần chuyển khách sang bạn.`,
  );
}

function normalizeEmail(raw?: string | null): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Email tuỳ chọn — nếu có thì format tối thiểu. */
function assertEmailOptional(raw?: string | null) {
  const email = normalizeEmail(raw);
  if (!email) return "";
  // đủ lỏng: a@b.c
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email không hợp lệ");
  }
  return email;
}

export async function createCustomer(input: {
  name: string;
  source?: string;
  phone?: string;
  email?: string;
  company?: string;
  short_name?: string;
  region?: string;
  status?: CustomerStatus;
  note?: string;
  owner_id: number;
}): Promise<Customer> {
  const db = getDb();
  const phone = (input.phone ?? "").trim();
  // Bắt buộc SĐT khi tạo mới để chống trùng lead giữa sales
  await assertPhoneAvailable(phone, { requirePhone: true });
  const email = assertEmailOptional(input.email);
  const company = (input.company ?? "").trim();

  const ts = nowLocal();
  const info = await db
    .prepare(
      `INSERT INTO customers (name, source, phone, email, company, short_name, region, status, note, owner_id, created_at, updated_at)
       VALUES (@name, @source, @phone, @email, @company, @short_name, @region, @status, @note, @owner_id, @ts, @ts)`,
    )
    .run({
      name: input.name.trim(),
      source: (input.source ?? "").trim(),
      phone,
      email,
      company,
      short_name: (input.short_name ?? "").trim(),
      region: (input.region ?? "").trim(),
      status: input.status ?? "consulting",
      note: (input.note ?? "").trim(),
      owner_id: input.owner_id,
      ts,
    } as unknown as SqlValue);
  return (await getCustomer(Number(info.lastInsertRowid)))!;
}

export async function updateCustomerStatus(id: number, status: CustomerStatus) {
  await getDb()
    .prepare("UPDATE customers SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, nowLocal(), id);
  return await getCustomer(id);
}

type QuotedProductSummary = {
  id: number;
  product_id: number | null;
  product_code: string;
  product_name: string;
  image_path: string;
  quote_count: number;
  total_m2: number;
  last_quoted_at: string | null;
  sample_sent: boolean;
  sample_sent_at: string | null;
  source: "manual" | "quote";
  retail_price: number;
  total_stock: number;
};

type CustomerDetail = {
  customer: Customer;
  quotes: Array<Quote & { items: QuoteItem[] }>;
  orders: Order[];
  notes: Note[];
  quotedProducts: QuotedProductSummary[];
  stats: {
    quote_count: number;
    order_count: number;
    note_count: number;
    mapping_count: number;
    debt: number;
    total_order_amount: number;
    total_paid: number;
  };
};

/** Hồ sơ KH: BG (+items), đơn, ghi chú, SP đã từng báo (gộp). */
export async function getCustomerDetail(id: number): Promise<CustomerDetail | null> {
  const customer = await getCustomer(id);
  if (!customer) return null;

  const [quotes, orders, notes, debtDetail, mappingCount] = await Promise.all([
    listQuotesForCustomer(null, id),
    listOrdersForCustomer(null, id),
    listNotes(100, null, id),
    getCustomerDebtDetail(id, null),
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM customer_mappings WHERE customer_id = ?")
      .get<{ n: number }>(id),
  ]);
  const itemsByQuote = await getQuoteItemsForQuotes(quotes.map((q) => q.id));
  const quotesWithItems = quotes.map((q) => ({
    ...q,
    items: itemsByQuote.get(q.id) ?? [],
  }));

  const quotedProducts = (await getDb()
    .prepare(
      `SELECT
        cps.id AS id,
        cps.product_id AS product_id,
        cps.product_code AS product_code,
        cps.product_name AS product_name,
        cps.sample_sent AS sample_sent,
        cps.sample_sent_at AS sample_sent_at,
        cps.source AS source,
        COALESCE(
          (SELECT path FROM product_images pi
           WHERE pi.product_id = cps.product_id
           ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.id ASC
           LIMIT 1),
          p.image_path,
          ''
        ) AS image_path,
        COALESCE(qs.quote_count, 0) AS quote_count,
        COALESCE(qs.total_m2, 0) AS total_m2,
        qs.last_quoted_at AS last_quoted_at,
        COALESCE(p.retail_price, 0) AS retail_price,
        COALESCE(stk.total_stock, 0) AS total_stock
       FROM customer_product_samples cps
       LEFT JOIN products p ON p.id = cps.product_id
       LEFT JOIN (
         SELECT
           qi.product_id AS product_id,
           COUNT(DISTINCT qi.quote_id) AS quote_count,
           SUM(qi.quantity_m2) AS total_m2,
           MAX(q.created_at) AS last_quoted_at
         FROM quote_items qi
         JOIN quotes q ON q.id = qi.quote_id
         WHERE q.customer_id = ?
         GROUP BY qi.product_id
       ) qs ON qs.product_id = cps.product_id
       LEFT JOIN (
         SELECT pic.product_id AS product_id, SUM(inv.quantity_stock) AS total_stock
         FROM product_internal_codes pic
         LEFT JOIN inventory inv ON inv.internal_code = pic.internal_code
         GROUP BY pic.product_id
       ) stk ON stk.product_id = cps.product_id
       WHERE cps.customer_id = ?
       ORDER BY
         COALESCE(qs.last_quoted_at, cps.created_at) DESC,
         cps.product_code ASC`,
    )
    .all<Omit<QuotedProductSummary, "sample_sent"> & { sample_sent: number }>(id, id)) as Array<
    Omit<QuotedProductSummary, "sample_sent"> & { sample_sent: number }
  >;
  const normalizedQuotedProducts: QuotedProductSummary[] = quotedProducts.map((r) => ({
    ...r,
    sample_sent: Boolean(r.sample_sent),
  }));

  return {
    customer,
    quotes: quotesWithItems,
    orders,
    notes,
    quotedProducts: normalizedQuotedProducts,
    stats: {
      quote_count: quotes.length,
      order_count: orders.length,
      note_count: notes.length,
      mapping_count: (mappingCount as { n: number }).n,
      debt: debtDetail?.debt ?? 0,
      total_order_amount: debtDetail?.total_order_amount ?? 0,
      total_paid: debtDetail?.total_paid ?? 0,
    },
  };
}

/** Add sản phẩm tay (không qua báo giá) vào tab "SP đã báo" — chọn từ danh mục có sẵn. */
export async function addManualCustomerProduct(input: {
  customer_id: number;
  product_id: number;
}): Promise<QuotedProductSummary> {
  const db = getDb();
  if (!(await getCustomer(input.customer_id))) {
    throw new Error("Không tìm thấy khách hàng");
  }
  const product = await getProduct(input.product_id);
  if (!product) throw new Error("Không tìm thấy sản phẩm");

  const existing = (await db
    .prepare("SELECT id FROM customer_product_samples WHERE customer_id = ? AND product_id = ?")
    .get<{ id: number }>(input.customer_id, input.product_id)) as { id: number } | undefined;

  let rowId: number;
  if (existing) {
    rowId = existing.id;
  } else {
    const info = await db
      .prepare(
        `INSERT INTO customer_product_samples
          (customer_id, product_id, product_code, product_name, sample_sent, source, created_at)
         VALUES (?, ?, ?, ?, 0, 'manual', ?)`,
      )
      .run(input.customer_id, product.id, product.code, product.name, nowLocal());
    rowId = Number(info.lastInsertRowid);
  }

  const row = (await db
    .prepare(
      `SELECT cps.id AS id, cps.product_id AS product_id, cps.product_code AS product_code,
        cps.product_name AS product_name, cps.sample_sent AS sample_sent,
        cps.sample_sent_at AS sample_sent_at, cps.source AS source,
        COALESCE(
          (SELECT path FROM product_images pi WHERE pi.product_id = cps.product_id
           ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.id ASC LIMIT 1),
          p.image_path, ''
        ) AS image_path,
        0 AS quote_count, 0 AS total_m2, NULL AS last_quoted_at
       FROM customer_product_samples cps
       LEFT JOIN products p ON p.id = cps.product_id
       WHERE cps.id = ?`,
    )
    .get<Omit<QuotedProductSummary, "sample_sent"> & { sample_sent: number }>(rowId)) as Omit<
    QuotedProductSummary,
    "sample_sent"
  > & {
    sample_sent: number;
  };
  return { ...row, sample_sent: Boolean(row.sample_sent) };
}

/** Lấy customer_id của 1 dòng customer_product_samples (để check quyền truy cập trước khi tick). */
export async function getCustomerProductSampleCustomerId(id: number): Promise<number | null> {
  const row = (await getDb()
    .prepare("SELECT customer_id FROM customer_product_samples WHERE id = ?")
    .get<{ customer_id: number }>(id)) as { customer_id: number } | undefined;
  return row?.customer_id ?? null;
}

/** Tick/bỏ tick "Đã gửi mẫu" cho 1 dòng SP đã báo — áp dụng chung cho cả SP add tay và SP từ báo giá. */
export async function setCustomerProductSampleSent(
  id: number,
  sent: boolean,
): Promise<{ ok: true }> {
  const db = getDb();
  const existing = await db.prepare("SELECT id FROM customer_product_samples WHERE id = ?").get(id);
  if (!existing) throw new Error("Không tìm thấy dòng sản phẩm");
  await db
    .prepare("UPDATE customer_product_samples SET sample_sent = ?, sample_sent_at = ? WHERE id = ?")
    .run(sent ? 1 : 0, sent ? nowLocal() : null, id);
  return { ok: true };
}

/**
 * Xóa 1 dòng SP đã báo (add tay hoặc từ báo giá) khỏi tab "SP đã báo" của KH.
 * Lưu ý: nếu dòng có source='quote' và sản phẩm đó vẫn còn trong 1 báo giá của KH,
 * lần sau báo giá được lưu lại (create/update) dòng này sẽ được thêm lại tự động.
 */
export async function deleteCustomerProductSample(id: number): Promise<{ ok: true }> {
  const db = getDb();
  const existing = await db.prepare("SELECT id FROM customer_product_samples WHERE id = ?").get(id);
  if (!existing) throw new Error("Không tìm thấy dòng sản phẩm");
  await db.prepare("DELETE FROM customer_product_samples WHERE id = ?").run(id);
  return { ok: true };
}

// ─── Customer mappings (mapping mẫu gạch theo KH) ──────────────

/** Căn cứ giá in trên đề xuất vật liệu. */
export type MappingPriceBasis = "retail" | "tp" | "b2b";

/** Chuẩn hóa giá trị basis đọc từ DB / client. */
export function normalizeMappingPriceBasis(value: unknown): MappingPriceBasis {
  return value === "tp" || value === "b2b" ? value : "retail";
}

export type CustomerMappingItem = {
  id: number;
  mapping_id: number;
  sort_order: number;
  area_group_key: string;
  description: string;
  size: string;
  product_id: number | null;
  image_path: string;
  custom_product_code: string;
  custom_product_name: string;
  custom_product_size: string;
  custom_product_surface: string;
  custom_product_retail_price: number;
  custom_product_image_path: string;
  /** null = tính theo price_basis của mapping; số = giá chốt tay (đ/m²). */
  price_override: number | null;
};

export type CustomerMapping = {
  id: number;
  code: string;
  customer_id: number;
  status: "draft" | "sent" | "accepted" | "expired";
  name: string;
  version: string;
  note: string;
  price_basis: MappingPriceBasis;
  created_at: string;
  updated_at: string;
  linked_quotes: Array<{ id: number; code: string; status: QuoteStatus }>;
  items: CustomerMappingItem[];
};

export async function listCustomerMappings(customerId: number): Promise<CustomerMapping[]> {
  const db = getDb();
  const maps = (await db
    .prepare(
      "SELECT * FROM customer_mappings WHERE customer_id = ? ORDER BY updated_at DESC, id DESC",
    )
    .all<{
      id: number;
      code: string;
      customer_id: number;
      status: "draft" | "sent" | "accepted" | "expired";
      name: string;
      version: string;
      note: string;
      price_basis: string;
      created_at: string;
      updated_at: string;
    }>(customerId)) as Array<{
    id: number;
    code: string;
    customer_id: number;
    status: "draft" | "sent" | "accepted" | "expired";
    name: string;
    version: string;
    note: string;
    price_basis: string;
    created_at: string;
    updated_at: string;
  }>;
  const items = (await db
    .prepare(
      `SELECT * FROM customer_mapping_items
       WHERE mapping_id IN (SELECT id FROM customer_mappings WHERE customer_id = ?)
       ORDER BY mapping_id, sort_order, id`,
    )
    .all<CustomerMappingItem>(customerId)) as CustomerMappingItem[];
  const links = (await db
    .prepare(
      `SELECT l.mapping_id, q.id, q.code, q.status
       FROM customer_mapping_quote_links l
       JOIN quotes q ON q.id = l.quote_id
       WHERE l.mapping_id IN (
         SELECT id FROM customer_mappings WHERE customer_id = ?
       ) ORDER BY l.created_at DESC`,
    )
    .all<{
      mapping_id: number;
      id: number;
      code: string;
      status: QuoteStatus;
    }>(customerId)) as Array<{
    mapping_id: number;
    id: number;
    code: string;
    status: QuoteStatus;
  }>;
  return maps.map((m) => ({
    ...m,
    price_basis: normalizeMappingPriceBasis(m.price_basis),
    linked_quotes: links
      .filter((link) => link.mapping_id === m.id)
      .map(({ id, code, status }) => ({ id, code, status })),
    items: items.filter((it) => it.mapping_id === m.id),
  }));
}

export async function getCustomerMappingCustomerId(mappingId: number): Promise<number | null> {
  const row = (await getDb()
    .prepare("SELECT customer_id FROM customer_mappings WHERE id = ?")
    .get<{ customer_id: number }>(mappingId)) as { customer_id: number } | undefined;
  return row?.customer_id ?? null;
}

export async function createQuoteFromCustomerMapping(mappingId: number): Promise<Quote> {
  const db = getDb();
  const mapping = (await db.prepare("SELECT * FROM customer_mappings WHERE id = ?").get<{
    id: number;
    customer_id: number;
    name: string;
    note: string;
  }>(mappingId)) as { id: number; customer_id: number; name: string; note: string } | undefined;
  if (!mapping) throw new Error("Không tìm thấy đề xuất vật liệu");

  const items = (await db
    .prepare(
      `SELECT product_id, description, size, custom_product_name
       FROM customer_mapping_items WHERE mapping_id = ?
       ORDER BY sort_order, id`,
    )
    .all<{
      product_id: number | null;
      description: string;
      size: string;
      custom_product_name: string;
    }>(mappingId)) as Array<{
    product_id: number | null;
    description: string;
    size: string;
    custom_product_name: string;
  }>;
  const customCount = items.filter(
    (item) => !item.product_id && item.custom_product_name.trim(),
  ).length;
  if (customCount) {
    throw new Error(
      `Có ${customCount} sản phẩm ngoài danh mục. Hãy thêm sản phẩm vào database trước khi chuyển thành báo giá.`,
    );
  }
  const catalogItems = items.filter(
    (item): item is typeof item & { product_id: number } => item.product_id != null,
  );
  if (!catalogItems.length) {
    throw new Error("Đề xuất chưa có sản phẩm trong danh mục để tạo báo giá");
  }
  const quote = await createQuote({
    customer_id: mapping.customer_id,
    discount_type: "custom",
    prices_include_vat: true,
    notes: [mapping.name ? `Từ đề xuất vật liệu: ${mapping.name}` : "", mapping.note]
      .filter(Boolean)
      .join("\n"),
    items: catalogItems.map((item) => ({
      product_id: item.product_id,
      quantity_m2: 0,
      discount_pct: 0,
      area: item.size || item.description,
    })),
  });
  await db
    .prepare(
      `INSERT OR IGNORE INTO customer_mapping_quote_links (mapping_id, quote_id)
       VALUES (?, ?)`,
    )
    .run(mappingId, quote.id);
  return quote;
}

function isMappingUploadPath(publicPath: string) {
  return publicPath.startsWith("/images/");
}

/** Xóa file ảnh mapping không còn được item nào tham chiếu. */
async function deleteOrphanMappingImages(oldPaths: string[]) {
  if (!oldPaths.length) return;
  const db = getDb();
  const used = new Set(
    (
      (await db
        .prepare(
          `SELECT image_path FROM customer_mapping_items WHERE image_path != ''
           UNION ALL
           SELECT custom_product_image_path AS image_path FROM customer_mapping_items
           WHERE custom_product_image_path != ''`,
        )
        .all<{ image_path: string }>()) as Array<{ image_path: string }>
    ).map((r) => r.image_path),
  );
  for (const p of oldPaths) {
    if (!isMappingUploadPath(p) || used.has(p)) continue;
    if (await isPublicImagePathReferenced(db, p)) continue;
    try {
      const filePath = path.join(process.cwd(), "public", p.replace(/^\//, ""));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    } catch {
      /* ignore */
    }
  }
}

/** Tạo mới hoặc cập nhật mapping (xóa + chèn lại items). */
export async function saveCustomerMapping(input: {
  id?: number;
  customer_id: number;
  name?: string;
  version?: string;
  note?: string;
  price_basis?: string;
  items?: Array<{
    description?: string;
    size?: string;
    product_id?: number | null;
    image_path?: string;
    sort_order?: number;
    area_group_key?: string;
    custom_product_code?: string;
    custom_product_name?: string;
    custom_product_size?: string;
    custom_product_surface?: string;
    custom_product_retail_price?: number;
    custom_product_image_path?: string;
    price_override?: number | null;
  }>;
}): Promise<CustomerMapping> {
  const db = getDb();
  const customer = await db.prepare("SELECT id FROM customers WHERE id = ?").get(input.customer_id);
  if (!customer) throw new Error("Không tìm thấy khách hàng");
  const priceBasis = normalizeMappingPriceBasis(input.price_basis);

  const runTx = db.transaction(async () => {
    let mappingId = input.id ?? 0;
    let oldPaths: string[] = [];

    if (mappingId) {
      const existing = (await db
        .prepare("SELECT id FROM customer_mappings WHERE id = ?")
        .get<{ id: number }>(mappingId)) as { id: number } | undefined;
      if (!existing) throw new Error("Không tìm thấy mapping");
      oldPaths = (
        (await db
          .prepare(
            `SELECT image_path, custom_product_image_path
             FROM customer_mapping_items WHERE mapping_id = ?`,
          )
          .all<{
            image_path: string;
            custom_product_image_path: string;
          }>(mappingId)) as Array<{
          image_path: string;
          custom_product_image_path: string;
        }>
      ).flatMap((r) => [r.image_path, r.custom_product_image_path]);
      await db
        .prepare(
          `UPDATE customer_mappings SET name = ?, version = ?, note = ?, price_basis = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
        )
        .run(
          input.name ?? "",
          input.version?.trim() || "01",
          input.note ?? "",
          priceBasis,
          mappingId,
        );
      await db.prepare("DELETE FROM customer_mapping_items WHERE mapping_id = ?").run(mappingId);
    } else {
      const fullCustomer = (await db
        .prepare("SELECT name, company, short_name FROM customers WHERE id = ?")
        .get<{
          name: string;
          company: string;
          short_name: string;
        }>(input.customer_id)) as {
        name: string;
        company: string;
        short_name: string;
      };
      const code = await buildEntityCode("DXVL", "customer_mappings", fullCustomer);
      const info = await db
        .prepare(
          `INSERT INTO customer_mappings (code, customer_id, name, version, note, price_basis)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          code,
          input.customer_id,
          input.name ?? "",
          input.version?.trim() || "01",
          input.note ?? "",
          priceBasis,
        );
      mappingId = Number(info.lastInsertRowid);
    }

    const insItem = db.prepare(
      `INSERT INTO customer_mapping_items
         (mapping_id, sort_order, area_group_key, description, size, product_id, image_path,
          custom_product_code, custom_product_name, custom_product_size,
          custom_product_surface, custom_product_retail_price, custom_product_image_path,
          price_override)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [i, it] of (input.items ?? []).entries()) {
      const override =
        it.price_override == null || !Number.isFinite(Number(it.price_override))
          ? null
          : Math.max(0, Math.round(Number(it.price_override)));
      await insItem.run(
        mappingId,
        it.sort_order ?? i,
        it.area_group_key || `area-${i + 1}`,
        it.description ?? "",
        it.size ?? "",
        it.product_id ?? null,
        it.image_path ?? "",
        it.custom_product_code ?? "",
        it.custom_product_name ?? "",
        it.custom_product_size ?? "",
        it.custom_product_surface ?? "",
        Math.max(0, Number(it.custom_product_retail_price) || 0),
        it.custom_product_image_path ?? "",
        override,
      );
    }

    await deleteOrphanMappingImages(oldPaths);
    return mappingId;
  });

  const id = await runTx();
  const all = await listCustomerMappings(input.customer_id);
  return all.find((m) => m.id === id)!;
}

export async function deleteCustomerMapping(mappingId: number): Promise<{ ok: true }> {
  const db = getDb();
  const items = (await db
    .prepare(
      `SELECT image_path, custom_product_image_path
       FROM customer_mapping_items WHERE mapping_id = ?`,
    )
    .all<{
      image_path: string;
      custom_product_image_path: string;
    }>(mappingId)) as Array<{
    image_path: string;
    custom_product_image_path: string;
  }>;
  const existing = await db.prepare("SELECT id FROM customer_mappings WHERE id = ?").get(mappingId);
  if (!existing) throw new Error("Không tìm thấy mapping");
  await db.prepare("DELETE FROM customer_mappings WHERE id = ?").run(mappingId);
  for (const image_path of items.flatMap((item) => [
    item.image_path,
    item.custom_product_image_path,
  ])) {
    if (!isMappingUploadPath(image_path)) continue;
    if (await isPublicImagePathReferenced(db, image_path)) continue;
    try {
      const filePath = path.join(process.cwd(), "public", image_path.replace(/^\//, ""));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    } catch {
      /* ignore */
    }
  }
  return { ok: true };
}

/** Lưu ảnh khu vực mapping vào public/images theo hash nội dung. */
export async function uploadMappingImageFile(input: {
  filename: string;
  dataBase64: string;
  mimeType?: string;
}): Promise<{ path: string }> {
  let b64 = input.dataBase64;
  const dataUrlMatch = b64.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) b64 = dataUrlMatch[2]!;
  const rawBuf = Buffer.from(b64, "base64");
  if (rawBuf.length > 12 * 1024 * 1024) {
    throw new Error("Ảnh quá lớn (tối đa 12MB)");
  }

  const normalized = await normalizeUploadImageBuffer(rawBuf);
  return { path: await saveManagedImage(normalized, ".webp") };
}

/**
 * Xóa KH + toàn bộ liên quan (báo giá/dòng BG, đơn hàng, thanh toán/công nợ, ghi chú).
 * Gọi trong transaction; explicit delete để chắc chắn kể cả khi FK cascade yếu.
 */
export async function deleteCustomer(id: number): Promise<{
  ok: true;
  name: string;
  quotes: number;
  orders: number;
  payments: number;
  notes: number;
}> {
  const existing = await getCustomer(id);
  if (!existing) throw new Error("Không tìm thấy khách hàng");

  const db = getDb();
  const quotes = (
    (await db
      .prepare("SELECT COUNT(*) AS n FROM quotes WHERE customer_id = ?")
      .get<{ n: number }>(id)) as { n: number }
  ).n;
  const orders = (
    (await db
      .prepare("SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?")
      .get<{ n: number }>(id)) as { n: number }
  ).n;
  const payments = (
    (await db
      .prepare("SELECT COUNT(*) AS n FROM payments WHERE customer_id = ?")
      .get<{ n: number }>(id)) as { n: number }
  ).n;
  const notes = (
    (await db
      .prepare("SELECT COUNT(*) AS n FROM notes WHERE customer_id = ?")
      .get<{ n: number }>(id)) as { n: number }
  ).n;

  const runTx = db.transaction(async () => {
    // quote_items CASCADE theo quotes; xóa quotes trước khi orders (orders.quote_id SET NULL)
    await db
      .prepare(
        `DELETE FROM quote_items WHERE quote_id IN (
         SELECT id FROM quotes WHERE customer_id = ?
       )`,
      )
      .run(id);
    await db.prepare("DELETE FROM payments WHERE customer_id = ?").run(id);
    await db.prepare("DELETE FROM orders WHERE customer_id = ?").run(id);
    await db.prepare("DELETE FROM quotes WHERE customer_id = ?").run(id);
    await db.prepare("DELETE FROM notes WHERE customer_id = ?").run(id);
    await db.prepare("DELETE FROM customers WHERE id = ?").run(id);
  });
  await runTx();

  return {
    ok: true,
    name: existing.name,
    quotes,
    orders,
    payments,
    notes,
  };
}

export async function updateCustomer(
  id: number,
  input: {
    name?: string;
    source?: string;
    phone?: string;
    email?: string;
    company?: string;
    short_name?: string;
    region?: string;
    status?: CustomerStatus;
    note?: string;
  },
): Promise<Customer> {
  const existing = await getCustomer(id);
  if (!existing) throw new Error("Không tìm thấy khách hàng");
  const name = (input.name ?? existing.name).trim();
  if (!name) throw new Error("Tên khách hàng bắt buộc");

  const phone = input.phone !== undefined ? input.phone.trim() : (existing.phone ?? "").trim();
  // Đổi SĐT → vẫn chặn trùng với KH khác; giữ SĐT cũ thì bỏ qua
  if (input.phone !== undefined) {
    await assertPhoneAvailable(phone, {
      excludeId: id,
      requirePhone: true,
    });
  }

  const email =
    input.email !== undefined
      ? assertEmailOptional(input.email)
      : normalizeEmail(existing.email ?? "");
  const company =
    input.company !== undefined ? input.company.trim() : (existing.company ?? "").trim();

  const shortName =
    input.short_name !== undefined ? input.short_name.trim() : (existing.short_name ?? "").trim();

  await getDb()
    .prepare(
      `UPDATE customers SET
        name = ?, source = ?, phone = ?, email = ?, company = ?, short_name = ?, region = ?,
        status = ?, note = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      name,
      (input.source ?? existing.source).trim(),
      phone,
      email,
      company,
      shortName,
      (input.region ?? existing.region).trim(),
      input.status ?? existing.status,
      (input.note ?? existing.note).trim(),
      nowLocal(),
      id,
    );
  return (await getCustomer(id))!;
}

// ─── Quotes ─────────────────────────────────────────────────

type ListQuotesOptions = {
  search?: string;
  statuses?: QuoteStatus[];
  /** Mặc định DEFAULT_QUOTE_LIST_LIMIT; <=0 = không LIMIT (detail/dashboard). */
  limit?: number;
};

export async function listQuotes(
  ownerId?: number | null,
  opts?: ListQuotesOptions,
): Promise<Quote[]> {
  return listQuotesForCustomer(ownerId, null, opts);
}

async function listQuotesForCustomer(
  ownerId?: number | null,
  customerId?: number | null,
  opts?: ListQuotesOptions,
): Promise<Quote[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (ownerId != null) {
    where.push("c.owner_id = ?");
    params.push(ownerId);
  }
  if (customerId != null) {
    where.push("q.customer_id = ?");
    params.push(customerId);
  }
  const statuses = (opts?.statuses ?? []).filter(Boolean);
  if (statuses.length === 1) {
    where.push("q.status = ?");
    params.push(statuses[0]);
  } else if (statuses.length > 1) {
    where.push(`q.status IN (${statuses.map(() => "?").join(", ")})`);
    params.push(...statuses);
  }
  const q = opts?.search?.trim();
  if (q) {
    where.push(
      `(q.code ILIKE ? OR q.notes ILIKE ? OR c.name ILIKE ? OR c.source ILIKE ? OR c.phone ILIKE ?)`,
    );
    const pat = likePattern(q);
    params.push(pat, pat, pat, pat, pat);
  }

  // Detail 1 KH / dashboard: không cắt; list trang: trần mặc định.
  const limit =
    customerId != null
      ? clampListLimit(opts?.limit ?? 0, DEFAULT_QUOTE_LIST_LIMIT)
      : clampListLimit(opts?.limit, DEFAULT_QUOTE_LIST_LIMIT);

  return (await db
    .prepare(
      `SELECT q.*,
        c.name AS customer_name,
        c.source AS customer_source,
        COALESCE(qi.amount, 0) AS amount,
        COALESCE(qi.items_count, 0) AS items_count
       FROM quotes q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN (
         SELECT quote_id,
           SUM(line_total) AS amount,
           COUNT(*) AS items_count
         FROM quote_items
         GROUP BY quote_id
       ) qi ON qi.quote_id = q.id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY q.created_at DESC
       ${limit != null ? "LIMIT ?" : ""}`,
    )
    .all<Quote>(...(limit != null ? [...params, limit] : params) as SqlValue[])) as Quote[];
}

async function getQuoteItemsForQuotes(quoteIds: number[]): Promise<Map<number, QuoteItem[]>> {
  const itemsByQuote = new Map<number, QuoteItem[]>();
  if (quoteIds.length === 0) return itemsByQuote;
  const placeholders = quoteIds.map(() => "?").join(", ");
  const rows = (await getDb()
    .prepare(
      `SELECT * FROM quote_items
       WHERE quote_id IN (${placeholders})
       ORDER BY quote_id, id`,
    )
    .all<QuoteItem>(...quoteIds)) as QuoteItem[];
  for (const item of rows) {
    const items = itemsByQuote.get(item.quote_id) ?? [];
    items.push(item);
    itemsByQuote.set(item.quote_id, items);
  }
  return itemsByQuote;
}

export async function getQuote(id: number): Promise<Quote | null> {
  return (
    ((await getDb()
      .prepare(
        `SELECT q.*,
          c.name AS customer_name,
          c.source AS customer_source,
          c.owner_id AS customer_owner_id,
          COALESCE((SELECT SUM(line_total) FROM quote_items qi WHERE qi.quote_id = q.id), 0) AS amount,
          COALESCE((SELECT COUNT(*) FROM quote_items qi WHERE qi.quote_id = q.id), 0) AS items_count
         FROM quotes q
         JOIN customers c ON c.id = q.customer_id
         WHERE q.id = ?`,
      )
      .get<Quote>(id)) as Quote | undefined) ?? null
  );
}

export async function getQuoteItems(quoteId: number): Promise<QuoteItem[]> {
  return (await getDb()
    .prepare("SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id")
    .all<QuoteItem>(quoteId)) as QuoteItem[];
}

function resolveQuoteItemPricing(
  product: Product,
  discountType: DiscountType,
  item: {
    discount_pct?: number;
    unit_price?: number | null;
  },
): { unit: number; discountPct: number } {
  // Ưu tiên đơn giá nhập tay từ form
  if (
    item.unit_price != null &&
    Number.isFinite(Number(item.unit_price)) &&
    Number(item.unit_price) >= 0
  ) {
    const unit = Math.round(Number(item.unit_price));
    const discountPct =
      item.discount_pct != null && Number.isFinite(Number(item.discount_pct))
        ? Number(item.discount_pct)
        : effectiveDiscountPct(product.retail_price, unit);
    return { unit, discountPct };
  }

  let discountPct = item.discount_pct;
  if (discountPct == null) {
    if (discountType === "tp") discountPct = product.discount_tp ?? 0;
    else if (discountType === "b2b") discountPct = product.discount_b2b ?? 0;
    else discountPct = 0;
  }

  const unit = unitPriceForProduct(
    product,
    discountType,
    discountType === "custom" ? discountPct : undefined,
  );
  return { unit, discountPct: discountPct ?? 0 };
}

/** Upsert 1 dòng customer_product_samples khi sản phẩm xuất hiện trong báo giá (source='quote'). */
async function upsertCustomerProductSampleFromQuote(
  db: ReturnType<typeof getDb>,
  customerId: number,
  productId: number,
  productCode: string,
  productName: string,
) {
  const existing = (await db
    .prepare("SELECT id FROM customer_product_samples WHERE customer_id = ? AND product_id = ?")
    .get<{ id: number }>(customerId, productId)) as { id: number } | undefined;
  if (existing) {
    await db
      .prepare(
        "UPDATE customer_product_samples SET product_code = ?, product_name = ? WHERE id = ?",
      )
      .run(productCode, productName, existing.id);
  } else {
    await db
      .prepare(
        `INSERT INTO customer_product_samples
        (customer_id, product_id, product_code, product_name, sample_sent, source, created_at)
       VALUES (?, ?, ?, ?, 0, 'quote', ?)`,
      )
      .run(customerId, productId, productCode, productName, nowLocal());
  }
}

export async function createQuote(input: {
  customer_id: number;
  discount_type?: DiscountType;
  notes?: string;
  /** 1 = giá đã gồm VAT; 0 = chưa VAT */
  prices_include_vat?: boolean | number;
  /** Phí vận chuyển nhập tay (chưa VAT) */
  shipping_fee?: number;
  items: Array<{
    product_id: number;
    quantity_m2: number;
    discount_pct?: number;
    unit_price?: number | null;
    /** Tên hiển thị trên BG (có thể khác catalog) */
    product_name?: string;
    /** Mã hiển thị trên BG (có thể khác catalog) */
    product_code?: string;
    area?: string;
  }>;
}): Promise<Quote> {
  const db = getDb();
  const customer = await getCustomer(input.customer_id);
  if (!customer) throw new Error("Không tìm thấy khách hàng");
  if (!input.items?.length) throw new Error("Báo giá cần ít nhất 1 sản phẩm");

  const code = await buildEntityCode("QT", "quotes", customer);
  const ts = nowLocal();
  const discountType = input.discount_type ?? "custom";
  const includeVat = input.prices_include_vat ? 1 : 0;
  const shippingFee = Math.round(Number(input.shipping_fee) || 0);

  const createTx = db.transaction(async () => {
    const info = await db
      .prepare(
        `INSERT INTO quotes (code, customer_id, status, notes, discount_type, prices_include_vat, shipping_fee, created_at, updated_at)
         VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        code,
        input.customer_id,
        input.notes ?? "",
        discountType,
        includeVat,
        shippingFee,
        ts,
        ts,
      );

    const quoteId = Number(info.lastInsertRowid);
    const insertItem = db.prepare(
      `INSERT INTO quote_items (
        quote_id, product_id, product_code, product_name, size,
        quantity_m2, retail_price, discount_pct, unit_price, area, line_total
      ) VALUES (
        @quote_id, @product_id, @product_code, @product_name, @size,
        @quantity_m2, @retail_price, @discount_pct, @unit_price, @area, @line_total
      )`,
    );

    for (const item of input.items) {
      const product = await getProduct(item.product_id);
      if (!product) throw new Error(`Sản phẩm #${item.product_id} không tồn tại`);

      const { unit, discountPct } = resolveQuoteItemPricing(product, discountType, item);
      const qty = Number(item.quantity_m2) || 0;
      const lineTotal = Math.round(unit * qty);

      const productCode = (item.product_code ?? "").trim() || product.code;
      const productName = (item.product_name ?? "").trim() || product.name;

      await insertItem.run({
        quote_id: quoteId,
        product_id: product.id,
        product_code: productCode,
        product_name: productName,
        size: product.size,
        quantity_m2: qty,
        retail_price: product.retail_price,
        discount_pct: discountPct,
        unit_price: unit,
        area: item.area ?? "",
        line_total: lineTotal,
      } as unknown as SqlValue);

      await upsertCustomerProductSampleFromQuote(
        db,
        input.customer_id,
        product.id,
        productCode,
        productName,
      );
    }

    // Auto-update customer status when quoted
    if (customer.status === "consulting") {
      await db
        .prepare("UPDATE customers SET status = 'quoted', updated_at = ? WHERE id = ?")
        .run(ts, input.customer_id);
    }

    return quoteId;
  });

  const quoteId = (await createTx()) as number;
  const quote = await getQuote(quoteId);
  if (!quote) throw new Error("Không tạo được báo giá");
  return quote;
}

/** Xóa báo giá + dòng SP + đơn hàng (và thanh toán của đơn) gắn BG nếu có. */
export async function deleteQuote(id: number): Promise<{
  ok: true;
  code: string;
  customer_id: number;
  orders_deleted: number;
  payments_deleted: number;
}> {
  const quote = await getQuote(id);
  if (!quote) throw new Error("Không tìm thấy báo giá");

  const db = getDb();
  const orderIds = (
    (await db
      .prepare("SELECT id FROM orders WHERE quote_id = ?")
      .all<{ id: number }>(id)) as Array<{ id: number }>
  ).map((r) => r.id);

  let paymentsDeleted = 0;
  const runTx = db.transaction(async () => {
    for (const orderId of orderIds) {
      const info = await db.prepare("DELETE FROM payments WHERE order_id = ?").run(orderId);
      paymentsDeleted += Number(info.changes) || 0;
      await db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    }
    await db.prepare("DELETE FROM quote_items WHERE quote_id = ?").run(id);
    await db.prepare("DELETE FROM quotes WHERE id = ?").run(id);
  });
  await runTx();

  return {
    ok: true,
    code: quote.code,
    customer_id: quote.customer_id,
    orders_deleted: orderIds.length,
    payments_deleted: paymentsDeleted,
  };
}

export async function updateQuote(input: {
  id: number;
  customer_id: number;
  status?: QuoteStatus;
  discount_type?: DiscountType;
  notes?: string;
  prices_include_vat?: boolean | number;
  /** Phí vận chuyển nhập tay (chưa VAT) */
  shipping_fee?: number;
  items: Array<{
    product_id: number;
    quantity_m2: number;
    discount_pct?: number;
    unit_price?: number | null;
    product_name?: string;
    product_code?: string;
    area?: string;
  }>;
}): Promise<Quote> {
  const db = getDb();
  const existing = await getQuote(input.id);
  if (!existing) throw new Error("Không tìm thấy báo giá");
  if (existing.status === "accepted") {
    throw new Error("Báo giá đã duyệt — không thể sửa (đã tạo đơn)");
  }
  if (!(await getCustomer(input.customer_id))) {
    throw new Error("Không tìm thấy khách hàng");
  }
  if (!input.items?.length) throw new Error("Báo giá cần ít nhất 1 sản phẩm");

  const discountType = input.discount_type ?? existing.discount_type;
  const status = input.status ?? existing.status;
  const includeVat =
    input.prices_include_vat !== undefined
      ? input.prices_include_vat
        ? 1
        : 0
      : (existing.prices_include_vat ?? 0);
  const shippingFee =
    input.shipping_fee !== undefined
      ? Math.round(Number(input.shipping_fee) || 0)
      : (existing.shipping_fee ?? 0);
  const ts = nowLocal();

  const runTx = db.transaction(async () => {
    await db
      .prepare(
        `UPDATE quotes SET customer_id = ?, status = ?, notes = ?,
        discount_type = ?, prices_include_vat = ?, shipping_fee = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        input.customer_id,
        status,
        input.notes ?? existing.notes,
        discountType,
        includeVat,
        shippingFee,
        ts,
        input.id,
      );

    await db.prepare("DELETE FROM quote_items WHERE quote_id = ?").run(input.id);

    const insertItem = db.prepare(
      `INSERT INTO quote_items (
        quote_id, product_id, product_code, product_name, size,
        quantity_m2, retail_price, discount_pct, unit_price, area, line_total
      ) VALUES (
        @quote_id, @product_id, @product_code, @product_name, @size,
        @quantity_m2, @retail_price, @discount_pct, @unit_price, @area, @line_total
      )`,
    );

    for (const item of input.items) {
      const product = await getProduct(item.product_id);
      if (!product) {
        throw new Error(`Sản phẩm #${item.product_id} không tồn tại`);
      }

      const { unit, discountPct } = resolveQuoteItemPricing(product, discountType, item);
      const qty = Number(item.quantity_m2) || 0;
      const lineTotal = Math.round(unit * qty);
      const productCode = (item.product_code ?? "").trim() || product.code;
      const productName = (item.product_name ?? "").trim() || product.name;

      await insertItem.run({
        quote_id: input.id,
        product_id: product.id,
        product_code: productCode,
        product_name: productName,
        size: product.size,
        quantity_m2: qty,
        retail_price: product.retail_price,
        discount_pct: discountPct,
        unit_price: unit,
        area: item.area ?? "",
        line_total: lineTotal,
      } as unknown as SqlValue);

      await upsertCustomerProductSampleFromQuote(
        db,
        input.customer_id,
        product.id,
        productCode,
        productName,
      );
    }
  });

  await runTx();
  const quote = await getQuote(input.id);
  if (!quote) throw new Error("Không cập nhật được báo giá");
  return quote;
}

// ─── Orders ─────────────────────────────────────────────────

type ListOrdersOptions = {
  search?: string;
  statuses?: OrderStatus[];
  /** Mặc định DEFAULT_ORDER_LIST_LIMIT; <=0 = không LIMIT (detail/dashboard). */
  limit?: number;
};

export async function listOrders(
  ownerId?: number | null,
  opts?: ListOrdersOptions,
): Promise<Order[]> {
  return listOrdersForCustomer(ownerId, null, opts);
}

async function listOrdersForCustomer(
  ownerId?: number | null,
  customerId?: number | null,
  opts?: ListOrdersOptions,
): Promise<Order[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (ownerId != null) {
    where.push("c.owner_id = ?");
    params.push(ownerId);
  }
  if (customerId != null) {
    where.push("o.customer_id = ?");
    params.push(customerId);
  }
  const statuses = (opts?.statuses ?? []).filter(Boolean);
  if (statuses.length === 1) {
    where.push("o.status = ?");
    params.push(statuses[0]);
  } else if (statuses.length > 1) {
    where.push(`o.status IN (${statuses.map(() => "?").join(", ")})`);
    params.push(...statuses);
  }
  const q = opts?.search?.trim();
  if (q) {
    where.push(
      `(o.code ILIKE ? OR o.notes ILIKE ? OR c.name ILIKE ? OR c.source ILIKE ? OR c.phone ILIKE ?)`,
    );
    const pat = likePattern(q);
    params.push(pat, pat, pat, pat, pat);
  }

  const limit =
    customerId != null
      ? clampListLimit(opts?.limit ?? 0, DEFAULT_ORDER_LIST_LIMIT)
      : clampListLimit(opts?.limit, DEFAULT_ORDER_LIST_LIMIT);

  return (await getDb()
    .prepare(
      `SELECT o.*,
        c.name AS customer_name,
        c.source AS customer_source,
        COALESCE(pay.paid_amount, 0) AS paid_amount
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       LEFT JOIN (
         SELECT order_id, SUM(amount) AS paid_amount
         FROM payments
         GROUP BY order_id
       ) pay ON pay.order_id = o.id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY o.created_at DESC
       ${limit != null ? "LIMIT ?" : ""}`,
    )
    .all<Order>(...(limit != null ? [...params, limit] : params) as SqlValue[])) as Order[];
}

async function createOrder(input: {
  customer_id: number;
  amount: number;
  quote_id?: number | null;
  status?: OrderStatus;
  notes?: string;
  shipping_fee?: number;
}): Promise<Order> {
  const db = getDb();
  const customer = await getCustomer(input.customer_id);
  if (!customer) {
    throw new Error("Không tìm thấy khách hàng");
  }
  const code = await buildEntityCode("DH", "orders", customer);
  const ts = nowLocal();
  const shippingFee = Math.round(Number(input.shipping_fee) || 0);
  const info = await db
    .prepare(
      `INSERT INTO orders (code, customer_id, quote_id, amount, status, notes, shipping_fee, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      code,
      input.customer_id,
      input.quote_id ?? null,
      Math.round(input.amount),
      input.status ?? "preparing",
      input.notes ?? "",
      shippingFee,
      ts,
      ts,
    );

  await db
    .prepare(
      "UPDATE customers SET status = CASE WHEN status IN ('consulting','quoted') THEN 'closed' ELSE status END, updated_at = ? WHERE id = ?",
    )
    .run(ts, input.customer_id);

  return (await getOrder(Number(info.lastInsertRowid)))!;
}

export async function getOrder(id: number): Promise<Order | null> {
  return (
    ((await getDb()
      .prepare(
        `SELECT o.*,
          c.name AS customer_name,
          c.source AS customer_source,
          COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id), 0) AS paid_amount
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         WHERE o.id = ?`,
      )
      .get<Order>(id)) as Order | undefined) ?? null
  );
}

export async function updateOrderStatus(id: number, status: OrderStatus): Promise<Order> {
  const existing = await getOrder(id);
  if (!existing) throw new Error("Không tìm thấy đơn hàng");
  if (!["preparing", "shipping", "delivered"].includes(status)) {
    throw new Error("Trạng thái đơn không hợp lệ");
  }
  await getDb()
    .prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, nowLocal(), id);

  return (await getOrder(id))!;
}

/** Xóa đơn + thanh toán gắn đơn (nếu có). */
export async function deleteOrder(id: number): Promise<{
  ok: true;
  code: string;
  customer_id: number;
  payments_deleted: number;
}> {
  const existing = await getOrder(id);
  if (!existing) throw new Error("Không tìm thấy đơn hàng");

  const db = getDb();
  let paymentsDeleted = 0;
  const runTx = db.transaction(async () => {
    const info = await db.prepare("DELETE FROM payments WHERE order_id = ?").run(id);
    paymentsDeleted = Number(info.changes) || 0;
    await db.prepare("DELETE FROM orders WHERE id = ?").run(id);
  });
  await runTx();

  return {
    ok: true,
    code: existing.code,
    customer_id: existing.customer_id,
    payments_deleted: paymentsDeleted,
  };
}

export async function createOrderFromQuote(quoteId: number): Promise<Order> {
  const db = getDb();
  const quote = await getQuote(quoteId);
  if (!quote) throw new Error("Không tìm thấy báo giá");
  const amount = quote.amount ?? 0;
  const order = await createOrder({
    customer_id: quote.customer_id,
    quote_id: quoteId,
    amount,
    shipping_fee: quote.shipping_fee ?? 0,
    notes: `Từ báo giá ${quote.code}`,
  });
  await db
    .prepare("UPDATE quotes SET status = 'accepted', updated_at = ? WHERE id = ?")
    .run(nowLocal(), quoteId);
  return order;
}

// ─── Payments & Debt ────────────────────────────────────────

async function listPayments(customerId?: number): Promise<Payment[]> {
  const db = getDb();
  if (customerId) {
    return (await db
      .prepare("SELECT * FROM payments WHERE customer_id = ? ORDER BY paid_at DESC")
      .all<Payment>(customerId)) as Payment[];
  }
  return (await db
    .prepare("SELECT * FROM payments ORDER BY paid_at DESC")
    .all<Payment>()) as Payment[];
}

export async function addPayment(input: {
  customer_id: number;
  amount: number;
  order_id?: number | null;
  paid_at?: string;
  note?: string;
}): Promise<Payment> {
  if (!(await getCustomer(input.customer_id))) {
    throw new Error("Không tìm thấy khách hàng");
  }
  if (!input.amount || input.amount <= 0) {
    throw new Error("Số tiền thanh toán phải > 0");
  }
  const info = await getDb()
    .prepare(
      `INSERT INTO payments (customer_id, order_id, amount, paid_at, note)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.customer_id,
      input.order_id ?? null,
      Math.round(input.amount),
      input.paid_at ?? nowLocal(),
      input.note ?? "",
    );
  return (await getDb()
    .prepare("SELECT * FROM payments WHERE id = ?")
    .get<Payment>(Number(info.lastInsertRowid))) as Payment;
}

export async function getPayment(id: number): Promise<Payment | null> {
  return (
    ((await getDb().prepare("SELECT * FROM payments WHERE id = ?").get<Payment>(id)) as
      Payment | undefined) ?? null
  );
}

export async function updatePayment(
  id: number,
  input: {
    amount?: number;
    order_id?: number | null;
    paid_at?: string;
    note?: string;
  },
): Promise<Payment> {
  const db = getDb();
  const existing = await getPayment(id);
  if (!existing) throw new Error("Không tìm thấy thanh toán");

  const amount = input.amount !== undefined ? Math.round(input.amount) : existing.amount;
  if (!amount || amount <= 0) {
    throw new Error("Số tiền thanh toán phải > 0");
  }
  const orderId = input.order_id !== undefined ? input.order_id : existing.order_id;
  const paidAt =
    input.paid_at !== undefined && input.paid_at.trim() ? input.paid_at : existing.paid_at;
  const note = input.note !== undefined ? input.note : existing.note;

  await db
    .prepare("UPDATE payments SET amount = ?, order_id = ?, paid_at = ?, note = ? WHERE id = ?")
    .run(amount, orderId ?? null, paidAt, note, id);

  return (await getPayment(id))!;
}

export async function deletePayment(id: number): Promise<{ ok: true; customer_id: number }> {
  const existing = await getPayment(id);
  if (!existing) throw new Error("Không tìm thấy thanh toán");
  await getDb().prepare("DELETE FROM payments WHERE id = ?").run(id);
  return { ok: true, customer_id: existing.customer_id };
}

export async function listCustomerDebts(ownerId?: number | null): Promise<CustomerDebt[]> {
  const ownerClause = ownerId != null ? "AND c.owner_id = ?" : "";
  const params = ownerId != null ? [ownerId] : [];
  return (await getDb()
    .prepare(
      `SELECT
        c.id AS customer_id,
        c.name AS customer_name,
        c.source,
        c.phone,
        c.region,
        c.status,
        COALESCE(o.order_count, 0) AS order_count,
        COALESCE(o.total_order_amount, 0) AS total_order_amount,
        COALESCE(p.total_paid, 0) AS total_paid,
        COALESCE(o.total_order_amount, 0) - COALESCE(p.total_paid, 0) AS debt
      FROM customers c
      LEFT JOIN (
        SELECT customer_id,
          COUNT(*) AS order_count,
          SUM(amount + shipping_fee) AS total_order_amount
        FROM orders
        GROUP BY customer_id
      ) o ON o.customer_id = c.id
      LEFT JOIN (
        SELECT customer_id, SUM(amount) AS total_paid
        FROM payments
        GROUP BY customer_id
      ) p ON p.customer_id = c.id
      WHERE (COALESCE(o.order_count, 0) > 0 OR COALESCE(p.total_paid, 0) > 0)
        ${ownerClause}
      ORDER BY debt DESC, c.name ASC`,
    )
    .all<CustomerDebt>(...params)) as CustomerDebt[];
}

export async function getCustomerDebtDetail(
  customerId: number,
  ownerId?: number | null,
): Promise<CustomerDebtDetail | null> {
  const customer = await getCustomer(customerId);
  if (!customer) return null;
  if (ownerId != null && customer.owner_id !== ownerId) return null;

  const base = (await getDb()
    .prepare(
      `SELECT
        c.id AS customer_id,
        c.name AS customer_name,
        c.source,
        c.phone,
        c.region,
        c.status,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count,
        COALESCE((SELECT SUM(o.amount + o.shipping_fee) FROM orders o WHERE o.customer_id = c.id), 0) AS total_order_amount,
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id = c.id), 0) AS total_paid
       FROM customers c
       WHERE c.id = ?`,
    )
    .get<CustomerDebt & { total_paid: number; total_order_amount: number }>(customerId)) as
    (CustomerDebt & { total_paid: number; total_order_amount: number }) | undefined;

  const summary: CustomerDebt = base
    ? {
        ...base,
        debt: Number(base.total_order_amount) - Number(base.total_paid),
      }
    : {
        customer_id: customer.id,
        customer_name: customer.name,
        source: customer.source,
        phone: customer.phone,
        region: customer.region,
        status: customer.status,
        order_count: 0,
        total_order_amount: 0,
        total_paid: 0,
        debt: 0,
      };

  const orders = (await getDb()
    .prepare(
      `SELECT o.*,
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id), 0) AS paid_amount
       FROM orders o
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC`,
    )
    .all<Order & { paid_amount: number }>(customerId)) as Array<Order & { paid_amount: number }>;

  const payments = await listPayments(customerId);

  return { ...summary, orders, payments };
}

// ─── Notes ──────────────────────────────────────────────────

export async function listNotes(
  limit = 50,
  ownerId?: number | null,
  customerId?: number | null,
): Promise<Note[]> {
  const where: string[] = [];
  const params: number[] = [];
  if (ownerId != null) {
    where.push("(n.customer_id IS NULL OR c.owner_id = ?)");
    params.push(ownerId);
  }
  if (customerId != null) {
    where.push("n.customer_id = ?");
    params.push(customerId);
  }
  params.push(limit);
  return (await getDb()
    .prepare(
      `SELECT n.*, c.name AS customer_name, c.source AS customer_source
       FROM notes n
       LEFT JOIN customers c ON c.id = n.customer_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY
         CASE WHEN n.created_at IS NULL OR n.created_at = '' THEN 1 ELSE 0 END DESC,
         n.created_at DESC,
         n.id DESC
       LIMIT ?`,
    )
    .all<Note>(...params)) as Note[];
}

export async function createNote(input: {
  content: string;
  customer_id?: number | null;
  author?: string;
  author_user_id?: number | null;
}): Promise<Note> {
  // Must set created_at explicitly — column default is '' and listNotes
  // orders by created_at DESC, so blank timestamps sink new notes to the
  // bottom (or off the LIMIT window) and look like they never synced.
  const ts = nowLocal();
  const info = await getDb()
    .prepare(
      `INSERT INTO notes (customer_id, author, author_user_id, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.customer_id ?? null,
      input.author ?? "Showroom",
      input.author_user_id ?? null,
      input.content.trim(),
      ts,
    );
  return (await getDb()
    .prepare(
      `SELECT n.*, c.name AS customer_name, c.source AS customer_source
       FROM notes n LEFT JOIN customers c ON c.id = n.customer_id
       WHERE n.id = ?`,
    )
    .get<Note>(Number(info.lastInsertRowid))) as Note;
}

// ─── Dashboard ──────────────────────────────────────────────

export async function getDashboardStats(ownerId?: number | null) {
  // limit <= 0: không cắt — dashboard cần đủ để đếm giai đoạn / KPI (quy mô ~100–1000).
  const [customers, debts, orders, quotes, notes] = await Promise.all([
    listCustomers("all", ownerId, { limit: 0 }),
    listCustomerDebts(ownerId),
    listOrders(ownerId, { limit: 0 }),
    listQuotes(ownerId, { limit: 0 }),
    listNotes(10, ownerId),
  ]);

  const totalDebt = debts.reduce((s, d) => s + Math.max(0, d.debt), 0);
  const totalPaid = debts.reduce((s, d) => s + d.total_paid, 0);
  const totalOrderAmount = debts.reduce((s, d) => s + d.total_order_amount, 0);
  const pendingOrders = orders.filter((o) => o.status !== "delivered").length;
  const quotePipeline = quotes
    .filter((q) => q.status === "draft" || q.status === "sent")
    .reduce((s, q) => s + (q.amount ?? 0), 0);

  return {
    customerCount: customers.length,
    totalDebt,
    totalPaid,
    totalOrderAmount,
    pendingOrders,
    quotePipeline,
    notes,
    customers,
    debts,
    orders,
    quotes,
  };
}

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
  collections?: string;
  unit?: string;
  category?: string;
  supplier?: string;
  color?: string;
  packing?: string;
  packing_m2?: number | null;
  packing_pcs?: number | null;
  packing_kg?: number | null;
  retail_price?: number;
  trade_price?: number | null;
  b2b_price?: number | null;
  discount_tp?: number | null;
  discount_b2b?: number | null;
  note?: string;
  is_hot?: number;
  image_path?: string;
};

export async function updateProduct(id: number, input: ProductUpdate): Promise<Product> {
  const existing = await getProduct(id);
  if (!existing) throw new Error("Không tìm thấy sản phẩm");

  const code = (input.code ?? existing.code).trim();
  if (!code) throw new Error("Mã sản phẩm bắt buộc");

  if (code !== existing.code) {
    const clash = await getDb()
      .prepare("SELECT id FROM products WHERE code = ? AND id != ?")
      .get(code, id);
    if (clash) throw new Error(`Mã ${code} đã tồn tại`);
  }

  const retail =
    input.retail_price != null ? Math.round(Number(input.retail_price)) : existing.retail_price;
  if (!retail || retail < 0) throw new Error("Giá bán lẻ không hợp lệ");

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
        collections = @collections,
        category = @category,
        supplier = @supplier,
        color = @color,
        packing = @packing,
        packing_m2 = @packing_m2,
        packing_pcs = @packing_pcs,
        packing_kg = @packing_kg,
        retail_price = @retail_price,
        trade_price = @trade_price,
        b2b_price = @b2b_price,
        discount_tp = @discount_tp,
        discount_b2b = @discount_b2b,
        note = @note,
        is_hot = @is_hot,
        image_path = @image_path
       WHERE id = @id`,
    )
    .run({
      id,
      code,
      name: (input.name ?? existing.name).trim() || code,
      size: (input.size ?? existing.size).trim(),
      material: (input.material ?? existing.material).trim(),
      surface: (input.surface ?? existing.surface ?? "").trim(),
      shape: (input.shape ?? existing.shape ?? "").trim(),
      collections: (input.collections ?? existing.collections ?? "").trim(),
      category: (input.category ?? existing.category).trim(),
      supplier: (input.supplier ?? existing.supplier).trim(),
      color: (input.color ?? existing.color ?? "").trim(),
      packing: (input.packing ?? existing.packing ?? "").trim(),
      packing_m2: input.packing_m2 !== undefined ? input.packing_m2 : existing.packing_m2,
      packing_pcs: input.packing_pcs !== undefined ? input.packing_pcs : existing.packing_pcs,
      packing_kg: input.packing_kg !== undefined ? input.packing_kg : existing.packing_kg,
      retail_price: retail,
      trade_price: tradePrice,
      b2b_price: b2bPrice,
      discount_tp: discountTp,
      discount_b2b: discountB2b,
      note: (input.note ?? existing.note).trim(),
      is_hot: input.is_hot !== undefined ? (input.is_hot ? 1 : 0) : existing.is_hot,
      image_path: (input.image_path ?? existing.image_path).trim(),
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
  collections?: string;
  unit?: string;
  category?: string;
  supplier?: string;
  color?: string;
  packing?: string;
  packing_m2?: number | null;
  packing_pcs?: number | null;
  packing_kg?: number | null;
  retail_price: number;
  trade_price?: number | null;
  b2b_price?: number | null;
  discount_tp?: number | null;
  discount_b2b?: number | null;
  note?: string;
  is_hot?: number;
  image_path?: string;
};

export async function createProduct(input: ProductCreateInput): Promise<Product> {
  const code = (input.code ?? "").trim();
  if (!code) throw new Error("Mã sản phẩm bắt buộc");

  const clash = await getDb().prepare("SELECT id FROM products WHERE code = ?").get(code);
  if (clash) throw new Error(`Mã ${code} đã tồn tại`);

  const retail = Math.round(Number(input.retail_price) || 0);
  if (!retail || retail < 0) throw new Error("Giá bán lẻ không hợp lệ");

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
        code, name, size, material, surface, shape, collections, category, supplier,
        color, packing, packing_m2, packing_pcs, packing_kg,
        retail_price, trade_price, b2b_price, discount_tp, discount_b2b,
        note, is_hot, image_path
      ) VALUES (
        @code, @name, @size, @material, @surface, @shape, @collections, @category, @supplier,
        @color, @packing, @packing_m2, @packing_pcs, @packing_kg,
        @retail_price, @trade_price, @b2b_price, @discount_tp, @discount_b2b,
        @note, @is_hot, @image_path
      )`,
    )
    .run({
      code,
      name: (input.name ?? "").trim() || code,
      size: (input.size ?? "").trim(),
      material: (input.material ?? "").trim(),
      surface: (input.surface ?? "").trim(),
      shape: (input.shape ?? "").trim(),
      collections: (input.collections ?? "").trim(),
      category: (input.category ?? "").trim(),
      supplier: (input.supplier ?? "").trim(),
      color: (input.color ?? "").trim(),
      packing: (input.packing ?? "").trim(),
      packing_m2:
        input.packing_m2 != null && input.packing_m2 !== ("" as unknown)
          ? Number(input.packing_m2)
          : null,
      packing_pcs:
        input.packing_pcs != null && input.packing_pcs !== ("" as unknown)
          ? Number(input.packing_pcs)
          : null,
      packing_kg:
        input.packing_kg != null && input.packing_kg !== ("" as unknown)
          ? Number(input.packing_kg)
          : null,
      retail_price: retail,
      trade_price: tradePrice,
      b2b_price: b2bPrice,
      discount_tp: discountTp,
      discount_b2b: discountB2b,
      note: (input.note ?? "").trim(),
      is_hot: input.is_hot ? 1 : 0,
      image_path: (input.image_path ?? "").trim(),
    } as unknown as SqlValue);

  return (await getProduct(Number(info.lastInsertRowid)))!;
}

