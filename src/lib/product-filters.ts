/**
 * Filter facet dùng chung cho mọi trang lọc sản phẩm (san-pham, thu-vien, và
 * sau này là landing page). Tách thành module thuần (không React) để các app
 * dùng cùng một định nghĩa facet + cùng một logic lọc/đếm — chấm dứt tình
 * trạng mỗi trang tự viết một bộ FACETS lệch nhau.
 *
 * Dữ liệu đầu vào là các row "giống sản phẩm" (Product / GalleryImageCandidate):
 * mọi field facet được đọc qua `valueOf(row, key)` — vì tên cột có thể khác nhau
 * giữa các loại row (vd `collections` ở candidate nhưng `collection` ở một số nơi).
 */

/** Giá trị rỗng (null/undefined/chuỗi trắng) được quy về hằng này khi đếm facet. */
export const BLANK_FILTER_VALUE = "__blank__";

/** Khóa facet chuẩn dùng chung — mỗi trang chọn subset + label riêng của mình. */
export type FacetKey =
  | "category"
  | "supplier"
  | "color"
  | "surface"
  | "size"
  | "shape"
  | "effect"
  | "collection"
  | "collections"
  | "material";

export type FacetOption = {
  value: string;
  count: number;
  /** Hiển thị; mặc định = value (dùng khi value là key, label là tiếng Việt) */
  label?: string;
};

/** Row đã chọn một facet có nằm trong tập `values` không (OR trong facet). */
export function matchesFacet(values: Set<string>, value: string | null | undefined): boolean {
  if (!values.size) return true;
  const normalized = (value || "").trim();
  return normalized ? values.has(normalized) : values.has(BLANK_FILTER_VALUE);
}

/** Cộng dồn count cho một giá trị facet (rỗng → BLANK_FILTER_VALUE). */
export function addFacetCount(map: Map<string, number>, value: string | null | undefined): void {
  const key = (value || "").trim() || BLANK_FILTER_VALUE;
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Chuyển [value, count] → option hiển thị trên checkbox/dropdown. */
export function toFacetOption([value, count]: [string, number]): FacetOption {
  return { value, count, label: value === BLANK_FILTER_VALUE ? "Blank" : value };
}

/**
 * Khớp toàn bộ bộ lọc facet đang chọn (AND giữa các facet; OR trong một facet).
 * `exclude` = facet đang tính options — bỏ qua facet đó để nó không tự lọc chính nó.
 */
export function matchesFacets(
  valueOf: (key: FacetKey) => string | null | undefined,
  filters: Partial<Record<FacetKey, string[]>>,
  exclude?: FacetKey,
): boolean {
  for (const key of Object.keys(filters) as FacetKey[]) {
    if (key === exclude) continue;
    const values = filters[key];
    if (!values?.length) continue;
    if (!matchesFacet(new Set(values), valueOf(key))) return false;
  }
  return true;
}

/**
 * Đếm facet options trên một tập rows — giữ hành vi chuẩn:
 * - Row chỉ được tính nếu khớp tất cả facet KHÁC đang chọn (trừ facet này).
 * - Row qua được preFilter (vd khớp từ khóa tìm) mới được tính.
 * - Mặc định mỗi row đếm 1; truyền `uniqueBy` để đếm theo key riêng (vd product_id)
 *   — tránh đếm 2 ảnh của cùng SP thành 2.
 */
export function buildFacetOptions<Row>(
  rows: readonly Row[],
  key: FacetKey,
  valueOf: (row: Row, key: FacetKey) => string | null | undefined,
  filters: Partial<Record<FacetKey, string[]>>,
  options?: {
    preFilter?: (row: Row) => boolean;
    uniqueBy?: (row: Row) => string | number;
    sort?: "alpha" | "count";
  },
): FacetOption[] {
  const { preFilter, uniqueBy, sort = "alpha" } = options ?? {};
  const map = new Map<string, number>();
  const seenUnique = new Map<string, Set<string | number>>();
  for (const row of rows) {
    if (preFilter && !preFilter(row)) continue;
    if (!matchesFacets((k) => valueOf(row, k), filters, key)) continue;
    const value = (valueOf(row, key) || "").trim();
    if (!value) continue;
    if (uniqueBy) {
      const id = uniqueBy(row);
      let ids = seenUnique.get(value);
      if (!ids) {
        ids = new Set();
        seenUnique.set(value, ids);
      }
      if (ids.has(id)) continue;
      ids.add(id);
    }
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  const entries = [...map.entries()];
  entries.sort(
    sort === "count"
      ? (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi")
      : (a, b) => a[0].localeCompare(b[0], "vi"),
  );
  return entries.map(toFacetOption);
}
