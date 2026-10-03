/**
 * Tracking cho bề mặt công khai (LP + Thư viện mã gạch).
 *
 * Một sự kiện nội bộ → dịch ra TÊN và THAM SỐ riêng cho từng nền tảng.
 *
 * Vì sao phải dịch chứ không dùng chung một tên: Meta và GA4 có bộ tên chuẩn
 * khác nhau, và thuật toán/báo cáo của mỗi bên dựa trên đúng tên chuẩn của nó.
 * Gửi `AddToCart` cho GA4 thì nó nhận, nhưng coi là **custom event** — không vào
 * funnel thương mại điện tử dựng sẵn. Gửi `add_to_cart` cho Meta thì Meta không
 * tối ưu được. Nên: một tên nội bộ, hai tên xuất.
 *
 *   nội bộ          Meta            GA4
 *   ViewContent  →  ViewContent     view_item
 *   AddToCart    →  AddToCart       add_to_cart
 *   Lead         →  Lead            generate_lead
 *
 * Bắn theo HAI đường, có chủ đích:
 *   1. Gọi thẳng `window.fbq` / `window.gtag` → sự kiện tới nơi NGAY, không phụ
 *      thuộc việc container GTM có tag tương ứng hay không.
 *   2. Đẩy vào `dataLayer` → GTM đọc được, phục vụ lọc consent về sau.
 *
 * Lịch sử (đã trả giá để biết, đừng lặp lại):
 *   - Chỉ gọi thẳng: mất sự kiện khi GTM chưa khởi động xong (`typeof === "function"`
 *     sai), vì container nạp async.
 *   - Chỉ đẩy `dataLayer`: sự kiện kẹt vì container không có tag Custom Event cho
 *     `AddToCart`/`ViewContent`/`Lead` → Meta không nhận gì, tracking chết.
 *
 * ⚠️ ĐẾM TRÙNG — hai nguồn có thể nhân đôi sự kiện, cần tắt ở phía nền tảng:
 *   - **Meta Automatic Events**: Meta dùng AI tự đoán hành động từ nút bấm. Nếu
 *     đang BẬT mà code đã gửi thủ công → Meta nhận 2 lần. Tắt ở Events Manager.
 *   - **GTM Custom Event tag** khớp `event`: nếu sau này dựng thêm tag trong GTM
 *     cho cùng tên, sự kiện cũng gửi 2 lần (một từ code, một từ GTM).
 *   GA4 Enhanced Measurement thì KHÔNG gây trùng: nó chỉ bắt cuộn/bấm link
 *   ngoài/tìm kiếm/video/tải file — không đụng tới `view_item`/`add_to_cart`.
 *
 * Chỉ chạy client. SSR không có `window`.
 */

/** Tham số phụ — giá trị vô hướng hoặc mảng chuỗi (Meta không nhận object lồng). */
type ScalarParams = Record<string, string | number | boolean | string[] | undefined>;

/** Một mục hàng trong `items` của GA4. */
type Ga4Item = {
  item_id?: string;
  item_name?: string;
  item_category?: string;
};

/** Tham số gửi GA4 — cho phép `items` là mảng object. */
type Ga4Params = Record<string, string | number | boolean | string[] | Ga4Item[] | undefined>;

type FbqFn = (cmd: string, event: string, params?: ScalarParams) => void;
type GtagFn = (cmd: string, event: string, params?: Ga4Params) => void;

/** Tên sự kiện nội bộ. Thêm sự kiện mới thì khai ở đây + hai bảng dịch bên dưới. */
export type LpEvent = "ViewContent" | "AddToCart" | "Lead";

/**
 * Dữ liệu một sự kiện — TRUNG LẬP, chưa thuộc nền tảng nào.
 *
 * Caller chỉ mô tả chuyện gì xảy ra (mã gạch nào, tham số gì); việc dịch sang
 * shape của Meta/GA4 do `trackEvent` lo. Nhờ vậy thêm nền tảng mới chỉ sửa một
 * chỗ, không phải sửa mọi call site.
 */
