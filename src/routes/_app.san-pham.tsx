import {
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import * as React from "react";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ImportExportProductsDialog } from "@/components/ImportExportProductsDialog";
import { ImportStockDialog } from "@/components/ImportStockDialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as XLSX from "xlsx";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { EditProductDialog } from "@/components/EditProductDialog";
import { EditProductImagesDialog } from "@/components/EditProductImagesDialog";
import { BulkEditFieldDialog } from "@/components/BulkEditFieldDialog";
import { FilterChip } from "@/components/product-filter/FilterChip";
import {
  PriceFilter,
  PRICE_KIND_OPTIONS,
  type PriceKind,
} from "@/components/product-filter/PriceFilter";
import { MultiSelectFilter } from "@/components/product-filter/MultiSelectFilter";
import { deleteProductFn, fetchProducts } from "@/api/functions";
import type { Product } from "@/lib/types";
import { formatVND } from "@/lib/format";
import {
  ALL_PRODUCTS_SLUG,
  categoryFromSlug,
  labelFromSlug,
  PRODUCT_GROUPS,
} from "@/lib/product-categories";
import {
  ArrowUpDown,
  Check,
  Copy,
  FilePlus2,
  Flame,
  Images,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Search,
  SlidersHorizontal,
  Tags,
  Trash2,
  X,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NewQuoteDialog } from "@/components/NewQuoteDialog";

/** Mỗi lần cuộn xuống tải thêm */
const BATCH_SIZE = 36;

/** Checkbox chọn SP — custom, đồng bộ terracotta (không dùng native checkbox). */
function ProductCheck({
  checked,
  indeterminate,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
  className?: string;
}) {
  const on = checked || Boolean(indeterminate);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "size-6 grid place-items-center rounded-md transition-all duration-150",
        "ring-1 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/40",
        on
          ? "bg-terracotta ring-terracotta text-primary-foreground shadow-terracotta/20"
          : "bg-white/95 ring-black/10 text-transparent hover:ring-terracotta/40 hover:bg-white",
        className,
      )}
    >
      {indeterminate && !checked ? (
        <span className="block w-2.5 h-0.5 rounded-full bg-primary-foreground" />
      ) : (
        <Check
          className={cn(
            "size-3.5 stroke-[2.5] transition-opacity",
            checked ? "opacity-100" : "opacity-0",
          )}
          aria-hidden
        />
      )}
    </button>
  );
}

type ViewMode = "grid" | "list";

