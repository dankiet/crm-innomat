/**
 * Multi mã HHDV / kho gắn 1 SP (mã báo giá).
 *
 * ## Định dạng chuẩn (import / export / DB)
 * ```
 * F2115,F2115-HN,FG2115
 * ```
 * - Cách nhau bằng dấu **phẩy** `,` (không khoảng trắng bắt buộc; trim từng mã)
 * - Không dùng dấu phẩy *trong* mã (mã HHDV không có dấu `,`)
 * - Excel: 1 ô, gõ `A,B,C` — khó nhầm hơn xuống dòng / pipe
 *
 * Parse vẫn nhận thêm: `|` `;` tab xuống dòng (file cũ / paste).
 * Serialize luôn ra dấu phẩy.
 *
 * `internal_code` = mã đầu list (legacy, auto-sync).
 */

/** Tách multi: ưu tiên `,` — vẫn nhận | ; tab newline */
const SPLIT_RE = /[,|;\n\t]+/;

/** Tách list mã, unique case-insensitive, giữ casing lần đầu. */
export function parseInternalCodesList(
  ...parts: Array<string | null | undefined>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (part == null || part === "") continue;
    for (const tok of String(part).split(SPLIT_RE)) {
      const t = tok.trim();
      if (!t) continue;
      const k = t.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

/** Chuẩn lưu trữ / Excel: `A,B,C` */
export function serializeInternalCodes(codes: string[]): string {
  return parseInternalCodesList(...codes).join(",");
}

/** Alias match stock / search: multi + primary cũ + mã báo giá. */
export function allProductAliases(p: {
  code?: string | null;
  internal_code?: string | null;
  internal_codes?: string | null;
}): string[] {
  return parseInternalCodesList(p.internal_codes, p.internal_code, p.code);
}

/**
 * Chuẩn hóa multi → { multi, primary }.
 * multi luôn dạng `A,B,C`.
 */
export function normalizeInternalCodesInput(
  raw: string | null | undefined,
  /** @deprecated gộp vào multi nếu còn */
  legacyPrimary?: string | null,
): { multi: string; primary: string } {
  const list = parseInternalCodesList(raw, legacyPrimary);
  return {
    multi: serializeInternalCodes(list),
    primary: list[0] ?? "",
  };
}
