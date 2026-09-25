/**
 * Logic thuần cho Media Asset Registry — KHÔNG import alias `@/`, KHÔNG touch DB.
 * (Cùng quy ước alias-free như `image-asset-refs.ts` để node --test chạy được.)
 *
 *  - 3 trạng thái dùng: used / draft / orphan.
 *  - Group usage theo module (Product / Lookbook / Featured / Hero / Mapping).
 *  - Dedupe 1 physical file → 1 asset.
 *  - Planning backfill & replace (kiểm tra idempotence bằng thuần).
 */

/**
 * 2 trạng thái gán: `used` (gán vào ≥1 nơi) / `unused` (không gán vào đâu).
 * Trước 2026-09-25 có 3 trạng thái (used/draft/orphan); `draft` gộp vào `used`
 * vì ảnh gắn vào sản phẩm dù chưa public vẫn là "đã gán".
 */
export type MediaAssetStatus = "used" | "unused";

export const MEDIA_USAGE_GROUPS = ["product", "lookbook", "featured", "hero", "mapping"] as const;
export type MediaUsageGroupKey = (typeof MEDIA_USAGE_GROUPS)[number];

/** Một usage cấp sản phẩm (từ product_images JOIN products). */
export interface ProductUsageInput {
  product_public: number;
  featured_rank: number | null;
  kind: "map" | "concept" | "normal";
  image_public: number;
}

export interface MediaUsageSummary {
  /** tổng usage product */
  product: number;
  /** concept public (Lookbook) */
  lookbook: number;
  /** số sản phẩm featured 1..12 dùng asset */
  featured: number;
  /** số usage landing/hero */
  hero: number;
  /** số usage mapping (tile + custom) */
  mapping: number;
}

export const EMPTY_USAGE_SUMMARY: MediaUsageSummary = {
  product: 0,
  lookbook: 0,
  featured: 0,
  hero: 0,
  mapping: 0,
};

/**
 * Tổng hợp usage summary từ danh sách usage product + counts mapping/hero.
 * Pure → test trực tiếp không cần DB.
 */
export function summarizeUsages(
  products: ProductUsageInput[],
  mappingCount = 0,
  heroCount = 0,
): MediaUsageSummary {
  const summary: MediaUsageSummary = { ...EMPTY_USAGE_SUMMARY };
  summary.product = products.length;
  summary.mapping = mappingCount;
  summary.hero = heroCount;
  let featured = 0;
  for (const p of products) {
    if (p.kind === "concept" && p.image_public === 1) summary.lookbook++;
    if (p.featured_rank != null && p.featured_rank >= 1 && p.featured_rank <= 12) featured++;
  }
  summary.featured = featured;
  return summary;
}

/**
 * 2 trạng thái — `used` khi asset được gán vào BẤT KỲ đâu (product gallery,
 * mapping, hero…), `unused` khi không nơi nào trỏ tới. Ảnh gắn sản phẩm nhưng
 * chưa public vẫn tính `used` (đã gán, chỉ chưa hiển thị).
 */
export function classifyAssetStatus(s: MediaUsageSummary): MediaAssetStatus {
  const hasAnyUsage = s.product > 0 || s.mapping > 0 || s.hero > 0;
  return hasAnyUsage ? "used" : "unused";
}

/** Bất biến bắt buộc: ảnh đang public trên Lookbook KHÔNG BAO GIỜ unused. */
export function assertLookbookNeverOrphan(p: ProductUsageInput): void {
  if (p.kind === "concept" && p.image_public === 1) {
    const s = summarizeUsages([p]);
    if (classifyAssetStatus(s) === "unused") {
      throw new Error("Lookbook public image must never be unused");
    }
  }
}

/** Group counts per module để hiển thị chip trên card. */
export function usageGroups(s: MediaUsageSummary): Record<MediaUsageGroupKey, number> {
  return {
    product: s.product,
    lookbook: s.lookbook,
    featured: s.featured,
    hero: s.hero,
    mapping: s.mapping,
  };
}

/** nil-safe: đếm riêng từng nhóm theo vai trò. */
export type UsageRole = "product_image" | "product" | "mapping" | "custom_mapping_product" | "lp_hero";

export function countRoles<S extends string, T extends { role: S }>(refs: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of refs) out[r.role] = (out[r.role] ?? 0) + 1;
  return out;
}

/** Dedupe 1 physical file → 1 item. Nhận danh sách item có `storage_key`/`path`. */
export function dedupeByFile<T extends { path: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = storageKeyOf(it.path);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/** Lấy storage key (tail "<sha>.<ext>") từ path — MR: /images/ hoặc URL. */
export function storageKeyOf(path: string): string {
  if (!path) return "";
  let base = "";
  if (path.startsWith("/images/")) {
    base = path.slice("/images/".length);
  } else {
    try {
      base = (new URL(path).pathname.split("/").pop() ?? "").trim();
    } catch {
      return "";
    }
  }
  return /^([0-9a-f]{64})(\.[a-z0-9]+)?$/i.test(base) ? base : "";
}

/**
 * Planning backfill — nhận 5 nguồn ref, trả danh sách asset + role counts.
 * Chạy lại (cùng input) phải cho output y hệt → idempotent.
 */
export interface BackfillSource {
  src: "product_images" | "product" | "mapping" | "custom_mapping_product" | "lp_hero";
  /** mỗi phần tử là 1 ref có path (URL/đường dẫn), role đã có sẵn */
  path: string;
}

export interface BackfillPlan {
  /** distinct storage_key — đây là số MediaAsset sẽ tạo */
  assetKeys: string[];
  /** expected number of product usage rows (product_images) */
  productUsageKeys: string[];
  mappingUsageKeys: string[];
  mappingCustomUsageKeys: string[];
  heroUsageKeys: string[];
}

export function planBackfill(sources: BackfillSource[]): BackfillPlan {
  const assetKeys = new Set<string>();
  const productUsageKeys: string[] = [];
  const mappingUsageKeys: string[] = [];
  const mappingCustomUsageKeys: string[] = [];
  const heroUsageKeys: string[] = [];
  for (const s of sources) {
    const key = storageKeyOf(s.path);
    if (!key) continue;
    assetKeys.add(key);
    if (s.src === "product_images") productUsageKeys.push(key);
    else if (s.src === "mapping") mappingUsageKeys.push(key);
    else if (s.src === "custom_mapping_product") mappingCustomUsageKeys.push(key);
    else if (s.src === "lp_hero") heroUsageKeys.push(key);
  }
  return {
    assetKeys: [...assetKeys],
    productUsageKeys,
    mappingUsageKeys,
    mappingCustomUsageKeys,
    heroUsageKeys,
  };
}