/**
 * Image Reference Resolver — nguồn SỰ THẬT duy nhất cho mọi câu hỏi
 * "ảnh này đang được dùng ở đâu?" trên physical image (theo storage_key).
 *
 * Semantics khớp:
 *  - Usage UI (concrete references)
 *  - Count (gọn)
 *  - Orphan marking (via isPublicImagePathReferenced trong crm.server — cập nhật cùng nguồn)
 *  - GC re-check (countImageReferencesForKey trong image-gc.server — delegate về đây)
 *
 * Matching: tail-LIKE `%/<storageKey>` — GIỮ contract hiện tại (DB chứa cả
 * `/images/<key>`, full Supabase URL, đôi khi storage key trần). KHÔNG đổi sang
 * exact `=` (safety: live reference không được vô hình với GC).
 *
 * Sources (7):
 *  product_images.path, products.image_path, customer_mapping_items.image_path,
 *  customer_mapping_items.custom_product_image_path, gallery_collection_items.path,
 *  gallery_collections.cover_path, lp_settings.hero_image.
 */
import { type AsyncDb } from "@/db/driver";
import { gcRetentionHours } from "@/lib/image-asset-refs";

export type ImageReferenceRole =
  | "product_image"
  | "product"
  | "mapping"
  | "custom_mapping_product"
  | "gallery_item"
  | "gallery_cover"
  | "lp_hero";

export interface ImageReferenceSource {
  role: ImageReferenceRole;
  sql: string;
  /** cột chứa ref — dùng cho batch (giữ alias khi nối OR). */
  col: string;
  /** điều kiện tĩnh đặt trước OR (vd lp_hero: s.key = 'hero_image' AND). */
  pre?: string;
}

export interface ImageReference {
  role: ImageReferenceRole;
  /** id bản ghi giữ reference. */
  id: string;
  /** owner khi có (product / gallery collection / mapping). */
  owner?: { id: string; code?: string; name?: string };
  label?: string;
  ref: string;
  /** href khi có route canonical; null nghĩa là chưa có trang con. */
  href?: string | null;
}

const SOURCES: ImageReferenceSource[] = [
  {
    role: "product_image",
    col: "i.path",
    sql: `SELECT i.id, i.path, i.kind, i.is_primary,
                 p.id AS owner_id, p.code AS owner_code, p.name AS owner_name
            FROM product_images i
            JOIN products p ON p.id = i.product_id
           WHERE i.path LIKE ?`,
  },
  {
    role: "product",
    col: "p.image_path",
    sql: `SELECT p.id, p.image_path AS path, p.code AS owner_code, p.name AS owner_name
            FROM products p
           WHERE p.image_path LIKE ?`,
  },
  {
    role: "mapping",
    col: "m.image_path",
    sql: `SELECT m.id, m.image_path AS path, c.id AS owner_id, c.name AS owner_name
            FROM customer_mapping_items m
            JOIN customer_mappings cm ON cm.id = m.mapping_id
            JOIN customers c ON c.id = cm.customer_id
           WHERE m.image_path LIKE ?`,
  },
  {
    role: "custom_mapping_product",
    col: "m.custom_product_image_path",
    sql: `SELECT m.id, m.custom_product_image_path AS path, c.id AS owner_id, c.name AS owner_name
            FROM customer_mapping_items m
            JOIN customer_mappings cm ON cm.id = m.mapping_id
            JOIN customers c ON c.id = cm.customer_id
           WHERE m.custom_product_image_path LIKE ?`,
  },
  {
    role: "gallery_item",
    col: "i.path",
    sql: `SELECT i.id, i.path, g.id AS owner_id, g.name AS owner_name
            FROM gallery_collection_items i
            JOIN gallery_collections g ON g.id = i.collection_id
           WHERE i.path LIKE ?`,
  },
  {
    role: "gallery_cover",
    col: "g.cover_path",
    sql: `SELECT g.id, g.cover_path AS path, g.name AS owner_name
            FROM gallery_collections g
           WHERE g.cover_path LIKE ?`,
  },
  {
    role: "lp_hero",
    col: "s.value",
    pre: "s.key = 'hero_image' AND ",
    sql: `SELECT 1 AS id, s.value AS path
            FROM lp_settings s
           WHERE s.key = 'hero_image' AND s.value LIKE ?`,
  },
];

