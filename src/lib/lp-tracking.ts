/**
 * Tracking cho bề mặt công khai (LP + Thư viện mã gạch).
 *
 * Bắn sự kiện theo HAI đường, có chủ đích:
 *
 *   1. Gọi thẳng `window.fbq` / `window.gtag`  → sự kiện tới Meta/GA4 NGAY.
 *   2. Đẩy vào `dataLayer`                     → GTM đọc được, phục vụ lọc
 *                                                consent về sau.
 *
 * Vì sao cần cả hai (đã trả giá để biết):
 *
 *   - Bản đầu chỉ gọi thẳng. Nhanh, nhưng nếu GTM chưa khởi động xong thì
 *     `typeof w.fbq === "function"` sai → sự kiện mất im lặng.
 *   - Bản sau chỉ đẩy vào `dataLayer`, chờ GTM chuyển tiếp. Nhưng container
 *     KHÔNG có tag Custom Event cho `AddToCart`/`ViewContent`/`Lead` (trước giờ
 *     không cần, vì code gọi thẳng) → sự kiện kẹt trong `dataLayer`, Meta không
 *     nhận gì. Tracking chết hoàn toàn.
 *
 * Nên giữ đường gọi thẳng làm đường CHÍNH (không phụ thuộc cấu hình GTM), và
 * đẩy `dataLayer` như đường phụ.
 *
 * ⚠️ CẢNH BÁO ĐẾM TRÙNG: nếu sau này dựng tag Custom Event trong GTM khớp
 * `event` (`AddToCart` / `ViewContent` / `Lead` / `UnlockLibrary`), sự kiện sẽ
 * bị gửi HAI lần — một từ đường gọi thẳng ở đây, một từ GTM. Lúc đó phải bỏ
 * một trong hai, đừng để cả hai cùng chạy.
 *
 * Chỉ chạy client. SSR không có `window`.
 *
 * Tên event theo chuẩn Meta để campaign optimize được:
 *   ViewContent → xem chi tiết một mã gạch | AddToCart → lưu mã
 *   Lead → gửi form | UnlockLibrary → mở khoá thư viện (custom của Meta)
 */

type Params = Record<string, string | number | boolean | string[] | undefined>;

type FbqFn = (cmd: string, event: string, params?: Params) => void;
type GtagFn = (cmd: string, event: string, params?: Params) => void;

export type LpEvent = "ViewContent" | "AddToCart" | "Lead" | "UnlockLibrary";

/** Sự kiện chuẩn của Meta; ngoài danh sách này phải dùng `trackCustom`. */
const META_STANDARD_EVENTS: LpEvent[] = ["ViewContent", "AddToCart", "Lead"];

type TrackWindow = Window & {
  dataLayer?: unknown[];
  fbq?: FbqFn;
  gtag?: GtagFn;
};

/**
 * Bắn một sự kiện: gọi thẳng pixel/GA4, đồng thời ghi vào `dataLayer`.
 *
 * `fbq` là hàng đợi: gọi trước `fbq("init", …)` vẫn an toàn — Meta giữ lệnh lại
 * rồi chạy đúng thứ tự khi pixel sẵn sàng. Nên đường gọi thẳng không cần chờ.
 */
export function trackEvent(event: LpEvent, params: Params = {}): void {
  if (typeof window === "undefined") return;

  const w = window as TrackWindow;

  // Đường 1 — gọi thẳng. Đây là đường khiến sự kiện tới Meta/GA4 ngay, không
  // phụ thuộc việc container GTM có tag tương ứng hay không.
  try {
    if (typeof w.fbq === "function") {
      w.fbq(META_STANDARD_EVENTS.includes(event) ? "track" : "trackCustom", event, params);
    }
    if (typeof w.gtag === "function") {
      w.gtag("event", event, params);
    }
  } catch {
    // Pixel lỗi không được phép ảnh hưởng tới luồng của khách.
  }

  // Đường 2 — ghi vào `dataLayer` để GTM đọc được (lọc consent, đối soát).
  // `meta_is_standard` cho GTM biết nên gọi `track` hay `trackCustom`.
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({
    event,
    meta_event_name: event,
    meta_is_standard: META_STANDARD_EVENTS.includes(event),
    ...params,
  });

  if (import.meta.env.DEV) {
    console.info(`[lp-track] ${event}`, params);
  }
}
