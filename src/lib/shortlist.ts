/**
 * Chuẩn hoá shortlist IDs — alias-free để node --test import được.
 *
 * Canonical shortlist ID = String(products.id) (đã là chuẩn toàn codebase:
 * mọi toggle từ Home/Library/Lookbook lưu String <product-id>).
 * KHÔNG map heuristic mock-id → numeric (m1, m2… bị coi là invalid → UI
 * hiển thị là missing, không query, không tự xoá khỏi localStorage).
 */

/** Dung lượng tối đa 1 lượt resolve (chống ids khổng lồ từ storage hỏng). */
export const SHORTLIST_MAX_RESOLVE = 500;

export function normalizeShortlistIds(raw: string[]): {
  numeric: number[];
  invalid: string[];
} {
  const numeric: number[] = [];
  const invalid: string[] = [];
  const seenNumeric = new Set<number>();
  for (const rawId of raw ?? []) {
    const s = String(rawId).trim();
    if (s === "") continue; // storage rác — không phải material thiếu
    const id = Number(s);
    if (Number.isInteger(id) && id > 0) {
      if (!seenNumeric.has(id)) {
        seenNumeric.add(id);
        numeric.push(id);
      }
    } else {
      // Không phải id canonical (mock-id, rác) — giữ nguyên để UI báo missing.
      if (!invalid.includes(s)) invalid.push(s);
    }
    if (numeric.length >= SHORTLIST_MAX_RESOLVE) break;
  }
  return { numeric, invalid };
}

/** Dạng lưu trữ chuẩn: chuỗi, dedupe, giữ thứ tự. */
export function shortlistIdsAsStrings(raw: Array<string | number>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw ?? []) {
    const s = String(item).trim();
    if (s === "") continue;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}
