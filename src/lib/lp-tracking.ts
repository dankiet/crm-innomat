/**
 * Tracking cho bề mặt công khai (LP + Thư viện mã gạch).
 *
 * Bắn sự kiện qua `dataLayer` của GTM, KHÔNG gọi thẳng `fbq`/`gtag`.
 *
 * Vì sao đổi: bản cũ gọi thẳng `window.fbq`/`window.gtag` với điều kiện
 * `typeof === "function"`. GTM nạp **async** trong `<head>`, nên sự kiện bắn sớm
 * (đúng lúc React mount) thường rơi vào lúc container CHƯA khởi động → điều kiện
 * sai → sự kiện mất im lặng, không lỗi, không log. Mạng càng chậm càng dễ mất.
 *
 * Đẩy vào `dataLayer` thì GTM tự replay khi sẵn sàng, nên sự kiện không bao giờ
 * mất. Trong GTM dựng trigger Custom Event khớp `event` để chuyển tiếp sang
 * GA4 / Meta Pixel.
 *
 * Chỉ chạy client. SSR không có `window`.
 *
 * Tên event theo chuẩn Meta để campaign optimize được:
 *   ViewContent → vào trang | AddToCart → lưu mã | Lead → gửi form
 *   UnlockLibrary → mở khoá thư viện (custom, không phải event chuẩn của Meta)
 */

type Params = Record<string, string | number | boolean | string[] | undefined>;

export type LpEvent = "ViewContent" | "AddToCart" | "Lead" | "UnlockLibrary";

/** Sự kiện chuẩn của Meta; ngoài danh sách này phải dùng `trackCustom`. */
const META_STANDARD_EVENTS: LpEvent[] = ["ViewContent", "AddToCart", "Lead"];

/** Khai báo `dataLayer` trên `window` — GTM tạo nó, nhưng ta đẩy trước khi GTM chạy. */
type WindowWithDataLayer = Window & { dataLayer?: unknown[] };

/**
 * Ghi một sự kiện vào `dataLayer` để GTM xử lý.
 *
 * Đẩy CẢ hai khoá trong cùng một entry: `event` (để GTM khớp trigger) và
 * `meta_event_name` (để GTM biết chuyển tiếp sang Meta bằng `track` hay
 * `trackCustom` — quyết định này cần `META_STANDARD_EVENTS`, thứ GTM không biết).
 */
export function trackEvent(event: LpEvent, params: Params = {}): void {
  if (typeof window === "undefined") return;

  const w = window as WindowWithDataLayer;
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
