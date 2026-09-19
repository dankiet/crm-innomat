/**
 * Phần dùng chung của hai route landing: `/` (src/routes/index.tsx) và
 * `/lp/$slug` (src/routes/lp.$slug.tsx).
 *
 * Hai route render cùng `ArchitectLanding` và chỉ khác nhau ở chỗ xử lý slug
 * (mặc định → redirect 301 về `/`; slug lạ → 404). Toàn bộ `head()` và phần nạp
 * ảnh hero là giống hệt nhau nên gom về đây để không trôi lệch.
 */
import { findLpVariant } from "@/lib/lp-content";
import { fetchLpHeroImageFn } from "@/api/lp";
import lpCss from "../styles-lp.css?url";

const LP_DESCRIPTION = "em bán gạch — vật liệu cho concept kiến trúc. Từ shortlist đến công trình.";

/** Thẻ `<head>` cho trang landing: tiêu đề theo biến thể, CSS riêng, favicon, font. */
export function lpHead(slug: string) {
  const v = findLpVariant(slug);
  const title = v ? `${v.eyebrow} · Em bán gạch` : "em bán gạch — vật liệu cho concept kiến trúc";
  return {
    meta: [
      { title },
      { name: "description", content: LP_DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: title },
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
