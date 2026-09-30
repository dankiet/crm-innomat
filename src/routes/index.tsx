/**
 * Trang chu (Homepage /) — Landing Page "Em bán gạch" danh cho KTS.
 * Route cong khai, khong can Auth.
 *
 * CRM nam tai cac route /tong-quan, /san-pham... duoc bao ve boi _app.tsx (redirect /login neu chua auth).
 */
import { createFileRoute } from "@tanstack/react-router";
import { ArchitectLanding } from "@/components/landing/ArchitectLanding";
import { DEFAULT_LP_SLUG } from "@/lib/lp-content";
import { loadLpHeroImage, lpHead } from "./-lp-route";

export const Route = createFileRoute("/")({
  head: (ctx) => lpHead(ctx),
  loader: async () => await loadLpHeroImage(),
  component: HomePageRoute,
});

function HomePageRoute() {
  const data = Route.useLoaderData() as { heroImage?: string; heroImage2?: string };
  return <ArchitectLanding heroImage={data?.heroImage} heroImage2={data?.heroImage2} />;
}