export type LpEventPayload = {
  /** Mã gạch, vd "IN24MX03". */
  itemId?: string;
  /** Tên hiển thị của mã gạch. */
  itemName?: string;
  /** Nhóm (Gạch thẻ / Mosaic / Bông / Ốp lát). */
  itemCategory?: string;
  /** Tham số riêng của từng sự kiện, chuyển tiếp nguyên vẹn cho cả hai nền tảng. */
  params?: ScalarParams;
};

/** Tên sự kiện phía Meta, kèm cờ `track` hay `trackCustom`. */
const META_EVENT: Record<LpEvent, { name: string; standard: boolean }> = {
  ViewContent: { name: "ViewContent", standard: true },
  AddToCart: { name: "AddToCart", standard: true },
  Lead: { name: "Lead", standard: true },
};

/** Tên sự kiện phía GA4 — phải khớp bộ tên chuẩn để vào báo cáo dựng sẵn. */
const GA4_EVENT: Record<LpEvent, string> = {
  ViewContent: "view_item",
  AddToCart: "add_to_cart",
  Lead: "generate_lead",
};

type TrackWindow = Window & {
  dataLayer?: unknown[];
  fbq?: FbqFn;
  gtag?: GtagFn;
};

/**
 * Dựng tham số cho Meta: dùng `content_ids` / `content_name` / `content_category`
 * / `content_type` — đúng bộ khoá Meta dùng để gom theo sản phẩm.
 */
function metaParams(payload: LpEventPayload): ScalarParams {
  const out: ScalarParams = { ...payload.params };
  if (payload.itemId) {
    out.content_ids = [payload.itemId];
    out.content_type = "product";
  }
  if (payload.itemName) out.content_name = payload.itemName;
  if (payload.itemCategory) out.content_category = payload.itemCategory;
  return out;
}

/**
 * Dựng tham số cho GA4: dùng `items: [{ item_id, item_name, item_category }]`.
 *
 * GA4 yêu cầu mảng `items` cho sự kiện thương mại (`view_item`, `add_to_cart`);
 * gửi `content_ids` như Meta thì GA4 không hiểu. Sự kiện không gắn hàng hoá
 * (`generate_lead`) thì bỏ qua `items`.
 */
function ga4Params(payload: LpEventPayload): Ga4Params {
  const out: Ga4Params = { ...payload.params };
  if (payload.itemId) {
    const item: Ga4Item = { item_id: payload.itemId };
    if (payload.itemName) item.item_name = payload.itemName;
    if (payload.itemCategory) item.item_category = payload.itemCategory;
    out.items = [item];
  }
  return out;
}

/**
 * Bắn một sự kiện: gọi thẳng pixel/GA4, đồng thời ghi vào `dataLayer`.
 *
 * `fbq` là hàng đợi: gọi trước `fbq("init", …)` vẫn an toàn — Meta giữ lệnh lại
 * rồi chạy đúng thứ tự khi pixel sẵn sàng. Nên đường gọi thẳng không cần chờ.
 */
export function trackEvent(event: LpEvent, payload: LpEventPayload = {}): void {
  if (typeof window === "undefined") return;

  const w = window as TrackWindow;
  const meta = META_EVENT[event];

  // Đường 1 — gọi thẳng. Đây là đường khiến sự kiện tới Meta/GA4 ngay, không
  // phụ thuộc việc container GTM có tag tương ứng hay không.
  try {
    if (typeof w.fbq === "function") {
      w.fbq(meta.standard ? "track" : "trackCustom", meta.name, metaParams(payload));
    }
    if (typeof w.gtag === "function") {
      w.gtag("event", GA4_EVENT[event], ga4Params(payload));
    }
  } catch {
    // Pixel lỗi không được phép ảnh hưởng tới luồng của khách.
  }

  // Đường 2 — ghi vào `dataLayer` để GTM đọc được (lọc consent, đối soát).
  // Kèm CẢ HAI tên đã dịch để GTM không phải tự suy.
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({
    event,
    meta_event_name: meta.name,
    meta_is_standard: meta.standard,
    ga4_event_name: GA4_EVENT[event],
    ...payload.params,
    ...(payload.itemId ? { content_ids: [payload.itemId] } : {}),
    ...(payload.itemName ? { content_name: payload.itemName } : {}),
  });

  if (import.meta.env.DEV) {
    console.info(`[lp-track] ${event} → meta:${meta.name} ga4:${GA4_EVENT[event]}`, payload);
  }
}
