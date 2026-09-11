/**
 * Landing page (ads), Thư viện mã gạch & Bộ sưu tập Không gian — RPC functions.
 */
import { createServerFn } from "@tanstack/react-start";
import type { LpLeadInput, LpLeadStatus } from "@/lib/lp-types";

// ─── Public Endpoints (KHÔNG yêu cầu session) ────────────────

export const fetchLpMaterialsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { category?: string | null; limit?: number }) => data)
  .handler(async ({ data }) => {
    const { listPublicMaterials } = await import("@/db/lp.server");
    return await listPublicMaterials({
      category: data?.category ?? null,
      limit: data?.limit ?? 12,
    });
  });

export const fetchPublicCatalogFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data?: {
      category?: string | null;
      color?: string | null;
      colors?: string[] | null;
      surface?: string | null;
      surfaces?: string[] | null;
      size?: string | null;
      sizes?: string[] | null;
      shape?: string | null;
      shapes?: string[] | null;
      collections?: string | string[] | null;
      search?: string | null;
      page?: number;
      limit?: number;
    }) => data ?? {},
  )
  .handler(async ({ data }) => {
    const { listPublicCatalog } = await import("@/db/lp.server");
    return await listPublicCatalog(data);
  });

export const fetchPublicSpaceCollectionsFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data?: {
      seed?: number | null;
      limit?: number | null;
    }) => data ?? {},
  )
  .handler(async ({ data }) => {
    const { listPublicSpaceCollections, getLookbookCycleSeed } = await import(
      "@/db/space-collections.server"
    );
    const { getCurrentPublicUser } = await import("@/db/auth-public.server");
    const user = await getCurrentPublicUser();

    // Nếu đã đăng nhập Google, cho phép xem toàn bộ danh mục hoặc phân trang tùy chọn
    if (user) {
      return await listPublicSpaceCollections({
        limit: data?.limit ?? null,
      });
    }

    // Khách vãng lai: BẮT BUỘC áp dụng seed chu kỳ 7 ngày và cố định tối đa 9 ảnh do server quyết định
    // Tuyệt đối không cho phép client truyền limit hoặc seed để bypass
    const seed = getLookbookCycleSeed();
    const limit = 9;
    return await listPublicSpaceCollections({ seed, limit });
  });

export const fetchLpHeroImageFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getHeroImageSetting } = await import("@/db/lp.server");
  const heroImage = await getHeroImageSetting();
  return { heroImage };
});

export const setLpHeroImageFn = createServerFn({ method: "POST" })
  .inputValidator((data: { imagePath: string }) => data)
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { setHeroImageSetting } = await import("@/db/lp.server");
    await setHeroImageSetting(data.imagePath);
    return { ok: true as const };
  });

export const toggleProductPublicFn = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: number; isPublic: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { getDb } = await import("@/db/index.server");
    await getDb()
      .prepare("UPDATE products SET is_public = ? WHERE id = ?")
      .run(data.isPublic === 1 ? 1 : 0, data.productId);
    return { ok: true as const, isPublic: data.isPublic };
  });

export {
  authGoogleStart,
  authGoogleCallback,
  fetchPublicMeFn,
  logoutPublicFn,
} from "./functions";

export const submitLpLeadFn = createServerFn({ method: "POST" })
  .inputValidator((data: LpLeadInput) => data)
  .handler(async ({ data }) => {
    const { getRequestHeader, getRequestIP } = await import("@tanstack/react-start/server");
    const { createLpLead, checkRateLimit, hashIp } = await import("@/db/lp.server");

    // Lớp 1 — honeypot.
    if (data.hp && data.hp.trim()) {
      return { ok: true as const, duplicate: false };
    }

    // Lớp 2 — time-trap.
    if (typeof data.rendered_at === "number" && Date.now() - data.rendered_at < 2000) {
      return { ok: true as const, duplicate: false };
    }

    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const ipHash = hashIp(ip);

    // Lớp 3 — rate limit.
    const slug = (data.lp_slug ?? "").trim().slice(0, 64);
    const allowed = await checkRateLimit(`lead:${ipHash}:${slug}`);
    if (!allowed) {
      return {
        ok: false as const,
        error: "Anh/chị đã gửi khá nhiều lần. Vui lòng thử lại sau ít phút.",
      };
    }

    // Lớp 4 — dedupe.
    return await createLpLead(data, {
      ipHash,
      userAgent: getRequestHeader("user-agent") ?? "",
    });
  });

// ─── CRM Admin: Leads ───────────────────────────────────────

export const fetchLpLeadsFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data?: { status?: LpLeadStatus | "all"; search?: string; limit?: number }) => data ?? {},
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { listLpLeads } = await import("@/db/lp.server");
    return await listLpLeads(data);
  });

