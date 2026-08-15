export type CustomerStatus =
  | "consulting"
  /** Đã gửi mẫu — chờ cơ hội / dự án mới để tiếp tục, không hẳn là fail */
  | "sample_sent"
  | "quoted"
  | "closed"
  | "delivering"
  | "done"
  /** Closed-Lost — không chốt / mất deal */
  | "lost";

export type QuoteStatus = "draft" | "sent" | "accepted" | "expired";
export type OrderStatus = "preparing" | "shipping" | "delivered";
export type DiscountType = "none" | "tp" | "b2b" | "custom";

export type ProductImageRow = {
  id: number;
  product_id: number;
  gallery_collection_ids: number[];
  path: string;
  sort_order: number;
  is_primary: number;
  caption: string;
  created_at: string;
};

export type GalleryCollection = {
  id: number;
  name: string;
  description: string;
  cover_path: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  item_count: number;
};

export type GalleryCollectionItem = {
  id: number;
  collection_id: number;
  path: string;
  product_image_id: number | null;
  product_id: number | null;
  product_code: string;
  product_name: string;
  caption: string;
  sort_order: number;
  created_at: string;
  /** Giá lẻ (m²) — từ sản phẩm liên kết */
  retail_price?: number | null;
  /** Tồn kho kho Q9 (m²) */
  total_stock?: number | null;
};

export type GalleryImageCandidate = {
  product_image_id: number;
  product_id: number;
  path: string;
  caption: string;
  is_primary: number;
  sort_order: number;
  code: string;
  name: string;
  internal_codes: string;
  category: string;
  supplier: string;
  color: string;
  surface: string;
  size: string;
  shape: string;
  collections: string;
  material: string;
};

export type Product = {
  stock_m2?: number | null;
  internal_codes?: string;
  stock_vp?: number | null;
  id: number;
  code: string;
  /** Tồn kho tổng hợp từ product_internal_codes (ảo) */
  total_stock?: number | null;
  /** Danh sách mã phụ (gộp) từ product_internal_codes (ảo) */
  multi_codes_list?: string | null;
  name: string;
  size: string;
  material: string;
  category: string;
  /** Bộ sưu tập */
  supplier: string;
  /** Màu sắc (lọc) */
  color: string;
  /** Quy cách đóng gói hiển thị: "100 viên/1m2" */
  packing?: string;
  packing_m2?: number | null;
  packing_pcs?: number | null;
  retail_price: number;
  /** Giá Thương Mại = Trade Price (+VAT) — dùng trực tiếp khi CK TP */
  trade_price?: number | null;
  /** Giá B2B = Partner Price (+VAT) — dùng trực tiếp khi CK B2B */
  b2b_price?: number | null;
  discount_tp: number | null;
  discount_b2b: number | null;
  note: string;
  surface?: string;
  /** Kiểu dáng (vd: hình vuông, vảy cá, dạng thanh KitKat...) */
  shape?: string;
  /** Hiệu ứng vân/mặt gạch (vd: giả vân gỗ, giả đá, nhũ...) */
  collections?: string;
  unit?: string;
  is_hot: number;
  /** Ảnh đại diện (primary) — đồng bộ từ product_images */
  image_path: string;
  /** Số ảnh (optional, join) */
  image_count?: number;
  /** Thời điểm tạo */
  created_at?: string;
};

/** Màu chuẩn để gợi ý / trích từ tên */
export const PRODUCT_COLORS = [
  "Trắng",
  "Đen",
  "Xám",
  "Kem",
  "Beige",
  "Nâu",
  "Vàng",
  "Cam",
  "Đỏ",
  "Hồng",
  "Xanh",
  "Xanh mint",
  "Xanh dương",
  "Xanh lá",
  "Tím",
  "Gold",
] as const;

/** Nguồn khách hàng / lead */
export type LeadSource = "Facebook" | "Zalo" | "Khác" | "";

export const LEAD_SOURCES: Exclude<LeadSource, "">[] = ["Facebook", "Zalo", "Khác"];

export type Customer = {
  id: number;
  name: string;
  /** Nguồn khách hàng: Facebook | Zalo | Khác */
  source: string;
  phone: string;
  /** Email (tuỳ chọn) */
  email?: string;
  /** Tên công ty (tuỳ chọn — khi khách là DN) */
  company?: string;
  /** Tên viết tắt (để xuất file báo giá) */
  short_name?: string;
  region: string;
  status: CustomerStatus;
  note: string;
  /** User sở hữu (sales); admin thấy tất cả */
  owner_id?: number | null;
  owner_name?: string;
  created_at: string;
  updated_at: string;
};

export type Quote = {
  id: number;
  code: string;
  customer_id: number;
  status: QuoteStatus;
  notes: string;
  discount_type: DiscountType;
  /** 1 = đơn giá đã gồm VAT; 0 = chưa VAT (export cộng thêm VAT) */
  prices_include_vat?: number;
  /** Phí vận chuyển nhập tay (chưa VAT) */
  shipping_fee?: number;
  created_at: string;
  updated_at: string;
  amount?: number;
  items_count?: number;
  customer_name?: string;
  customer_source?: string;
};

