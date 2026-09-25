/**
 * Landing page (ads) & Thư viện mã gạch (Catalog) — server logic.
 *
 * Đây là bề mặt CÔNG KHAI duy nhất của hệ thống. Ba nguyên tắc cứng:
 *
 *  1. Feed đọc chỉ trả field public-safe (xem `LpMaterial`). Không giá,
 *     không tồn kho, không mã nội bộ, không supplier.
 *  2. Lead ghi vào `lp_leads`, KHÔNG gọi `createCustomer`. Traffic ads
 *     submit trùng là bình thường; `createCustomer` lại throw khi trùng
 *     SĐT và message của nó lộ tên sales + tên khách nội bộ.
 *  3. Endpoint ghi luôn qua `checkRateLimit` + honeypot + time-trap.
 */
import { createHash } from "node:crypto";
import { getDb, type SqlValue } from "./index.server";
import { createCustomer } from "./crm.server";
import { syncHeroUsage } from "./media-assets.server";
import { normalizePhone, isPhoneMatchable } from "@/lib/phone";
import { COLOR_PALETTES, matchColorPalette } from "@/lib/color-palette";
import { SURFACE_FINISHES, FORMAT_FAMILIES } from "@/lib/material-taxonomy";
import type {
  CatalogFacetOption,
  LpCatalogResult,
  LpLead,
  LpLeadInput,
  LpLeadStatus,
  LpMaterial,
  ShortlistContextItem,
} from "@/lib/lp-types";
import { nowUtc } from "@/lib/format";

function clip(raw: string | undefined | null, max: number): string {
  return (raw ?? "").trim().slice(0, max);
}

// ─── Public material feed ───────────────────────────────────

/**
 * Các mã gạch để hiển thị trên LP (10-12 mã tuyển chọn).
 */
const PUBLIC_MATERIAL_SELECT = `SELECT p.id, p.code, p.name, p.category, p.size,
              COALESCE(p.surface, '') AS surface,
              COALESCE(p.color, '')   AS color,
              COALESCE(p.shape, '')   AS shape,
              COALESCE(map_img.path, p.image_path, '') AS image,
              p.featured_rank
         FROM products p
         LEFT JOIN product_images map_img ON map_img.product_id = p.id AND map_img.kind = 'map'`;

const HAS_MATERIAL_IMAGE = "(COALESCE(p.image_path, '') <> '' OR map_img.path IS NOT NULL)";

export async function listPublicMaterials(opts?: {
  category?: string | null;
  limit?: number;
}): Promise<LpMaterial[]> {
  const db = getDb();
  const params: SqlValue[] = [];
  const where: string[] = [
    "p.is_public = 1",
    "p.featured_rank IS NOT NULL",
    "p.featured_rank BETWEEN 1 AND 12",
    HAS_MATERIAL_IMAGE,
  ];

  const cat = opts?.category?.trim();
  if (cat && cat.toLowerCase() !== "all") {
    where.push("LOWER(p.category) = ?");
    params.push(cat.toLowerCase());
  }

  const limit = Math.min(Math.max(Math.floor(opts?.limit ?? 12), 1), 48);
  params.push(limit);

  return (await db
    .prepare(
      `${PUBLIC_MATERIAL_SELECT}
        WHERE ${where.join(" AND ")}
        ORDER BY p.featured_rank ASC, p.id
        LIMIT ?`,
    )
    .all<LpMaterial>(...params)) as LpMaterial[];
}

/**
 * Lấy material theo đúng bộ ID canonical (product ids) — dùng cho shortlist/moodboard.
 * KHÔNG giới hạn featured-12; không áp limit. ID không tồn tại/đã xoá đơn giản
 * không nằm trong kết quả (graceful, không tạo mock, không mutate storage).
 */
export async function listPublicMaterialsByIds(ids: number[]): Promise<LpMaterial[]> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
  if (unique.length === 0) return [];
  const db = getDb();
  const placeholders = unique.map(() => "?").join(", ");
  return (await db
    .prepare(
      `${PUBLIC_MATERIAL_SELECT}
        WHERE p.is_public = 1 AND p.id IN (${placeholders}) AND ${HAS_MATERIAL_IMAGE}
        ORDER BY p.id`,
    )
    .all<LpMaterial>(...unique)) as LpMaterial[];
}
export type FeaturedSlotInfo = {
  rank: number;
  product_id: number;
  product_code: string;
  product_name: string;
  product_category: string;
  image: string;
};

