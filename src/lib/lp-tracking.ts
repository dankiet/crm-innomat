/**
 * Tracking cho bề mặt công khai (LP + Thư viện mã gạch).
 *
 * Prototype Lovable bắn thẳng `fbq`/`gtag`. Ở đây gói lại một lớp mỏng vì:
 *   - Pixel có thể CHƯA được cài (chưa có id) — gọi thẳng sẽ ném lỗi và
 *     làm chết cả handler submit, tức là mất lead vì một chuyện phụ.
 *   - Chỉ chạy client. SSR không có `window`.
 *
 * Tên event theo chuẩn Meta để campaign optimize được:
 *   ViewContent → vào trang | AddToCart → lưu mã | Lead → gửi form
 */

import { readConsent } from "@/lib/lp-consent";

type Params = Record<string, string | number | boolean | string[] | undefined>;

type FbqFn = (cmd: string, event: string, params?: Params) => void;
type GtagFn = (cmd: string, event: string, params?: Params) => void;

export type LpEvent = "ViewContent" | "AddToCart" | "Lead" | "UnlockLibrary";

export function trackEvent(event: LpEvent, params: Params = {}): void {
  if (typeof window === "undefined") return;

  // Chưa đồng ý thì không bắn gì. GTM cũng không được nạp (xem `lp-consent.ts`),
  // nên `fbq`/`gtag` sẽ không tồn tại — nhưng chặn tường minh ở đây để bất biến
  // không phụ thuộc vào việc GTM có tình cờ định nghĩa `gtag` hay không.
  if (readConsent() !== "granted") {
    if (import.meta.env.DEV) console.info(`[lp-track] (chưa đồng ý) ${event}`, params);
    return;
  }

  const w = window as unknown as { fbq?: FbqFn; gtag?: GtagFn };

  try {
    // Meta Pixel. `UnlockLibrary` là custom event nên dùng trackCustom.
    if (typeof w.fbq === "function") {
      const std: LpEvent[] = ["ViewContent", "AddToCart", "Lead"];
      w.fbq(std.includes(event) ? "track" : "trackCustom", event, params);
    }
    if (typeof w.gtag === "function") {
      w.gtag("event", event, params);
    }
  } catch {
    // Pixel lỗi không được phép ảnh hưởng tới luồng của khách.
  }

  if (import.meta.env.DEV) {
    console.info(`[lp-track] ${event}`, params);
  }
}
