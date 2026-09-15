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
  canonicalValues: string[];
  keywords: string[];
};

export const COLOR_PALETTES: ColorPaletteGroup[] = [
  {
    id: "white",
    label: "Trắng / Sáng",
    shortLabel: "Trắng",
    hex: "#FFFFFF",
    dotBorder: "#D1D5DB",
    canonicalValues: ["trắng"],
    keywords: ["trắng", "white", "off-white"],
  },
  {
    id: "beige",
    label: "Be / Kem / Cát",
    shortLabel: "Be/Kem",
    hex: "#E6D7C3",
    dotBorder: "#CDBFA9",
    canonicalValues: ["kem/be", "kem", "be", "beige"],
    keywords: ["kem/be", "kem", "be", "beige", "sand", "cát", "ivory", "travertine"],
  },
  {
    id: "grey",
    label: "Ghi / Xám xi măng",
    shortLabel: "Ghi xám",
    hex: "#9E9E9E",
    dotBorder: "#7E7E7E",
    canonicalValues: ["xám"],
    keywords: ["xám", "ghi", "grey", "gray", "xi măng", "cement"],
  },
  {
    id: "black",
    label: "Đen / Tro than",
    shortLabel: "Đen",
    hex: "#1E2022",
    dotBorder: "#111213",
    canonicalValues: ["đen"],
    keywords: ["đen", "black", "charcoal"],
  },
  {
    id: "brown",
    label: "Nâu / Gỗ mộc",
    shortLabel: "Nâu gỗ",
    hex: "#6B4C35",
    dotBorder: "#4F3624",
    canonicalValues: ["nâu"],
    keywords: ["nâu", "brown", "gỗ", "coffee", "cà phê", "chocolate"],
  },
  {
    id: "green",
    label: "Xanh lá / Rêu ngọc",
    shortLabel: "Xanh lá",
    hex: "#386641",
    dotBorder: "#27482D",
    canonicalValues: ["xanh lá", "xanh mint"],
    keywords: ["xanh lá", "rêu", "xanh mint", "mint", "green", "ngọc lục bảo", "emerald", "olive", "sage"],
  },
  {
    id: "blue",
    label: "Xanh dương / Biển sâu",
    shortLabel: "Xanh dương",
    hex: "#264653",
    dotBorder: "#1A323C",
    canonicalValues: ["xanh dương"],
    keywords: ["xanh dương", "xanh biển", "blue", "teal", "cobalt", "navy", "ocean"],
  },
  {
    id: "terracotta",
    label: "Đất nung / Cam / Đỏ",
    shortLabel: "Đất nung",
    hex: "#B94A2E",
    dotBorder: "#92361E",
    canonicalValues: ["cam", "đỏ"],
    keywords: ["cam", "đỏ", "terracotta", "đất nung", "red", "orange"],
  },
  {
    id: "yellow",
    label: "Vàng / Mustard / Gold",
    shortLabel: "Vàng",
    hex: "#E5A93C",
    dotBorder: "#B88228",
    canonicalValues: ["vàng", "gold"],
    keywords: ["vàng", "yellow", "gold", "mù tạt", "amber", "mustard"],
  },
  {
    id: "pink",
    label: "Hồng / Pastel",
    shortLabel: "Hồng",
    hex: "#D98A8A",
    dotBorder: "#B86B6B",
    canonicalValues: ["hồng"],
    keywords: ["hồng", "pink", "rose", "pastel"],
  },
  {
    id: "purple",
    label: "Tím / Violet",
    shortLabel: "Tím",
    hex: "#7E57C2",
    dotBorder: "#5E35B1",
    canonicalValues: ["tím"],
    keywords: ["tím", "purple", "violet"],
  },
];

// Bản đồ tra cứu nhanh O(1) cho các giá trị màu canonical và alias đầy đủ
const CANONICAL_MAP = new Map<string, string>();
for (const p of COLOR_PALETTES) {
  for (const v of [...p.canonicalValues, ...p.keywords]) {
    const k = v.toLowerCase().trim();
    if (!CANONICAL_MAP.has(k)) {
      CANONICAL_MAP.set(k, p.id);
    }
  }
}

/**
 * Ánh xạ chuỗi màu trong DB sang ID của bảng màu kiến trúc.
 * Xử lý tuần tự: Exact Match -> Slash Match -> Fallback 'Xanh' -> Safe Phrase Match
 */
export function matchColorPalette(rawColor: string | null | undefined): string | null {
  if (!rawColor) return null;
  const s = rawColor.trim().toLowerCase();
  if (!s || s === "chưa xác định" || s === "unknown") return null;

  // 1. So khớp chính xác từ điển chuẩn O(1)
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

  // 3. Fallback cho màu "Xanh" đơn lẻ (không xác định lá hay dương)
  if (s === "xanh") return "green";

  // 4. So khớp cụm từ an toàn (chỉ xét từ khóa dài >= 4 ký tự để tránh lỗi substring ngắn như 'be', 'tro')
  for (const p of COLOR_PALETTES) {
    for (const kw of p.keywords) {
      if (kw.length >= 4 && s.includes(kw)) {
        return p.id;
      }
    }
  }

  return null;
}
