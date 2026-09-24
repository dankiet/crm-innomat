/**
 * Phần dùng chung của hai route landing: `/` (src/routes/index.tsx) và
 * `/lp/$slug` (src/routes/lp.$slug.tsx).
 *
 * Hai route render cùng `ArchitectLanding` và chỉ khác nhau ở chỗ xử lý slug
 * (mặc định → redirect 301 về `/`; slug lạ → 404). Toàn bộ `head()` và phần nạp
 * ảnh hero là giống hệt nhau nên gom về đây để không trôi lệch.
 */
import { fetchLpHeroImageFn } from "@/api/lp";
import { GTM_HEAD_SNIPPET, readConsent } from "@/lib/lp-consent";
import lpCss from "../styles-lp.css?url";

const LP_DESCRIPTION = "em bán gạch — vật liệu cho concept kiến trúc. Từ shortlist đến công trình.";

const LP_TITLE = "Em bán gạch - Những viên gạch nhỏ cho những không gian có chuyện để kể...";

/**
 * Thẻ `<head>` cho trang landing: tiêu đề, CSS riêng, favicon, font, và GTM nếu đã đồng ý.
 *
 * GTM chỉ được chèn khi cookie đồng thuận là `granted`. Việc đọc cookie diễn ra ở
 * SERVER trong lúc dựng `<head>`, nên khách chưa đồng ý thì snippet không hề có
 * trong HTML — không phải chặn ở client (chặn ở client thì tag vẫn được chèn và
 * vẫn bắn request).
 */
export function lpHead() {
  const consent = readConsent();

  return {
    meta: [
      { title: LP_TITLE },
      { name: "description", content: LP_DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: LP_TITLE },
      { property: "og:description", content: LP_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/logo.png" },
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
export async function loadLpHeroImage(): Promise<{ heroImage?: string }> {
  try {
    const res = await fetchLpHeroImageFn();
    return { heroImage: res?.heroImage };
  } catch {
    return { heroImage: undefined };
  }
}
