/**
 * Landing page (ads) — kiểu dữ liệu dùng chung client + server.
 *
 * Nguyên tắc: LP là bề mặt CÔNG KHAI. Mọi type ở đây chỉ chứa field
 * an toàn để lộ ra browser. Giá, tồn kho, mã nội bộ, supplier KHÔNG
 * bao giờ xuất hiện trong `LpMaterial`.
 */

/** Trạng thái xử lý lead trong CRM. */
export type LpLeadStatus = "new" | "contacted" | "converted" | "spam";

export const LP_LEAD_STATUS_LABEL: Record<LpLeadStatus, string> = {
  new: "Mới",
  contacted: "Đã liên hệ",
  converted: "Đã chuyển KH",
  spam: "Spam",
};

/** Dòng gạch khách chọn trong form — khớp taxonomy CRM cấp 1. */
export const LP_NEEDS = [
  "Gạch thẻ",
  "Gạch mosaic",
  "Gạch bông",
  "Gạch ốp lát",
  "Chưa rõ, cần tư vấn",
] as const;

export type LpNeed = (typeof LP_NEEDS)[number];

/** Tham số UTM thu từ query string của LP. */
export type LpUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

/** Loại form đã gửi — phân biệt brief landing với gate Thư viện mã gạch. */
export type LpFormKind = "lp" | "library-gate";

export const LP_FORM_KIND_LABEL: Record<LpFormKind, string> = {
  lp: "Brief landing",
  "library-gate": "Mở thư viện",
};

/** Loại hình công trình — pill group trong brief. */
export const LP_PROJECT_TYPES = [
  "Nhà ở / Villa",
  "Hospitality / Resort",
  "F&B / Retail",
  "Văn phòng / Studio",
  "Công trình khác",
] as const;

/** Giai đoạn dự án — pill group trong brief. */
export const LP_PROJECT_STAGES = [
  "Đang lên concept",
  "Đang thiết kế 3D",
  "Chuẩn bị thi công",
  "Cần chốt vật liệu gấp",
] as const;

/** Metadata ngữ cảnh khi KTS chọn mã gạch vào shortlist */
export type ShortlistContextItem = {
  code: string;
  product_id?: number;
  source?: "space" | "library" | "featured_curation";
  space_slug?: string;
  space_title?: string;
  application_position?: string;
  added_at?: number;
};

/** Payload form gửi lên endpoint public. */
export type LpLeadInput = {
  full_name: string;
  phone: string;
  email?: string;
  need?: string;
  note?: string;
  lp_slug: string;
  /** Tên studio / văn phòng thiết kế. */
  studio?: string;
  project_type?: string;
  project_stage?: string;
  project_name?: string;
  /** Ước tính diện tích ốp lát, để nguyên text khách nhập. */
  area?: string;
  /** Tên file khách chọn đính kèm — CHỈ tên, file không được upload. */
  attachment_names?: string[];
  form_kind?: LpFormKind;
  consent_marketing?: boolean;
  utm?: LpUtm;
  referrer?: string;
  landing_path?: string;
  /** Mã gạch khách đã lưu vào shortlist — sales biết trước khách thích gì. */
  shortlist_codes?: string[];
  /** Chi tiết ngữ cảnh shortlist (không gian, vị trí ghim). */
  shortlist_details?: ShortlistContextItem[];
  /** Honeypot — bot điền, người thật không thấy. Có giá trị = drop. */
  hp?: string;
  /** Thời điểm form render (ms). Submit < 2s = bot. */
  rendered_at?: number;
};

/** Lead row đọc trong CRM. */
export type LpLead = {
  id: number;
  full_name: string;
  phone: string;
  phone_norm: string;
  email: string;
  need: string;
  note: string;
  lp_slug: string;
  studio: string;
  project_type: string;
  project_stage: string;
  project_name: string;
  area: string;
  /** Tên file khách nói sẽ gửi (CSV) — file chưa nằm trên server. */
  attachment_names: string;
  form_kind: LpFormKind;
  /** Mã gạch trong shortlist, phân cách bằng dấu phẩy. */
  shortlist_codes: string;
  /** JSON chi tiết ngữ cảnh (mã gạch, bối cảnh không gian, vị trí ghim). */
  shortlist_details?: string;
  status: LpLeadStatus;
  customer_id: number | null;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  referrer: string;
  landing_path: string;
  user_agent: string;
  consent_marketing: number;
  consent_at: string;
  handled_by: number | null;
  handled_at: string;
  created_at: string;
  /** Join ảo — tên sales đã xử lý. */
  handled_by_name?: string | null;
  /** Join ảo — số lần cùng SĐT đã submit. */
  dup_count?: number;
};

/**
 * Vật liệu ở dạng public-safe cho LP.
 * Cố ý KHÔNG có: retail_price, trade_price, b2b_price, total_stock,
 * internal_code(s), supplier, note.
 */
export type LpMaterial = {
  id: number;
  code: string;
  name: string;
  category: string;
  size: string;
  surface: string;
  color: string;
  shape: string;
  image: string;
  featured_rank?: number | null;
};

/** Facet đếm số lượng cho bộ lọc Thư viện mã gạch */
export type CatalogFacetOption = {
  value: string;
  count: number;
};

export type CatalogFacets = {
  colors: CatalogFacetOption[];
  surfaces: CatalogFacetOption[];
  sizes: CatalogFacetOption[];
  shapes: CatalogFacetOption[];
  collections: CatalogFacetOption[];
};

export type LpCatalogResult = {
  items: LpMaterial[];
  total: number;
  page: number;
  limit: number;
  facets: CatalogFacets;
};

/** Nội dung một biến thể LP. */
export type LpVariant = {
  slug: string;
  /** Dòng gạch được nhấn — lọc catalog và preset field `need`. */
  focusCategory: string | null;
  eyebrow: string;
  headline: string;
  sub: string;
  offer: string[];
  formTitle: string;
  formNote: string;
  faq: { q: string; a: string }[];
};

/** Tag không gian gán cho ảnh sản phẩm trong CRM Lookbook Hub */
export type CrmConceptTag = {
  room_slug: string;
  confidence: number | null;
  source: string;
  review_status: string;
};

/** Concept item đại diện cho một ảnh concept kiến trúc trong CRM Hub */
export type CrmConceptItem = {
  image_id: number;
  image_path: string;
  caption: string;
  ai_description: string;
  is_public: number;
  created_at: string;
  product_id: number;
  product_code: string;
  product_name: string;
  product_category: string;
  product_size: string;
  product_surface: string;
  product_color: string;
  map_image: string;
  room_tags: CrmConceptTag[];
};

/** Bộ lọc tìm kiếm & phân trang cho CRM Concept Hub */
export type CrmConceptFilter = {
  room_slug?: string | null;
  is_public?: number | "all" | null;
  search?: string | null;
  page?: number;
  limit?: number;
};

/** Phản hồi phân trang & thống kê CRM Concept Hub */
export type CrmConceptResponse = {
  items: CrmConceptItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    total: number;
    publicCount: number;
    hiddenCount: number;
    withDescCount: number;
  };
  roomStats: Record<string, number>;
};
