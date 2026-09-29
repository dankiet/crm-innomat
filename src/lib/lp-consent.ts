/**
 * Đồng thuận cookie cho Google Tag Manager (container `GTM-P4SQ7HBB`).
 *
 * Luật hiện hành: **GTM nạp cho MỌI khách**, kể cả người bấm "Từ chối". Lựa chọn
 * chỉ quyết định (a) ẩn/hiện thanh hỏi, và (b) giá trị đẩy vào `dataLayer` để GTM
 * dựng audience loại trừ.
 *
 * Đánh đổi có chủ đích, đã cân nhắc: trước đây "chưa chọn = không nạp", nên khách
 * không bấm gì thì không có số liệu nào — mất tracking đúng ở nhóm đông nhất.
 * Giờ ưu tiên có số liệu; khách từ chối được ghi nhận bằng cờ trong `dataLayer`
 * (`CONSENT_DATALAYER_KEY`) để lọc ra về sau.
 *
 * ⚠️ Hệ quả phải nhớ: đây là mô hình "tự khai báo rồi loại trừ", KHÔNG phải mô
 * hình chặn theo đồng thuận. Về mặt tuân thủ (Nghị định 13/2023, GDPR nếu có khách
 * EU), cookie theo dõi được đặt TRƯỚC khi khách chọn — nếu sau này cần chặt hơn thì
 * phải quay lại gate ở server (`lpHead`) và chấp nhận mất số liệu của nhóm không bấm.
 *
 * Vì sao cookie chứ không phải localStorage: snippet GTM nằm trong `<head>` do
 * server dựng, nên server phải đọc được lựa chọn NGAY ở lần render đầu. localStorage
 * chỉ sống ở client → không đọc được. Cookie thì `getCookie()` đọc được trong
 * `head()` và `document.cookie` đọc được ở client, nên hai bên luôn khớp nhau
 * (không lệch hydration).
 *
 * Cookie KHÔNG `httpOnly`: client phải tự ghi để đổi lựa chọn mà không cần round-trip.
 *
 * KHÁC HẲN `consent_marketing` của form lead (`src/lib/lp-types.ts`) — đó là đồng ý
 * nhận email marketing, lưu trong `lp_leads`. Cookie này chỉ nói về GTM.
 */
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

/** Container ID của GTM. */
export const GTM_ID = "GTM-P4SQ7HBB";

/** Tên cookie lưu lựa chọn. */
export const CONSENT_COOKIE = "ebg_gtm_consent";

/** Sự kiện phát ra khi lựa chọn đổi, để UI đang mở tự vẽ lại. */
export const CONSENT_EVENT = "ebg-consent-change";

export type ConsentValue = "granted" | "denied";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Đọc lựa chọn hiện tại. Server đọc cookie của request, client đọc `document.cookie`.
 * `undefined` = chưa chọn (hiện banner, chưa nạp GTM).
 *
 * Hai nhánh PHẢI viết inline ngay trong `.client()`/`.server()`: compiler của TanStack
 * chỉ coi `getCookie` là hợp lệ khi nằm trong một hàm truyền trực tiếp cho
 * `createIsomorphicFn().server(...)` (`isInsideCompilerSafeBoundaryNodes`,
 * import-protection/analysis.js:218-325). Tách ra hàm rời sẽ khiến import
 * `@tanstack/react-start/server` bị chặn ở bundle client.
 */
export const readConsent = createIsomorphicFn()
  .client((): ConsentValue | undefined => {
    if (typeof document === "undefined") return undefined;
    const prefix = `${CONSENT_COOKIE}=`;
    const hit = document.cookie.split("; ").find((c) => c.startsWith(prefix));
    if (!hit) return undefined;
    try {
      const raw = decodeURIComponent(hit.slice(prefix.length));
      return raw === "granted" || raw === "denied" ? raw : undefined;
    } catch {
      return undefined;
    }
  })
  .server((): ConsentValue | undefined => {
    try {
      const raw = getCookie(CONSENT_COOKIE);
      return raw === "granted" || raw === "denied" ? raw : undefined;
    } catch {
      // Ngoài request context (build, script rời) `getCookie` ném lỗi.
      return undefined;
    }
  });

