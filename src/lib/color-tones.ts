/**
 * Color → Tone group mapping ("Tông màu").
 *
 * Thay facet "Màu" (19 giá trị raw, lủng củng: Xanh / Xanh lá / Xanh Lá …)
 * bằng 8 nhóm tông màu dễ chọn hơn. Field DB giữ nguyên `color`; URL param
 * `?colors=` giữ tên nhưng giá trị có thể là group id ("xam") hoặc màu raw
 * ("Xám") — normalizeToneSelection chấp nhận cả hai.
 */

export const BLANK_FILTER_VALUE = "__blank__";

export type ToneGroupId =
  "trang_kem" | "xam" | "xanh_la" | "xanh_duong" | "nau" | "den" | "cam_terracotta" | "vang";

export interface ToneGroup {
  id: ToneGroupId;
  label: string;
}

/** 8 tông; thứ tự này là thứ tự hiển thị đề xuất. */
export const TONE_GROUPS: ToneGroup[] = [
  { id: "trang_kem", label: "Trắng / Kem" },
  { id: "xam", label: "Xám" },
  { id: "xanh_la", label: "Xanh lá" },
  { id: "xanh_duong", label: "Xanh dương" },
  { id: "nau", label: "Nâu" },
  { id: "den", label: "Đen" },
  { id: "cam_terracotta", label: "Cam / Terracotta" },
  { id: "vang", label: "Vàng" },
] as const;

/** Dữ liệu thật trong DB (lowercase, trim): color raw → nhóm. */
const COLOR_TO_GROUP: Record<string, ToneGroupId> = {
  trắng: "trang_kem",
  "kem/be": "trang_kem",
  kem: "trang_kem",
  beige: "trang_kem",
  xám: "xam",
  "xanh lá": "xanh_la",
  xanh: "xanh_la",
  "xanh mint": "xanh_la",
  "xanh dương": "xanh_duong",
  nâu: "nau",
  đen: "den",
  cam: "cam_terracotta",
  đỏ: "cam_terracotta",
  hồng: "cam_terracotta",
  tím: "cam_terracotta",
  vàng: "vang",
};

/**
 * Raw color (db `color`) → group id.
 * Trả BLANK_FILTER_VALUE khi blank — matchesFacet/addFacetCount sẽ coi là
 * blank như hành vi cũ. Raw không khớp mapping trả "" (không đội vào options).
 */
export function toneOf(
  rawColor: string | null | undefined,
): ToneGroupId | "" | typeof BLANK_FILTER_VALUE {
  const normalized = (rawColor ?? "").trim().toLowerCase();
  if (!normalized) return BLANK_FILTER_VALUE;
  return COLOR_TO_GROUP[normalized] ?? "";
}

/** Label tiếng Việt của group id; blank token → "Blank" (giữ chuẩn cũ). */
export function toneLabel(id: string): string {
  if (!id) return "Blank";
  if (id === BLANK_FILTER_VALUE) return "Blank";
  return TONE_GROUPS.find((g) => g.id === id)?.label ?? id;
}

/**
 * Giá trị chọn từ URL / chip → group id. Chấp nhận cả group id ("xam"), màu
 * raw ("Xám", link cũ) và token blank ("__blank__") để round-trip không vỡ.
 */
export function normalizeToneSelection(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (trimmed === BLANK_FILTER_VALUE) return BLANK_FILTER_VALUE;
  if (TONE_GROUPS.some((g) => g.id === trimmed)) return trimmed;
  return toneOf(trimmed);
}
