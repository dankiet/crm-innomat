/**
 * Shortlink công khai — `/s/<slug>` → 301 sang đích thật (kèm UTM đã lưu).
 *
 * Nằm ngoài `_app` nên KHÔNG qua cổng auth: khách vãng lai bấm link từ
 * caption/comment/bio phải vào được thẳng landing.
 *
 * Bất biến: đích là URL TUYỆT ĐỐI dựng từ `origin` của request + cột UTM đã lưu.
 * Không forward query của khách — nếu forward thì rơi đúng bẫy 301-strip-query
 * đã ghi ở `marketing/06` (redirect làm mất UTM trước khi trang load).
 */
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { resolveShortLinkFn } from "@/api/lp";

export const Route = createFileRoute("/s/$slug")({
  loader: async ({ params }) => {
    const target = await resolveShortLinkFn({ data: { slug: params.slug } });
    if (!target) throw notFound();

    // 302 (KHÔNG 301): đây là link tracking theo chiến dịch, UTM/đích sẽ còn
    // được sửa. 301 bị browser + FB link-scanner cache vĩnh viễn → sửa xong
    // người đã bấm trước đó vẫn đi theo đích cũ.
    throw redirect({ href: target, statusCode: 302 });
  },
  component: () => null,
});
