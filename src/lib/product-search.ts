/**
 * Helper search sản phẩm theo kiểu "exact-first": nếu token tách từ query khớp
 * chính xác `code` hoặc 1 mã phụ của bất kỳ SP nào trong pool → chỉ match exact
 * (loại nhiễu substring khi paste mã đầy đủ). Ngược lại → fallback substring
 * trên toàn bộ chuỗi searchable (giữ chức năng tìm theo tên / mã cụt).
 *
 * Mỗi nơi gọi truyền hàm `normalize` và haystack giữ nguyên chuẩn của nơi đó
 * (ví dụ thu-vien bỏ dấu, trang SP/dialog chỉ lowercase) để không hồi quy.
 */

export type SearchCodeRow = {
  /** Mã chính (đã normalize theo normalize của nơi gọi) */
  code: string;
  /** Các mã phụ (đã normalize) — split từ internal_codes / multi_codes_list */
  codes: string[];
};

/** Tách token, hỗ trợ paste nhiều mã cách nhau bởi khoảng trắng hoặc dấu phẩy */
export function splitSearchTokens(query: string, normalize: (value: string) => string): string[] {
  return normalize(query)
    .split(/[\s,，、;；|]+/)
    .filter(Boolean);
}

/** Build SearchCodeRow từ code chính + chuỗi mã phụ (phân tách bởi dấu phẩy/khoảng trắng) */
export function codeRowFromProduct(
  code: string,
  multiCodesList: string | null | undefined,
  normalize: (value: string) => string,
): SearchCodeRow {
  return {
    code: normalize(code),
    codes: (multiCodesList || "")
      .split(/[\s,，、;；|]+/)
      .map(normalize)
      .filter(Boolean),
  };
}

/** Tập mã chính xác trên toàn pool — dùng để nhận biết token nào là mã đầy đủ */
export function buildExactCodeSet(rows: SearchCodeRow[]): Set<string> {
  const set = new Set<string>();
  for (const row of rows) {
    if (row.code) set.add(row.code);
    for (const code of row.codes) {
      if (code) set.add(code);
    }
  }
  return set;
}

/**
 * OR exact-first: trả true nếu row khớp BẤT KỲ token nào.
 * - Token là mã đầy đủ trong pool → so sánh exact code/mã phụ.
 * - Token còn lại → substring trên `searchable`.
 */
export function matchSearchTokens(
  row: SearchCodeRow,
  tokens: string[],
  searchable: string,
  exactSet: Set<string>,
): boolean {
  if (!tokens.length) return true;
  return tokens.some((token) => {
    if (exactSet.has(token)) {
      return row.code === token || row.codes.includes(token);
    }
    return searchable.includes(token);
  });
}
