/**
 * Landing page (Em bán gạch) — route công khai, KHÔNG auth.
 *
 * Nằm ngoài `_app` nên không đi qua guard `fetchMe()`.
 * Render giao diện chuẩn Tạp chí vật liệu dành cho KTS (ArchitectLanding).
 */
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { ArchitectLanding } from "@/components/landing/ArchitectLanding";
import { findLpVariant, DEFAULT_LP_SLUG } from "@/lib/lp-content";
import { loadLpHeroImage, lpHead } from "@/lib/lp-route";

export const Route = createFileRoute("/lp/$slug")({
  head: ({ params }) => lpHead(params.slug),
  loader: async ({ params }) => {
    // Nếu vào đúng slug mặc định thì redirect hẳn về trang chủ "/" để chuẩn hóa URL (Canonical URL)
    if (params.slug === DEFAULT_LP_SLUG || !params.slug) {
      throw redirect({ to: "/", statusCode: 301 });
    }
    if (!findLpVariant(params.slug)) {
      throw notFound();
    }
    return await loadLpHeroImage();
  },
  component: LandingPageRoute,
});

function LandingPageRoute() {
  const data = Route.useLoaderData() as { heroImage?: string };
  return <ArchitectLanding heroImage={data?.heroImage} />;
}