/**
 * Lấy danh sách 12 Vị trí Tuyển chọn hiện tại (đã gán sản phẩm nào).
 */
export async function listFeaturedSlots(): Promise<FeaturedSlotInfo[]> {
  const db = getDb();
  const rows = await db
    .prepare(
      `SELECT p.featured_rank AS rank,
              p.id AS product_id,
              p.code AS product_code,
              p.name AS product_name,
              p.category AS product_category,
              COALESCE(p.image_path, '') AS image
         FROM products p
        WHERE p.featured_rank IS NOT NULL
          AND p.featured_rank BETWEEN 1 AND 12
        ORDER BY p.featured_rank ASC`,
    )
    .all<FeaturedSlotInfo>();
  return rows;
}

/**
 * Gán 1 sản phẩm vào 1 trong 12 Vị trí Tuyển chọn trang chủ.
 * Đảm bảo luật uniqueness trên `featured_rank` bằng cách:
 *   1. Clear slot cũ (`featured_rank = NULL` cho tất cả product hiện đang giữ `rank`).
 *   2. Nếu product này đang nắm slot khác -> clear slot cũ của nó.
 *   3. Gán product mới vào `rank`, đồng thời tự động Bật Online (`is_public = 1`) nếu chưa.
 *   Trong cùng 1 transaction để tránh trạng thái inconsistent giữa các query.
 */
export async function setFeaturedSlot(
  rankInput: number,
  productIdInput: number | null,
): Promise<void> {
  const rank = Number(rankInput);
  const productId = productIdInput == null ? null : Number(productIdInput);
  const db = getDb();
  await db.transaction(async (tx) => {
    // 1) Clear mọi sản phẩm đang ngồi vị trí `rank` (nếu có)
    await tx.prepare("UPDATE products SET featured_rank = NULL WHERE featured_rank = ?").run(rank);

    if (productId == null || isNaN(productId)) {
      // Chỉ yêu cầu GỠ khỏi slot -> thoát transaction tại đây
      return;
    }

    // 2) Clear slot cũ của product này (nếu product này đang ở vị trí khác)
    await tx
      .prepare(
        "UPDATE products SET featured_rank = NULL WHERE id = ? AND featured_rank IS DISTINCT FROM ?",
      )
      .run(productId, rank);

    // 3) Gán product vào slot mới, đồng thời ép nó phải Online để hiển thị trên Thư viện web
    // Nếu products.image_path rỗng nhưng có ảnh map -> fallback lấy ảnh map gán vào products.image_path
    const mapRow = (await tx
      .prepare("SELECT path FROM product_images WHERE product_id = ? AND kind = 'map' LIMIT 1")
      .get<{ path: string }>(productId)) as { path: string } | undefined;

    if (mapRow?.path) {
      await tx
        .prepare(
          "UPDATE products SET is_public = 1, featured_rank = ?, image_path = COALESCE(NULLIF(image_path, ''), ?) WHERE id = ?",
        )
        .run(rank, mapRow.path, productId);
    } else {
      await tx
        .prepare("UPDATE products SET is_public = 1, featured_rank = ? WHERE id = ?")
        .run(rank, productId);
    }
  });
}

/**
 * Thư viện mã gạch (Public Catalog Feed & Facets).
 * Phân luồng theo 4 dòng gạch và tính toán số lượng facet options.
 */
