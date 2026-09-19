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
