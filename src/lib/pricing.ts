import type { DiscountType, Product } from "@/lib/types";

/** Thuế suất VAT dùng chung (export báo giá + ước tính lợi nhuận). */
export const VAT_RATE = 0.08;

/** Quy đơn giá bán về trục gồm VAT — để so sánh đúng với trade_price (đã gồm VAT). */
function salePriceInclVat(
  unitPrice: number,
  includeVat: boolean,
): number {
  const base = Number(unitPrice) || 0;
  return includeVat ? Math.round(base) : Math.round(base * (1 + VAT_RATE));
}

/** Lợi nhuận ước tính 1 dòng BG: (giá bán gồm VAT − trade_price) × m².
 *  pct = lợi nhuận / doanh thu gồm VAT. null khi thiếu giá vốn hoặc số lượng. */
export function estimateLineProfitInfo(
  unitPrice: number,
  quantityM2: number,
  tradePrice: number | null | undefined,
  includeVat: boolean,
): { amount: number; pct: number } | null {
  const trade = tradePrice != null ? Number(tradePrice) : NaN;
  if (!Number.isFinite(trade) || trade <= 0) return null;
  const qty = Number(quantityM2) || 0;
  if (qty <= 0) return null;
  const saleUnit = salePriceInclVat(unitPrice, includeVat);
  const revenue = saleUnit * qty;
  const amount = Math.round((saleUnit - trade) * qty);
  return { amount, pct: revenue > 0 ? (amount / revenue) * 100 : 0 };
}

/** Giá đơn vị sau chiết khấu — ưu tiên giá Trade / Partner đã lưu (+VAT). */
export function unitPriceForProduct(
  product: Pick<
    Product,
    | "retail_price"
    | "trade_price"
    | "b2b_price"
    | "discount_tp"
    | "discount_b2b"
  >,
  discountType: DiscountType,
  customPct?: number | null,
): number {
  const retail = Math.round(Number(product.retail_price) || 0);

  if (discountType === "none") {
    return retail;
  }

  if (discountType === "tp") {
    const trade = product.trade_price;
    if (trade != null && Number(trade) > 0) {
      return Math.round(Number(trade));
    }
    return priceAfterDiscount(retail, product.discount_tp);
  }

  if (discountType === "b2b") {
    const partner = product.b2b_price;
    if (partner != null && Number(partner) > 0) {
      return Math.round(Number(partner));
    }
    return priceAfterDiscount(retail, product.discount_b2b);
  }

  // custom
  return priceAfterDiscount(retail, customPct ?? 0);
}

/** Fallback: tính từ % (khi chưa có trade_price / b2b_price). */
function priceAfterDiscount(
  retail: number,
  discountPct: number | null | undefined,
): number {
  const pct = discountPct ?? 0;
  return Math.round(retail * (1 - pct / 100));
}

/** % hiển thị trên dòng BG (làm tròn 2 chữ số). */
export function effectiveDiscountPct(
  retail: number,
  unitPrice: number,
): number {
  if (!retail || retail <= 0) return 0;
  return Math.round((1 - unitPrice / retail) * 10000) / 100;
}
