import fs from "node:fs";
import {
  candidates,
  extractAliasCodes,
  extractNameDimPack,
  normRaw,
  parsePackaging,
  titleCaseVn,
  type ParsedPackaging,
} from "@/lib/product-code-matcher";
import {
  allProductAliases,
  normalizeInternalCodesInput,
  parseInternalCodesList,
  serializeInternalCodes,
} from "@/lib/product-internal-codes";
import {
  mergePackingVariants,
  parsePackingFromHhdvName,
  type PackingByCode,
} from "@/lib/hhdv-packing";
import { putImageBuffer, deleteImageRef, isManagedImageRef } from "@/lib/storage";
import path from "node:path";
import { getDb, type SqlValue } from "./index.server";
import {
  unitPriceForProduct,
  effectiveDiscountPct,
  priceAfterDiscount,
} from "@/lib/pricing";
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
  Quote,
  QuoteItem,
  QuoteStatus,
} from "@/lib/types";
import { isPhoneMatchable, phonesMatch } from "@/lib/phone";
import { statusMeta } from "@/lib/types";

function extractCoreVariants(code: string): string[] {
  const parts = code.split("-");
  return parts.length > 1 ? [parts[0], code] : [code];
}

type ProductStockRef = {
  id: number;
  code: string;
  name: string;
  internal_code: string;
  internal_codes: string;
  packing: string;
  packing_pcs: number | null;
  packing_m2: number | null;
  stock_m2: number | null;
  stock_vp: number | null;
};

type StockImportRow = {
  internal_code: string;
  stock_m2: number;
  stock_vp?: number;
  product_name?: string;
  mo_ta?: string;
  kho?: string;
};

type StockImportMatched = {
  product_id: number;
  code: string;
  name: string;
  internal_code: string;
  old_stock: number | null;
  new_stock: number;
  old_stock_vp?: number | null;
  new_stock_vp?: number;
  source_codes?: string[];
  source_stocks?: number[];
  new_internal_codes?: string;
  old_internal_codes?: string;
  multi_codes_added?: string[];
  packing_pcs?: number | null;
  packing_m2?: number | null;
  packing?: string;
  packing_changed?: boolean;
  packing_conflict?: boolean;
  so_luong_dong_goi?: string;
  dien_tich?: string;
  don_vi_tinh?: string;
  parsed_name?: string;
  name_changed?: boolean;
  match_rule?: string;
};

type StockImportPreview = {
  matched: StockImportMatched[];
  unmatched: StockImportRow[];
  matched_count?: number;
  unmatched_count?: number;
  packing_update_count?: number;
  multi_update_count?: number;
  name_update_count?: number;
  packing_conflict_count?: number;
};

export { priceAfterDiscount, unitPriceForProduct, effectiveDiscountPct };

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
  // Lọc danh mục bằng JS (case-insensitive, hỗ trợ tiếng Việt)
  const categoryLower = opts?.category?.trim().toLowerCase();
  if (opts?.search?.trim()) {
    where.push(
      "(p.code LIKE ? OR pic.multi_codes_list LIKE ? OR p.name LIKE ? OR p.size LIKE ? OR p.collections LIKE ?)",
    );
    const q = `%${opts.search.trim()}%`;
    params.push(q, q, q, q, q);
  }

  let stockJoin = '';
  if (opts?.stockLocation && opts.stockLocation !== 'all') {
      stockJoin = ' AND inv.stock_location = ?';
      joinParams.push(opts.stockLocation);
  }

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
    ORDER BY p.category, p.collections, p.code
  `;
  const rows = (await db.prepare(sql).all<Product>(...(joinParams as SqlValue[]), ...(params as SqlValue[]))) as Product[];
  const products =
    categoryLower && categoryLower !== "all"
      ? rows.filter((p) => p.category.trim().toLowerCase() === categoryLower)
      : rows;
  return opts?.limit ? products.slice(0, Number(opts.limit)) : products;
}
export async function getProduct(id: number): Promise<Product | null> {
  return (
    (await getDb()
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
         WHERE p.id = ?`
      )
      .get<Product>(id) as Product | undefined) ?? null
  );
}

/** Field cho phép gợi ý (datalist) & bulk apply — whitelist để tránh SQL injection */
export const PRODUCT_SUGGEST_FIELDS = [
  "color",
  "collections",
  "category",
  "surface",
  "shape",
  "finish_effect",
  "material",
  "size",
] as const;
export type ProductSuggestField = (typeof PRODUCT_SUGGEST_FIELDS)[number];

