/**
 * Architectural Color Palettes (Chuẩn Moodboard KTS).
 * Phân nhóm 8 gam màu chính từ taxonomy `products.color`.
 */

export type ColorPaletteGroup = {
  id: string;
  label: string;
  shortLabel: string;
  hex: string;
  dotBorder?: string;
  keywords: string[];
};

export const COLOR_PALETTES: ColorPaletteGroup[] = [
  {
    id: "white",
    label: "Trắng / Sáng",
    shortLabel: "Trắng",
    hex: "#FFFFFF",
    dotBorder: "#D1D5DB",
    keywords: ["trắng", "white", "off-white", "sáng"],
  },
  {
    id: "beige",
    label: "Be / Kem / Cát",
    shortLabel: "Be/Kem",
    hex: "#E6D7C3",
    dotBorder: "#CDBFA9",
    keywords: ["kem", "be", "beige", "sand", "cát", "ivory"],
  },
  {
    id: "grey",
    label: "Ghi / Xám xi măng",
    shortLabel: "Ghi xám",
    hex: "#9E9E9E",
    dotBorder: "#7E7E7E",
    keywords: ["xám", "ghi", "grey", "gray", "xi măng", "cement"],
  },
  {
    id: "black",
    label: "Đen / Tro than",
    shortLabel: "Đen",
    hex: "#1E2022",
    dotBorder: "#111213",
    keywords: ["đen", "black", "tro", "charcoal", "tối"],
  },
  {
    id: "green",
    label: "Xanh lá / Rêu ngọc",
    shortLabel: "Xanh lá",
    hex: "#386641",
    dotBorder: "#27482D",
    keywords: ["xanh lá", "rêu", "green", "mint", "ngọc lục bảo", "emerald", "olive"],
  },
  {
    id: "blue",
    label: "Xanh dương / Biển sâu",
    shortLabel: "Xanh dương",
    hex: "#264653",
    dotBorder: "#1A323C",
    keywords: ["xanh dương", "xanh biển", "biển", "blue", "teal", "cobalt", "navy", "ocean"],
  },
  {
    id: "terracotta",
    label: "Đất nung / Cam / Đỏ",
    shortLabel: "Đất nung",
    hex: "#B94A2E",
    dotBorder: "#92361E",
    keywords: ["cam", "đỏ", "terracotta", "đất nung", "hồng", "red", "orange", "pink", "vàng", "yellow"],
  },
  {
    id: "brown",
    label: "Nâu / Gỗ mộc",
    shortLabel: "Nâu gỗ",
    hex: "#6B4C35",
    dotBorder: "#4F3624",
    keywords: ["nâu", "brown", "gỗ", "coffee", "cà phê", "chocolate", "amber", "hổ phách"],
  },
];

/**
 * Ánh xạ chuỗi màu trong DB sang ID của bảng màu kiến trúc.
 */
export function matchColorPalette(rawColor: string | null | undefined): string | null {
  if (!rawColor) return null;
  const s = rawColor.trim().toLowerCase();
  if (!s || s === "chưa xác định" || s === "unknown") return null;

  for (const p of COLOR_PALETTES) {
    for (const kw of p.keywords) {
      if (s.includes(kw)) {
        return p.id;
      }
    }
  }

  // Fallback: nếu chuỗi chỉ ghi chung chung "Xanh"
  if (s === "xanh") return "green";

  return null;
}
