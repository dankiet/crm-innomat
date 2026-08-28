/**
 * Import / export catalog sản phẩm (Excel).
 * Upsert theo Mã báo giá (code). Không đụng ảnh.
 */
import * as XLSX from "xlsx";
import {
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
  type ProductCreateInput,
  type ProductUpdate,
} from "./crm.server";
import type { Product } from "@/lib/types";

/** Header = tên cột DB (snake_case) */
const PRODUCT_XLSX_COLUMNS = [
  { key: "id", header: "id" },
  { key: "code", header: "code", required: true },
  { key: "name", header: "name" },
  { key: "size", header: "size" },
  { key: "material", header: "material" },
  { key: "category", header: "category" },
  { key: "supplier", header: "supplier" },
  { key: "color", header: "color" },
  { key: "packing", header: "packing" },
  { key: "packing_m2", header: "packing_m2" },
  { key: "packing_pcs", header: "packing_pcs" },
  { key: "packing_kg", header: "packing_kg" },
  { key: "retail_price", header: "retail_price" },
  { key: "trade_price", header: "trade_price" },
  { key: "b2b_price", header: "b2b_price" },
  { key: "discount_tp", header: "discount_tp" },
  { key: "discount_b2b", header: "discount_b2b" },
  { key: "surface", header: "surface" },
  { key: "shape", header: "shape" },
  { key: "collections", header: "collections" },
  { key: "unit", header: "unit" },
  { key: "image_path", header: "image_path" },
  { key: "created_at", header: "created_at" },
  { key: "note", header: "note" },
  { key: "is_hot", header: "is_hot" }
] as const;

type ProductXlsxKey = (typeof PRODUCT_XLSX_COLUMNS)[number]["key"];

type ProductImportRow = {
  code: string;
  id?: number;
  name?: string;
  size?: string;
  material?: string;
  category?: string;
  supplier?: string;
  color?: string;
  packing?: string;
  packing_m2?: number | null;
  packing_pcs?: number | null;
  packing_kg?: number | null;
  retail_price?: number | null;
  trade_price?: number | null;
  b2b_price?: number | null;
  discount_tp?: number | null;
  discount_b2b?: number | null;
  surface?: string;
  shape?: string;
  collections?: string;
  unit?: string;
  image_path?: string;
  created_at?: string;
  note?: string;
  is_hot?: number;
};

type ProductImportPreviewItem = {
  action: "create" | "update";
  code: string;
  name: string;
  product_id?: number;
  changes?: string[];
  row: ProductImportRow;
};

type ProductImportPreview = {
  create: ProductImportPreviewItem[];
  update: ProductImportPreviewItem[];
  errors: Array<{ code: string; message: string }>;
  create_count: number;
  update_count: number;
  error_count: number;
};

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  // "420,000" | "31%" | " 550.000 " (VN)
  let s = String(v).replace(/\s/g, "").replace(/%/g, "");
  // bỏ dấu nghìn: 420,000 hoặc 420.000 (khi là số nguyên nghìn)
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    s = s.replace(/[.,]/g, "");
  } else {
    s = s.replace(/,/g, "");
  }
  if (!s || s === "-" || s === "—") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function hotFlag(v: unknown): number {
  if (v === true || v === 1 || v === "1") return 1;
  const s = str(v).toLowerCase();
  if (["x", "yes", "y", "true", "có", "co", "hot"].includes(s)) return 1;
  return 0;
}

function productToRow(p: Product): Record<string, string | number | null> {
  return {
    id: p.id,
    code: p.code,
    name: p.name || "",
    size: p.size || "",
    material: p.material || "",
    category: p.category || "",
    supplier: p.supplier || "",
    color: p.color || "",
    packing: p.packing || "",
    packing_m2: p.packing_m2 ?? "",
    packing_pcs: p.packing_pcs ?? "",
    packing_kg: p.packing_kg ?? "",
    retail_price: p.retail_price ?? "",
    trade_price: p.trade_price ?? "",
    b2b_price: p.b2b_price ?? "",
    discount_tp: p.discount_tp ?? "",
    discount_b2b: p.discount_b2b ?? "",
    surface: p.surface || "",
    shape: p.shape || "",
    collections: p.collections || "",
    unit: p.unit || "",
    image_path: p.image_path || "",
    created_at: p.created_at || "",
    note: p.note || "",
    is_hot: p.is_hot ? 1 : 0,
  };
}