/** href theo route canonical hiện có (không invent route). */
function hrefFor(
  role: ImageReferenceRole,
  row: { id: number | string; owner_id?: string },
): string | null {
  switch (role) {
    case "gallery_item":
    case "gallery_cover":
      return `/thu-vien?c=${row.id}`;
    case "mapping":
    case "custom_mapping_product":
      return row.owner_id ? `/khach-hang/${row.owner_id}` : null;
    case "product":
    case "product_image":
      return null; // chưa có route product-detail độc lập (catalog /san-pham có nhom, không theo id)
    case "lp_hero":
      return null;
    default:
      return null;
  }
}

function mapRow(source: ImageReferenceSource, row: Record<string, unknown>): ImageReference {
  const id = String(row.id ?? "");
  const ownerId = row.owner_id != null ? String(row.owner_id) : undefined;
  const ownerName =
    typeof row.owner_name === "string" && row.owner_name ? row.owner_name : undefined;
  const ownerCode =
    typeof row.owner_code === "string" && row.owner_code ? row.owner_code : undefined;
  const labelRaw =
    typeof row.kind === "string" ? row.kind : typeof row.label === "string" ? row.label : "";
  return {
    role: source.role,
    id,
    owner:
      ownerId || ownerCode || ownerName
        ? { id: ownerId ?? "", code: ownerCode, name: ownerName }
        : undefined,
    label: labelRaw || undefined,
    ref: String(row.path ?? ""),
    href: hrefFor(source.role, row as unknown as { id: string; owner_id?: string }),
  };
}

/**
 * Concrete references cho 1 storage key ("<sha256>.<ext>").
 * Empty array = không reference nào (hoặc key rác — không được dùng để khẳng định orphan
 * một mình; GC re-check chạy đúng pipeline claim).
 */
export async function listImageReferencesForKey(
  db: AsyncDb,
  storageKey: string,
): Promise<ImageReference[]> {
  if (!storageKey) return [];
  const pattern = `%/${storageKey}`;
  const out: ImageReference[] = [];
  for (const source of SOURCES) {
    const rows = (await db.prepare(source.sql).all<Record<string, unknown>>(pattern)) ?? [];
    for (const row of rows) out.push(mapRow(source, row));
  }
  return out;
}

/**
 * Batch cho một trang grid: Map<storageKey, references[]> — 1 query / nguồn.
 */
export async function listImageReferencesForKeys(
  db: AsyncDb,
  storageKeys: string[],
): Promise<Map<string, ImageReference[]>> {
  const result = new Map<string, ImageReference[]>();
  const unique = [...new Set(storageKeys.filter(Boolean))];
  if (unique.length === 0) return result;
  const ors = unique.map(() => "path LIKE ?").join(" OR ");
  const patterns = unique.map((k) => `%/${k}`);
  for (const source of SOURCES) {
    const whereCol = source.col;
    const orsSql = unique.map(() => `${whereCol} LIKE ?`).join(" OR ");
    const sql = source.sql.replace(/WHERE .*LIKE \?/i, `WHERE ${source.pre ?? ""}(${orsSql})`);
    const rows = (await db.prepare(sql).all<Record<string, unknown>>(...patterns)) ?? [];
    for (const row of rows) {
      const ref = mapRow(source, row);
      // xác định key nào match: ref path tail khớp key nào
      const path = String(row.path ?? "");
      for (const key of unique) {
        if (path.endsWith(`/${key}`)) {
          const list = result.get(key) ?? [];
          list.push(ref);
          result.set(key, list);
          break;
        }
      }
    }
  }
  return result;
}

export { gcRetentionHours };
/** Retention (giờ) cho countdown UI — cùng chính sách toàn cục, không per-asset. */
export function retentionHours(): number {
  return gcRetentionHours();
}

export interface ImageAssetLifecycleRow {
  id: number;
  sha256: string;
  storage_key: string;
  orphaned_at: string | null;
  gc_claimed_at: string | null;
  gc_completed_at: string | null;
  last_referenced_at: string;
  created_at: string;
}

/** Thông tin lifecycle registry cho các key của một trang grid. */
export async function listAssetLifecycleForKeys(
  db: AsyncDb,
  storageKeys: string[],
): Promise<Map<string, ImageAssetLifecycleRow>> {
  const result = new Map<string, ImageAssetLifecycleRow>();
  const unique = [...new Set(storageKeys.filter(Boolean))];
  if (unique.length === 0) return result;
  const placeholders = unique.map(() => "?").join(", ");
  const rows =
    (await db
      .prepare(
        `SELECT id, sha256, storage_key, orphaned_at, gc_claimed_at, gc_completed_at,
              last_referenced_at, created_at
         FROM image_assets
        WHERE storage_key IN (${placeholders})`,
      )
      .all<ImageAssetLifecycleRow>(...unique)) ?? [];
  for (const r of rows) result.set(r.storage_key, r);
  return result;
}
