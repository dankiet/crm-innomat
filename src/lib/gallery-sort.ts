/**
 * Sort + chuẩn hoá tìm kiếm của Thư viện (bộ sưu tập ảnh).
 *
 * Tách nguyên văn từ `src/routes/_app.thu-vien.tsx`. `GALLERY_SORT_FIELDS`
 * (metadata hiển thị cho menu sort) vẫn nằm ở route vì nó dùng type của
 * `@/components/SortMenu` — lib KHÔNG import components.
 */
import { splitSearchTokens } from "./product-search.ts";
import type { GalleryCollection, GalleryCollectionItem } from "./types.ts";

export type SortDir = "asc" | "desc";

export type GallerySort =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "updated_asc"
  | "name_asc"
  | "name_desc"
  | "items_desc"
  | "items_asc";

export type GallerySortField = "created" | "updated" | "name" | "items";

export function decodeGallerySort(value: GallerySort): {
  field: GallerySortField;
  dir?: SortDir;
} {
  switch (value) {
    case "created_asc":
      return { field: "created", dir: "asc" };
    case "created_desc":
      return { field: "created", dir: "desc" };
    case "updated_asc":
      return { field: "updated", dir: "asc" };
    case "updated_desc":
      return { field: "updated", dir: "desc" };
    case "name_asc":
      return { field: "name", dir: "asc" };
    case "name_desc":
      return { field: "name", dir: "desc" };
    case "items_asc":
      return { field: "items", dir: "asc" };
    case "items_desc":
      return { field: "items", dir: "desc" };
    default:
      return { field: "created", dir: "desc" };
  }
}

export function encodeGallerySort(field: GallerySortField, dir: SortDir): GallerySort {
  switch (field) {
    case "created":
      return dir === "asc" ? "created_asc" : "created_desc";
    case "updated":
      return dir === "asc" ? "updated_asc" : "updated_desc";
    case "name":
      return dir === "asc" ? "name_asc" : "name_desc";
    case "items":
      return dir === "asc" ? "items_asc" : "items_desc";
  }
}

export function parseGallerySort(v: unknown): GallerySort | undefined {
  if (
    v === "created_desc" ||
    v === "created_asc" ||
    v === "updated_desc" ||
    v === "updated_asc" ||
    v === "name_asc" ||
    v === "name_desc" ||
    v === "items_desc" ||
    v === "items_asc"
  )
    return v;
  return undefined;
}

export function parsePositiveInt(v: unknown): number | undefined {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim() !== ""
        ? Number(v)
        : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

export function compareCollectionName(a: GalleryCollection, b: GalleryCollection): number {
  const byName = a.name.localeCompare(b.name, "vi", { sensitivity: "base" });
  if (byName !== 0) return byName;
  return a.id - b.id;
}

export function timeMs(value: string | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function parseViewerIndex(v: unknown): number | undefined {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim() !== ""
        ? Number(v)
        : NaN;
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

/** Bỏ dấu tiếng Việt + hạ việt hoá — chuẩn so trùng tên/mã trong trang Thư viện. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLocaleLowerCase("vi")
    .trim();
}

export function searchTokens(query: string): string[] {
  return splitSearchTokens(query, normalizeSearchText);
}

/**
 * Optional view-only sort: group by product (1a,1b stay adjacent), then order
 * clusters by stock high→low. Does not rewrite saved sort_order.
 *
 * Cover stays put: the cover photo is pinned first (badge still on cover_path),
 * remaining photos of the same product stay right after it, then other products
 * by stock. So sorting never moves/replaces the đại diện tile.
 */
export function sortCollectionItemsByStockDesc(
  items: GalleryCollectionItem[],
  coverPath?: string | null,
): GalleryCollectionItem[] {
  type Cluster = {
    key: string;
    stock: number;
    firstOrder: number;
    items: GalleryCollectionItem[];
  };
  const clusters: Cluster[] = [];
  const byProduct = new Map<number, Cluster>();
  const cover = coverPath?.trim() || "";

  items.forEach((item, index) => {
    const stock = Number(item.total_stock) || 0;
    if (item.product_id != null) {
      let cluster = byProduct.get(item.product_id);
      if (!cluster) {
        cluster = {
          key: `p-${item.product_id}`,
          stock,
          firstOrder: index,
          items: [],
        };
        byProduct.set(item.product_id, cluster);
        clusters.push(cluster);
      }
      cluster.items.push(item);
      return;
    }
    clusters.push({
      key: `i-${item.id}`,
      stock,
      firstOrder: index,
      items: [item],
    });
  });

  // Within each product cluster, put the cover photo first so badge stays on
  // the lead tile of that product when we pin the cover cluster.
  if (cover) {
    for (const cluster of clusters) {
      const coverIdx = cluster.items.findIndex((item) => item.path === cover);
      if (coverIdx > 0) {
        const [coverItem] = cluster.items.splice(coverIdx, 1);
        cluster.items.unshift(coverItem!);
      }
    }
  }

  clusters.sort((a, b) => {
    const aIsCover = cover ? a.items.some((item) => item.path === cover) : false;
    const bIsCover = cover ? b.items.some((item) => item.path === cover) : false;
    if (aIsCover !== bIsCover) return aIsCover ? -1 : 1;
    const byStock = b.stock - a.stock;
    if (byStock !== 0) return byStock;
    return a.firstOrder - b.firstOrder;
  });

  return clusters.flatMap((cluster) => cluster.items);
}