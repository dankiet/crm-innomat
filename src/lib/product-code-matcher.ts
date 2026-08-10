/**
 * Thuật toán đối chiếu Mã sản phẩm, Mã nội bộ, Tên sản phẩm, và Quy cách đóng gói.
 * Ported 1-1 từ thư mục match-code (Python).
 */

export function normRaw(s: string): string {
  if (!s) return "";
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const PREFIX_PATTERNS = [
  /^/,
  /^\d+-/,
  /^\d(?=[A-Z0-9])/,
  /^[A-Z](?=\d)/, // 1 chữ cái dẫn đầu trước số, vd "Y6861LV" -> "6861LV"
];

const SUFFIX_PATTERNS = [
  /$/,
  /-HN$/,
  /-\d+$/,
  /-[A-Z]$/,
  /[A-Z]$/, // 1 chữ cái cuối không có gạch ngang, vd "BH104S" -> "BH104"
];

/**
 * Trả về danh sách candidate CÓ THỨ TỰ ƯU TIÊN:
 * Khớp nguyên bản / ít sửa đổi nhất được thử trước,
 * các biến thể cắt bỏ tiền tố/hậu tố được thử sau cùng.
 */
export function candidates(rawCode: string): string[] {
  const code = (rawCode || "").toUpperCase().trim();
  if (!code) return [];

  const cands: string[] = [];
  const seen = new Set<string>();

  const push = (c: string) => {
    if (c && !seen.has(c)) {
      seen.add(c);
      cands.push(c);
    }
  };

  push(code);
  push(normRaw(code));

  // Tạo tổ hợp tiền tố / hậu tố sắp xếp theo mức độ can thiệp từ ít đến nhiều
  const combos: Array<{ priority: number; pre: RegExp; suf: RegExp }> = [];
  for (let pi = 0; pi < PREFIX_PATTERNS.length; pi++) {
    for (let si = 0; si < SUFFIX_PATTERNS.length; si++) {
      combos.push({
        priority: pi + si,
        pre: PREFIX_PATTERNS[pi],
        suf: SUFFIX_PATTERNS[si],
      });
    }
  }
  combos.sort((a, b) => a.priority - b.priority);

  for (const { pre, suf } of combos) {
    const strippedPre = code.replace(pre, "");
    const stripped = strippedPre.replace(suf, "");
    if (stripped) {
      push(stripped);
      push(normRaw(stripped));
    }
  }

  return cands;
}

/**
 * Lấy mã trong ngoặc đơn ở cột Mô tả, vd '06164A-1 (06164A)' hoặc 'FG36550 (MF36Y00C)'.
 */
export function extractAliasCodes(moTa: string): string[] {
  if (!moTa) return [];
  const out: string[] = [];
  const s = String(moTa).trim();

  // Mã đứng trước ngoặc
  const mHead = s.match(/^\s*([A-Za-z0-9\-/]+)/);
  if (mHead) {
    out.push(mHead[1]);
  }

  // Mã trong ngoặc
  const regexInParen = /\(([^()]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regexInParen.exec(s)) !== null) {
    if (match[1]) {
      out.push(match[1].trim());
    }
  }

  return out;
}

/**
 * Tách Tên sản phẩm / Kích thước / Quy cách đóng gói từ cột Tên hàng.
 * Cấu trúc: "<Tên sản phẩm>, <Mã hàng>, <Kích thước> (<Quy cách đóng gói>)"
 */
export function extractNameDimPack(
  tenHang: string,
  maHang: string,
): { name: string; dim: string; pack: string } {
  if (!tenHang) return { name: "", dim: "", pack: "" };
  const text = tenHang.trim();

  // Quy cách đóng gói = nội dung trong ngoặc đơn cuối cùng của chuỗi
  let pack = "";
  let textWoPack = text;
  const mPack = text.match(/\(([^()]*)\)\s*$/);
  if (mPack) {
    pack = mPack[1].trim();
    textWoPack = text.slice(0, mPack.index).trimEnd();
  }

  let name = "";
  let dim = "";
  let idx = -1;

  if (maHang) {
    idx = textWoPack.toUpperCase().indexOf(maHang.toUpperCase());
  }

  if (idx !== -1) {
    name = textWoPack.slice(0, idx).replace(/[\s,]+$/, "").trim();
    dim = textWoPack.slice(idx + maHang.length).replace(/^[\s,]+/, "").trim();
  } else {
    // Fallback: tách theo dấu phẩy đầu tiên
    if (textWoPack.includes(",")) {
      const firstComma = textWoPack.indexOf(",");
      name = textWoPack.slice(0, firstComma).trim();
      dim = textWoPack.slice(firstComma + 1).trim();
    } else {
      name = textWoPack;
      dim = "";
    }
  }

  return { name, dim, pack };
}

/**
 * Viết hoa chữ cái đầu mỗi từ, giữ nguyên dấu tiếng Việt.
 */
export function titleCaseVn(s: string): string {
  if (!s) return s;
  return s
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

/**
 * Chuẩn hóa ký hiệu diện tích: ㎡ / m² -> m2.
 */
function normalizeAreaUnit(u: string): string {
  if (!u) return u;
  const u2 = u
    .trim()
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/㎡/g, "m2")
    .replace(/\s+/g, "");
  return u2 === "m2" || u2 === "m" ? "m2" : u.trim();
}

export type ParsedPackaging = {
  so_luong_dong_goi: string;
  dien_tich: string;
  don_vi_tinh: string;
};

/**
 * Tách Quy cách đóng gói (vd '17 vĩ/1.202㎡') thành 3 phần:
 * - so_luong_dong_goi: '17'
 * - dien_tich: '1.202'
 * - don_vi_tinh: 'vỉ/m2'
 */
export function parsePackaging(pack: string): ParsedPackaging {
  if (!pack) {
    return { so_luong_dong_goi: "", dien_tich: "", don_vi_tinh: "" };
  }

  const parts = pack
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (!parts.length) {
    return { so_luong_dong_goi: "", dien_tich: "", don_vi_tinh: "" };
  }

  // Phần đầu: "17 vĩ" -> số lượng "17" + đơn vị đóng gói "vỉ"
  const m1 = parts[0].match(/^([\d.,]+)?\s*(.*)$/);
  const soLuong = (m1?.[1] || "").replace(",", ".").trim();
  let donViDongGoi = (m1?.[2] || "").trim();
  if (/viên/i.test(donViDongGoi)) donViDongGoi = "viên";
  else if (/vĩ|vỉ/i.test(donViDongGoi)) donViDongGoi = "vỉ";

  // Các phần còn lại: tìm phần có số (diện tích) và phần chỉ có chữ (đơn vị)
  let dienTich = "";
  let donViDienTich = "";
  const extra: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const m2 = p.match(/^([\d.,]+)\s*(.*)$/);
    if (m2 && !dienTich) {
      dienTich = m2[1].replace(",", ".");
      if (m2[2]) {
        donViDienTich = normalizeAreaUnit(m2[2]);
      }
    } else if (!donViDienTich) {
      donViDienTich = normalizeAreaUnit(p);
    } else {
      extra.push(normalizeAreaUnit(p));
    }
  }

  let donViTinh = [donViDongGoi, donViDienTich].filter(Boolean).join("/");
  if (extra.length > 0) {
    donViTinh += " / " + extra.join(" / ");
  }

  return {
    so_luong_dong_goi: soLuong,
    dien_tich: dienTich,
    don_vi_tinh: donViTinh,
  };
}