export const setLpLeadStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; status: LpLeadStatus }) => data)
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    const me = await requireUser();
    const { setLpLeadStatus } = await import("@/db/lp.server");
    return await setLpLeadStatus(data.id, data.status, me.id);
  });

export const convertLpLeadFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    const me = await requireUser();
    const { convertLpLeadToCustomer } = await import("@/db/lp.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await convertLpLeadToCustomer(data.id, me.id);
    if (result.ok) {
      await writeAudit({
        user: me,
        action: "lp_lead.convert",
        entity_type: "customer",
        entity_id: result.customer_id,
        summary: `Chuyển lead LP #${data.id} thành khách hàng`,
      });
    }
    return result;
  });

export const deleteLpLeadFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    const me = await requireUser();
    const { deleteLpLead } = await import("@/db/lp.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await deleteLpLead(data.id);
    await writeAudit({
      user: me,
      action: "lp_lead.delete",
      entity_type: "lp_lead",
      entity_id: data.id,
      summary: `Xoá lead LP #${data.id}`,
    });
    return result;
  });


export const bulkSetProductsPublicFn = createServerFn({ method: "POST" })
  .inputValidator((data: { productIds: number[]; is_public: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { getDb } = await import("@/db/index.server");
    const { writeAudit } = await import("@/db/audit.server");
    const db = getDb();

    if (!data.productIds || data.productIds.length === 0) return { updated: 0 };

    const placeholders = data.productIds.map(() => "?").join(",");
    const params = [data.is_public ? 1 : 0, ...data.productIds];

    await db
      .prepare(
        `UPDATE products
            SET is_public = ?
          WHERE id IN (${placeholders})`,
      )
      .run(...params);

    await writeAudit({
      user: me,
      action: "product.bulk_public",
      entity_type: "product",
      summary: `${data.is_public ? "Công khai" : "Ẩn"} ${data.productIds.length} sản phẩm trên Thư viện`,
    });

    return { updated: data.productIds.length };
  });

export const setFeaturedSlotFn = createServerFn({ method: "POST" })
  .inputValidator((data: { rank: number; productId: number | null }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { setFeaturedSlot } = await import("@/db/lp.server");
    const { writeAudit } = await import("@/db/audit.server");
    await setFeaturedSlot(data.rank, data.productId);
    await writeAudit({
      user: me,
      action: "featured_slot.set",
      entity_type: "product",
      summary: data.productId
        ? `Gán sản phẩm #${data.productId} vào Vị trí #${data.rank} Trang chủ`
        : `Gỡ bỏ Vị trí #${data.rank} khỏi Trang chủ`,
    });
    return { ok: true };
  });

export const fetchFeaturedSlotsFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { listFeaturedSlots } = await import("@/db/lp.server");
    return await listFeaturedSlots();
  });

// ─── CRM Admin: Concept Manager / Lookbook Hub ────────────────

export const fetchCrmConceptImagesFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data?: {
      category?: string | null;
      room_slug?: string | null;
      is_public?: number | "all" | null;
      color?: string | null;
      search?: string | null;
      page?: number;
      limit?: number;
    }) => data ?? {},
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { listCrmConceptImages } = await import("@/db/space-collections.server");
    return await listCrmConceptImages(data);
  });

export const setConceptImagePublicFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; is_public: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { setConceptImagePublic } = await import("@/db/space-collections.server");
    const { writeAudit } = await import("@/db/audit.server");
    const res = await setConceptImagePublic(data.id, data.is_public);
    await writeAudit({
      user: me,
      action: "concept_image.toggle_public",
      entity_type: "product_image",
      entity_id: data.id,
      summary: `${data.is_public ? "Bật hiển thị" : "Ẩn"} ảnh concept #${data.id} trên Lookbook`,
    });
    return res;
  });

export const updateConceptDescriptionFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; ai_description: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { updateConceptDescription } = await import("@/db/space-collections.server");
    const { writeAudit } = await import("@/db/audit.server");
    const res = await updateConceptDescription(data.id, data.ai_description);
    await writeAudit({
      user: me,
      action: "concept_image.update_desc",
      entity_type: "product_image",
      entity_id: data.id,
      summary: `Cập nhật mô tả AI cho ảnh concept #${data.id}`,
    });
    return res;
  });

export const demoteConceptImageFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { demoteConceptImage } = await import("@/db/space-collections.server");
    const { writeAudit } = await import("@/db/audit.server");
    const res = await demoteConceptImage(data.id);
    await writeAudit({
      user: me,
      action: "concept_image.demote",
      entity_type: "product_image",
      entity_id: data.id,
      summary: `Chuyển ảnh concept #${data.id} về ảnh thường (normal)`,
    });
    return res;
  });
