/**
 * Architectural Color Palettes (Chuẩn Moodboard KTS).
 * Phân nhóm 11 gam màu trực diện từ taxonomy `products.color` trong Database CRM.
 */

export type ColorPaletteGroup = {
  id: string;
  label: string;
  shortLabel: string;
  hex: string;
  dotBorder?: string;
  /** Các giá trị chuẩn nguyên bản (LOWER(TRIM(color))) thực tế trong PostgreSQL */
  dbCanonicalValues: string[];
  /** Các từ khóa alias bổ trợ cho tìm kiếm / moodboard */
  aliases: string[];
};

export const COLOR_PALETTES: ColorPaletteGroup[] = [
  {
    id: "white",
    label: "Trắng / Sáng",
    shortLabel: "Trắng",
    hex: "#FFFFFF",
    dotBorder: "#D1D5DB",
    dbCanonicalValues: ["trắng"],
    aliases: ["white", "off-white"],
  },
  {
    id: "beige",
    label: "Be / Kem / Cát",
    shortLabel: "Be/Kem",
    hex: "#E6D7C3",
    dotBorder: "#CDBFA9",
    dbCanonicalValues: ["kem/be", "kem", "beige"],
    aliases: ["sand", "cát", "ivory", "travertine"],
  },
  {
    id: "grey",
    label: "Ghi / Xám xi măng",
    shortLabel: "Ghi xám",
    hex: "#9E9E9E",
    dotBorder: "#7E7E7E",
    dbCanonicalValues: ["xám"],
    aliases: ["ghi", "grey", "gray", "xi măng", "cement"],
  },
  {
    id: "black",
    label: "Đen / Tro than",
    shortLabel: "Đen",
    hex: "#1E2022",
    dotBorder: "#111213",
    dbCanonicalValues: ["đen"],
    aliases: ["black", "charcoal"],
  },
  {
    id: "brown",
    label: "Nâu / Gỗ mộc",
    shortLabel: "Nâu gỗ",
    hex: "#6B4C35",
    dotBorder: "#4F3624",
    dbCanonicalValues: ["nâu"],
    aliases: ["brown", "gỗ", "coffee", "cà phê", "chocolate"],
  },
  {
    id: "green",
    label: "Xanh lá / Rêu ngọc",
    shortLabel: "Xanh lá",
    hex: "#386641",
    dotBorder: "#27482D",
    dbCanonicalValues: ["xanh lá", "xanh mint"],
    aliases: ["rêu", "mint", "green", "ngọc lục bảo", "emerald", "olive", "sage"],
  },
  {
    id: "blue",
    label: "Xanh dương / Biển sâu",
    shortLabel: "Xanh dương",
    hex: "#264653",
    dotBorder: "#1A323C",
    dbCanonicalValues: ["xanh dương"],
    aliases: ["xanh biển", "blue", "teal", "cobalt", "navy", "ocean"],
  },
  {
    id: "terracotta",
    label: "Đất nung / Cam / Đỏ",
    shortLabel: "Đất nung",
    hex: "#B94A2E",
    dotBorder: "#92361E",
    dbCanonicalValues: ["cam", "đỏ"],
    aliases: ["terracotta", "đất nung", "red", "orange"],
  },
  {
    id: "yellow",
    label: "Vàng / Mustard / Gold",
    shortLabel: "Vàng",
    hex: "#E5A93C",
    dotBorder: "#B88228",
    dbCanonicalValues: ["vàng"],
    aliases: ["yellow", "gold", "mù tạt", "amber", "mustard"],
  },
  {
    id: "pink",
    label: "Hồng / Pastel",
    shortLabel: "Hồng",
    hex: "#D98A8A",
    dotBorder: "#B86B6B",
    dbCanonicalValues: ["hồng"],
    aliases: ["pink", "rose", "pastel"],
  },
  {
    id: "purple",
    label: "Tím / Violet",
    shortLabel: "Tím",
    hex: "#7E57C2",
    dotBorder: "#5E35B1",
    dbCanonicalValues: ["tím"],
    aliases: ["purple", "violet"],
  },
];

// Bản đồ tra cứu O(1) chính xác cho các giá trị canonical từ DB
const CANONICAL_MAP = new Map<string, string>();
for (const p of COLOR_PALETTES) {
  for (const v of p.dbCanonicalValues) {
    CANONICAL_MAP.set(v.toLowerCase().trim(), p.id);
  }
}

// Bản đồ tra cứu alias mở rộng
const ALIAS_MAP = new Map<string, string>();
for (const p of COLOR_PALETTES) {
  for (const v of p.aliases) {
    ALIAS_MAP.set(v.toLowerCase().trim(), p.id);
  }
}

/**
 * Ánh xạ chuỗi màu trong DB sang ID của bảng màu kiến trúc.
 * Xử lý tuần tự:
 * 1. Exact Match trên giá trị Canonical DB
 * 2. Exact Match trên giá trị phân tách bằng dấu gạch chéo
 * 3. Exact Match trên danh sách Alias mở rộng
 * 4. Safe Phrase Match trên Alias có độ dài >= 4 ký tự
 */
export function matchColorPalette(rawColor: string | null | undefined): string | null {
  if (!rawColor) return null;
  const s = rawColor.trim().toLowerCase();
  if (!s || s === "chưa xác định" || s === "unknown") return null;

  // 1. So khớp chính xác từ điển chuẩn DB O(1)
  if (CANONICAL_MAP.has(s)) {
    return CANONICAL_MAP.get(s)!;
  }

  // 2. So khớp khi có dấu gạch chéo (VD: "Kem / Be", "Trắng/Xám")
  if (s.includes("/")) {
    const parts = s.split("/").map((p) => p.trim());
    for (const part of parts) {
      if (CANONICAL_MAP.has(part)) {
        return CANONICAL_MAP.get(part)!;
      }
    }
  }

  // 3. So khớp chính xác từ điển Alias O(1)
  if (ALIAS_MAP.has(s)) {
    return ALIAS_MAP.get(s)!;
  }

  // 4. So khớp cụm từ an toàn (chỉ xét alias dài >= 4 ký tự để tránh lỗi substring ngắn như 'be', 'tro')
  for (const p of COLOR_PALETTES) {
    for (const alias of p.aliases) {
      if (alias.length >= 4 && s.includes(alias)) {
        return p.id;
      }
    }
  }

  return null;
}
