/**
 * Phần dùng chung của hai route landing: `/` (src/routes/index.tsx) và
 * `/lp/$slug` (src/routes/lp.$slug.tsx).
 *
 * Hai route render cùng `ArchitectLanding` và chỉ khác nhau ở chỗ xử lý slug
 * (mặc định → redirect 301 về `/`; slug lạ → 404). Toàn bộ `head()` và phần nạp
 * ảnh hero là giống hệt nhau nên gom về đây để không trôi lệch.
 */
import { fetchLpHeroImageFn, fetchLpHeroImage2Fn } from "@/api/lp";
import { GTM_HEAD_SNIPPET, readConsent } from "@/lib/lp-consent";
import lpCss from "../styles-lp.css?url";

/**
 * Kích thước ảnh OG (1.91:1) — khai tại chỗ, KHÔNG import từ module
 * `og-image.server`.
 *
 * `-lp-route.ts` là module route nên đi cả vào bundle client, mà vite.config.ts
 * đặt `importProtection.client.files` với `behavior: "error"` để chặn đúng việc
 * kéo module server (có `sharp`, `node:fs`) sang client — build đã thật sự vỡ ở
 * đây một lần. Hai con số này phải khớp `OG_WIDTH`/`OG_HEIGHT` bên
 * `og-image.server.ts`; route `/og-image` mới là nơi thực sự dựng ảnh.
 */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const LP_DESCRIPTION = "em bán gạch — vật liệu cho concept kiến trúc. Từ shortlist đến công trình.";

const LP_TITLE = "Em bán gạch - Những viên gạch nhỏ cho những không gian có chuyện để kể...";

/**
 * Gốc URL của site, dạng tuyệt đối — bắt buộc cho thẻ OG.
 *
 * Facebook/Google **không chấp nhận đường dẫn tương đối** ở `og:image`/`og:url`;
 * trước đây LP khai `content="/logo.png"` nên crawler bỏ qua ảnh và tự đi tìm
 * ảnh khác (thực tế lấy logo Innomat của CRM).
 *
 * KHÔNG đọc host từ request (`getRequestUrl` của `@tanstack/react-start/server`)
 * vì `-lp-route.ts` đi cả vào bundle client — build đã vỡ vì đúng lý do đó. Dùng
 * hằng số: domain LP là cố định, và với OG thì trỏ về domain thật còn ĐÚNG hơn
 * (link chia sẻ từ bản preview vẫn phải hiện ảnh của bản chính).
 *
 * `VITE_SITE_URL` để đổi khi cần (Vite inline biến `VITE_*` cho cả hai phía).
 */
const DEFAULT_SITE_ORIGIN = "https://embangach.com";

export function siteOrigin(): string {
  const fromEnv = import.meta.env.VITE_SITE_URL;
  const value = typeof fromEnv === "string" ? fromEnv.trim() : "";
  return value ? value.replace(/\/+$/, "") : DEFAULT_SITE_ORIGIN;
}

/**
 * Thẻ `<head>` cho trang landing: tiêu đề, CSS riêng, favicon, font, và GTM nếu đã đồng ý.
 *
 * GTM chỉ được chèn khi cookie đồng thuận là `granted`. Việc đọc cookie diễn ra ở
 * SERVER trong lúc dựng `<head>`, nên khách chưa đồng ý thì snippet không hề có
 * trong HTML — không phải chặn ở client (chặn ở client thì tag vẫn được chèn và
 * vẫn bắn request).
 */
export function lpHead(ctx?: { loaderData?: { heroImage?: string } }) {
  const consent = readConsent();
  const base = siteOrigin();

  // Ảnh xem trước do `/og-image` dựng (JPEG 1200×630). Truyền hero đang dùng làm
  // tham số để ảnh khớp đúng nội dung trang và không phải truy vấn DB lần nữa.
  const hero = ctx?.loaderData?.heroImage ?? "";
  const ogImage = base
    ? `${base}/og-image${hero ? `?v=${encodeURIComponent(hero)}` : ""}`
    : "/og-image";
  const ogUrl = base || undefined;

  return {
    meta: [
      { title: LP_TITLE },
      { name: "description", content: LP_DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: LP_TITLE },
      { property: "og:description", content: LP_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Em bán gạch" },
      { property: "og:image", content: ogImage },
      { property: "og:image:width", content: String(OG_WIDTH) },
      { property: "og:image:height", content: String(OG_HEIGHT) },
      { property: "og:image:type", content: "image/jpeg" },
      ...(ogUrl ? [{ property: "og:url", content: ogUrl }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage },
    ],
    links: [
      { rel: "stylesheet", href: lpCss },
      { rel: "icon", href: "/favicon-ebg.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&display=swap",
      },
    ],
    scripts: consent === "granted" ? [{ children: GTM_HEAD_SNIPPET }] : [],
  };
}

/** Nạp ảnh hero từ `lp_settings`; lỗi mạng rơi về `undefined` để trang vẫn dựng được. */
export async function loadLpHeroImage(): Promise<{ heroImage?: string; heroImage2?: string }> {
  try {
    const [hero, hero2] = await Promise.all([fetchLpHeroImageFn(), fetchLpHeroImage2Fn()]);
    return { heroImage: hero?.heroImage, heroImage2: hero2?.heroImage2 };
  } catch {
    return { heroImage: undefined, heroImage2: undefined };
  }
}