export async function exportProductsXlsx(opts?: {
  category?: string;
}): Promise<{
  filename: string;
  base64: string;
  mimeType: string;
}> {
  const products = await listProducts({
    category: opts?.category,
    limit: 50_000,
  });

  const rows =
    products.length > 0
      ? products.map(productToRow)
      : [
          // template rỗng 1 dòng mẫu
          {
            id: 1,
            code: "VD-001",
            name: "Tên mẫu",
            size: "300x600",
            material: "",
            category: "",
            supplier: "",
            color: "",
            packing: "",
            packing_m2: "",
            packing_pcs: "",
            packing_kg: "",
            retail_price: 350000,
            trade_price: "",
            b2b_price: "",
            discount_tp: "",
            discount_b2b: "",
            surface: "",
            shape: "",
            collections: "",
            unit: "",
            image_path: "",
            created_at: "",
            note: "",
            is_hot: 0,
          },
        ];

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: PRODUCT_XLSX_COLUMNS.map((c) => c.header),
  });
  // width gợi ý
  ws["!cols"] = PRODUCT_XLSX_COLUMNS.map((c) => ({
    wch: Math.min(28, Math.max(10, c.header.length + 4)),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "San pham");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    filename: `San_pham_${date}.xlsx`,
    base64: Buffer.from(buf).toString("base64"),
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

function normHeader(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map header file → field.
 * Hỗ trợ:
 *  - file export CRM (Mã báo giá, Giá lẻ…)
 *  - bảng giá thô: STT | Mã số | Kích thước | Tên | Chất liệu |
 *    ĐƠN GIÁ xuất… | Cột A/B/C | GIÁ BÁN LẺ | Tỉ lệ | GHI CHÚ
 *
 * Map giá bảng thô:
 *  - GIÁ BÁN LẺ → retail_price
 *  - Cột A (CTYXD/TKE) → trade_price (CK TP)
 *  - Cột C (cân đối) → b2b_price; fallback Cột B nếu không có C
 *  - Tỉ lệ % = markup giá xuất (không map CK)
 */
function mapHeaders(headers: string[]): Map<string, ProductXlsxKey> {
  const aliases: Record<string, ProductXlsxKey> = {};
  for (const col of PRODUCT_XLSX_COLUMNS) {
    aliases[normHeader(col.header)] = col.key;
  }
  Object.assign(aliases, {
    code: "code",
    ma: "code",
    "ma so": "code",
    "ma bg": "code",
    "ma san pham": "code",
    "ma hang": "code",
    "ma bao gia": "code",
    // «Mã nội bộ» = multi (comma). Header cũ vẫn map vào internal_codes.
    
    name: "name",
    ten: "name",
    "ten san pham": "name",
    "ten hang": "name",
    size: "size",
    "kich thuoc": "size",
    "kich thuoc (mm)": "size",
    material: "material",
    "chat lieu": "material",
    category: "category",
    "danh muc": "category",
    supplier: "supplier",
    color: "color",
    mau: "color",
    packing: "packing",
    "quy cach": "packing",
    packing_m2: "packing_m2",
    "m2/thung": "packing_m2",
    packing_pcs: "packing_pcs",
    "vien/thung": "packing_pcs",
    packing_kg: "packing_kg",
    "kg/thung": "packing_kg",
    "kg/ thung": "packing_kg",
    "khoi luong": "packing_kg",
    "trong luong": "packing_kg",
    retail_price: "retail_price",
    "gia le": "retail_price",
    "gia ban le": "retail_price",
    "gia ban le (gom vat)": "retail_price",
    trade_price: "trade_price",
    "gia tp": "trade_price",
    "gia thuong mai": "trade_price",
    "cot a": "trade_price",
    b2b_price: "b2b_price",
    "gia b2b": "b2b_price",
    "gia partner": "b2b_price",
    "cot b": "b2b_price",
    "cot c": "b2b_price",
    discount_tp: "discount_tp",
    "ck tp": "discount_tp",
    "ck tp %": "discount_tp",
    discount_b2b: "discount_b2b",
    "ck b2b": "discount_b2b",
    "ck b2b %": "discount_b2b",
    
    note: "note",
    "ghi chu": "note",
    is_hot: "is_hot",
    "ban chay": "is_hot",
    hot: "is_hot",
    collections: "collections",
    shape: "shape",
    "kieu dang": "shape",
    "kiểu dáng": "shape",
    surface: "surface",
    "be mat": "surface",
    unit: "unit",
    "don vi": "unit",
  } satisfies Record<string, ProductXlsxKey>);

  // Khớp chứa (header dài bảng giá). Ưu tiên rule cụ thể trước.
  const containsRules: Array<{ test: (h: string) => boolean; key: ProductXlsxKey }> =
    [
      { test: (h) => h.includes("gia ban le"), key: "retail_price" },
      {
        test: (h) =>
          h.includes("cot a") ||
          (h.includes("cot a:") && h.includes("ctyxd")),
        key: "trade_price",
      },
      // Cột C trước B (cân đối = partner hay dùng)
      {
        test: (h) => h.includes("cot c") || h.includes("can doi"),
        key: "b2b_price",
      },
      {
        test: (h) => h.includes("cot b") && !h.includes("cot c"),
        key: "b2b_price",
      },
      {
        test: (h) =>
          h.includes("gia tp") ||
          h.includes("thuong mai") ||
          (h.includes("don gia xuat") && h.includes("tong")),
        key: "trade_price",
      },
      {
        test: (h) => h === "ma so" || h.startsWith("ma so "),
        key: "code",
      },
      {
        test: (h) =>
          h.includes("kich thuoc") || h === "size" || h.endsWith("(mm)"),
        key: "size",
      },
      {
        test: (h) => h === "ten" || h.startsWith("ten ") || h.includes("ten hang"),
        key: "name",
      },
      {
        test: (h) => h.includes("chat lieu") || h.includes("porcelain"),
        key: "material",
      },
      {
        test: (h) => h.includes("ghi chu"),
        key: "note",
      },
      {
        test: (h) =>
          h.includes("kg/thung") ||
          h.includes("kg/ thung") ||
          (h.includes("kg") && h.includes("thung")) ||
          h.includes("khoi luong") ||
          h.includes("trong luong"),
        key: "packing_kg",
      },
    ];

  const map = new Map<string, ProductXlsxKey>();
  const usedKeys = new Set<ProductXlsxKey>();

  for (const h of headers) {
    const n = normHeader(h);
    // bỏ STT / Ảnh / Tỉ lệ / Tham khảo (không map)
    if (
      n === "stt" ||
      n === "anh" ||
      n === "image" ||
      n.startsWith("ti le") ||
      n.startsWith("ti le") ||
      n.includes("tham khao")
    ) {
      continue;
    }

    let key = aliases[n];
    if (!key) {
      for (const rule of containsRules) {
        if (rule.test(n)) {
          key = rule.key;
          break;
        }
      }
    }
    if (!key) continue;
    // Không ghi đè key đã map (trừ khi header khớp exact hơn — exact đã set trước)
    if (usedKeys.has(key) && !aliases[n]) continue;
    map.set(h, key);
    usedKeys.add(key);
  }

  // Ưu tiên cột bảng giá chuẩn (A/B/C) hơn tên header mơ hồ
  const headerList = headers.map((h) => ({ h, n: normHeader(h) }));
  const colA = headerList.find((x) => x.n.includes("cot a"));
  const colC = headerList.find(
    (x) => x.n.includes("cot c") || x.n.includes("can doi"),
  );
  const colB = headerList.find(
    (x) => x.n.includes("cot b") && !x.n.includes("cot c"),
  );

  if (colA) {
    // gỡ trade_price khỏi «Đơn giá xuất…» nếu đã gán — Cột A mới là TP
    for (const [h, k] of [...map.entries()]) {
      if (k === "trade_price" && h !== colA.h) map.delete(h);
    }
    map.set(colA.h, "trade_price");
  }

  if (colC) {
    for (const [h, k] of [...map.entries()]) {
      if (k === "b2b_price" && h !== colC.h) {
        const hn = normHeader(h);
        if (hn.includes("cot b")) map.delete(h);
      }
    }
    map.set(colC.h, "b2b_price");
  } else if (colB) {
    for (const [h, k] of [...map.entries()]) {
      if (k === "b2b_price" && h !== colB.h) map.delete(h);
    }
    map.set(colB.h, "b2b_price");
  }

  return map;
}

/** Parse sheet object rows (đã json) → ProductImportRow[] */
export function parseProductImportRows(
  rawRows: Record<string, unknown>[],
): ProductImportRow[] {
  if (!rawRows.length) return [];
  const headers = Object.keys(rawRows[0] ?? {});
  const headerMap = mapHeaders(headers);
  if (![...headerMap.values()].includes("code")) {
    throw new Error(
      "Không tìm thấy cột mã SP («Mã báo giá» / «Mã số»). Kiểm tra header file.",
    );
  }

  const out: ProductImportRow[] = [];
  for (const raw of rawRows) {
    const row: ProductImportRow = { code: "" };
    for (const [header, key] of headerMap) {
      const val = raw[header];
      switch (key) {
        case "id": row.id = typeof val === "number" ? val : parseInt(str(val), 10); break;
        case "code": {
          const c = str(val);
          row.code = c;
          break;
        }
        case "name":
        case "size":
        case "material":
        case "category":
        case "supplier":
        case "color":
        case "packing":
        case "note":
        case "surface":
        case "shape":
        case "collections":
        case "unit":
        case "image_path":
        case "created_at":
          // @ts-ignore
          row[key] = str(val);
          break;
        case "packing_m2":
        case "packing_pcs":
        case "packing_kg":
        case "retail_price":
        case "trade_price":
        case "b2b_price":
        case "discount_tp":
        case "discount_b2b":
          // @ts-ignore
          row[key] = numOrNull(val);
          break;
        case "is_hot":
          row.is_hot = hotFlag(val);
          break;
      }
    }
    if (row.code) out.push(row);
  }
  return out;
}

function fieldChanged(
  label: string,
  oldV: unknown,
  newV: unknown,
): string | null {
  const a =
    oldV == null || oldV === ""
      ? ""
      : typeof oldV === "number"
        ? String(oldV)
        : String(oldV).trim();
  const b =
    newV == null || newV === ""
      ? ""
      : typeof newV === "number"
        ? String(newV)
        : String(newV).trim();
  if (a === b) return null;
  return `${label}: ${a || "—"} → ${b || "—"}`;
}

export async function previewProductImport(
  items: ProductImportRow[],
): Promise<ProductImportPreview> {
  const products = await listProducts({ limit: 50_000 });
  const byCode = new Map(
    products.map((p) => [p.code.trim().toLowerCase(), p]),
  );
  // Fallback: map theo Mã nội bộ (product_internal_codes gộp vào multi_codes_list).
  // Cho phép file khóa theo «Mã số» = mã nội bộ vẫn khớp đúng SP (vd: cập nhật Kg/thùng).
  const byInternal = new Map<string, (typeof products)[number]>();
  for (const p of products) {
    const list = (p.multi_codes_list || "")
      .split(/[,;]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    for (const ic of list) {
      // Không ghi đè nếu mã nội bộ trùng Mã báo giá của SP khác (ưu tiên byCode khi tra cứu).
      if (!byInternal.has(ic)) byInternal.set(ic, p);
    }
  }

  const create: ProductImportPreviewItem[] = [];
  const update: ProductImportPreviewItem[] = [];
  const errors: Array<{ code: string; message: string }> = [];
  const seen = new Set<string>();

  for (const row of items) {
    const code = row.code.trim();
    if (!code) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) {
      errors.push({ code, message: "Trùng mã trong file (giữ dòng đầu)" });
      continue;
    }
    seen.add(key);

    const existing = byCode.get(key) ?? byInternal.get(key);
    if (!existing) {
      if (row.retail_price == null || Number(row.retail_price) <= 0) {
        errors.push({
          code,
          message: "SP mới cần Giá lẻ > 0",
        });
        continue;
      }
      create.push({
        action: "create",
        code,
        name: row.name?.trim() || code,
        row,
      });
      continue;
    }

    const changes: string[] = [];
    // Cột không có trong file = giữ nguyên. Cột có nhưng ô trống = xóa giá trị.
    const pushStr = (label: string, oldV: unknown, newV?: string) => {
      if (newV === undefined) return;
      const c = fieldChanged(label, oldV, newV);
      if (c) changes.push(c);
    };
    // Field bắt buộc (Giá lẻ > 0): trống trên file = giữ nguyên, không cho xóa.
    const pushNumRequired = (label: string, oldV: unknown, newV?: number | null) => {
      if (newV === undefined || newV === null) return;
      const c = fieldChanged(label, oldV, newV);
      if (c) changes.push(c);
    };
    // Field số tùy chọn: ô trống (null) = xóa giá trị.
    const pushNum = (label: string, oldV: unknown, newV?: number | null) => {
      if (newV === undefined) return;
      const c = fieldChanged(label, oldV, newV);
      if (c) changes.push(c);
    };


    pushStr("Tên", existing.name, row.name);
    pushStr("Size", existing.size, row.size);
    pushStr("Chất liệu", existing.material, row.material);
    pushStr("Danh mục", existing.category, row.category);
    pushStr("Bộ sưu tập", existing.supplier, row.supplier);
    pushStr("Màu", existing.color, row.color);
    pushStr("Quy cách", existing.packing, row.packing);
    pushStr("Bề mặt", existing.surface, row.surface);
    pushStr("Kiểu dáng", existing.shape, row.shape);
    pushStr("Hiệu ứng vân/mặt gạch", existing.collections, row.collections);
    pushNum("m²/thùng", existing.packing_m2, row.packing_m2);
    pushNum("Viên/thùng", existing.packing_pcs, row.packing_pcs);
    pushNum("Kg/thùng", existing.packing_kg, row.packing_kg);
    pushNumRequired("Giá lẻ", existing.retail_price, row.retail_price);
    pushNum("Giá TP", existing.trade_price, row.trade_price);
    pushNum("Giá B2B", existing.b2b_price, row.b2b_price);
    pushNum("CK TP", existing.discount_tp, row.discount_tp);
    pushNum("CK B2B", existing.discount_b2b, row.discount_b2b);

    pushStr("Ghi chú", existing.note, row.note);
    if (row.is_hot !== undefined && row.is_hot !== null) {
      // chỉ đổi nếu file ghi 1/x/hot; 0 cũng chấp nhận nếu cột có giá trị
      const c = fieldChanged(
        "Bán chạy",
        existing.is_hot ? 1 : 0,
        row.is_hot ? 1 : 0,
      );
      if (c) changes.push(c);
    }

    if (changes.length === 0) {
      // still count as update-noop? skip to keep preview clean
      continue;
    }

    update.push({
      action: "update",
      code,
      name: row.name?.trim() || existing.name,
      product_id: existing.id,
      changes,
      row,
    });
  }

  return {
    create,
    update,
    errors,
    create_count: create.length,
    update_count: update.length,
    error_count: errors.length,
  };
}

function rowToUpdate(row: ProductImportRow): ProductUpdate {
  const u: ProductUpdate = {};
  if (row.name !== undefined) u.name = row.name;
  if (row.size !== undefined) u.size = row.size;
  if (row.material !== undefined) u.material = row.material;
  if (row.category !== undefined) u.category = row.category;
  if (row.supplier !== undefined) u.supplier = row.supplier;
  if (row.color !== undefined) u.color = row.color;
  if (row.packing !== undefined) u.packing = row.packing;
  if (row.packing_m2 !== undefined) u.packing_m2 = row.packing_m2;
  if (row.packing_pcs !== undefined) u.packing_pcs = row.packing_pcs;
  if (row.packing_kg !== undefined) u.packing_kg = row.packing_kg;
  if (row.retail_price !== undefined && row.retail_price !== null) u.retail_price = Math.round(row.retail_price);
  if (row.trade_price !== undefined) u.trade_price = row.trade_price !== null ? Math.round(row.trade_price) : (null as any);
  if (row.b2b_price !== undefined) u.b2b_price = row.b2b_price !== null ? Math.round(row.b2b_price) : (null as any);
  if (row.discount_tp !== undefined) u.discount_tp = row.discount_tp;
  if (row.discount_b2b !== undefined) u.discount_b2b = row.discount_b2b;
  if (row.surface !== undefined) u.surface = row.surface;
  if (row.shape !== undefined) u.shape = row.shape;
  if (row.collections !== undefined) u.collections = row.collections;
  if (row.unit !== undefined) u.unit = row.unit;
  if (row.image_path !== undefined) u.image_path = row.image_path;
  if (row.note !== undefined) u.note = row.note;
  if (row.is_hot !== undefined) u.is_hot = row.is_hot ? 1 : 0;
  return u;
}

function rowToCreate(row: ProductImportRow): ProductCreateInput {
  return {
    code: row.code.trim(),
    name: row.name ?? "",
    size: row.size ?? "",
    material: row.material ?? "",
    category: row.category ?? "",
    supplier: row.supplier ?? "",
    color: row.color ?? "",
    packing: row.packing ?? "",
    packing_m2: row.packing_m2 ?? null,
    packing_pcs: row.packing_pcs ?? null,
    packing_kg: row.packing_kg ?? null,
    retail_price: row.retail_price !== undefined && row.retail_price !== null ? Math.round(row.retail_price) : 0,
    trade_price: row.trade_price !== undefined && row.trade_price !== null ? Math.round(row.trade_price) : null,
    b2b_price: row.b2b_price !== undefined && row.b2b_price !== null ? Math.round(row.b2b_price) : null,
    discount_tp: row.discount_tp ?? null,
    discount_b2b: row.discount_b2b ?? null,
    surface: row.surface ?? "",
    shape: row.shape ?? "",
    collections: row.collections ?? "",
    unit: row.unit ?? "",
    image_path: row.image_path ?? "",
    note: row.note ?? "",
    is_hot: row.is_hot ? 1 : 0,
  };
}

export async function applyProductImport(items: ProductImportRow[]): Promise<{
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ code: string; message: string }>;
}> {
  const preview = await previewProductImport(items);
  let created = 0;
  let updated = 0;
  const errors = [...preview.errors];

  for (const item of preview.create) {
    try {
      await createProduct(rowToCreate(item.row));
      created++;
    } catch (e) {
      errors.push({
        code: item.code,
        message: e instanceof Error ? e.message : "Lỗi tạo SP",
      });
    }
  }

  for (const item of preview.update) {
    try {
      if (!item.product_id) continue;
      await updateProduct(item.product_id, rowToUpdate(item.row));
      // verify still exists
      if (!(await getProduct(item.product_id))) {
        throw new Error("Không cập nhật được");
      }
      updated++;
    } catch (e) {
      errors.push({
        code: item.code,
        message: e instanceof Error ? e.message : "Lỗi cập nhật SP",
      });
    }
  }

  return {
    created,
    updated,
    skipped: items.length - created - updated - errors.length,
    errors,
  };
}

export async function exportInternalCodesXlsx(): Promise<{ filename: string; base64: string; mimeType: string }> {
  const { getDb } = await import('./index.server'); const db = getDb();
  const rows = await db.prepare(`
    SELECT i.id, p.code as product_code, p.name as product_name, i.internal_code, inv.stock_location, inv.quantity_stock, inv.created_at
    FROM product_internal_codes i
    LEFT JOIN products p ON p.id = i.product_id
    LEFT JOIN inventory inv ON inv.internal_code = i.internal_code
    ORDER BY i.id
  `).all<any>();
  
  const mapped = rows.map((r: any) => ({
    id: r.id || "",
    product_code: r.product_code || "",
    product_name: r.product_name || "",
    internal_code: r.internal_code || "",
    stock_location: r.stock_location || "",
    quantity_stock: r.quantity_stock || 0,
    created_at: r.created_at || ""
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(mapped.length ? mapped : [{ id: "", product_code: "", product_name: "", internal_code: "", stock_location: "", quantity_stock: "", created_at: "" }]);
  XLSX.utils.book_append_sheet(wb, ws, "TonKho");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return {
    filename: `TonKho_${new Date().toISOString().slice(0,10)}.xlsx`,
    base64: buf.toString("base64"),
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
