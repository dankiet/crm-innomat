/**
 * Primerias facet + sort của trang sản phẩm (`/san-pham`).
 *
 * Tách nguyên văn từ `src/routes/_app.san-pham.tsx`. `PRODUCT_SORT_FIELDS`
 * (metadata hiển thị cho menu sort) vẫn nằm ở route vì nó dùng type của
 * `@/components/SortMenu` — lib KHÔNG import components.
 *
 * Xem OUT OF SCOPE FINDINGS trong REFACTOR_REPORT — nơi ở đúng là `lib/types.ts`.
 */
import type { Product } from "./types.ts";

export type SortDir = "asc" | "desc";

export function parseCsv(v: unknown): string[] {
  if (typeof v !== "string" || !v.trim()) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Nhóm facet — dùng khi tính options: loại facet của chính nhóm đó ra khỏi bộ lọc. */
export type FacetKey = "color" | "surface" | "size" | "shape" | "texture" | "collection" | "supplier";
export const BLANK_FILTER_VALUE = "__blank__";

export function matchesFacet(values: Set<string>, value: string | null | undefined): boolean {
  if (!values.size) return true;
  const normalized = (value || "").trim();
  return normalized ? values.has(normalized) : values.has(BLANK_FILTER_VALUE);
}

export function addFacetCount(map: Map<string, number>, value: string | null | undefined): void {
  const key = (value || "").trim() || BLANK_FILTER_VALUE;
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function toFacetOption([value, count]: [string, number]) {
  return { value, count, label: value === BLANK_FILTER_VALUE ? "Blank" : value };
}

/**
 * Đếm facet từ danh sách dòng đã lọc, sort theo count giảm dần rồi sinh option.
 * Khuôn lặp của 4 memo trong /san-pham (surface/texture/collection/supplier).
 * Lưu ý KHÔNG áp cho color (chuẩn hoá tông màu + thứ tự riêng) và shape
 * (sort theo alphabet) — chúng là biến thể có chủ đích.
 */
export function countFacet(
  rows: ReadonlyArray<{ p: Product }>,
  getter: (p: Product) => string | null | undefined,
): Array<{ value: string; count: number; label: string }> {
  const map = new Map<string, number>();
  for (const { p } of rows) {
    addFacetCount(map, getter(p));
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(toFacetOption);
}

export type ProductSort =
  | "default"
  | "code_asc"
  | "code_desc"
  | "name_asc"
  | "name_desc"
  | "price_asc"
  | "price_desc"
  | "stock_desc"
  | "stock_asc"
  | "hot_first";

export type ProductSortField =
  | "default"
  | "code"
  | "name"
  | "price"
  | "stock"
  | "hot";

export function decodeProductSort(value: ProductSort): {
  field: ProductSortField;
  dir?: SortDir;
} {
  switch (value) {
    case "code_asc":
      return { field: "code", dir: "asc" };
    case "code_desc":
      return { field: "code", dir: "desc" };
    case "name_asc":
      return { field: "name", dir: "asc" };
    case "name_desc":
      return { field: "name", dir: "desc" };
    case "price_asc":
      return { field: "price", dir: "asc" };
    case "price_desc":
      return { field: "price", dir: "desc" };
    case "stock_asc":
      return { field: "stock", dir: "asc" };
    case "stock_desc":
      return { field: "stock", dir: "desc" };
    case "hot_first":
      return { field: "hot", dir: "desc" };
    default:
      return { field: "default", dir: "asc" };
  }
}

export function encodeProductSort(field: ProductSortField, dir: SortDir): ProductSort {
  switch (field) {
    case "code":
      return dir === "desc" ? "code_desc" : "code_asc";
    case "name":
      return dir === "desc" ? "name_desc" : "name_asc";
    case "price":
      return dir === "desc" ? "price_desc" : "price_asc";
    case "stock":
      return dir === "desc" ? "stock_desc" : "stock_asc";
    case "hot":
      return "hot_first";
    default:
      return "default";
  }
}

export function compareProductCode(a: Product, b: Product): number {
  const byCode = (a.code || "").localeCompare(b.code || "", "vi", {
    numeric: true,
    sensitivity: "base",
  });
  if (byCode !== 0) return byCode;
  return a.id - b.id;
}

export function parseSort(v: unknown): ProductSort | undefined {
  if (
    v === "default" ||
    v === "code_asc" ||
    v === "code_desc" ||
    v === "name_asc" ||
    v === "name_desc" ||
    v === "price_asc" ||
    v === "price_desc" ||
    v === "stock_desc" ||
    v === "stock_asc" ||
    v === "hot_first"
  )
    return v;
  return undefined;
}

/** Giá lẻ — dùng cho sort theo giá. */
export function priceOf(p: Product): number {
  return Number(p.retail_price) || 0;
}