/**
 * Mô hình draft của đề xuất vật liệu (mapping) + giá tự động.
 *
 * Tách nguyên văn từ `src/components/CustomerMappingDialog.tsx`. Chỉ lấy phần
 * "draft factory + giá" — `basisLabel`/`PRICE_BASIS_OPTIONS`/`fileToDataUrl`/`move`
 * là glue riêng của dialog nên vẫn nằm ở đó (xem REFACTOR_REPORT, P1-1d).
 */
import { basisToDiscountType, unitPriceForProduct } from "./pricing.ts";
import type { MappingPriceBasis, Product } from "./types.ts";

export type Draft = {
  key: string;
  areaGroupKey: string;
  collapsed: boolean;
  imagePath: string;
  imageDataUrl: string | null;
  sourceName: string;
  description: string;
  size: string;
  product: Product | null;
  customProduct: CustomProduct | null;
  /** "" = tự tính theo căn cứ giá; chuỗi số = giá chốt tay */
  priceOverride: string;
};

export type CustomProduct = {
  code: string;
  name: string;
  size: string;
  surface: string;
  retailPrice: string;
  imagePath: string;
  imageDataUrl: string | null;
  imageName: string;
};

export function key() {
  return Math.random().toString(36).slice(2);
}

export function blankDraft(): Draft {
  return {
    key: key(),
    areaGroupKey: key(),
    collapsed: false,
    imagePath: "",
    imageDataUrl: null,
    sourceName: "",
    description: "",
    size: "",
    product: null,
    customProduct: null,
    priceOverride: "",
  };
}

/** Giá tự động của 1 phương án theo căn cứ giá — 0 khi chưa chọn sản phẩm. */
export function autoPriceFor(item: Draft, basis: MappingPriceBasis): number {
  if (item.product) {
    return unitPriceForProduct(item.product, basisToDiscountType(basis));
  }
  if (item.customProduct) {
    return Number(item.customProduct.retailPrice.replace(/\D/g, "")) || 0;
  }
  return 0;
}