function formatMoneyShort(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}tr`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function parseCsv(v: unknown): string[] {
  if (typeof v !== "string" || !v.trim()) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePriceKind(v: unknown): PriceKind | undefined {
  if (v === "retail" || v === "tp" || v === "b2b") return v;
  return undefined;
}

/** Nhóm facet — dùng khi tính options: loại facet của chính nhóm đó ra khỏi bộ lọc. */
type FacetKey = "color" | "surface" | "size" | "shape" | "effect" | "collection" | "material";

type ProductSort =
  | "default"
  | "code_asc"
  | "price_asc"
  | "price_desc"
  | "stock_desc";

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "default", label: "Mặc định" },
  { value: "code_asc", label: "Mã SP A-Z" },
  { value: "price_asc", label: "Giá tăng" },
  { value: "price_desc", label: "Giá giảm" },
  { value: "stock_desc", label: "Tồn kho nhiều nhất" },
];

/** Section filter gập/mở — giữ panel «Bộ lọc» gọn: mở sẵn khi mục đã có lựa chọn. */
function FilterSection({
  title,
  count = 0,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => defaultOpen || count > 0);

  // Khi user đã tick filter mà section đang gập → mở ra để thấy trạng thái.
  useEffect(() => {
    if (count > 0) setOpen(true);
  }, [count]);

  return (
    <div className="rounded-lg ring-1 ring-black/5 bg-surface-strong/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-strong/40 transition-colors"
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="inline-flex items-center gap-1.5">
          {count > 0 ? (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-[1.25rem] px-1 rounded-full text-[10px] font-semibold tabular-nums bg-terracotta text-primary-foreground">
              {count}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open ? "rotate-180" : "",
            )}
          />
        </span>
      </button>
      {open ? (
        <div className="px-3 pb-3 pt-1 border-t border-border/60">{children}</div>
      ) : null}
    </div>
  );
}

function parseSort(v: unknown): ProductSort | undefined {
  if (
    v === "default" ||
    v === "code_asc" ||
    v === "price_asc" ||
    v === "price_desc" ||
    v === "stock_desc"
  )
    return v;
  return undefined;
}

/** Giá theo loại: lẻ / Trade (+VAT) / Partner B2B (+VAT) */
function priceOf(p: Product, kind: PriceKind): number {
  if (kind === "tp") {
    if (p.trade_price != null && Number(p.trade_price) > 0) {
      return Math.round(Number(p.trade_price));
    }
    const retail = Number(p.retail_price) || 0;
    const pct = p.discount_tp != null ? Number(p.discount_tp) : 0;
    return Math.round(retail * (1 - pct / 100));
  }
  if (kind === "b2b") {
    if (p.b2b_price != null && Number(p.b2b_price) > 0) {
      return Math.round(Number(p.b2b_price));
    }
    const retail = Number(p.retail_price) || 0;
    const pct = p.discount_b2b != null ? Number(p.discount_b2b) : 0;
    return Math.round(retail * (1 - pct / 100));
  }
  return Number(p.retail_price) || 0;
}

type SanPhamSearch = {
  nhom?: string;
  q?: string;
  min?: number;
  max?: number;
  /** Loại giá khi lọc: retail | tp | b2b */
  priceKind?: PriceKind;
  colors?: string[];
  /** Bề mặt */
  surfaces?: string[];
  /** Kích thước */
  sizes?: string[];
  /** Kiểu dáng */
  shapes?: string[];
  /** Hiệu ứng vân/mặt gạch */
  effects?: string[];
  /** Bộ sưu tập */
  collections?: string[];
  /** Chất liệu */
  materials?: string[];
  hot?: boolean;
  stockLocation?: string;
  view?: ViewMode;
  sort?: ProductSort;
};

export const Route = createFileRoute("/_app/san-pham")({
  validateSearch: (search: Record<string, unknown>): SanPhamSearch => ({
    nhom: typeof search.nhom === "string" ? search.nhom : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    min: typeof search.min === "number" ? search.min : undefined,
    max: typeof search.max === "number" ? search.max : undefined,
    priceKind: parsePriceKind(search.priceKind),
    colors: Array.isArray(search.colors)
      ? (search.colors as string[])
      : parseCsv(search.colors),
    surfaces: Array.isArray(search.surfaces)
      ? (search.surfaces as string[])
      : parseCsv(search.surfaces),
    sizes: Array.isArray(search.sizes)
      ? (search.sizes as string[])
      : parseCsv(search.sizes),
    shapes: Array.isArray(search.shapes)
      ? (search.shapes as string[])
      : parseCsv(search.shapes),
    effects: Array.isArray(search.effects)
      ? (search.effects as string[])
      : parseCsv(search.effects),
    collections: Array.isArray(search.collections)
      ? (search.collections as string[])
      : parseCsv(search.collections),
    materials: Array.isArray(search.materials)
      ? (search.materials as string[])
      : parseCsv(search.materials),
    hot: search.hot === true || search.hot === "1",
    view: search.view === "list" || search.view === "grid" ? search.view : undefined,
    stockLocation: typeof search.stockLocation === "string" ? search.stockLocation : undefined,
    sort: parseSort(search.sort),
  }),
  beforeLoad: ({ search }) => {
    if (!search.nhom) {
      throw redirect({
        to: "/san-pham",
        search: { nhom: ALL_PRODUCTS_SLUG },
      });
    }
    // Cho phép tat-ca (all) + các nhóm trong PRODUCT_GROUPS
    const known = PRODUCT_GROUPS.some((g) => g.slug === search.nhom);
    if (!known) {
      throw redirect({
        to: "/san-pham",
        search: { nhom: ALL_PRODUCTS_SLUG },
      });
    }
  },
  head: ({ match }) => {
    const label = labelFromSlug(match.search.nhom);
    return {
      meta: [{ title: `${label} — Innomat CRM` }],
    };
  },
  loaderDeps: ({ search }: { search: SanPhamSearch }) => ({ stockLocation: search.stockLocation }),
  loader: async ({ deps }) => {
    const products = await fetchProducts({ data: { stockLocation: deps.stockLocation } });
    return { products };
  },
  component: ProductsPage,
});

function ProductsPage() {
  const { products } = Route.useLoaderData() as { products: Product[] };
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [importStockOpen, setImportStockOpen] = useState(false);
  const [importStockTab, setImportStockTab] = useState<"mapping" | "stock">("stock");
  const [stockPreviewData, setStockPreviewData] = useState<any[] | null>(null);
  const stockFileRef = useRef<HTMLInputElement | null>(null);
  const mappingFileRef = useRef<HTMLInputElement | null>(null);
  async function handleStockFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const parsed: { internal_code: string; stock_location: string; quantity: number }[] = [];
      for (let i = 3; i < rows.length; i++) {
        const row = rows[i] as any[];
        const internal_code = (row[0] || "").toString().trim();
        const stock_location = (row[3] || "").toString().trim();
        const rawQty = row[7];
        let quantity = 0;
        if (typeof rawQty === "number" && Number.isFinite(rawQty)) {
          quantity = rawQty;
        } else {
          const strQty = (rawQty || "").toString().trim();
          if (strQty && !isNaN(Number(strQty))) {
            quantity = Number(strQty);
          }
        }
        if (internal_code && stock_location) {
          parsed.push({ internal_code, stock_location, quantity: quantity < 0 ? 0 : quantity });
        }
      }
      if (!parsed.length) {
        import("sonner").then(m => m.toast.error("Không Tìm Thấy Dữ Liệu Hoặc File Không Đúng Định Dạng Tổng Hợp Tồn Kho MISA"));
        return;
      }
      setStockPreviewData(parsed);
      setImportStockTab("stock");
      setImportStockOpen(true);
    } catch (err) {
      console.error(err);
      import("sonner").then(m => m.toast.error(err instanceof Error ? err.message : "Có Lỗi Xảy Ra Khi Đọc File Excel"));
    } finally {
      if (stockFileRef.current) stockFileRef.current.value = "";
    }
  }
  async function handleMappingFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const parsed: { product_code: string; internal_code: string }[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as string[];
        const product_code = (row[0] || "").toString().trim();
        const internal_code = (row[1] || "").toString().trim();
        if (product_code && internal_code) {
          parsed.push({ product_code, internal_code });
        }
      }
      if (!parsed.length) {
        import("sonner").then(m => m.toast.error("Không Tìm Thấy Dữ Liệu Hoặc File Không Đúng Định Dạng 2 Cột: Mã Báo Giá | Mã Nội Bộ"));
        return;
      }
      setStockPreviewData(parsed);
      setImportStockTab("mapping");
      setImportStockOpen(true);
    } catch (err) {
      console.error(err);
      import("sonner").then(m => m.toast.error(err instanceof Error ? err.message : "Có Lỗi Xảy Ra Khi Đọc File Excel"));
    } finally {
      if (mappingFileRef.current) mappingFileRef.current.value = "";
    }
  }
  const { user } = Route.useRouteContext() as {
    user: { role: string };
  };
  const canEditProducts = user.role === "admin";
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();

  const {
    nhom,
    q: qParam = "",
    min: minParam = 0,
    max: maxParam = 0,
    priceKind: priceKindParam = "retail",
    colors: colorsParam = [],
    surfaces: surfacesParam = [],
    sizes: sizesParam = [],
    shapes: shapesParam = [],
    effects: effectsParam = [],
    collections: collectionsParam = [],
    materials: materialsParam = [],
    hot: hotParam = false,
    view: viewParam = "grid",
    stockLocation: stockLocParam,
    sort: sortParam = "default",
  } = searchParams;

  const viewMode: ViewMode = viewParam === "list" ? "list" : "grid";

  const category = categoryFromSlug(nhom);
  const groupLabel = labelFromSlug(nhom);

  // Input search dùng local state + debounce vào URL để đỡ giật
  const [searchDraft, setSearchDraft] = useState(qParam);
  useEffect(() => setSearchDraft(qParam), [qParam]);

  useEffect(() => {
    if (searchDraft === (qParam ?? "")) return;
    const t = setTimeout(() => {
      navigate({
        search: (prev: SanPhamSearch) => ({
          ...prev,
          q: searchDraft.trim() ? searchDraft : undefined,
        }),
        replace: true,
      });
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const deferredSearch = useDeferredValue(searchDraft);

  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [imagesProduct, setImagesProduct] = useState<Product | null>(null);
  const [quoteFromSelection, setQuoteFromSelection] = useState(false);
  /** Sheet / popover «Bộ lọc» (facet phụ + full list trên mobile) */
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  /** Scope theo nhóm sidebar (chỉ đổi khi nhóm đổi) */
  const scoped = useMemo(() => {
    if (category === "all") return products;
    const cat = category.toLowerCase();
    return products.filter((p) => p.category.trim().toLowerCase() === cat);
  }, [products, category]);

  /** Search text: mã + tên + bộ sưu tập */
  const indexed = useMemo(
    () =>
      scoped.map((p) => ({
        p,
        codeHay: [p.code, p.multi_codes_list || ""].join(" ").toLowerCase(),
        nameHay: (p.name || "").toLowerCase(),
        collectionHay: (p.collections || "").toLowerCase(),
      })),
    [scoped],
  );

  const colorSet = useMemo(() => new Set(colorsParam), [colorsParam]);
  const surfaceSet = useMemo(() => new Set(surfacesParam), [surfacesParam]);
  const sizeSet = useMemo(() => new Set(sizesParam), [sizesParam]);
  const shapeSet = useMemo(() => new Set(shapesParam), [shapesParam]);
  const effectSet = useMemo(() => new Set(effectsParam), [effectsParam]);
  const collectionSet = useMemo(
    () => new Set(collectionsParam),
    [collectionsParam],
  );
  const materialSet = useMemo(
    () => new Set(materialsParam),
    [materialsParam],
  );

  /**
   * Lọc indexed theo toàn bộ bộ lọc đang chọn (giá + facet + hot + search).
   * Truyền `exclude` để bỏ qua facet của nhóm đó — dùng để tính options facet:
   * khi chọn kích thước 75x300, các nhóm khác chỉ hiện giá trị tồn tại trên
   * những SP khớp, còn chính nhóm Kích thước vẫn giữ đủ lựa chọn đã chọn.
   */
  const matchIndexed = useCallback(
    (exclude?: FacetKey) => {
      const q = deferredSearch.trim().toLowerCase();
      const searchTokens = q.split(/[\s,;|]+/).filter(Boolean);
      const isMultiCodeQuery = searchTokens.length > 1;
      const isSizeQuery =
        /^\d{2,4}\s*[x×X*]\s*\d{2,4}(\s*[x×X*]\s*\d{2,4})?(\s*mm)?$/i.test(
          deferredSearch.trim(),
        ) || /^\d{3,4}\s*x\s*\d{3,4}/i.test(deferredSearch.trim());

      return indexed.filter(({ p, codeHay, nameHay, collectionHay }) => {
        if (minParam || maxParam) {
          const price = priceOf(p, priceKindParam);
          if (minParam && price < minParam) return false;
          if (maxParam && price > maxParam) return false;
        }
        if (exclude !== "color" && colorSet.size && !colorSet.has((p.color || "").trim())) return false;
        if (exclude !== "surface" && surfaceSet.size && !surfaceSet.has((p.surface || "").trim())) return false;
        if (exclude !== "size" && sizeSet.size && !sizeSet.has((p.size || "").trim())) return false;
        if (exclude !== "shape" && shapeSet.size && !shapeSet.has((p.shape || "").trim())) return false;
        if (exclude !== "effect" && effectSet.size && !effectSet.has((p.finish_effect || "").trim())) return false;
        if (exclude !== "collection" && collectionSet.size && !collectionSet.has((p.collections || "").trim())) return false;
        if (exclude !== "material" && materialSet.size && !materialSet.has((p.material || "").trim())) return false;
        if (hotParam && !p.is_hot) return false;
        if (!q) return true;
        if (isSizeQuery) return false;
        if (isMultiCodeQuery) {
          return searchTokens.some(
            (token) =>
              codeHay.includes(token) ||
              nameHay.includes(token) ||
              collectionHay.includes(token),
          );
        }
        return (
          codeHay.includes(q) ||
          nameHay.includes(q) ||
          collectionHay.includes(q)
        );
      });
    },
    [
      indexed,
      deferredSearch,
      minParam,
      maxParam,
      priceKindParam,
      colorSet,
      surfaceSet,
      sizeSet,
      shapeSet,
      effectSet,
      collectionSet,
      materialSet,
      hotParam,
    ],
  );

  const colorOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { p } of matchIndexed("color")) {
      const c = (p.color || "").trim();
      if (!c) continue;
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "vi"))
      .map(([value, count]) => ({ value, count }));
  }, [matchIndexed]);

  const surfaceOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { p } of matchIndexed("surface")) {
      const s = (p.surface || "").trim();
      if (!s) continue;
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }, [matchIndexed]);

  const sizeOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { p } of matchIndexed("size")) {
      const s = (p.size || "").trim();
      if (!s) continue;
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "vi", { numeric: true }))
      .map(([value, count]) => ({ value, count }));
  }, [matchIndexed]);

  const shapeOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { p } of matchIndexed("shape")) {
      const s = (p.shape || "").trim();
      if (!s) continue;
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "vi"))
      .map(([value, count]) => ({ value, count }));
  }, [matchIndexed]);

  const effectOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { p } of matchIndexed("effect")) {
      const e = (p.finish_effect || "").trim();
      if (!e) continue;
      map.set(e, (map.get(e) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }, [matchIndexed]);

  const collectionOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { p } of matchIndexed("collection")) {
      const c = (p.collections || "").trim();
      if (!c) continue;
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "vi"))
      .map(([value, count]) => ({ value, count }));
  }, [matchIndexed]);

  const materialOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { p } of matchIndexed("material")) {
      const m = (p.material || "").trim();
      if (!m) continue;
      map.set(m, (map.get(m) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "vi"))
      .map(([value, count]) => ({ value, count }));
  }, [matchIndexed]);

  const hotInScope = useMemo(
    () => indexed.filter(({ p }) => p.is_hot).length,
    [indexed],
  );

  const filtered = useMemo(() => {
    const list = matchIndexed().map((x) => x.p);

    switch (sortParam) {
      case "code_asc":
        return list.sort((a, b) =>
          (a.code || "").localeCompare(b.code || "", "vi", {
            numeric: true,
            sensitivity: "base",
          }),
        );
      case "price_asc":
        return list.sort(
          (a, b) => priceOf(a, priceKindParam) - priceOf(b, priceKindParam),
        );
      case "price_desc":
        return list.sort(
          (a, b) => priceOf(b, priceKindParam) - priceOf(a, priceKindParam),
        );
      case "stock_desc":
        return list.sort(
          (a, b) => (Number(b.total_stock) || 0) - (Number(a.total_stock) || 0),
        );
      default:
        return list;
    }
  }, [
    matchIndexed,
    sortParam,
    priceKindParam,
  ]);

  /** Infinite scroll: hiện dần theo batch */
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset khi filter / nhóm / search đổi
  const filterKey = useMemo(
    () =>
      [
        nhom,
        deferredSearch,
        minParam,
        maxParam,
        priceKindParam,
        colorsParam.join(","),
        surfacesParam.join(","),
        sizesParam.join(","),
        shapesParam.join(","),
        effectsParam.join(","),
        collectionsParam.join(","),
        materialsParam.join(","),
        hotParam ? "1" : "0",
        stockLocParam,
      ].join("|"),
    [
      nhom,
      deferredSearch,
      minParam,
      maxParam,
      priceKindParam,
      colorsParam,
      surfacesParam,
      sizesParam,
      shapesParam,
      effectsParam,
      collectionsParam,
      materialsParam,
      hotParam,
    ],
  );

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [filterKey]);

  const visibleItems = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );
  const hasMore = visibleCount < filtered.length;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((n) => Math.min(n + BATCH_SIZE, filtered.length));
        }
      },
      { root: null, rootMargin: "400px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, filtered.length, filterKey]);

  const withImg = useMemo(
    () => scoped.reduce((n, p) => n + (p.image_path ? 1 : 0), 0),
    [scoped],
  );
  const hotTotal = useMemo(
    () => scoped.reduce((n, p) => n + (p.is_hot ? 1 : 0), 0),
    [scoped],
  );

  const activeCount =
    (deferredSearch.trim() ? 1 : 0) +
    (minParam || maxParam || priceKindParam !== "retail" ? 1 : 0) +
    colorsParam.length +
    surfacesParam.length +
    sizesParam.length +
    shapesParam.length +
    effectsParam.length +
    collectionsParam.length +
    materialsParam.length +
    (hotParam ? 1 : 0) +
    (stockLocParam === "KHOVP" ? 1 : 0);

  const hasActiveFilter = activeCount > 0;

  /** Facet đếm cho mobile sheet (desktop đã show hết chip) */
  const secondaryFilterCount =
    shapesParam.length +
    effectsParam.length +
    collectionsParam.length +
    materialsParam.length;
  const primaryFilterCount =
    (minParam || maxParam || priceKindParam !== "retail" ? 1 : 0) +
    colorsParam.length +
    surfacesParam.length +
    sizesParam.length;
  const mobileFiltersBadge = primaryFilterCount + secondaryFilterCount;

  const priceKindLabel =
    PRICE_KIND_OPTIONS.find((o) => o.value === priceKindParam)?.short ?? "Lẻ";
  const priceSummary =
    minParam || maxParam
      ? `${priceKindLabel} ${minParam ? formatMoneyShort(minParam) : "…"}–${maxParam ? formatMoneyShort(maxParam) : "…"}`
      : priceKindParam !== "retail"
        ? priceKindLabel
        : null;

  const sortLabel =
    SORT_OPTIONS.find((o) => o.value === sortParam)?.label ?? "Mặc định";

  function setSearch(patch: Partial<SanPhamSearch>) {
    navigate({
      search: (prev: SanPhamSearch) => {
        const next: SanPhamSearch = { ...prev, ...patch };
        // Dọn field rỗng để URL gọn
        if (!next.q) delete next.q;
        if (!next.min) delete next.min;
        if (!next.max) delete next.max;
        if (!next.priceKind || next.priceKind === "retail")
          delete next.priceKind;
        if (!next.colors || next.colors.length === 0) delete next.colors;
        if (!next.surfaces || next.surfaces.length === 0)
          delete next.surfaces;
        if (!next.sizes || next.sizes.length === 0) delete next.sizes;
        if (!next.shapes || next.shapes.length === 0) delete next.shapes;
        if (!next.effects || next.effects.length === 0) delete next.effects;
        if (!next.collections || next.collections.length === 0)
          delete next.collections;
        if (!next.materials || next.materials.length === 0) delete next.materials;
        if (!next.hot) delete next.hot;
        if (!next.view || next.view === "grid") delete next.view;
        if (!next.stockLocation || next.stockLocation === "ALL") delete next.stockLocation;
        if (!next.sort || next.sort === "default") delete next.sort;
        return next;
      },
      replace: true,
    });
  }

  function setViewMode(v: ViewMode) {
    setSearch({ view: v === "grid" ? undefined : v });
  }

  function clearFilters() {
    setSearchDraft("");
    setSearch({
      q: undefined,
      min: undefined,
      max: undefined,
      priceKind: undefined,
      colors: undefined,
      surfaces: undefined,
      sizes: undefined,
      shapes: undefined,
      effects: undefined,
      collections: undefined,
      materials: undefined,
      hot: undefined,
      stockLocation: undefined,
    });
  }

  const onEditProduct = useCallback((p: Product) => setEditProduct(p), []);
  const onImagesProduct = useCallback((p: Product) => setImagesProduct(p), []);

  /** Multi-select (list view) */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);

  const selectedCount = selectedIds.size;
  const visibleIdList = useMemo(
    () => visibleItems.map((p) => p.id),
    [visibleItems],
  );
  const allVisibleSelected =
    visibleIdList.length > 0 &&
    visibleIdList.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    visibleIdList.some((id) => selectedIds.has(id)) && !allVisibleSelected;

  /** SP đã chọn — tra từ toàn bộ dataset để giữ lựa chọn qua mọi bộ lọc/nhóm. */
  const selectedProducts = useMemo(
    () => products.filter((p) => selectedIds.has(p.id)),
    [products, selectedIds],
  );

  /** Số SP đã chọn nhưng không nằm trong kết quả hiện tại. */
  const selectedHiddenCount = useMemo(
    () => selectedIds.size - filtered.filter((p) => selectedIds.has(p.id)).length,
    [selectedIds, filtered],
  );

  /** Đã chọn hết mọi SP trong kết quả hiện tại chưa (điều khiển nút "Hết"). */
  const allFilteredSelected = useMemo(
    () =>
      filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id)),
    [filtered, selectedIds],
  );

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIdList) next.delete(id);
      } else {
        for (const id of visibleIdList) next.add(id);
      }
      return next;
    });
  }, [allVisibleSelected, visibleIdList]);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filtered.map((p) => p.id)));
    toast.success(`Đã chọn ${filtered.length} SP (toàn bộ kết quả)`);
  }, [filtered]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  async function bulkCopyCodes() {
    if (!selectedProducts.length) return;
    const text = selectedProducts.map((p) => p.code).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Đã copy ${selectedProducts.length} mã`);
    } catch {
      toast.error("Không copy được");
    }
  }

  async function bulkDelete() {
    if (!selectedProducts.length || bulkBusy) return;
    if (!pendingBulkDelete) {
      setPendingBulkDelete(true);
      return;
    }
    setPendingBulkDelete(false);
    setBulkBusy(true);
    let okN = 0;
    let failN = 0;
    const errors: string[] = [];
    for (const p of selectedProducts) {
      try {
        await deleteProductFn({ data: { id: p.id } });
        okN += 1;
      } catch (err) {
        failN += 1;
        if (errors.length < 3) {
          errors.push(
            err instanceof Error ? err.message : `Lỗi xóa ${p.code}`,
          );
        }
      }
    }
    setBulkBusy(false);
    clearSelection();
    setPendingBulkDelete(false);
    await router.invalidate();
    if (okN) toast.success(`Đã xóa ${okN} SP`);
    if (failN) {
      toast.error(
        `Không xóa được ${failN} SP${errors[0] ? `: ${errors[0]}` : ""}`,
      );
    }
  }

  return (
    <>
      <PageHeader
        title={groupLabel}
        description={`${scoped.length} mã · ${withImg} ảnh · ${hotTotal} bán chạy`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" ref={stockFileRef} onChange={handleStockFileChange} />
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" ref={mappingFileRef} onChange={handleMappingFileChange} />

            <button
              type="button"
              onClick={() => stockFileRef.current?.click()}
              className="h-8 px-3.5 rounded-md text-[12px] font-semibold bg-terracotta text-primary-foreground hover:bg-terracotta/90 inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <FilePlus2 className="w-4 h-4" />
              Nhập Tồn Kho
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-8 px-3.5 rounded-md text-[12px] font-semibold border border-border/80 bg-card hover:bg-surface-strong/60 text-foreground inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground" />
                  Import / Export Dữ Liệu
                  <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1.5 bg-card/95 backdrop-blur-md shadow-xl border border-border/60 rounded-xl space-y-0.5">
                <button
                  onClick={() => mappingFileRef.current?.click()}
                  className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-surface-strong/60 rounded-lg transition-colors flex items-center gap-2 text-foreground cursor-pointer"
                >
                  <List className="w-4 h-4 text-terracotta shrink-0" />
                  <div>
                    <div className="font-semibold">Nhập Mã Nội Bộ</div>
                    <div className="text-[11px] text-muted-foreground font-normal">Excel 2 cột (Mã SP ↔ Mã nội bộ)</div>
                  </div>
                </button>
                <div className="my-1 border-t border-border/40" />
                <button
                  onClick={() => setImportExportOpen(true)}
                  className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-surface-strong/60 rounded-lg transition-colors flex items-center gap-2 text-foreground cursor-pointer"
                >
                  <LayoutGrid className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="font-semibold">Nhập / Xuất Sản Phẩm</div>
                    <div className="text-[11px] text-muted-foreground font-normal">File catalogue sản phẩm</div>
                  </div>
                </button>
              </PopoverContent>
            </Popover>
          </div>
        }
      />

      {/* Filter toolbar — hierarchy: search → kho/sort → facets */}
      <div className="mb-5 space-y-3">
        {/* Hàng 1: search */}
        <div className="relative w-full min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Tìm mã, tên… (có thể dán nhiều mã)"
            className="h-10 w-full text-sm pl-10 pr-9 rounded-full bg-transparent border border-border/80 outline-none focus:border-terracotta/50 focus:ring-2 focus:ring-terracotta/15 text-foreground placeholder:text-muted-foreground/60"
          />
          {searchDraft ? (
            <button
              type="button"
              onClick={() => setSearchDraft("")}
              aria-label="Xoá tìm kiếm"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {/* Hàng 2: kho (context) + sort */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex bg-surface-strong/50 p-0.5 rounded-full border border-border/80 shrink-0">
            <button
              type="button"
              onClick={() => setSearch({ stockLocation: "KHOQ9" })}
              className={cn(
                "h-8 px-3.5 rounded-full text-xs font-medium transition-all",
                !stockLocParam || stockLocParam === "KHOQ9"
                  ? "bg-card text-foreground shadow-sm ring-1 ring-black/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
              )}
            >
              Kho Q9
            </button>
            <button
              type="button"
              onClick={() => setSearch({ stockLocation: "KHOVP" })}
              className={cn(
                "h-8 px-3.5 rounded-full text-xs font-medium transition-all",
                stockLocParam === "KHOVP"
                  ? "bg-card text-foreground shadow-sm ring-1 ring-black/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
              )}
            >
              Kho VP
            </button>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "h-8 shrink-0 px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 ring-1 ring-black/5 transition-colors",
                  sortParam !== "default"
                    ? "bg-surface-strong text-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <ArrowUpDown className="size-3.5 opacity-70" />
                <span className="max-w-[9rem] truncate">
                  {sortParam === "default" ? "Sắp xếp" : sortLabel}
                </span>
                <ChevronDown className="size-3.5 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <p className="text-xs font-medium text-foreground px-2 pb-1.5">
                Sắp xếp theo
              </p>
              <div className="space-y-0.5">
                {SORT_OPTIONS.map((opt) => {
                  const on = sortParam === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setSearch({ sort: opt.value as ProductSort })
                      }
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                        on
                          ? "bg-terracotta-soft text-foreground"
                          : "hover:bg-surface-strong/70 text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "size-4 rounded-full border grid place-items-center flex-shrink-0",
                          on
                            ? "bg-terracotta border-terracotta text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {on && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <span className="flex-1 truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Hàng 3: facets — desktop primary chips; mobile gọn + sheet */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Desktop: Size · Màu · Bề mặt · Giá */}
          <div className="hidden md:contents">
            <FilterChip label="Kích thước" count={sizesParam.length}>
              <MultiSelectFilter
                title="Chọn kích thước"
                options={sizeOptions}
                selected={sizesParam}
                onChange={(next) =>
                  setSearch({ sizes: next.length ? next : undefined })
                }
                searchable
              />
            </FilterChip>
            <FilterChip label="Màu" count={colorsParam.length}>
              <MultiSelectFilter
                title="Chọn màu"
                options={colorOptions}
                selected={colorsParam}
                onChange={(next) =>
                  setSearch({ colors: next.length ? next : undefined })
                }
                searchable
              />
            </FilterChip>
            <FilterChip label="Bề mặt" count={surfacesParam.length}>
              <MultiSelectFilter
                title="Chọn bề mặt"
                options={surfaceOptions}
                selected={surfacesParam}
                onChange={(next) =>
                  setSearch({ surfaces: next.length ? next : undefined })
                }
                searchable
              />
            </FilterChip>
            <FilterChip label="Chất liệu" count={materialsParam.length}>
              <MultiSelectFilter
                title="Chọn chất liệu"
                options={materialOptions}
                selected={materialsParam}
                onChange={(next) =>
                  setSearch({ materials: next.length ? next : undefined })
                }
                searchable
              />
            </FilterChip>
            <FilterChip label="Giá" summary={priceSummary}>
              <PriceFilter
                min={minParam}
                max={maxParam}
                priceKind={priceKindParam}
                onChange={({ min, max, priceKind }) =>
                  setSearch({
                    min: min || undefined,
                    max: max || undefined,
                    priceKind:
                      priceKind && priceKind !== "retail"
                        ? priceKind
                        : undefined,
                  })
                }
              />
            </FilterChip>

            <FilterChip label="Kiểu dáng" count={shapesParam.length}>
              <MultiSelectFilter
                title="Chọn kiểu dáng"
                options={shapeOptions}
                selected={shapesParam}
                onChange={(next) =>
                  setSearch({ shapes: next.length ? next : undefined })
                }
                searchable
              />
            </FilterChip>
            <FilterChip label="Hiệu ứng" count={effectsParam.length}>
              <MultiSelectFilter
                title="Chọn hiệu ứng"
                options={effectOptions}
                selected={effectsParam}
                onChange={(next) =>
                  setSearch({ effects: next.length ? next : undefined })
                }
                searchable
              />
            </FilterChip>
            {collectionOptions.length > 0 ? (
              <FilterChip label="Bộ sưu tập" count={collectionsParam.length}>
                <MultiSelectFilter
                  title="Chọn bộ sưu tập"
                  options={collectionOptions}
                  selected={collectionsParam}
                  onChange={(next) =>
                    setSearch({ collections: next.length ? next : undefined })
                  }
                  searchable
                />
              </FilterChip>
            ) : null}
          </div>

          {/* Mobile: 1 nút mở sheet full facets */}
          <button
            type="button"
            onClick={() => setMoreFiltersOpen(true)}
            className={cn(
              "md:hidden h-9 shrink-0 px-3 rounded-full text-sm font-medium inline-flex items-center gap-1.5 transition-colors",
              mobileFiltersBadge > 0
                ? "bg-terracotta-soft text-terracotta ring-1 ring-terracotta/30"
                : "border border-border text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
            )}
          >
            <SlidersHorizontal className="size-3.5 opacity-80" />
            <span>Bộ lọc</span>
            {mobileFiltersBadge > 0 ? (
              <span className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-semibold tabular-nums bg-terracotta text-primary-foreground">
                {mobileFiltersBadge}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setSearch({ hot: hotParam ? undefined : true })}
            className={
              hotParam
                ? "h-9 shrink-0 px-3 rounded-full text-sm font-medium bg-terracotta text-primary-foreground inline-flex items-center gap-1.5 shadow-sm"
                : "h-9 shrink-0 px-3 rounded-full text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-surface-strong/60 transition-colors inline-flex items-center gap-1.5"
            }
            aria-pressed={hotParam}
          >
            <Flame className="size-3.5" />
            <span>Bán chạy</span>
            <span
              className={
                hotParam
                  ? "opacity-80 tabular-nums"
                  : "opacity-70 tabular-nums"
              }
            >
              {hotInScope}
            </span>
          </button>
        </div>

        {/* Mobile / tablet sheet: tất cả facet */}
        <Dialog open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Bộ lọc sản phẩm</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-1">
              <FilterSection title="Kích thước" count={sizesParam.length}>
                <MultiSelectFilter
                  title="Chọn kích thước"
                  options={sizeOptions}
                  selected={sizesParam}
                  onChange={(next) =>
                    setSearch({ sizes: next.length ? next : undefined })
                  }
                  searchable
                />
              </FilterSection>
              <FilterSection title="Màu" count={colorsParam.length}>
                <MultiSelectFilter
                  title="Chọn màu"
                  options={colorOptions}
                  selected={colorsParam}
                  onChange={(next) =>
                    setSearch({ colors: next.length ? next : undefined })
                  }
                  searchable
                />
              </FilterSection>
              <FilterSection title="Bề mặt" count={surfacesParam.length}>
                <MultiSelectFilter
                  title="Chọn bề mặt"
                  options={surfaceOptions}
                  selected={surfacesParam}
                  onChange={(next) =>
                    setSearch({ surfaces: next.length ? next : undefined })
                  }
                  searchable
                />
              </FilterSection>
              <FilterSection title="Chất liệu" count={materialsParam.length}>
                <MultiSelectFilter
                  title="Chọn chất liệu"
                  options={materialOptions}
                  selected={materialsParam}
                  onChange={(next) =>
                    setSearch({ materials: next.length ? next : undefined })
                  }
                  searchable
                />
              </FilterSection>
              <FilterSection
                title="Giá"
                count={
                  minParam || maxParam || priceKindParam !== "retail" ? 1 : 0
                }
              >
                <PriceFilter
                  min={minParam}
                  max={maxParam}
                  priceKind={priceKindParam}
                  onChange={({ min, max, priceKind }) =>
                    setSearch({
                      min: min || undefined,
                      max: max || undefined,
                      priceKind:
                        priceKind && priceKind !== "retail"
                          ? priceKind
                          : undefined,
                    })
                  }
                />
              </FilterSection>
              <FilterSection title="Kiểu dáng" count={shapesParam.length}>
                <MultiSelectFilter
                  title="Chọn kiểu dáng"
                  options={shapeOptions}
                  selected={shapesParam}
                  onChange={(next) =>
                    setSearch({ shapes: next.length ? next : undefined })
                  }
                  searchable
                />
              </FilterSection>
              <FilterSection title="Hiệu ứng" count={effectsParam.length}>
                <MultiSelectFilter
                  title="Chọn hiệu ứng"
                  options={effectOptions}
                  selected={effectsParam}
                  onChange={(next) =>
                    setSearch({ effects: next.length ? next : undefined })
                  }
                  searchable
                />
              </FilterSection>
              {collectionOptions.length > 0 ? (
                <FilterSection
                  title="Bộ sưu tập"
                  count={collectionsParam.length}
                >
                  <MultiSelectFilter
                    title="Chọn bộ sưu tập"
                    options={collectionOptions}
                    selected={collectionsParam}
                    onChange={(next) =>
                      setSearch({
                        collections: next.length ? next : undefined,
                      })
                    }
                    searchable
                  />
                </FilterSection>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              {mobileFiltersBadge > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    clearFilters();
                  }}
                  className="h-9 px-4 rounded-lg text-sm font-medium text-muted-foreground hover:text-terracotta"
                >
                  Xoá lọc
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setMoreFiltersOpen(false)}
                className="h-9 px-4 rounded-lg text-sm font-medium bg-terracotta text-primary-foreground"
              >
                Xem {filtered.length} sản phẩm
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {hasActiveFilter && (
          <div className="flex flex-wrap items-center gap-2">
            {deferredSearch.trim() && (
              <ActiveTag onClear={() => setSearchDraft("")}>
                “{deferredSearch.trim()}”
              </ActiveTag>
            )}
            {priceSummary && (
              <ActiveTag
                onClear={() =>
                  setSearch({
                    min: undefined,
                    max: undefined,
                    priceKind: undefined,
                  })
                }
              >
                Giá {priceSummary}
              </ActiveTag>
            )}
            {colorsParam.map((c: string) => (
              <ActiveTag
                key={`c-${c}`}
                onClear={() =>
                  setSearch({
                    colors: colorsParam.filter((x: string) => x !== c),
                  })
                }
              >
                {c}
              </ActiveTag>
            ))}
            {surfacesParam.map((s: string) => (
              <ActiveTag
                key={`s-${s}`}
                onClear={() =>
                  setSearch({
                    surfaces: surfacesParam.filter((x: string) => x !== s),
                  })
                }
              >
                {s}
              </ActiveTag>
            ))}
            {sizesParam.map((s: string) => (
              <ActiveTag
                key={`size-${s}`}
                onClear={() =>
                  setSearch({
                    sizes: sizesParam.filter((x: string) => x !== s),
                  })
                }
              >
                Size: {s}
              </ActiveTag>
            ))}
            {shapesParam.map((s: string) => (
              <ActiveTag
                key={`shape-${s}`}
                onClear={() =>
                  setSearch({
                    shapes: shapesParam.filter((x: string) => x !== s),
                  })
                }
              >
                Kiểu dáng: {s}
              </ActiveTag>
            ))}
            {effectsParam.map((e: string) => (
              <ActiveTag
                key={`effect-${e}`}
                onClear={() =>
                  setSearch({
                    effects: effectsParam.filter((x: string) => x !== e),
                  })
                }
              >
                Hiệu ứng: {e}
              </ActiveTag>
            ))}
            {materialsParam.map((m: string) => (
              <ActiveTag
                key={`mat-${m}`}
                onClear={() =>
                  setSearch({
                    materials: materialsParam.filter((x: string) => x !== m),
                  })
                }
              >
                Chất liệu: {m}
              </ActiveTag>
            ))}
            {collectionsParam.map((c: string) => (
              <ActiveTag
                key={`bst-${c}`}
                onClear={() =>
                  setSearch({
                    collections: collectionsParam.filter(
                      (x: string) => x !== c,
                    ),
                  })
                }
              >
                BST: {c}
              </ActiveTag>
            ))}
            {stockLocParam === "KHOVP" && (
              <ActiveTag
                onClear={() => setSearch({ stockLocation: undefined })}
              >
                Kho: VP
              </ActiveTag>
            )}
            {hotParam && (
              <ActiveTag onClear={() => setSearch({ hot: undefined })}>
                Bán chạy
              </ActiveTag>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-terracotta transition-colors ml-1"
            >
              Xoá tất cả ({activeCount})
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {filtered.length === 0 ? (
              "Không có sản phẩm"
            ) : (
              <>
                <span className="text-foreground font-medium">
                  {Math.min(visibleCount, filtered.length)}
                </span>
                <span className="mx-1">/</span>
                <span className="text-foreground font-medium">
                  {filtered.length}
                </span>
                <span className="mx-1">sản phẩm</span>
                {selectedCount > 0 ? (
                  <span className="ml-2 text-terracotta font-medium tabular-nums">
                    · đã chọn {selectedCount}
                  </span>
                ) : null}
                {selectedHiddenCount > 0 ? (
                  <span className="ml-2 text-muted-foreground">
                    ({selectedHiddenCount} đã chọn nằm ngoài kết quả này)
                  </span>
                ) : null}
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {viewMode === "list" || selectedCount > 0 ? (
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="h-8 px-2.5 rounded-lg text-[11px] font-medium ring-1 ring-black/5 bg-card hover:bg-surface-strong text-foreground"
              >
                {allVisibleSelected
                  ? "Bỏ chọn đang hiện"
                  : "Chọn đang hiện"}
              </button>
            ) : null}
            <div
              className="inline-flex p-0.5 rounded-lg ring-1 ring-black/5 bg-surface-strong/50"
              role="group"
              aria-label="Kiểu hiển thị"
            >
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={
                  viewMode === "grid"
                    ? "h-8 px-2.5 rounded-md text-xs font-medium bg-card shadow-sm text-foreground inline-flex items-center gap-1.5"
                    : "h-8 px-2.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                }
                aria-pressed={viewMode === "grid"}
                title="Lưới"
              >
                <LayoutGrid className="size-3.5" />
                <span className="hidden sm:inline">Lưới</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={
                  viewMode === "list"
                    ? "h-8 px-2.5 rounded-md text-xs font-medium bg-card shadow-sm text-foreground inline-flex items-center gap-1.5"
                    : "h-8 px-2.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                }
                aria-pressed={viewMode === "list"}
                title="Danh sách"
              >
                <List className="size-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-5">
          {visibleItems.map((t) => (
            <ProductCard
              key={t.id}
              product={t}
              selected={selectedIds.has(t.id)}
              onToggleSelect={toggleSelect}
              onEdit={canEditProducts ? onEditProduct : undefined}
              onImages={canEditProducts ? onImagesProduct : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 px-1 pb-1 text-xs text-muted-foreground">
            <ProductCheck
              checked={allVisibleSelected}
              indeterminate={someVisibleSelected}
              onChange={toggleSelectAllVisible}
              label="Chọn tất cả đang hiện"
              className="shrink-0"
            />
            <span>
              {allVisibleSelected
                ? "Bỏ chọn đang hiện"
                : "Chọn từng SP hoặc tất cả đang hiện"}
            </span>
          </div>
          {visibleItems.map((t) => (
            <ProductListRow
              key={t.id}
              product={t}
              selected={selectedIds.has(t.id)}
              onToggleSelect={toggleSelect}
              onEdit={canEditProducts ? onEditProduct : undefined}
              onImages={canEditProducts ? onImagesProduct : undefined}
            />
          ))}
        </div>
      )}

      {/* Bulk action bar — gọn, nổi đáy khi có SP được tick */}
      {selectedCount > 0 ? (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 max-w-[min(96vw,28rem)] safe-pb">
          <div className="flex items-center gap-1 rounded-full bg-foreground/95 text-background shadow-lg ring-1 ring-white/10 backdrop-blur-sm pl-3 pr-1.5 py-1.5">
            <span className="text-xs font-semibold tabular-nums text-primary-foreground min-w-[1.25rem] text-center">
              {selectedCount}
            </span>
            <span className="text-[11px] text-background/70 pr-1 hidden sm:inline">
              đã chọn
            </span>
            <span className="w-px h-4 bg-white/15 mx-0.5" aria-hidden />
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={bulkBusy || allFilteredSelected}
              title={`Chọn hết ${filtered.length} SP`}
              className="h-7 px-2 rounded-full text-[11px] font-medium text-background/90 hover:bg-white/10 disabled:opacity-35 transition-colors"
            >
              Hết
              <span className="tabular-nums text-background/50 ml-0.5">
                {filtered.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setQuoteFromSelection(true)}
              disabled={bulkBusy}
              title={`Tạo báo giá (${selectedCount} SP)`}
              className="h-7 px-2 rounded-full text-[11px] font-medium bg-terracotta text-primary-foreground hover:opacity-90 inline-flex items-center gap-1 disabled:opacity-35 transition-opacity"
            >
              <FilePlus2 className="size-3.5" />
              <span className="hidden xs:inline sm:inline">Báo giá</span>
            </button>
            <button
              type="button"
              onClick={bulkCopyCodes}
              disabled={bulkBusy}
              title="Copy mã đã chọn"
              className="size-7 grid place-items-center rounded-full hover:bg-white/10 disabled:opacity-35 transition-colors"
            >
              <Copy className="size-3.5" />
            </button>
            {canEditProducts ? (
              <button
                type="button"
                onClick={() => setBulkEditOpen(true)}
                disabled={bulkBusy}
                title="Gán giá trị hàng loạt (màu, bộ sưu tập, danh mục...)"
                className="size-7 grid place-items-center rounded-full hover:bg-white/10 disabled:opacity-35 transition-colors"
              >
                <Tags className="size-3.5" />
              </button>
            ) : null}
            {canEditProducts ? (
              pendingBulkDelete ? (
                <div className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 ring-1 ring-red-400/30">
                  <span className="text-[11px] text-red-200 font-medium">Xóa {selectedCount} SP?</span>
                  <button
                    type="button"
                    onClick={bulkDelete}
                    disabled={bulkBusy}
                    className="size-6 grid place-items-center rounded-full bg-red-500 text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {bulkBusy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => setPendingBulkDelete(false)}
                    className="size-6 grid place-items-center rounded-full hover:bg-white/10 disabled:opacity-50"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={bulkDelete}
                  disabled={bulkBusy}
                  title="Xóa đã chọn"
                  className="size-7 grid place-items-center rounded-full text-red-300 hover:bg-red-500/25 disabled:opacity-35 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )
            ) : null}
            <button
              type="button"
              onClick={clearSelection}
              disabled={bulkBusy}
              title="Bỏ chọn"
              className="size-7 grid place-items-center rounded-full hover:bg-white/10 disabled:opacity-35 transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      <BulkEditFieldDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        productIds={Array.from(selectedIds)}
        onDone={() => {
          clearSelection();
          router.invalidate();
        }}
      />

      {hasMore ? (
        <div
          ref={sentinelRef}
          className="h-12 flex items-center justify-center mt-4 text-xs text-muted-foreground"
          aria-hidden
        >
          Đang tải thêm…
        </div>
      ) : filtered.length > 0 ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Đã hiện tất cả {filtered.length} sản phẩm
        </p>
      ) : null}

      {!filtered.length && (
        <div className="rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="text-sm text-muted-foreground">
            Không có sản phẩm phù hợp.
          </p>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-sm font-medium text-terracotta hover:underline"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      )}

      <ImportExportProductsDialog
        open={importExportOpen}
        onOpenChange={setImportExportOpen}
        category={category}
      />
      <ImportStockDialog
        open={importStockOpen}
        onOpenChange={setImportStockOpen}
        tab={importStockTab}
        previewData={stockPreviewData}
        onClearPreview={() => setStockPreviewData(null)}
      />
      <EditProductDialog
        open={Boolean(editProduct)}
        onOpenChange={(o) => {
          if (!o) setEditProduct(null);
        }}
        product={editProduct}
        onEditImages={() => {
          if (editProduct) {
            setImagesProduct(editProduct);
            setEditProduct(null);
          }
        }}
      />
      <EditProductImagesDialog
        open={Boolean(imagesProduct)}
        onOpenChange={(o) => {
          if (!o) setImagesProduct(null);
        }}
        product={imagesProduct}
      />

      <NewQuoteDialog
        open={quoteFromSelection}
        onOpenChange={(o) => {
          if (!o) setQuoteFromSelection(false);
        }}
        defaultProductIds={Array.from(selectedIds)}
        onCreated={() => {
          setQuoteFromSelection(false);
          clearSelection();
        }}
      />
    </>
  );
}

function ActiveTag({
  children,
  onClear,
}: {
  children: React.ReactNode;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full text-xs bg-terracotta-soft text-terracotta ring-1 ring-terracotta/25">
      {children}
      <button
        type="button"
        onClick={onClear}
        aria-label="Xoá filter"
        className="size-4 grid place-items-center rounded-full hover:bg-terracotta/15"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/** Tag bề mặt / thông số: mỗi loại một màu để dễ phân biệt */
type MetaKind = "size" | "surface" | "shape" | "material" | "color" | "finish";

const META_TAG_CLASS: Record<MetaKind, string> = {
  size: "bg-surface-strong/70 text-foreground/80 ring-black/5",
  surface:
    "bg-sky-50 text-sky-800 ring-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/25",
  shape:
    "bg-lime-50 text-lime-800 ring-lime-200/70 dark:bg-lime-500/10 dark:text-lime-300 dark:ring-lime-400/25",
  material:
    "bg-violet-50 text-violet-800 ring-violet-200/70 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/25",
  color:
    "bg-amber-50 text-amber-800 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25",
  finish:
    "bg-emerald-50 text-emerald-800 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25",
};

const META_TAG_TITLE: Record<MetaKind, string> = {
  size: "Kích thước",
  surface: "Bề mặt",
  shape: "Kiểu dáng",
  material: "Chất liệu",
  color: "Màu",
  finish: "Hiệu ứng",
};

function productMetaTags(p: Product): { kind: MetaKind; value: string }[] {
  return (
    [
      { kind: "size", value: p.size },
      { kind: "surface", value: p.surface },
      { kind: "shape", value: p.shape },
      { kind: "material", value: p.material },
      { kind: "color", value: p.color },
      { kind: "finish", value: p.finish_effect },
    ] as { kind: MetaKind; value?: string | null }[]
  )
    .map(({ kind, value }) => ({ kind, value: (value || "").trim() }))
    .filter((x) => x.value.length > 0);
}

function MetaTag({
  kind,
  value,
  size = "md",
}: {
  kind: MetaKind;
  value: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      title={`${META_TAG_TITLE[kind]}: ${value}`}
      className={[
        "inline-flex items-center rounded-md font-medium ring-1 max-w-full truncate",
        size === "sm"
          ? "h-[18px] px-1.5 text-[10px]"
          : "h-6 px-2 text-[11px]",
        META_TAG_CLASS[kind],
      ].join(" ")}
    >
      {value}
    </span>
  );
}

const ProductCard = memo(function ProductCard({
  product: t,
  selected,
  onToggleSelect,
  onEdit,
  onImages,
}: {
  product: Product;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onEdit?: (p: Product) => void;
  onImages?: (p: Product) => void;
}) {
  return (
    <article
      className={
        selected
          ? "group flex flex-col rounded-2xl bg-card border-2 border-terracotta overflow-hidden transition-all duration-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
          : "group flex flex-col rounded-2xl bg-card border border-border/60 overflow-hidden transition-all duration-200 hover:border-border hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
      }
    >
      <div className="relative aspect-[4/5] bg-[#f7f6f4] overflow-hidden">
        <ProductImage
          src={t.image_path}
          alt={t.name}
          code={t.code}
          fit="contain"
        />
        <ProductCheck
          checked={selected}
          onChange={() => onToggleSelect(t.id)}
          label={`Chọn ${t.code}`}
          className="absolute top-2 left-2 z-10"
        />
        {t.is_hot ? (
          <span className="absolute top-2.5 left-10 text-[10px] font-semibold tracking-wide uppercase bg-terracotta text-primary-foreground px-2 py-0.5 rounded-full">
            Hot
          </span>
        ) : null}
        {(t.image_count ?? 0) > 1 ? (
          <span className="absolute top-2.5 right-2.5 text-[10px] font-medium tabular-nums bg-black/50 backdrop-blur-sm text-white px-1.5 py-0.5 rounded-md">
            {t.image_count}
          </span>
        ) : null}
        {onEdit || onImages ? (
          <div className="absolute inset-x-0 bottom-0 p-2.5 flex justify-end gap-1.5 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 bg-gradient-to-t from-black/25 to-transparent pt-8">
            {onImages ? (
              <button
                type="button"
                onClick={() => onImages(t)}
                className="size-8 grid place-items-center rounded-full bg-white/95 text-foreground shadow-sm hover:bg-white"
                title="Hình"
              >
                <Images className="size-3.5" />
              </button>
            ) : null}
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(t)}
                className="size-8 grid place-items-center rounded-full bg-white/95 text-foreground shadow-sm hover:bg-white"
                title="Sửa"
              >
                <Pencil className="size-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col flex-1 p-3.5 pt-3">
        <p className="font-mono text-[10px] tracking-wide text-muted-foreground/80">
          {t.code}
          {t.multi_codes_list ? ` · NB: ${t.multi_codes_list}` : " · NB: —"}
        </p>
        <h3 className="text-[13px] font-medium leading-snug text-foreground mt-0.5 line-clamp-2 min-h-[2.4em]">
          {t.name}
        </h3>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {productMetaTags(t).map((m) => (
            <MetaTag key={m.kind} kind={m.kind} value={m.value} size="sm" />
          ))}
        </div>
        {t.total_stock != null && t.total_stock !== undefined ? (
          <p
            className={
              t.total_stock > 0
                ? "text-[11px] font-medium tabular-nums text-emerald-700 mt-1"
                : "text-[11px] font-medium tabular-nums text-muted-foreground mt-1"
            }
          >
            Tồn:{" "}
            {Number(t.total_stock).toLocaleString("vi-VN", {
              maximumFractionDigits: 3,
            })}{" "}
            m²
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground/70 mt-1">Tồn: —</p>
        )}
        <div className="mt-auto pt-3">
          <p className="text-sm font-semibold tabular-nums tracking-tight text-foreground">
            {formatVND(t.retail_price)}
          </p>
          <p className="text-[10px] text-muted-foreground">/m² lẻ</p>
        </div>
      </div>
    </article>
  );
});

const ProductListRow = memo(function ProductListRow({
  product: t,
  selected,
  onToggleSelect,
  onEdit,
  onImages,
}: {
  product: Product;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onEdit?: (p: Product) => void;
  onImages?: (p: Product) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(t.code);
      setCopied(true);
      toast.success(`Đã copy ${t.code}`);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Không copy được");
    }
  }

  const stock =
    t.total_stock != null && t.total_stock !== undefined
      ? Number(t.total_stock).toLocaleString("vi-VN", {
          maximumFractionDigits: 3,
        })
      : null;

  const metaTags = productMetaTags(t);

  return (
    <article
      className={
        selected
          ? "rounded-xl border-2 border-terracotta bg-card px-3 sm:px-4 py-3 shadow-sm transition-colors"
          : "rounded-xl border border-border/70 bg-card px-3 sm:px-4 py-3 hover:border-border hover:shadow-sm transition-colors"
      }
    >
      <div className="flex gap-3 sm:gap-4 items-start">
        <ProductCheck
          checked={selected}
          onChange={() => onToggleSelect(t.id)}
          label={`Chọn ${t.code}`}
          className="mt-1 flex-shrink-0"
        />

        <div className="size-16 sm:size-[4.5rem] rounded-xl overflow-hidden bg-[#f7f6f4] ring-1 ring-black/5 flex-shrink-0 relative">
          <ProductImage
            src={t.image_path}
            alt={t.name}
            code={t.code}
            fit="contain"
          />
          {t.is_hot ? (
            <span className="absolute top-1 left-1 text-[8px] font-bold uppercase tracking-wide bg-terracotta text-primary-foreground px-1.5 py-0.5 rounded-full">
              Hot
            </span>
          ) : null}
          {(t.image_count ?? 0) > 1 ? (
            <span className="absolute bottom-1 right-1 text-[9px] font-medium tabular-nums bg-black/50 text-white px-1 rounded">
              {t.image_count}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="font-mono text-xs sm:text-sm font-semibold text-foreground">
              {t.code}
            </p>
            {t.multi_codes_list ? (
              <p className="text-[11px] text-muted-foreground">
                NB: {t.multi_codes_list}
              </p>
            ) : null}
          </div>
          <h3 className="text-sm sm:text-[15px] font-medium leading-snug text-foreground line-clamp-2">
            {t.name}
          </h3>
          {metaTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {metaTags.map((m) => (
                <MetaTag key={m.kind} kind={m.kind} value={m.value} />
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-end justify-between gap-2 mt-1 pt-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <div>
                <p className="text-sm sm:text-base font-semibold tabular-nums tracking-tight text-foreground">
                  {formatVND(t.retail_price)}
                </p>
                <p className="text-[10px] text-muted-foreground">/m² lẻ</p>
              </div>
              <p
                className={
                  stock != null && Number(t.total_stock) > 0
                    ? "text-xs font-medium tabular-nums text-emerald-700"
                    : "text-xs tabular-nums text-muted-foreground"
                }
              >
                Tồn: {stock != null ? `${stock} m²` : "—"}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {onEdit ? (
                <QuickBtn onClick={() => onEdit(t)} icon={Pencil} label="Sửa" />
              ) : null}
              {onImages ? (
                <QuickBtn
                  onClick={() => onImages(t)}
                  icon={Images}
                  label="Hình"
                />
              ) : null}
              <QuickBtn
                onClick={copyCode}
                icon={copied ? Check : Copy}
                label={copied ? "OK" : "Copy mã"}
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
});

function QuickBtn({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 px-2 sm:px-2.5 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 ring-1 ring-black/5 bg-card hover:bg-surface-strong text-foreground transition-colors"
    >
      <Icon className="size-3.5 opacity-80" />
      <span>{label}</span>
    </button>
  );
}


