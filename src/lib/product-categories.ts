/** Nhóm sản phẩm — sidebar + filter */
export const PRODUCT_GROUPS = [
  {
    slug: "tat-ca",
    category: "all" as const,
    label: "Tất Cả Sản Phẩm",
  },
  {
    slug: "gach-the",
    category: "Gạch thẻ",
    label: "Gạch Thẻ",
  },
  {
    slug: "gach-mosaic",
    category: "Gạch mosaic",
    label: "Gạch Mosaic",
  },
  {
    slug: "gach-bong",
    category: "Gạch bông",
    label: "Gạch Bông",
  },
  {
    slug: "gach-op-lat",
    category: "Gạch Ốp Lát",
    label: "Gạch Ốp Lát",
  },
] as const;

export type ProductGroupSlug = (typeof PRODUCT_GROUPS)[number]["slug"];

export const ALL_PRODUCTS_SLUG: ProductGroupSlug = "tat-ca";

export function categoryFromSlug(slug: string | undefined): string | "all" {
  if (!slug || slug === "tat-ca") return "all";
  const g = PRODUCT_GROUPS.find((x) => x.slug === slug);
  if (!g || g.category === "all") return "all";
  return g.category;
}

export function labelFromSlug(slug: string | undefined): string {
  if (!slug || slug === "tat-ca") return "Tất cả sản phẩm";
  const g = PRODUCT_GROUPS.find((x) => x.slug === slug);
  return g?.label ?? "Sản phẩm";
}
