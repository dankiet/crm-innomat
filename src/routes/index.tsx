/**
 * Trang chu (Homepage /) — Landing Page "Em bán gạch" danh cho KTS.
 * Route cong khai, khong can Auth.
 *
 * CRM nam tai cac route /tong-quan, /san-pham... duoc bao ve boi _app.tsx (redirect /login neu chua auth).
 */
import { createFileRoute } from "@tanstack/react-router";
import { ArchitectLanding } from "@/components/landing/ArchitectLanding";
import { DEFAULT_LP_SLUG, findLpVariant } from "@/lib/lp-content";
import lpCss from "../styles-lp.css?url";

export const Route = createFileRoute("/")({
  head: () => {
    const v = findLpVariant(DEFAULT_LP_SLUG);
    const title = v ? `${v.eyebrow} · Em bán gạch` : "em bán gạch — vật liệu cho concept kiến trúc";
    return {
      meta: [
        { title },
        {
          name: "description",
          content: "em bán gạch — vật liệu cho concept kiến trúc. Từ shortlist đến công trình.",
        },
        { name: "robots", content: "index, follow" },
        { property: "og:title", content: title },
        {
          property: "og:description",
          content: "em bán gạch — vật liệu cho concept kiến trúc. Từ shortlist đến công trình.",
        },
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
  },
  loader: async () => {
    const variant = findLpVariant(DEFAULT_LP_SLUG);
    const { getHeroImageSetting } = await import("@/db/lp.server");
    const heroImage = await getHeroImageSetting();
    return { variant, heroImage };
  },
  component: HomePageRoute,
});

function HomePageRoute() {
  const data = Route.useLoaderData() as { variant?: unknown; heroImage?: string };
  return <ArchitectLanding heroImage={data?.heroImage} />;
}