export type QuoteItem = {
  id: number;
  quote_id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  size: string;
  quantity_m2: number;
  retail_price: number;
  discount_pct: number;
  unit_price: number;
  area: string;
  line_total: number;
};

export type Order = {
  id: number;
  code: string;
  customer_id: number;
  quote_id: number | null;
  amount: number;
  /** Phí vận chuyển (copy từ BG khi chuyển ĐH) */
  shipping_fee?: number;
  status: OrderStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  customer_source?: string;
  paid_amount?: number;
};

export type Payment = {
  id: number;
  customer_id: number;
  order_id: number | null;
  amount: number;
  paid_at: string;
  note: string;
  created_at: string;
};

export type Note = {
  id: number;
  customer_id: number | null;
  author: string;
  author_user_id?: number | null;
  content: string;
  created_at: string;
  customer_name?: string;
  customer_source?: string;
};

/** Công nợ cộng dồn theo khách hàng */
export type CustomerDebt = {
  customer_id: number;
  customer_name: string;
  source: string;
  phone: string;
  region: string;
  status: CustomerStatus;
  order_count: number;
  total_order_amount: number;
  total_paid: number;
  debt: number;
};

export type CustomerDebtDetail = CustomerDebt & {
  orders: Array<Order & { paid_amount: number }>;
  payments: Payment[];
};

export const statusMeta: Record<CustomerStatus, { label: string; className: string }> = {
  consulting: {
    label: "Đang tư vấn",
    className: "bg-sky-50 text-sky-800",
  },
  sample_sent: {
    label: "Đã gửi mẫu",
    className: "bg-teal-50 text-teal-800",
  },
  quoted: { label: "Gửi báo giá", className: "bg-violet-50 text-violet-800" },
  closed: { label: "Đã chốt", className: "bg-emerald-50 text-emerald-800" },
  delivering: {
    label: "Đang giao",
    className: "bg-amber-50 text-amber-800",
  },
  done: { label: "Hoàn tất", className: "bg-stone-100 text-stone-600" },
  /** Closed-Lost — soft wording for showroom */
  lost: { label: "Bỏ lỡ", className: "bg-rose-50 text-rose-800" },
};

export const quoteStatusMeta: Record<QuoteStatus, { label: string; className: string }> = {
  draft: { label: "Nháp", className: "bg-stone-200 text-stone-700" },
  sent: { label: "Đã gửi", className: "bg-blue-50 text-blue-700" },
  accepted: { label: "Đã duyệt", className: "bg-moss-soft text-moss" },
  expired: { label: "Hết hạn", className: "bg-stone-200 text-stone-500" },
};

export const orderStatusMeta: Record<OrderStatus, { label: string; className: string }> = {
  preparing: {
    label: "Đang soạn kho",
    className: "bg-amber-50 text-amber-700",
  },
  shipping: {
    label: "Đang vận chuyển",
    className: "bg-blue-50 text-blue-700",
  },
  delivered: { label: "Đã giao", className: "bg-moss-soft text-moss" },
};

/**
 * Pipeline cơ hội (Kanban).
 * "Thất bại" = Closed-Lost (mất deal / không chốt) — chuẩn CRM.
 */
export const pipelineStages: Array<{
  key: CustomerStatus;
  label: string;
  hint: string;
  /** Tailwind classes cho cột */
  columnClass: string;
  headerClass: string;
  dotClass: string;
}> = [
  {
    key: "consulting",
    label: "Đang tư vấn",
    hint: "Lead mới / đang trao đổi",
    columnClass: "bg-sky-50/80 ring-sky-200/80",
    headerClass: "border-sky-200/80 bg-sky-100/50",
    dotClass: "bg-sky-500",
  },
  {
    key: "sample_sent",
    label: "Đã gửi mẫu",
    hint: "Đã gửi mẫu, chờ cơ hội / dự án mới — chưa hẳn là fail",
    columnClass: "bg-teal-50/80 ring-teal-200/80",
    headerClass: "border-teal-200/80 bg-teal-100/50",
    dotClass: "bg-teal-500",
  },
  {
    key: "quoted",
    label: "Gửi báo giá",
    hint: "Đã có BG, chờ phản hồi",
    columnClass: "bg-violet-50/80 ring-violet-200/80",
    headerClass: "border-violet-200/80 bg-violet-100/50",
    dotClass: "bg-violet-500",
  },
  {
    key: "closed",
    label: "Đã chốt",
    hint: "Won — chốt đơn / hợp đồng",
    columnClass: "bg-emerald-50/80 ring-emerald-200/80",
    headerClass: "border-emerald-200/80 bg-emerald-100/50",
    dotClass: "bg-emerald-500",
  },
  {
    key: "lost",
    label: "Bỏ lỡ",
    hint: "Chưa chốt được — gác nhẹ, có thể quay lại",
    columnClass: "bg-rose-50/70 ring-rose-200/70",
    headerClass: "border-rose-200/80 bg-rose-100/40",
    dotClass: "bg-rose-400",
  },
];