export async function listPublicCatalog(opts?: {
  category?: string | null;
  color?: string | null;
  colors?: string[] | null;
  colorPalettes?: string[] | null;
  surface?: string | null;
  surfaces?: string[] | null;
  surfaceFinishes?: string[] | null;
  size?: string | null;
  sizes?: string[] | null;
  shape?: string | null;
  shapes?: string[] | null;
  formatFamilies?: string[] | null;
  collections?: string | string[] | null;
  search?: string | null;
  page?: number;
  limit?: number;
}): Promise<LpCatalogResult> {
  const db = getDb();
  const where: string[] = ["p.is_public = 1", "COALESCE(p.image_path, '') <> ''"];
  const params: SqlValue[] = [];

  const cat = opts?.category?.trim();
  if (cat && cat.toLowerCase() !== "all" && cat !== "Tất cả") {
    where.push("LOWER(p.category) = ?");
    params.push(cat.toLowerCase());
  }

  // 1. Lọc theo bảng màu kiến trúc chuẩn (colorPalettes: ID[])
  const activePalettes = opts?.colorPalettes?.filter(Boolean) ?? [];
  if (activePalettes.length > 0) {
    const matchedDbValues: string[] = [];
    for (const pid of activePalettes) {
      const p = COLOR_PALETTES.find((cp) => cp.id === pid);
      if (p) {
        matchedDbValues.push(...p.dbCanonicalValues);
      }
    }
    const uniqueDbValues = Array.from(new Set(matchedDbValues));
    if (uniqueDbValues.length > 0) {
      const placeholders = uniqueDbValues.map(() => "?").join(", ");
      where.push(`LOWER(TRIM(p.color)) IN (${placeholders})`);
      params.push(...uniqueDbValues);
    }
  } else {
    // Fallback lọc màu theo chuỗi raw (nếu có)
    const rawColors =
      (opts?.colors?.filter(Boolean) ?? []).length > 0
        ? (opts?.colors?.filter(Boolean) ?? [])
        : opts?.color?.trim()
          ? [opts.color.trim()]
          : [];
    if (rawColors.length > 0) {
      const placeholders = rawColors.map(() => "?").join(", ");
      where.push(`p.color IN (${placeholders})`);
      params.push(...rawColors);
    }
  }

  // 2. Lọc theo nhóm Cảm xúc Bề mặt (surfaceFinishes: ID[])
  const activeFinishes = opts?.surfaceFinishes?.filter(Boolean) ?? [];
  if (activeFinishes.length > 0) {
    const matchedSurfaces: string[] = [];
    for (const fid of activeFinishes) {
      const g = SURFACE_FINISHES.find((sf) => sf.id === fid);
      if (g) matchedSurfaces.push(...g.rawSurfaces);
    }
    const uniqueSurfaces = Array.from(new Set(matchedSurfaces));
    if (uniqueSurfaces.length > 0) {
      const placeholders = uniqueSurfaces.map(() => "?").join(", ");
      where.push(`p.surface IN (${placeholders})`);
      params.push(...uniqueSurfaces);
    }
  } else {
    const rawSurfaces =
      (opts?.surfaces?.filter(Boolean) ?? []).length > 0
        ? (opts?.surfaces?.filter(Boolean) ?? [])
        : opts?.surface?.trim()
          ? [opts.surface.trim()]
          : [];
    if (rawSurfaces.length > 0) {
      const placeholders = rawSurfaces.map(() => "?").join(", ");
      where.push(`p.surface IN (${placeholders})`);
      params.push(...rawSurfaces);
    }
  }

  // 3. Lọc theo nhóm Kiểu dáng Hình học (formatFamilies: ID[])
  const activeFamilies = opts?.formatFamilies?.filter(Boolean) ?? [];
  if (activeFamilies.length > 0) {
    const matchedShapes: string[] = [];
    for (const fid of activeFamilies) {
      const g = FORMAT_FAMILIES.find((ff) => ff.id === fid);
      if (g) matchedShapes.push(...g.rawShapes);
    }
    const uniqueShapes = Array.from(new Set(matchedShapes));
    if (uniqueShapes.length > 0) {
      const placeholders = uniqueShapes.map(() => "?").join(", ");
      where.push(`p.shape IN (${placeholders})`);
      params.push(...uniqueShapes);
    }
  } else {
    const rawShapes =
      (opts?.shapes?.filter(Boolean) ?? []).length > 0
        ? (opts?.shapes?.filter(Boolean) ?? [])
        : opts?.shape?.trim()
          ? [opts.shape.trim()]
          : [];
    if (rawShapes.length > 0) {
      const placeholders = rawShapes.map(() => "?").join(", ");
      where.push(`p.shape IN (${placeholders})`);
      params.push(...rawShapes);
    }
  }

  const rawSizes =
    (opts?.sizes?.filter(Boolean) ?? []).length > 0
      ? (opts?.sizes?.filter(Boolean) ?? [])
      : opts?.size?.trim()
        ? [opts.size.trim()]
        : [];
  if (rawSizes.length > 0) {
    const placeholders = rawSizes.map(() => "?").join(", ");
    where.push(`p.size IN (${placeholders})`);
    params.push(...rawSizes);
  }
  if (opts?.search?.trim()) {
    where.push("(LOWER(p.code) LIKE ? OR LOWER(p.name) LIKE ?)");
    const q = `%${opts.search.trim().toLowerCase()}%`;
    params.push(q, q);
  }
  const whereClause = where.join(" AND ");

  // Count total matching items
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM products p WHERE ${whereClause}`)
    .get<{ total: number }>(...params);
  const total = Number(countRow?.total ?? 0);

  const page = Math.max(Math.floor(opts?.page ?? 1), 1);
  const limit = Math.min(Math.max(Math.floor(opts?.limit ?? 18), 1), 200);
  const offset = (page - 1) * limit;

  const itemParams = [...params, limit, offset];
  const items = (await db
    .prepare(
      `SELECT p.id, p.code, p.name, p.category, p.size,
              COALESCE(p.surface, '') AS surface,
              COALESCE(p.color, '')   AS color,
              COALESCE(p.shape, '')   AS shape,
              COALESCE(map_img.path, p.image_path, '') AS image
         FROM products p
         LEFT JOIN product_images map_img ON map_img.product_id = p.id AND map_img.kind = 'map'
        WHERE ${whereClause}
        ORDER BY (p.featured_rank IS NULL), p.featured_rank, p.id
        LIMIT ? OFFSET ?`,
    )
    .all<LpMaterial>(...itemParams)) as LpMaterial[];

  // Calculate facet distributions for active category
  const baseWhere = ["p.is_public = 1", "COALESCE(p.image_path, '') <> ''"];
  const baseParams: SqlValue[] = [];
  if (cat && cat.toLowerCase() !== "all" && cat !== "Tất cả") {
    baseWhere.push("LOWER(p.category) = ?");
    baseParams.push(cat.toLowerCase());
  }
  const baseWhereClause = baseWhere.join(" AND ");

  const [colors, surfaces, sizes, shapes, collections] = await Promise.all([
    db
      .prepare(
        `SELECT p.color AS value, COUNT(*) AS count
           FROM products p
          WHERE ${baseWhereClause} AND COALESCE(p.color, '') <> ''
          GROUP BY p.color
          ORDER BY count DESC, value
          LIMIT 50`,
      )
      .all<CatalogFacetOption>(...baseParams),
    db
      .prepare(
        `SELECT p.surface AS value, COUNT(*) AS count
           FROM products p
          WHERE ${baseWhereClause} AND COALESCE(p.surface, '') <> ''
          GROUP BY p.surface
          ORDER BY count DESC, value
          LIMIT 50`,
      )
      .all<CatalogFacetOption>(...baseParams),
    db
      .prepare(
        `SELECT p.size AS value, COUNT(*) AS count
           FROM products p
          WHERE ${baseWhereClause} AND COALESCE(p.size, '') <> ''
          GROUP BY p.size
          ORDER BY count DESC, value
          LIMIT 50`,
      )
      .all<CatalogFacetOption>(...baseParams),
    db
      .prepare(
        `SELECT p.shape AS value, COUNT(*) AS count
           FROM products p
          WHERE ${baseWhereClause} AND COALESCE(p.shape, '') <> ''
          GROUP BY p.shape
          ORDER BY count DESC, value
          LIMIT 50`,
      )
      .all<CatalogFacetOption>(...baseParams),
    db
      .prepare(
        `SELECT p.collections AS value, COUNT(*) AS count
           FROM products p
          WHERE ${baseWhereClause} AND COALESCE(p.collections, '') <> ''
          GROUP BY p.collections
          ORDER BY count DESC, value
          LIMIT 50`,
      )
      .all<CatalogFacetOption>(...baseParams),
  ]);
  // 1. Tổng hợp facet theo 11 bảng màu kiến trúc chuẩn
  const paletteCountMap: Record<string, number> = {};
  for (const c of (colors as CatalogFacetOption[]) ?? []) {
    const pid = matchColorPalette(c.value);
    if (pid) {
      paletteCountMap[pid] = (paletteCountMap[pid] || 0) + Number(c.count);
    }
  }
  const colorPalettes: CatalogFacetOption[] = COLOR_PALETTES.map((p) => ({
    value: p.id,
    count: paletteCountMap[p.id] || 0,
  })).filter((p) => p.count > 0);

  // 2. Tổng hợp facet theo 4 nhóm Cảm xúc Bề mặt
  const finishCounts: Record<string, number> = {};
  for (const s of (surfaces as CatalogFacetOption[]) ?? []) {
    for (const g of SURFACE_FINISHES) {
      if (g.rawSurfaces.includes(s.value)) {
        finishCounts[g.id] = (finishCounts[g.id] || 0) + Number(s.count);
      }
    }
  }
  const surfaceFinishes: CatalogFacetOption[] = SURFACE_FINISHES.map((g) => ({
    value: g.id,
    count: finishCounts[g.id] || 0,
  })).filter((g) => g.count > 0);

  // 3. Tổng hợp facet theo 4 nhóm Kiểu dáng Hình học
  const familyCounts: Record<string, number> = {};
  for (const sh of (shapes as CatalogFacetOption[]) ?? []) {
    for (const g of FORMAT_FAMILIES) {
      if (g.rawShapes.includes(sh.value)) {
        familyCounts[g.id] = (familyCounts[g.id] || 0) + Number(sh.count);
      }
    }
  }
  const formatFamilies: CatalogFacetOption[] = FORMAT_FAMILIES.map((g) => ({
    value: g.id,
    count: familyCounts[g.id] || 0,
  })).filter((g) => g.count > 0);

  return {
    items,
    total,
    page,
    limit,
    facets: {
      colors: (colors as CatalogFacetOption[]) ?? [],
      colorPalettes,
      surfaces: (surfaces as CatalogFacetOption[]) ?? [],
      surfaceFinishes,
      shapes: (shapes as CatalogFacetOption[]) ?? [],
      formatFamilies,
      sizes: (sizes as CatalogFacetOption[]) ?? [],
      collections: (collections as CatalogFacetOption[]) ?? [],
    },
  };
}

// ─── Rate limit ─────────────────────────────────────────────

/** Hash IP — không lưu IP thô, chỉ cần định danh ổn định để đếm. */
export function hashIp(ip: string): string {
  const salt = process.env.LP_IP_SALT ?? "innomat-lp";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;

/**
 * Fixed-window rate limit, state trong Postgres.
 */
export async function checkRateLimit(bucket: string): Promise<boolean> {
  const db = getDb();
  const now = Date.now();
  const row = await db
    .prepare("SELECT hits, window_start FROM lp_rate_limits WHERE bucket = ?")
    .get<{ hits: number; window_start: string }>(bucket);

  if (!row) {
    await db
      .prepare("INSERT INTO lp_rate_limits (bucket, hits, window_start) VALUES (?, 1, ?)")
      .run(bucket, String(now));
    return true;
  }

  const started = Number(row.window_start) || 0;
  if (now - started > WINDOW_MS) {
    await db
      .prepare("UPDATE lp_rate_limits SET hits = 1, window_start = ? WHERE bucket = ?")
      .run(String(now), bucket);
    return true;
  }

  if (row.hits >= MAX_HITS) return false;

  await db.prepare("UPDATE lp_rate_limits SET hits = hits + 1 WHERE bucket = ?").run(bucket);
  return true;
}

// ─── Lead intake ────────────────────────────────────────────

type LeadResult = { ok: true; duplicate: boolean } | { ok: false; error: string };

/**
 * Ghi lead từ LP kèm chi tiết ngữ cảnh Shortlist.
 */
export async function createLpLead(
  input: LpLeadInput,
  meta: { ipHash: string; userAgent: string },
): Promise<LeadResult> {
  const fullName = clip(input.full_name, 120);
  const phoneRaw = clip(input.phone, 32);
  const email = clip(input.email, 160).toLowerCase();
  const formKind = input.form_kind === "library-gate" ? "library-gate" : "lp";

  const isGate = formKind === "library-gate";
  const hasPhone = isPhoneMatchable(phoneRaw);

  if (isGate) {
    if (!hasPhone && !email) {
      return { ok: false, error: "Vui lòng nhập email hoặc số điện thoại để mở thư viện." };
    }
    if (phoneRaw && !hasPhone) {
      return { ok: false, error: "Số điện thoại chưa đúng, cần ít nhất 9 chữ số." };
    }
  } else {
    if (!fullName) return { ok: false, error: "Vui lòng nhập tên." };
    if (!hasPhone) {
      return { ok: false, error: "Số điện thoại chưa đúng, cần ít nhất 9 chữ số." };
    }
  }

  const phoneNorm = hasPhone ? normalizePhone(phoneRaw) : "";
  const db = getDb();

  const dedupeCol = phoneNorm ? "phone_norm" : "email";
  const dedupeVal = phoneNorm || email;
  const recent = dedupeVal
    ? await db
        .prepare(
          `SELECT id FROM lp_leads
            WHERE ${dedupeCol} = ? AND lp_slug = ? AND form_kind = ?
              AND created_at > ?
            LIMIT 1`,
        )
        .get<{ id: number }>(
          dedupeVal,
          clip(input.lp_slug, 64),
          formKind,
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " "),
        )
    : null;
  if (recent) return { ok: true, duplicate: true };

  const ts = nowUtc();
  const consent = input.consent_marketing ? 1 : 0;

  // Extract shortlist codes from both input.shortlist_codes and input.shortlist_details
  const directCodes = input.shortlist_codes ?? [];
  const detailCodes = (input.shortlist_details ?? []).map((d) => d.code);
  const allCodes = [...new Set([...directCodes, ...detailCodes])]
    .map((c) => clip(c, 40))
    .filter((c) => c && /^[\w.\-/]+$/.test(c))
    .slice(0, 24);

  const shortlistDetailsJson =
    input.shortlist_details && input.shortlist_details.length > 0
      ? JSON.stringify(input.shortlist_details.slice(0, 24))
      : "";

  await db
    .prepare(
      `INSERT INTO lp_leads
         (full_name, phone, phone_norm, email, need, note, lp_slug,
          studio, project_type, project_stage, project_name, area,
          attachment_names, form_kind,
          shortlist_codes, shortlist_details, status,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          referrer, landing_path, ip_hash, user_agent,
          consent_marketing, consent_at, created_at)
       VALUES
         (@full_name, @phone, @phone_norm, @email, @need, @note, @lp_slug,
          @studio, @project_type, @project_stage, @project_name, @area,
          @attachment_names, @form_kind,
          @shortlist_codes, @shortlist_details, 'new',
          @utm_source, @utm_medium, @utm_campaign, @utm_content, @utm_term,
          @referrer, @landing_path, @ip_hash, @user_agent,
          @consent_marketing, @consent_at, @created_at)`,
    )
    .run({
      full_name: fullName,
      phone: phoneRaw,
      phone_norm: phoneNorm,
      email,
      need: clip(input.need, 80),
      note: clip(input.note, 1000),
      lp_slug: clip(input.lp_slug, 64),
      studio: clip(input.studio, 160),
      project_type: clip(input.project_type, 80),
      project_stage: clip(input.project_stage, 80),
      project_name: clip(input.project_name, 200),
      area: clip(input.area, 120),
      attachment_names: (input.attachment_names ?? [])
        .map((n) => clip(n, 120))
        .filter(Boolean)
        .slice(0, 4)
        .join(", "),
      form_kind: formKind,
      shortlist_codes: allCodes.join(","),
      shortlist_details: shortlistDetailsJson,
      utm_source: clip(input.utm?.source, 120),
      utm_medium: clip(input.utm?.medium, 120),
      utm_campaign: clip(input.utm?.campaign, 160),
      utm_content: clip(input.utm?.content, 160),
      utm_term: clip(input.utm?.term, 160),
      referrer: clip(input.referrer, 500),
      landing_path: clip(input.landing_path, 300),
      ip_hash: meta.ipHash,
      user_agent: clip(meta.userAgent, 300),
      consent_marketing: consent,
      consent_at: consent ? ts : "",
      created_at: ts,
    } as unknown as SqlValue);

  return { ok: true, duplicate: false };
}

// ─── CRM side: đọc & xử lý lead ──────────────────────────────

export async function listLpLeads(opts?: {
  status?: LpLeadStatus | "all";
  search?: string;
  limit?: number;
}): Promise<LpLead[]> {
  const db = getDb();
  const where: string[] = [];
  const params: SqlValue[] = [];

  if (opts?.status && opts.status !== "all") {
    where.push("l.status = ?");
    params.push(opts.status);
  }
  if (opts?.search?.trim()) {
    where.push(
      "(l.full_name LIKE ? OR l.phone_norm LIKE ? OR l.email LIKE ? OR l.studio LIKE ? OR l.utm_campaign LIKE ?)",
    );
    const q = `%${opts.search.trim()}%`;
    params.push(q, q, q, q, q);
  }
  params.push(Math.min(Math.max(Math.floor(opts?.limit ?? 200), 1), 500));

  const rows = (await db
    .prepare(
      `SELECT l.*, u.display_name AS handled_by_name,
              CASE WHEN l.phone_norm = '' THEN 1
                   ELSE (SELECT COUNT(*) FROM lp_leads d WHERE d.phone_norm = l.phone_norm)
              END AS dup_count
         FROM lp_leads l
         LEFT JOIN users u ON u.id = l.handled_by
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ?`,
    )
    .all<LpLead>(...params)) as LpLead[];

  // Decorate shortlist_codes (canonical product ids) -> code/name để inbox
  // hiển thị mã gạch thật thay vì id thô. Id không còn tồn tại được bỏ qua
  // graceful (vẫn giữ CSV gốc trong DB). 1 query cho toàn bộ page.
  const wantedIds = new Set<number>();
  for (const lead of rows) {
    for (const raw of lead.shortlist_codes.split(",")) {
      const id = Number(raw.trim());
      if (Number.isInteger(id) && id > 0) wantedIds.add(id);
    }
  }
  if (wantedIds.size > 0) {
    const placeholders = [...wantedIds].map(() => "?").join(", ");
    const products = (await db
      .prepare(`SELECT id, code, name FROM products WHERE id IN (${placeholders})`)
      .all<{ id: number; code: string; name: string }>(...[...wantedIds])) as Array<{
      id: number;
      code: string;
      name: string;
    }>;
    const byId = new Map<number, { id: number; code: string; name: string }>();
    for (const p of products) byId.set(Number(p.id), p);
    for (const lead of rows) {
      const resolved: Array<{ id: number; code: string; name: string }> = [];
      for (const raw of lead.shortlist_codes.split(",")) {
        const id = Number(raw.trim());
        const product = byId.get(id);
        if (product) resolved.push(product);
      }
      if (resolved.length > 0) lead.shortlist_products = resolved;
    }
  }
  return rows;
}

/** Số lead status 'new' (chưa ai xử lý) — dùng cho badge sidebar. */
export async function countNewLpLeads(): Promise<number> {
  const db = getDb();
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM lp_leads WHERE status = 'new'")
    .get<{ n: number }>();
  return row?.n ?? 0;
}

export async function setLpLeadStatus(
  id: number,
  status: LpLeadStatus,
  userId: number,
): Promise<{ ok: true }> {
  await getDb()
    .prepare("UPDATE lp_leads SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?")
    .run(status, userId, nowUtc(), id);
  return { ok: true };
}

export async function deleteLpLead(id: number): Promise<{ ok: true }> {
  await getDb().prepare("DELETE FROM lp_leads WHERE id = ?").run(id);
  return { ok: true };
}

/**
 * Chuyển lead → customer kèm Rich Context Note & Sample Requests.
 */
export async function convertLpLeadToCustomer(
  id: number,
  ownerId: number,
): Promise<{ ok: true; customer_id: number } | { ok: false; error: string }> {
  const db = getDb();
  const lead = await db.prepare("SELECT * FROM lp_leads WHERE id = ?").get<LpLead>(id);
  if (!lead) return { ok: false, error: "Không tìm thấy lead." };
  if (lead.customer_id) {
    return { ok: false, error: "Lead này đã được chuyển thành khách hàng." };
  }
  if (!lead.phone_norm) {
    return {
      ok: false,
      error: "Lead này chỉ có email, chưa có số điện thoại. Bổ sung SĐT trước khi chuyển.",
    };
  }

  // 1. Phân tích Shortlist Details
  let contextItems: ShortlistContextItem[] = [];
  if (lead.shortlist_details) {
    try {
      contextItems = JSON.parse(lead.shortlist_details);
    } catch {
      // Fallback
    }
  }

  try {
    const customer = await createCustomer({
      name: lead.full_name || `Lead ${lead.id}`,
      source: "Khác",
      phone: lead.phone,
      email: lead.email,
      company: lead.studio,
      note: [
        lead.need ? `Nhu cầu: ${lead.need}` : "",
        lead.project_type ? `Loại công trình: ${lead.project_type}` : "",
        lead.project_stage ? `Giai đoạn: ${lead.project_stage}` : "",
        lead.project_name ? `Dự án: ${lead.project_name}` : "",
        lead.area ? `Diện tích: ${lead.area}` : "",
        lead.note,
        lead.shortlist_codes ? `Mã đã chọn: ${lead.shortlist_codes}` : "",
        lead.attachment_names ? `Khách nói sẽ gửi file: ${lead.attachment_names}` : "",
        lead.lp_slug ? `LP: ${lead.lp_slug}` : "",
        lead.utm_campaign ? `Campaign: ${lead.utm_campaign}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      owner_id: ownerId,
    });

    const ts = nowUtc();

    // 2. Tạo Note nghiệp vụ chi tiết cho Sales
    const breakdownText =
      contextItems.length > 0
        ? contextItems
            .map(
              (item, idx) =>
                `${idx + 1}. Mã [${item.code}]: ${
                  item.source === "space"
                    ? `Chọn từ Không gian '${item.space_title || item.space_slug}' (Vị trí: ${item.application_position || "Chưa rõ"})`
                    : "Chọn từ Thư viện mã gạch"
                }`,
            )
            .join("\n")
        : lead.shortlist_codes
          ? `Mã gạch quan tâm: ${lead.shortlist_codes}`
          : "Chưa lưu mã gạch cụ thể";

    const noteContent = `📌 [BRIEF TỪ EM BÁN GẠCH]
- KTS / Văn phòng: ${lead.studio || lead.full_name}
- Dự án: ${lead.project_name || "Chưa đặt tên"} (${lead.project_type || "Chưa rõ"} · ${lead.project_stage || "Chưa rõ"})
- Diện tích ốp lát: ${lead.area || "Chưa rõ"}
- Ghi chú: ${lead.note || "Không có"}

📋 DANH SÁCH MÃ VẬT LIỆU & BỐI CẢNH ỨNG DỤNG:
${breakdownText}`;

    await db
      .prepare(
        `INSERT INTO notes (customer_id, author, content, created_at, author_user_id)
         VALUES (?, 'System (Landing Brief)', ?, ?, ?)`,
      )
      .run(customer.id, noteContent, ts, ownerId);

    // 3. Tự động ghi vào customer_product_samples (đánh dấu mẫu gạch KTS quan tâm)
    const codesToLink = [
      ...new Set([
        ...contextItems.map((c) => c.code),
        ...(lead.shortlist_codes ? lead.shortlist_codes.split(",").map((s) => s.trim()) : []),
      ]),
    ].filter(Boolean);

    for (const code of codesToLink) {
      const prod = await db
        .prepare("SELECT id, name FROM products WHERE code = ?")
        .get<{ id: number; name: string }>(code);
      if (prod) {
        await db
          .prepare(
            `INSERT INTO customer_product_samples (customer_id, product_id, product_code, product_name, sample_sent, source, created_at)
             VALUES (?, ?, ?, ?, 0, 'landing_space', ?)
             ON CONFLICT (customer_id, product_id) DO NOTHING`,
          )
          .run(customer.id, prod.id, code, prod.name, ts);
      }
    }

    // 4. Đánh dấu trạng thái lead
    await db
      .prepare(
        `UPDATE lp_leads
            SET status = 'converted', customer_id = ?, handled_by = ?, handled_at = ?
          WHERE id = ?`,
      )
      .run(customer.id, ownerId, ts, id);

    return { ok: true, customer_id: customer.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Không chuyển được lead.",
    };
  }
}

// ─── Landing Page Settings (Hero Banner & Layout) ─────────────

async function getLpSetting(key: string, defaultValue = ""): Promise<string> {
  const db = getDb();
  const row = await db
    .prepare("SELECT value FROM lp_settings WHERE key = ?")
    .get<{ value: string }>(key);
  return row ? row.value : defaultValue;
}

async function setLpSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  const ts = nowUtc();
  await db
    .prepare(
      `INSERT INTO lp_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    )
    .run(key, value, ts);
}

export async function getHeroImageSetting(): Promise<string> {
  const defaultHero =
    "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/fe2aef755acdc0f9b7e1911403a8ff4d79eff43cb8862b97e86977dea4e679ad.webp";
  return await getLpSetting("hero_image", defaultHero);
}

export async function setHeroImageSetting(imagePath: string): Promise<void> {
  const trimmed = imagePath.trim();
  await setLpSetting("hero_image", trimmed);
  // Media asset registry: đồng bộ landing_page_media_usages (delete + re-insert).
  await syncHeroUsage(getDb(), trimmed);
}