/** Lấy danh sách giá trị distinct đã dùng cho 1 field phân loại — dùng làm gợi ý datalist */
export async function listProductFieldValues(
  field: ProductSuggestField,
): Promise<string[]> {
  if (!PRODUCT_SUGGEST_FIELDS.includes(field)) {
    throw new Error("Field không hợp lệ");
  }
  const db = getDb();
  return (
    (await db
      .prepare(
        `SELECT DISTINCT ${field} AS v FROM products WHERE ${field} != '' ORDER BY ${field}`,
      )
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
    .prepare(
      `UPDATE products SET ${field} = ? WHERE id IN (${placeholders})`,
    )
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

export async function deleteProduct(
  id: number,
): Promise<{ ok: true; code: string }> {
  const db = getDb();
  const product = await getProduct(id);
  if (!product) throw new Error("Không tìm thấy sản phẩm");

  const inQuotes = (
    (await db
      .prepare(
        "SELECT COUNT(*) AS n FROM quote_items WHERE product_id = ?",
      )
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

async function isPublicImagePathReferenced(
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
         LIMIT 1`,
      )
      .get(publicPath, publicPath, publicPath, publicPath),
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

export async function listProductImages(
  productId: number,
): Promise<ProductImageRow[]> {
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
}): Promise<ProductImageRow> {
  const db = getDb();
  if (!(await getProduct(input.product_id))) {
    throw new Error("Không tìm thấy sản phẩm");
  }
  const pathStr = input.path.trim();
  if (!pathStr) throw new Error("Đường dẫn ảnh bắt buộc");

  const count = (
    (await db
      .prepare(
        "SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?",
      )
      .get<{ n: number }>(input.product_id)) as { n: number }
  ).n;

  const makePrimary = input.is_primary === true || count === 0;
  if (makePrimary) {
    await db
      .prepare(
        "UPDATE product_images SET is_primary = 0 WHERE product_id = ?",
      )
      .run(input.product_id);
  }

  const maxSort = (
    (await db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) AS m FROM product_images WHERE product_id = ?",
      )
      .get<{ m: number }>(input.product_id)) as { m: number }
  ).m;

  const info = await db
    .prepare(
      `INSERT INTO product_images
        (product_id, path, sort_order, is_primary, caption)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.product_id,
      pathStr,
      maxSort + 1,
      makePrimary ? 1 : 0,
      (input.caption ?? "").trim(),
    );

  await syncPrimaryImagePath(input.product_id);
  return (await db
    .prepare("SELECT * FROM product_images WHERE id = ?")
    .get<ProductImageRow>(Number(info.lastInsertRowid))) as ProductImageRow;
}

/** Chuẩn ảnh SP khi upload: cạnh dài tối đa (giữ tỉ lệ). */
export const PRODUCT_IMAGE_MAX_SIDE = 1600;

/**
 * Scale ảnh upload về tiêu chuẩn CRM (max cạnh PRODUCT_IMAGE_MAX_SIDE).
 * Giữ aspect ratio; JPEG/WebP nén gọn; PNG giữ alpha nếu cần.
 */
async function normalizeUploadImageBuffer(
  input: Buffer,
  preferredExt: string,
): Promise<{ buffer: Buffer; ext: string; mime: string }> {
  const sharp = (await import("sharp")).default;
  let pipeline = sharp(input, { failOn: "none" }).rotate(); // honor EXIF orientation
  const meta = await pipeline.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  if (w > PRODUCT_IMAGE_MAX_SIDE || h > PRODUCT_IMAGE_MAX_SIDE) {
    pipeline = pipeline.resize({
      width: PRODUCT_IMAGE_MAX_SIDE,
      height: PRODUCT_IMAGE_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const ext = preferredExt.toLowerCase();
  // GIF animated → flatten to JPEG (simpler, smaller for catalog)
  if (ext === ".png") {
    const buf = await pipeline.png({ compressionLevel: 8, effort: 6 }).toBuffer();
    return { buffer: buf, ext: ".png", mime: "image/png" };
  }
  if (ext === ".webp") {
    const buf = await pipeline.webp({ quality: 85 }).toBuffer();
    return { buffer: buf, ext: ".webp", mime: "image/webp" };
  }
  // default jpeg (also for .gif / unknown)
  const buf = await pipeline
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  return { buffer: buf, ext: ".jpg", mime: "image/jpeg" };
}

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

  const mimeIn = input.mimeType || dataUrlMatch?.[1] || "image/jpeg";
  const extFromMime: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  let ext =
    extFromMime[mimeIn] || path.extname(input.filename).toLowerCase();
  if (!ext || ext === ".") ext = ".jpg";

  let outBuf: Buffer;
  try {
    const normalized = await normalizeUploadImageBuffer(rawBuf, ext);
    outBuf = normalized.buffer;
    ext = normalized.ext;
  } catch (err) {
    console.warn("Image normalize failed, saving original:", err);
    outBuf = rawBuf;
  }

const publicPath = await saveManagedImage(outBuf, ext);
  return await addProductImage({
    product_id: input.product_id,
    path: publicPath,
    caption: input.caption,
    is_primary: input.is_primary,
  });
}

export async function setPrimaryProductImage(
  productId: number,
  imageId: number,
): Promise<ProductImageRow[]> {
  const db = getDb();
  const row = (await db
    .prepare(
      "SELECT * FROM product_images WHERE id = ? AND product_id = ?",
    )
    .get<ProductImageRow>(imageId, productId)) as ProductImageRow | undefined;
  if (!row) throw new Error("Không tìm thấy ảnh của sản phẩm này");

  const runTx = getDb().transaction(async () => {
    await db
      .prepare(
        "UPDATE product_images SET is_primary = 0 WHERE product_id = ?",
      )
      .run(productId);
    await db
      .prepare(
        "UPDATE product_images SET is_primary = 1 WHERE id = ?",
      )
      .run(imageId);
  });
  await runTx();
  await syncPrimaryImagePath(productId);
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

  await db.prepare("DELETE FROM product_images WHERE id = ?").run(imageId);

  // If deleted primary, promote first remaining
  if (row.is_primary) {
    const next = (await db
      .prepare(
        `SELECT id FROM product_images
         WHERE product_id = ?
         ORDER BY sort_order ASC, id ASC LIMIT 1`,
      )
      .get<{ id: number }>(row.product_id)) as { id: number } | undefined;
    if (next) {
      await db
        .prepare(
          "UPDATE product_images SET is_primary = 1 WHERE id = ?",
        )
        .run(next.id);
    }
  }

  await syncPrimaryImagePath(row.product_id);

  // Chỉ xóa file được CRM quản lý khi không còn bản ghi nào dùng chung path.
  if (row.path.startsWith("/images/")) {
    const filePath = path.join(process.cwd(), "public", row.path);
    try {
      if ((await isPublicImagePathReferenced(db, row.path)) === false && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      /* ignore */
    }
  }

  return {
    product_id: row.product_id,
    images: await listProductImages(row.product_id),
  };
}

// ─── Customers ──────────────────────────────────────────────

/** ownerId = null → tất cả (admin); số → chỉ KH của sales đó */
export async function listCustomers(
  status?: CustomerStatus | "all",
  ownerId?: number | null,
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

  const sql = `
    SELECT c.*, u.display_name AS owner_name
    FROM customers c
    LEFT JOIN users u ON u.id = c.owner_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY c.updated_at DESC
  `;
  return (await db.prepare(sql).all<Customer>(...(params as SqlValue[]))) as Customer[];
}

export async function getCustomer(id: number): Promise<Customer | null> {
  return (
    (await getDb()
      .prepare(
        `SELECT c.*, u.display_name AS owner_name
         FROM customers c
         LEFT JOIN users u ON u.id = c.owner_id
         WHERE c.id = ?`,
      )
      .get<Customer>(id) as Customer | undefined) ?? null
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

export async function assertPhoneAvailable(
  phone: string,
  opts?: { excludeId?: number; requirePhone?: boolean },
): Promise<void> {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) {
    if (opts?.requirePhone) {
      throw new Error(
        "Vui lòng nhập số điện thoại để tránh trùng khách giữa các sales",
      );
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
    .prepare(
      "UPDATE customers SET status = ?, updated_at = ? WHERE id = ?",
    )
    .run(status, nowLocal(), id);
  return await getCustomer(id);
}

export type QuotedProductSummary = {
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

export type CustomerDetail = {
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
export async function getCustomerDetail(
  id: number,
): Promise<CustomerDetail | null> {
  const customer = await getCustomer(id);
  if (!customer) return null;

  const quotes = (await listQuotes(null)).filter((q) => q.customer_id === id);
  const quotesWithItems = await Promise.all(
    quotes.map(async (q) => ({
      ...q,
      items: await getQuoteItems(q.id),
    })),
  );

  const orders = (await listOrders(null)).filter((o) => o.customer_id === id);
  const notes = (await listNotes(100, null)).filter((n) => n.customer_id === id);

  const debtDetail = await getCustomerDebtDetail(id, null);
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
    .all<Omit<QuotedProductSummary, "sample_sent"> & { sample_sent: number }>(
      id,
      id,
    )) as Array<
    Omit<QuotedProductSummary, "sample_sent"> & { sample_sent: number }
  >;
  const normalizedQuotedProducts: QuotedProductSummary[] = quotedProducts.map(
    (r) => ({ ...r, sample_sent: Boolean(r.sample_sent) }),
  );

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
      mapping_count: (
        (await getDb()
          .prepare("SELECT COUNT(*) AS n FROM customer_mappings WHERE customer_id = ?")
          .get<{ n: number }>(id)) as { n: number }
      ).n,
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
    .prepare(
      "SELECT id FROM customer_product_samples WHERE customer_id = ? AND product_id = ?",
    )
    .get<{ id: number }>(
      input.customer_id,
      input.product_id,
    )) as { id: number } | undefined;

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
      .run(
        input.customer_id,
        product.id,
        product.code,
        product.name,
        nowLocal(),
      );
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
    .get<
      Omit<QuotedProductSummary, "sample_sent"> & { sample_sent: number }
    >(rowId)) as Omit<QuotedProductSummary, "sample_sent"> & {
    sample_sent: number;
  };
  return { ...row, sample_sent: Boolean(row.sample_sent) };
}

/** Lấy customer_id của 1 dòng customer_product_samples (để check quyền truy cập trước khi tick). */
export async function getCustomerProductSampleCustomerId(
  id: number,
): Promise<number | null> {
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
  const existing = await db
    .prepare("SELECT id FROM customer_product_samples WHERE id = ?")
    .get(id);
  if (!existing) throw new Error("Không tìm thấy dòng sản phẩm");
  await db
    .prepare(
      "UPDATE customer_product_samples SET sample_sent = ?, sample_sent_at = ? WHERE id = ?",
    )
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
  const existing = await db
    .prepare("SELECT id FROM customer_product_samples WHERE id = ?")
    .get(id);
  if (!existing) throw new Error("Không tìm thấy dòng sản phẩm");
  await db
    .prepare("DELETE FROM customer_product_samples WHERE id = ?")
    .run(id);
  return { ok: true };
}

// ─── Customer mappings (mapping mẫu gạch theo KH) ──────────────

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
};

export type CustomerMapping = {
  id: number;
  code: string;
  customer_id: number;
  status: "draft" | "sent" | "accepted" | "expired";
  name: string;
  version: string;
  note: string;
  created_at: string;
  updated_at: string;
  linked_quotes: Array<{ id: number; code: string; status: QuoteStatus }>;
  items: CustomerMappingItem[];
};

export async function listCustomerMappings(
  customerId: number,
): Promise<CustomerMapping[]> {
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
    linked_quotes: links
      .filter((link) => link.mapping_id === m.id)
      .map(({ id, code, status }) => ({ id, code, status })),
    items: items.filter((it) => it.mapping_id === m.id),
  }));
}

export async function getCustomerMappingCustomerId(
  mappingId: number,
): Promise<number | null> {
  const row = (await getDb()
    .prepare("SELECT customer_id FROM customer_mappings WHERE id = ?")
    .get<{ customer_id: number }>(mappingId)) as { customer_id: number } | undefined;
  return row?.customer_id ?? null;
}

export async function createQuoteFromCustomerMapping(
  mappingId: number,
): Promise<Quote> {
  const db = getDb();
  const mapping = (await db
    .prepare("SELECT * FROM customer_mappings WHERE id = ?")
    .get<{
      id: number;
      customer_id: number;
      name: string;
      note: string;
    }>(mappingId)) as
    | { id: number; customer_id: number; name: string; note: string }
    | undefined;
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
    notes: [
      mapping.name ? `Từ đề xuất vật liệu: ${mapping.name}` : "",
      mapping.note,
    ]
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
      const filePath = path.join(
        process.cwd(),
        "public",
        p.replace(/^\//, ""),
      );
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
  }>;
}): Promise<CustomerMapping> {
  const db = getDb();
  const customer = await db
    .prepare("SELECT id FROM customers WHERE id = ?")
    .get(input.customer_id);
  if (!customer) throw new Error("Không tìm thấy khách hàng");

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
          `UPDATE customer_mappings SET name = ?, version = ?, note = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
        )
        .run(input.name ?? "", input.version?.trim() || "01", input.note ?? "", mappingId);
      await db
        .prepare("DELETE FROM customer_mapping_items WHERE mapping_id = ?")
        .run(mappingId);
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
          `INSERT INTO customer_mappings (code, customer_id, name, version, note)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          code,
          input.customer_id,
          input.name ?? "",
          input.version?.trim() || "01",
          input.note ?? "",
        );
      mappingId = Number(info.lastInsertRowid);
    }

    const insItem = db.prepare(
      `INSERT INTO customer_mapping_items
         (mapping_id, sort_order, area_group_key, description, size, product_id, image_path,
          custom_product_code, custom_product_name, custom_product_size,
          custom_product_surface, custom_product_retail_price, custom_product_image_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [i, it] of (input.items ?? []).entries()) {
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
      );
    }

    await deleteOrphanMappingImages(oldPaths);
    return mappingId;
  });

  const id = await runTx();
  const all = await listCustomerMappings(input.customer_id);
  return all.find((m) => m.id === id)!;
}

export async function deleteCustomerMapping(
  mappingId: number,
): Promise<{ ok: true }> {
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
  const existing = await db
    .prepare("SELECT id FROM customer_mappings WHERE id = ?")
    .get(mappingId);
  if (!existing) throw new Error("Không tìm thấy mapping");
  await db
    .prepare("DELETE FROM customer_mappings WHERE id = ?")
    .run(mappingId);
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

  const mimeIn = input.mimeType || dataUrlMatch?.[1] || "image/jpeg";
  const extFromMime: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  let ext =
    extFromMime[mimeIn] || path.extname(input.filename).toLowerCase();
  if (!ext || ext === ".") ext = ".jpg";

  let outBuf: Buffer;
  try {
    const normalized = await normalizeUploadImageBuffer(rawBuf, ext);
    outBuf = normalized.buffer;
    ext = normalized.ext;
  } catch (err) {
    console.warn("Mapping image normalize failed, saving original:", err);
    outBuf = rawBuf;
  }

return { path: await saveManagedImage(outBuf, ext) };
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

  const phone =
    input.phone !== undefined
      ? input.phone.trim()
      : (existing.phone ?? "").trim();
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
    input.company !== undefined
      ? input.company.trim()
      : (existing.company ?? "").trim();

  const shortName =
    input.short_name !== undefined
      ? input.short_name.trim()
      : (existing.short_name ?? "").trim();

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

export async function listQuotes(ownerId?: number | null): Promise<Quote[]> {
  const db = getDb();
  const ownerClause =
    ownerId != null ? "WHERE c.owner_id = ?" : "";
  const params = ownerId != null ? [ownerId] : [];
  return (await db
    .prepare(
      `SELECT q.*,
        c.name AS customer_name,
        c.source AS customer_source,
        COALESCE((SELECT SUM(line_total) FROM quote_items qi WHERE qi.quote_id = q.id), 0) AS amount,
        COALESCE((SELECT COUNT(*) FROM quote_items qi WHERE qi.quote_id = q.id), 0) AS items_count
       FROM quotes q
       JOIN customers c ON c.id = q.customer_id
       ${ownerClause}
       ORDER BY q.created_at DESC`,
    )
    .all<Quote>(...params)) as Quote[];
}

export async function getQuote(id: number): Promise<Quote | null> {
  return (
    (await getDb()
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
      .get<Quote>(id) as Quote | undefined) ?? null
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
    .prepare(
      "SELECT id FROM customer_product_samples WHERE customer_id = ? AND product_id = ?",
    )
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

      const { unit, discountPct } = resolveQuoteItemPricing(
        product,
        discountType,
        item,
      );
      const qty = Number(item.quantity_m2) || 0;
      const lineTotal = Math.round(unit * qty);

      const productCode =
        (item.product_code ?? "").trim() || product.code;
      const productName =
        (item.product_name ?? "").trim() || product.name;

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
        .prepare(
          "UPDATE customers SET status = 'quoted', updated_at = ? WHERE id = ?",
        )
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
      const info = await db
        .prepare("DELETE FROM payments WHERE order_id = ?")
        .run(orderId);
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

      const { unit, discountPct } = resolveQuoteItemPricing(
        product,
        discountType,
        item,
      );
      const qty = Number(item.quantity_m2) || 0;
      const lineTotal = Math.round(unit * qty);
      const productCode =
        (item.product_code ?? "").trim() || product.code;
      const productName =
        (item.product_name ?? "").trim() || product.name;

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

export async function listOrders(ownerId?: number | null): Promise<Order[]> {
  const ownerClause =
    ownerId != null ? "WHERE c.owner_id = ?" : "";
  const params = ownerId != null ? [ownerId] : [];
  return (await getDb()
    .prepare(
      `SELECT o.*,
        c.name AS customer_name,
        c.source AS customer_source,
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id), 0) AS paid_amount
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       ${ownerClause}
       ORDER BY o.created_at DESC`,
    )
    .all<Order>(...params)) as Order[];
}

export async function createOrder(input: {
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

  const orders = await listOrders();
  return orders.find((o) => o.id === Number(info.lastInsertRowid))!;
}

export async function getOrder(id: number): Promise<Order | null> {
  const orders = await listOrders(null);
  return (orders.find((o) => o.id === id) as Order | undefined) ?? null;
}

export async function updateOrderStatus(
  id: number,
  status: OrderStatus,
): Promise<Order> {
  const existing = await getOrder(id);
  if (!existing) throw new Error("Không tìm thấy đơn hàng");
  if (!["preparing", "shipping", "delivered"].includes(status)) {
    throw new Error("Trạng thái đơn không hợp lệ");
  }
  await getDb()
    .prepare(
      "UPDATE orders SET status = ?, updated_at = ? WHERE id = ?",
    )
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
    const info = await db
      .prepare("DELETE FROM payments WHERE order_id = ?")
      .run(id);
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
    .prepare(
      "UPDATE quotes SET status = 'accepted', updated_at = ? WHERE id = ?",
    )
    .run(nowLocal(), quoteId);
  return order;
}

// ─── Payments & Debt ────────────────────────────────────────

export async function listPayments(customerId?: number): Promise<Payment[]> {
  const db = getDb();
  if (customerId) {
    return (await db
      .prepare(
        "SELECT * FROM payments WHERE customer_id = ? ORDER BY paid_at DESC",
      )
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
    (await getDb()
      .prepare("SELECT * FROM payments WHERE id = ?")
      .get<Payment>(id) as Payment | undefined) ?? null
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

  const amount =
    input.amount !== undefined ? Math.round(input.amount) : existing.amount;
  if (!amount || amount <= 0) {
    throw new Error("Số tiền thanh toán phải > 0");
  }
  const orderId =
    input.order_id !== undefined ? input.order_id : existing.order_id;
  const paidAt =
    input.paid_at !== undefined && input.paid_at.trim()
      ? input.paid_at
      : existing.paid_at;
  const note = input.note !== undefined ? input.note : existing.note;

  await db
    .prepare(
      "UPDATE payments SET amount = ?, order_id = ?, paid_at = ?, note = ? WHERE id = ?",
    )
    .run(amount, orderId ?? null, paidAt, note, id);

  return (await getPayment(id))!;
}

export async function deletePayment(
  id: number,
): Promise<{ ok: true; customer_id: number }> {
  const existing = await getPayment(id);
  if (!existing) throw new Error("Không tìm thấy thanh toán");
  await getDb().prepare("DELETE FROM payments WHERE id = ?").run(id);
  return { ok: true, customer_id: existing.customer_id };
}

export async function listCustomerDebts(
  ownerId?: number | null,
): Promise<CustomerDebt[]> {
  const ownerClause =
    ownerId != null ? "AND c.owner_id = ?" : "";
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
  const debts = await listCustomerDebts(ownerId);
  const base = debts.find((d) => d.customer_id === customerId);
  const customer = await getCustomer(customerId);
  if (!customer) return null;
  if (ownerId != null && customer.owner_id !== ownerId) return null;

  const summary: CustomerDebt = base ?? {
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
    .all<Order & { paid_amount: number }>(customerId)) as Array<
    Order & { paid_amount: number }
  >;

  const payments = await listPayments(customerId);

  return { ...summary, orders, payments };
}

// ─── Notes ──────────────────────────────────────────────────

export async function listNotes(
  limit = 50,
  ownerId?: number | null,
): Promise<Note[]> {
  const ownerClause =
    ownerId != null
      ? "WHERE (n.customer_id IS NULL OR c.owner_id = ?)"
      : "";
  const params: unknown[] =
    ownerId != null ? [ownerId, limit] : [limit];
  return (await getDb()
    .prepare(
      `SELECT n.*, c.name AS customer_name, c.source AS customer_source
       FROM notes n
       LEFT JOIN customers c ON c.id = n.customer_id
       ${ownerClause}
       ORDER BY n.created_at DESC
       LIMIT ?`,
    )
    .all<Note>(...(params as SqlValue[]))) as Note[];
}

export async function createNote(input: {
  content: string;
  customer_id?: number | null;
  author?: string;
  author_user_id?: number | null;
}): Promise<Note> {
  const info = await getDb()
    .prepare(
      `INSERT INTO notes (customer_id, author, author_user_id, content)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      input.customer_id ?? null,
      input.author ?? "Showroom",
      input.author_user_id ?? null,
      input.content.trim(),
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
  const customers = await listCustomers("all", ownerId);
  const debts = await listCustomerDebts(ownerId);
  const orders = await listOrders(ownerId);
  const quotes = await listQuotes(ownerId);
  const notes = await listNotes(10, ownerId);

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
  finish_effect?: string;
  unit?: string;
  category?: string;
  collections?: string;
  color?: string;
  packing?: string;
  packing_m2?: number | null;
  packing_pcs?: number | null;
  retail_price?: number;
  trade_price?: number | null;
  b2b_price?: number | null;
  discount_tp?: number | null;
  discount_b2b?: number | null;
  note?: string;
  is_hot?: number;
  image_path?: string;
};

export async function updateProduct(
  id: number,
  input: ProductUpdate,
): Promise<Product> {
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
    input.retail_price != null
      ? Math.round(Number(input.retail_price))
      : existing.retail_price;
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
    retail > 0 && tradePrice != null
      ? Math.round(((retail - tradePrice) / retail) * 100)
      : null;

  const discountB2b =
    retail > 0 && b2bPrice != null
      ? Math.round(((retail - b2bPrice) / retail) * 100)
      : null;

  await getDb()
    .prepare(
      `UPDATE products SET
        code = @code,
        name = @name,
        size = @size,
        material = @material,
        surface = @surface,
        shape = @shape,
        finish_effect = @finish_effect,
        category = @category,
        collections = @collections,
        color = @color,
        packing = @packing,
        packing_m2 = @packing_m2,
        packing_pcs = @packing_pcs,
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
      finish_effect: (input.finish_effect ?? existing.finish_effect ?? "").trim(),
      category: (input.category ?? existing.category).trim(),
      collections: (input.collections ?? existing.collections).trim(),
      color: (input.color ?? existing.color ?? "").trim(),
      packing: (input.packing ?? existing.packing ?? "").trim(),
      packing_m2: input.packing_m2 !== undefined ? input.packing_m2 : existing.packing_m2,
      packing_pcs: input.packing_pcs !== undefined ? input.packing_pcs : existing.packing_pcs,
      retail_price: retail,
      trade_price: tradePrice,
      b2b_price: b2bPrice,
      discount_tp: discountTp,
      discount_b2b: discountB2b,
      note: (input.note ?? existing.note).trim(),
      is_hot:
        input.is_hot !== undefined
          ? input.is_hot
            ? 1
            : 0
          : existing.is_hot,
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
  finish_effect?: string;
  unit?: string;
  category?: string;
  collections?: string;
  color?: string;
  packing?: string;
  packing_m2?: number | null;
  packing_pcs?: number | null;
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

  const clash = await getDb()
    .prepare("SELECT id FROM products WHERE code = ?")
    .get(code);
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
    retail > 0 && tradePrice != null
      ? Math.round(((retail - tradePrice) / retail) * 100)
      : null;

  const discountB2b =
    retail > 0 && b2bPrice != null
      ? Math.round(((retail - b2bPrice) / retail) * 100)
      : null;

  const info = await getDb()
    .prepare(
      `INSERT INTO products (
        code, name, size, material, surface, shape, finish_effect, category, collections,
        color, packing, packing_m2, packing_pcs,
        retail_price, trade_price, b2b_price, discount_tp, discount_b2b,
        note, is_hot, image_path
      ) VALUES (
        @code, @name, @size, @material, @surface, @shape, @finish_effect, @category, @collections,
        @color, @packing, @packing_m2, @packing_pcs,
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
      finish_effect: (input.finish_effect ?? "").trim(),
      category: (input.category ?? "").trim(),
      collections: (input.collections ?? "").trim(),
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

/**
 * Map mã hàng file → SP:
 * 1. candidates(fileCode)
 * 2. extractAliasCodes(moTa)
 * 3. extractCoreVariants(fileCode)
 */
function resolveProductFromFileCode(
  fileCode: string,
  byAlias: Map<string, ProductStockRef>,
  moTa?: string,
): { product: ProductStockRef; matchRule: string } | null {
  const code = fileCode.trim();
  if (!code) return null;

  const tryGet = (c: string) =>
    byAlias.get(c) ?? byAlias.get(c.toUpperCase()) ?? byAlias.get(normRaw(c)) ?? null;

  const cands = candidates(code);
  for (const cand of cands) {
    const hit = tryGet(cand);
    if (hit) return { product: hit, matchRule: "Candidates Mã hàng" };
  }

  if (moTa) {
    const aliases = extractAliasCodes(moTa);
    for (const alias of aliases) {
      const aliasCands = candidates(alias);
      for (const cand of aliasCands) {
        const hit = tryGet(cand);
        if (hit) return { product: hit, matchRule: "Alias trong Mô tả" };
      }
    }
  }

  const variants = extractCoreVariants(code);
  for (const v of variants) {
    const hit = tryGet(v);
    if (hit) return { product: hit, matchRule: "Core Variant" };
  }

  return null;
}

/**
 * Union-find: nhóm mã liên quan từ mã hàng trên file.
 * Các mã sinh ra cùng một Core Variant sẽ được gom chung họ hàng.
 */
function buildCodeGroups(items: StockImportRow[]): Map<string, string[]> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const k = x.toUpperCase();
    if (!parent.has(k)) parent.set(k, k);
    const p = parent.get(k)!;
    if (p !== k) {
      const r = find(p);
      parent.set(k, r);
      return r;
    }
    return k;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const variantMap = new Map<string, string[]>();

  for (const item of items) {
    const code = String(item.internal_code ?? "").trim();
    if (!code) continue;
    find(code);

    const variants = extractCoreVariants(code);
    variants.push(code.toUpperCase());

    for (const v of variants) {
      if (v.length < 3) continue;
      if (!variantMap.has(v)) variantMap.set(v, []);
      variantMap.get(v)!.push(code);
    }
  }

  for (const codes of variantMap.values()) {
    for (let i = 1; i < codes.length; i++) {
      union(codes[0], codes[i]);
    }
  }

  const groups = new Map<string, string[]>();
  for (const [k] of parent) {
    const r = find(k);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(k);
  }
  return groups;
}

/**
 * So khớp mã hàng file với DB (multi-internal + mã báo giá).
 * - Option 1: Tồn kho
 * - Option 2: Mã nội bộ
 * - Option 3: Quy cách / Packing
 * - Option 4: Tên sản phẩm
 */
async function previewStockImport(
  items: StockImportRow[],
): Promise<StockImportPreview> {
  const db = getDb();
  const byAlias = new Map<string, ProductStockRef>();

  const rows = (await db
    .prepare(
      `SELECT p.id, p.code, p.name, pic.internal_code, pic.multi_codes_list as internal_codes,
              p.packing, p.packing_pcs, p.packing_m2,
              invQ9.quantity_stock as stock_m2,
              invVP.quantity_stock as stock_vp
       FROM products p
       LEFT JOIN (
           SELECT product_id, MIN(internal_code) as internal_code, GROUP_CONCAT(DISTINCT internal_code) as multi_codes_list
           FROM product_internal_codes GROUP BY product_id
       ) pic ON pic.product_id = p.id
       LEFT JOIN inventory invQ9 ON invQ9.internal_code = pic.internal_code AND invQ9.stock_location = 'Q9'
       LEFT JOIN inventory invVP ON invVP.internal_code = pic.internal_code AND invVP.stock_location = 'VP'`,
    )
    .all<ProductStockRef>()) as ProductStockRef[];

  for (const r of rows) {
    const ref: ProductStockRef = {
      id: r.id,
      code: r.code,
      name: r.name,
      internal_code: (r.internal_code ?? "").trim(),
      internal_codes: (r.internal_codes ?? "").trim(),
      packing: (r.packing ?? "").trim(),
      packing_pcs: r.packing_pcs ?? null,
      packing_m2: r.packing_m2 ?? null,
      stock_m2: r.stock_m2,
      stock_vp: r.stock_vp ?? null,
    };
    const aliases = allProductAliases(ref);
    for (const a of aliases) {
      if (!byAlias.has(a)) byAlias.set(a, ref);
      const up = a.toUpperCase();
      if (!byAlias.has(up)) byAlias.set(up, ref);
      const nr = normRaw(a);
      if (nr && !byAlias.has(nr)) byAlias.set(nr, ref);
    }
  }

  type SourceRow = {
    code: string;
    stock: number;
    product_name: string;
    mo_ta: string;
    match_rule: string;
  };

  type Acc = {
    product: ProductStockRef;
    sumStock: number;
    sources: SourceRow[];
    seenCodes: Set<string>;
  };
  const byProduct = new Map<number, Acc>();
  const unmatched: StockImportRow[] = [];

  const codeGroups = buildCodeGroups(items);
  const codeToRoot = new Map<string, string>();
  for (const [root, members] of codeGroups) {
    for (const m of members) codeToRoot.set(m.toUpperCase(), root);
  }

  const codeToProduct = new Map<string, ProductStockRef>();

  function attachToProduct(
    p: ProductStockRef,
    code: string,
    newStock: number,
    product_name: string,
    mo_ta: string,
    match_rule: string,
  ) {
    const codeKey = code.toUpperCase();
    codeToProduct.set(codeKey, p);
    const acc = byProduct.get(p.id);
    if (!acc) {
      byProduct.set(p.id, {
        product: p,
        sumStock: newStock,
        sources: [{ code, stock: newStock, product_name, mo_ta, match_rule }],
        seenCodes: new Set([codeKey]),
      });
    } else if (acc.seenCodes.has(codeKey)) {
      const idx = acc.sources.findIndex(
        (s) => s.code.toUpperCase() === codeKey,
      );
      if (idx >= 0 && newStock > acc.sources[idx].stock) {
        acc.sumStock += newStock - acc.sources[idx].stock;
        acc.sources[idx] = {
          code,
          stock: newStock,
          product_name: product_name || acc.sources[idx].product_name,
          mo_ta: mo_ta || acc.sources[idx].mo_ta,
          match_rule: match_rule || acc.sources[idx].match_rule,
        };
      }
    } else {
      acc.seenCodes.add(codeKey);
      acc.sources.push({ code, stock: newStock, product_name, mo_ta, match_rule });
      acc.sumStock += newStock;
    }
  }

  const pending: Array<{
    code: string;
    stock: number;
    product_name: string;
    mo_ta: string;
  }> = [];

  for (const item of items) {
    const code = String(item.internal_code ?? "").trim();
    if (!code) continue;
    const stock = Number(item.stock_m2);
    const newStock = Number.isFinite(stock) && stock >= 0 ? stock : 0;
    const product_name = String(item.product_name ?? "").trim();
    const mo_ta = String(item.mo_ta ?? "").trim();

    const resolved = resolveProductFromFileCode(code, byAlias, mo_ta);
    if (resolved) {
      attachToProduct(
        resolved.product,
        code,
        newStock,
        product_name,
        mo_ta,
        resolved.matchRule,
      );
    } else {
      pending.push({ code, stock: newStock, product_name, mo_ta });
    }
  }

  for (const row of pending) {
    const root =
      codeToRoot.get(row.code.toUpperCase()) ?? row.code.toUpperCase();
    const members = codeGroups.get(root) ?? [row.code.toUpperCase()];
    let resolved: { product: ProductStockRef; matchRule: string } | null = null;
    for (const m of members) {
      const p = codeToProduct.get(m);
      if (p) {
        resolved = { product: p, matchRule: "Mã nhóm tương quan" };
        break;
      }
      resolved = resolveProductFromFileCode(m, byAlias, row.mo_ta);
      if (resolved) break;
    }
    if (resolved) {
      attachToProduct(
        resolved.product,
        row.code,
        row.stock,
        row.product_name,
        row.mo_ta,
        resolved.matchRule,
      );
    } else {
      unmatched.push({
        internal_code: row.code,
        stock_m2: row.stock,
        product_name: row.product_name,
        mo_ta: row.mo_ta,
      });
    }
  }

  let packing_update_count = 0;
  let multi_update_count = 0;
  let packing_conflict_count = 0;
  let name_update_count = 0;

  const matched: StockImportMatched[] = [...byProduct.values()]
    .map((acc) => {
      const sourcesSorted = acc.sources.slice().sort((a, b) => {
        const aHn = /-HN$/i.test(a.code) ? 1 : 0;
        const bHn = /-HN$/i.test(b.code) ? 1 : 0;
        if (aHn !== bHn) return aHn - bHn;
        return b.stock - a.stock;
      });

      const packRows: PackingByCode[] = [];
      let primaryParsedName = "";
      let primaryPackagingInfo: ParsedPackaging = {
        so_luong_dong_goi: "",
        dien_tich: "",
        don_vi_tinh: "",
      };

      for (const s of sourcesSorted) {
        if (!s.product_name) continue;
        const pack = parsePackingFromHhdvName(s.product_name);
        if (pack.packing_pcs != null || pack.packing_m2 != null) {
          packRows.push({ code: s.code, raw_name: s.product_name, ...pack });
        }

        if (!primaryParsedName) {
          const { name: rawName, pack: packStr } = extractNameDimPack(
            s.product_name,
            s.code,
          );
          if (rawName) {
            primaryParsedName = titleCaseVn(rawName);
          }
          if (packStr) {
            primaryPackagingInfo = parsePackaging(packStr);
          }
        }
      }

      const merged = mergePackingVariants(packRows);
      const packing_changed =
        merged.primary.packing_pcs != null ||
        merged.primary.packing_m2 != null
          ? merged.packingText !== (acc.product.packing || "") ||
            merged.primary.packing_pcs !== acc.product.packing_pcs ||
            merged.primary.packing_m2 !== acc.product.packing_m2
          : false;
      if (packing_changed) packing_update_count += 1;
      if (merged.hasConflict) packing_conflict_count += 1;

      // Check name change
      const name_changed =
        Boolean(primaryParsedName) &&
        primaryParsedName.trim().toLowerCase() !==
          acc.product.name.trim().toLowerCase();
      if (name_changed) name_update_count += 1;

      // Multi-codes
      const oldMulti = parseInternalCodesList(
        acc.product.internal_codes,
        acc.product.internal_code,
        acc.product.code,
      );
      const extras: string[] = [];
      for (const s of acc.sources) {
        extras.push(s.code);
        if (s.mo_ta) {
          extras.push(...extractAliasCodes(s.mo_ta));
        }
      }
      const newMultiList = parseInternalCodesList(...oldMulti, ...extras);
      const new_internal_codes = serializeInternalCodes(newMultiList);
      const old_internal_codes =
        serializeInternalCodes(
          parseInternalCodesList(
            acc.product.internal_codes,
            acc.product.internal_code,
          ),
        ) || "";
      const added = newMultiList.filter(
        (c) =>
          !oldMulti.some((o) => o.toUpperCase() === c.toUpperCase()),
      );
      const multiChanged =
        added.length > 0 ||
        new_internal_codes.toUpperCase() !== old_internal_codes.toUpperCase();
      if (multiChanged && (added.length > 0 || !old_internal_codes)) {
        multi_update_count += 1;
      }

      return {
        product_id: acc.product.id,
        code: acc.product.code,
        name: acc.product.name,
        internal_code: new_internal_codes || acc.product.code,
        old_stock: acc.product.stock_m2,
        new_stock: Math.round(acc.sumStock * 1000) / 1000,
        source_codes: acc.sources.map((s) => s.code),
        source_stocks: acc.sources.map((s) => s.stock),
        old_internal_codes,
        new_internal_codes: multiChanged ? new_internal_codes : undefined,
        multi_codes_added: added.length ? added : undefined,
        packing_pcs: packing_changed ? merged.primary.packing_pcs : undefined,
        packing_m2: packing_changed ? merged.primary.packing_m2 : undefined,
        packing: packing_changed ? merged.packingText : undefined,
        packing_changed,
        packing_conflict: merged.hasConflict,
        parsed_name: primaryParsedName || undefined,
        name_changed,
        so_luong_dong_goi: primaryPackagingInfo.so_luong_dong_goi || undefined,
        dien_tich: primaryPackagingInfo.dien_tich || undefined,
        don_vi_tinh: primaryPackagingInfo.don_vi_tinh || undefined,
      } satisfies StockImportMatched;
    })
    .sort((a, b) =>
      a.code.localeCompare(b.code, "vi", { sensitivity: "base" }),
    );

  return {
    matched,
    unmatched,
    matched_count: matched.length,
    unmatched_count: unmatched.length,
    packing_update_count,
    multi_update_count,
    packing_conflict_count,
    name_update_count,
  };
}

type StockImportApplyItem = {
  product_id: number;
  stock_m2?: number;
  update_stock?: boolean;
  packing?: string;
  packing_pcs?: number | null;
  packing_m2?: number | null;
  update_packing?: boolean;
  internal_codes?: string;
  update_multi?: boolean;
  new_name?: string;
  update_name?: boolean;
};

/**
 * Áp dụng tồn + packing + multi-codes + tên sản phẩm từ preview «Nhập tồn kho».
 */
async function applyStockImport(
  items: StockImportApplyItem[],
  opts?: {
    update_stock?: boolean;
    update_packing?: boolean;
    update_multi?: boolean;
    update_name?: boolean;
  },
): Promise<{
  stock_count: number;
  packing_count: number;
  multi_count: number;
  name_count: number;
}> {
  const doStock = opts?.update_stock !== false;
  const doPack = opts?.update_packing !== false;
  const doMulti = opts?.update_multi !== false;
  const doName = opts?.update_name === true;

  const db = getDb();
  let stock_count = 0;
  let packing_count = 0;
  let multi_count = 0;
  let name_count = 0;

  const updStock = db.prepare(
    `INSERT INTO inventory (internal_code, stock_location, quantity_stock)
     SELECT internal_code, 'Q9', ? FROM product_internal_codes
     WHERE product_id = ? ORDER BY id LIMIT 1
     ON CONFLICT(internal_code, stock_location)
     DO UPDATE SET quantity_stock = excluded.quantity_stock`,
  );
  const updPack = db.prepare(
    "UPDATE products SET packing = ?, packing_pcs = ?, packing_m2 = ? WHERE id = ?",
  );
  const updMulti = db.prepare(
    "UPDATE products SET internal_codes = ?, internal_code = ? WHERE id = ?",
  );
  const updName = db.prepare("UPDATE products SET name = ? WHERE id = ?");

  const createTx = db.transaction(async () => {
    for (const item of items) {
      const id = Number(item.product_id);
      if (!Number.isFinite(id) || id <= 0) continue;

      if (doStock && item.update_stock !== false && item.stock_m2 != null) {
        const stock = Number(item.stock_m2);
        if (Number.isFinite(stock) && stock >= 0) {
          stock_count += (await updStock.run(stock, id)).changes;
        }
      }

      if (
        doPack &&
        item.update_packing !== false &&
        (item.packing_pcs != null ||
          item.packing_m2 != null ||
          (item.packing && item.packing.length > 0))
      ) {
        packing_count += (await updPack.run(
          item.packing ?? "",
          item.packing_pcs ?? null,
          item.packing_m2 ?? null,
          id,
        )).changes;
      }

      if (
        doMulti &&
        item.update_multi !== false &&
        item.internal_codes &&
        item.internal_codes.trim()
      ) {
        const { multi, primary } = normalizeInternalCodesInput(
          item.internal_codes,
        );
        multi_count += (await updMulti.run(multi, primary, id)).changes;
      }

      if (
        doName &&
        item.update_name !== false &&
        item.new_name &&
        item.new_name.trim()
      ) {
        name_count += (await updName.run(item.new_name.trim(), id)).changes;
      }
    }
  });
  await createTx();

  return { stock_count, packing_count, multi_count, name_count };
}

async function bulkUpdateStockByProductId(
  items: Array<{ product_id: number; stock_m2: number }>,
): Promise<number> {
  const db = getDb();
  let updatedCount = 0;
  const updateStmt = db.prepare(
    `INSERT INTO inventory (internal_code, stock_location, quantity_stock)
     SELECT internal_code, 'Q9', ? FROM product_internal_codes
     WHERE product_id = ? ORDER BY id LIMIT 1
     ON CONFLICT(internal_code, stock_location)
     DO UPDATE SET quantity_stock = excluded.quantity_stock`,
  );
  
  const runTx = db.transaction(async () => {
    for (const item of items) {
      updatedCount += (await updateStmt.run(item.stock_m2, item.product_id)).changes;
    }
  });
  await runTx();
  return updatedCount;
}

async function bulkUpdateStock(
  items: Array<{ internal_code: string; stock_m2: number }>,
): Promise<number> {
  const preview = await previewStockImport(items);
  return await bulkUpdateStockByProductId(
    preview.matched.map((m) => ({
      product_id: m.product_id,
      stock_m2: m.new_stock,
    })),
  );
}
