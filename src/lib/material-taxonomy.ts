/**
 * Architectural Material Taxonomy (Chuẩn hóa Phân loại Vật liệu Kiến trúc).
 *
 * Tầng Logic Thông minh (Virtual Taxonomy Layer) phân nhóm dữ liệu thô từ CRM
 * thành các trục tiêu chí chuẩn cho Kiến trúc sư và Khách hàng mà không làm
 * biến đổi hay phá vỡ cấu trúc cơ sở dữ liệu gốc.
 */

// ─── 1. FORMAT FAMILIES (Kiểu dáng & Tỷ lệ Hình học) ────────────────────────

export type FormatFamilyGroup = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  /** Các giá trị `shape` thô trong DB */
  rawShapes: string[];
  /** Điều kiện bổ trợ theo quy cách/kích thước */
  isMatch?: (item: { shape?: string; size?: string; category?: string }) => boolean;
};

export const FORMAT_FAMILIES: FormatFamilyGroup[] = [
  {
    id: "strip",
    label: "Gạch Thanh (Subway / KitKat / Strip)",
    shortLabel: "Gạch Thanh",
    description: "Gạch thẻ dạng thanh dài, ốp xương cá, so le hoặc thẳng đứng",
    rawShapes: ["Thanh", "Thanh Vát", "Thanh Lõm", "Giả thẻ hiệu ứng"],
  },
  {
    id: "square",
    label: "Gạch Vuông (Square Grid)",
    shortLabel: "Gạch Vuông",
    description: "Phom vuông kinh điển, gạch bông hoặc lưới grid hiện đại",
    rawShapes: ["Vuông", "Vuông Nhỏ"],
  },
  {
    id: "geometric",
    label: "Hình Học Đặc Biệt (Geometric / Art)",
    shortLabel: "Hình Học & Art",
    description: "Lục giác (Hexagon), Vảy cá (Fish Scale), Lông vũ, Bát giác, Xương cá",
    rawShapes: ["Lục Giác", "Vảy Cá", "Lông Vũ", "Bát Giác", "Xương Cá"],
  },
  {
    id: "slab",
    label: "Khổ Lớn & Tấm (Large Slabs)",
    shortLabel: "Khổ Lớn & Sàn",
    description: "Khổ gạch 600x1200, 800x800, 400x800 cho sàn và mặt tiền",
    rawShapes: ["Porcelain"],
  },
];

// ─── 2. SURFACE FINISHES (Cảm xúc Xúc giác Bề mặt) ──────────────────────────

export type SurfaceFinishGroup = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  rawSurfaces: string[];
};

export const SURFACE_FINISHES: SurfaceFinishGroup[] = [
  {
    id: "glossy",
    label: "Men Bóng (Glossy / Reflective)",
    shortLabel: "Men Bóng",
    description: "Bắt sáng tốt, phản chiếu ánh sáng và tạo chiều sâu",
    rawSurfaces: ["Bóng", "Bán bóng", "Bán Bóng"],
  },
  {
    id: "matte",
    label: "Men Mờ (Matte / Satin)",
    shortLabel: "Men Mờ",
    description: "Mịn lì, chống chói, thanh lịch và ấm áp",
    rawSurfaces: ["Mờ"],
  },
  {
    id: "wavy",
    label: "Bóng Gợn & Men Rạn (Handmade / Wavy)",
    shortLabel: "Bóng Gợn & Rạn",
    description: "Hiệu ứng lượn sóng thủ công, men rạn độc bản",
    rawSurfaces: ["Bóng Gợn", "Gợn", "Vân Nổi"],
  },
  {
    id: "structured",
    label: "Nhám & Chống Trượt (Structured / Anti-slip)",
    shortLabel: "Nhám Chống Trượt",
    description: "Hạt cát nhám, chống trơn trượt cho sàn và ngoại thất",
    rawSurfaces: ["Nhám", "Nhám Cát", "Carving"],
  },
];

// ─── 3. LOOK & TEXTURE (Phong cách & Hiệu ứng Vân) ──────────────────────────

export type LookTextureGroup = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  rawKeywords: string[];
  rawShapes: string[];
};

export const LOOK_TEXTURES: LookTextureGroup[] = [
  {
    id: "stone_marble",
    label: "Vân Đá Tự Nhiên & Marble",
    shortLabel: "Vân Đá & Marble",
    description: "Vân mây cẩm thạch, đá sa thạch và phiến đá tự nhiên",
    rawKeywords: ["marble", "đá", "stone", "bianco", "statuario", "calacatta"],
    rawShapes: ["Vân đá (Stone)", "Marble", "Sa thạch (Sandstone)"],
  },
  {
    id: "wood",
    label: "Vân Gỗ Mộc (Wood Texture)",
    shortLabel: "Vân Gỗ",
    description: "Họa tiết thớ gỗ tự nhiên, ấm cúng và mộc mạc",
    rawKeywords: ["gỗ", "wood", "oak", "teak", "walnut"],
    rawShapes: ["Vân gỗ (Wood)"],
  },
  {
    id: "terrazzo",
    label: "Terrazzo & Đá Mài",
    shortLabel: "Terrazzo",
    description: "Hạt đá mài mosaic, phong cách Ý hiện đại",
    rawKeywords: ["terrazzo", "đá mài", "hạt"],
    rawShapes: ["Terrazzo"],
  },
  {
    id: "cement",
    label: "Xi Măng & Bê Tông (Concrete)",
    shortLabel: "Xi Măng / Bê Tông",
    description: "Bề mặt xi măng xám, phong cách Industrial / Brutalism",
    rawKeywords: ["xi măng", "bê tông", "cement", "concrete"],
    rawShapes: ["Xi măng (Cement)"],
  },
  {
    id: "solid_art",
    label: "Đơn Sắc & Men Màu Nghệ Thuật",
    shortLabel: "Đơn Sắc & Art",
    description: "Gạch thẻ, mosaic màu trơn thuần khiết cho mảng tường nhấn",
    rawKeywords: ["đơn sắc", "solid", "men rạn", "color"],
    rawShapes: ["Thanh", "Vuông", "Lục Giác", "Vảy Cá", "Lông Vũ"],
  },
];

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Lấy danh sách các giá trị DB thô tương ứng với một nhóm Format Family.
 */
export function getRawShapesForFamily(familyId: string): string[] {
  const found = FORMAT_FAMILIES.find((f) => f.id === familyId);
  return found ? found.rawShapes : [];
}

/**
 * Lấy danh sách các giá trị DB thô tương ứng với một nhóm Surface Finish.
 */
export function getRawSurfacesForFinish(finishId: string): string[] {
  const found = SURFACE_FINISHES.find((f) => f.id === finishId);
  return found ? found.rawSurfaces : [];
}
