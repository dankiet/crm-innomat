/**
 * Toán dòng báo giá (diện tích viên, số viên, đơn giá theo nhóm chiết khấu).
 *
 * Tách nguyên văn từ `src/components/NewQuoteDialog.tsx` — hệ thống "viên/m²" và
 * "tiền/chiết khấu" không thuộc về component. Mọi hàm thuần, test được.
 */
import { unitPriceForProduct } from "./pricing.ts";
import type { DiscountType, Product } from "./types.ts";

export type Line = {
  key: string;
  collapsed: boolean;
  product: Product | null;
  /** Mã hiển thị trên BG (có thể khác mã catalog) */
  product_code: string;
  /** Tên hiển thị trên BG (có thể khác tên catalog) */
  product_name: string;
  /** Kích thước hiển thị trên BG (có thể khác catalog) */
  size: string;
  /** Chất liệu hiển thị trên BG (có thể khác catalog) */
  material: string;
  /** Chuỗi thô đang gõ trong ô SL — giữ được "0", "0." khi nhập thập phân */
  quantity_raw: string;
  /** Số m² đã parse từ quantity_raw */
  quantity_m2: number;
  discount_pct: number;
  /** Đơn giá bán / m² — có thể nhập tay */
  unit_price: number;
  area: string;
};

/** Chỉ giữ chữ số + 1 dấu thập phân; nhận cả dấu phẩy kiểu VN ("0,12" → "0.12"). */
export function sanitizeQuantityInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(/,/g, ".");
  const [head, ...rest] = cleaned.split(".");
  return rest.length ? `${head}.${rest.join("")}` : head;
}

/** Số m² từ chuỗi thô — rỗng hoặc không hợp lệ = 0. */
export function parseQuantityInput(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Diện tích 1 viên (m²) — ưu tiên cột area_per_tile_m2 (admin chỉnh tay được);
 * nếu null thì parse từ size "WxH" (mm): size đơn "300x600" → 0.18, mosaic
 * nhiều cỡ ("85x85/256x273") lấy cặp LỚN NHẤT ("256x273" → 0.0699 m²).
 * Không xác định được → null (không gợi ý).
 */
export function tileAreaM2(product: Product): number | null {
  if (product.area_per_tile_m2 != null && Number.isFinite(product.area_per_tile_m2) && product.area_per_tile_m2 > 0) {
    return product.area_per_tile_m2;
  }
  const size = (product.size || "").trim();
  if (!size) return null;
  let best: number | null = null;
  const re = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(size)) !== null) {
    const area = (parseFloat(m[1]) * parseFloat(m[2])) / 1_000_000;
    if (Number.isFinite(area) && area > 0 && (best === null || area > best)) {
      best = area;
    }
  }
  return best;
}

/** Số viên tròn LÊN cho diện tích — null nếu chưa biết quy cách viên.
 *  Trừ epsilon để float noise (5.4/0.18 = 30.000000000000004) không đẩy
 *  số viên chuẩn thành 31. */
export function ceilTiles(quantityM2: number, areaPerTile: number): number | null {
  if (!(quantityM2 > 0) || !(areaPerTile > 0)) return null;
  return Math.ceil(quantityM2 / areaPerTile - 1e-9);
}

/** Format số m² với tối đa 2 chữ số thập phân (dấu phẩy kiểu VN). */
export function formatSqm(value: number): string {
  if (Number.isNaN(value)) return "0";
  return value.toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function calcUnit(
  product: Product,
  discountType: DiscountType,
  discountPct: number,
): number {
  return unitPriceForProduct(
    product,
    discountType,
    discountType === "custom" ? discountPct : undefined,
  );
}

/** Áp lại nhóm chiết khấu cho mọi dòng: cập nhật % và đơn giá tương ứng. */
export function applyDiscountType(type: DiscountType, current: Line[]): Line[] {
  return current.map((line) => {
    if (!line.product) return line;
    let pct = 0;
    if (type === "tp") pct = line.product.discount_tp ?? 0;
    else if (type === "b2b") pct = line.product.discount_b2b ?? 0;
    else if (type === "none") pct = 0;
    else pct = line.discount_pct;
    const unit = calcUnit(line.product, type, pct);
    return { ...line, discount_pct: pct, unit_price: unit };
  });
}