/** Ghi lựa chọn rồi phát sự kiện để UI vẽ lại. Chỉ có tác dụng ở client. */
export function setConsent(value: ConsentValue): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** Đăng ký theo dõi thay đổi lựa chọn (dùng cho `useSyncExternalStore`). */
export function subscribeConsent(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_EVENT, onChange);
}

/**
 * Nạp GTM ở client — dùng khi khách bấm "Đồng ý" giữa phiên, lúc HTML đã dựng xong
 * mà chưa có snippet. Idempotent: gọi lại không nhân đôi script.
 */
export function loadGtm(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  if (document.getElementById("gtm-script")) return;
  const s = document.createElement("script");
  s.id = "gtm-script";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}&l=dataLayer`;
  document.head.appendChild(s);
}

/**
 * Xoá lựa chọn để banner hiện lại — dùng cho nút "Đổi lựa chọn cookie" ở footer.
 */
export function clearConsent(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/**
 * Trước đây dùng để dừng GTM khi khách rút lại đồng thuận.
 *
 * Không còn cần: GTM nạp cho mọi khách nên không có gì để dừng, và rút lại lựa
 * chọn giờ chỉ đổi cờ trong `dataLayer` (`pushConsentToDataLayer`) để GTM lọc về
 * sau. Đã xoá hàm này cùng hai caller — xem `reopenConsent` ở footer LP.
 */

/**
 * Snippet `<head>` — nay chèn cho MỌI khách (server quyết định ở `head()`).
 *
 * Đẩy lựa chọn vào `dataLayer` TRƯỚC khi nạp container, để GTM đọc được ngay ở
 * lần load đầu. Nếu đẩy sau thì trigger trong GTM đã bắn xong trước khi biết khách
 * từ chối — mất luôn khả năng lọc.
 *
 * `consent === undefined` (khách chưa bấm gì) vẫn đẩy cờ `"unknown"` để trong GTM
 * phân biệt được ba nhóm: granted / denied / unknown.
 */
export function gtmHeadSnippet(consent: ConsentValue | undefined): string {
  const flag = consent ?? "unknown";
  return (
    `window.dataLayer=window.dataLayer||[];` +
    `window.dataLayer.push({${JSON.stringify(CONSENT_DATALAYER_KEY)}:${JSON.stringify(flag)}});` +
    `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':` +
    `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],` +
    `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=` +
    `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
    `})(window,document,'script','dataLayer','${GTM_ID}');`
  );
}

/** Nội dung `<noscript>` — iframe dự phòng khi khách tắt JS. */
export const GTM_NOSCRIPT_HTML =
  `<iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}" ` +
  `height="0" width="0" style="display:none;visibility:hidden"></iframe>`;

/** Tên biến đẩy vào `dataLayer` để GTM biết lựa chọn của khách. */
export const CONSENT_DATALAYER_KEY = "ebg_consent";

/**
 * Đẩy lựa chọn cookie vào `dataLayer` để GTM đọc được.
 *
 * Vì sao cần: GTM nạp cho MỌI khách (kể cả người bấm "Từ chối") — đánh đổi có chủ
 * đích để không mất số liệu tracking. Bù lại, lựa chọn phải đi vào `dataLayer` để
 * trong GTM dựng được biến/audience, từ đó loại trừ những người đã từ chối.
 * Không có bước này thì không ai biết ai đã từ chối — cookie chỉ nằm trong trình
 * duyệt khách, server không đọc được.
 *
 * Idempotent: gọi nhiều lần chỉ ghi giá trị mới nhất.
 */
export function pushConsentToDataLayer(value: ConsentValue): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({ [CONSENT_DATALAYER_KEY]: value });
}
