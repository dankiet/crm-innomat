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
import { NewProductDialog } from "@/components/NewProductDialog";
import { BulkEditFieldDialog } from "@/components/BulkEditFieldDialog";
import { FilterChip } from "@/components/product-filter/FilterChip";
import { MultiSelectFilter } from "@/components/product-filter/MultiSelectFilter";
import {
  SortMenu,
  type SortDir,
  type SortFieldOption,
} from "@/components/SortMenu";
import { deleteProductFn, fetchProducts, updateProductFn } from "@/api/functions";
import { bulkSetProductsPublicFn } from "@/api/lp";
import type { Product } from "@/lib/types";
import { formatVND } from "@/lib/format";
import {
  buildExactCodeSet,
  codeRowFromProduct,
  matchSearchTokens,
  splitSearchTokens,
} from "@/lib/product-search";
import {
  ALL_PRODUCTS_SLUG,
  categoryFromSlug,
  labelFromSlug,
  PRODUCT_GROUPS,
} from "@/lib/product-categories";
import {
  Check,
  Copy,
  FilePlus2,
  Flame,
  Globe,
  Eye,
  EyeOff,
  Images,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
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

function parseCsv(v: unknown): string[] {
  if (typeof v !== "string" || !v.trim()) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Nhóm facet — dùng khi tính options: loại facet của chính nhóm đó ra khỏi bộ lọc. */
type FacetKey = "color" | "surface" | "size" | "shape" | "effect" | "collection";
const BLANK_FILTER_VALUE = "__blank__";

function matchesFacet(values: Set<string>, value: string | null | undefined): boolean {
  if (!values.size) return true;
  const normalized = (value || "").trim();
  return normalized ? values.has(normalized) : values.has(BLANK_FILTER_VALUE);
}

function addFacetCount(map: Map<string, number>, value: string | null | undefined): void {
  const key = (value || "").trim() || BLANK_FILTER_VALUE;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toFacetOption([value, count]: [string, number]) {
  return { value, count, label: value === BLANK_FILTER_VALUE ? "Blank" : value };
}

type ProductSort =
  | "default"
  | "code_asc"
  | "code_desc"
  | "name_asc"
  | "name_desc"
  | "price_asc"
  | "price_desc"
  | "stock_desc"
  | "stock_asc"
  | "hot_first";

type ProductSortField =
  | "default"
  | "code"
  | "name"
  | "price"
  | "stock"
  | "hot";

const PRODUCT_SORT_FIELDS: SortFieldOption<ProductSortField>[] = [
  {
    field: "default",
    label: "Nhóm · BST · Mã",
    shortLabel: "Nhóm · BST · Mã",
    bidirectional: false,
    defaultDir: "asc",
  },
  {
    field: "code",
    label: "Mã sản phẩm",
    shortLabel: "Mã",
    defaultDir: "asc",
    ascHint: "A → Z",
    descHint: "Z → A",
  },
  {
    field: "name",
    label: "Tên sản phẩm",
    shortLabel: "Tên",
    defaultDir: "asc",
    ascHint: "A → Z",
    descHint: "Z → A",
  },
  {
    field: "price",
    label: "Giá",
    shortLabel: "Giá",
    defaultDir: "asc",
    ascHint: "Thấp → cao",
    descHint: "Cao → thấp",
  },
  {
    field: "stock",
    label: "Tồn kho",
    shortLabel: "Tồn",
    defaultDir: "desc",
    ascHint: "Ít → nhiều",
    descHint: "Nhiều → ít",
  },
  {
    field: "hot",
    label: "Hot trước",
    shortLabel: "Hot",
    bidirectional: false,
    defaultDir: "desc",
  },
];

function decodeProductSort(value: ProductSort): {
  field: ProductSortField;
  dir?: SortDir;
} {
  switch (value) {
    case "code_asc":
      return { field: "code", dir: "asc" };
    case "code_desc":
      return { field: "code", dir: "desc" };
    case "name_asc":
      return { field: "name", dir: "asc" };
    case "name_desc":
      return { field: "name", dir: "desc" };
    case "price_asc":
      return { field: "price", dir: "asc" };
    case "price_desc":
      return { field: "price", dir: "desc" };
    case "stock_asc":
      return { field: "stock", dir: "asc" };
    case "stock_desc":
      return { field: "stock", dir: "desc" };
    case "hot_first":
      return { field: "hot", dir: "desc" };
    default:
      return { field: "default", dir: "asc" };
  }
}

function encodeProductSort(field: ProductSortField, dir: SortDir): ProductSort {
  switch (field) {
    case "code":
      return dir === "desc" ? "code_desc" : "code_asc";
    case "name":
      return dir === "desc" ? "name_desc" : "name_asc";
    case "price":
      return dir === "desc" ? "price_desc" : "price_asc";
    case "stock":
      return dir === "desc" ? "stock_desc" : "stock_asc";
    case "hot":
      return "hot_first";
    default:
      return "default";
  }
}

function compareProductCode(a: Product, b: Product): number {
  const byCode = (a.code || "").localeCompare(b.code || "", "vi", {
    numeric: true,
    sensitivity: "base",
  });
  if (byCode !== 0) return byCode;
  return a.id - b.id;
}

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
    v === "code_desc" ||
    v === "name_asc" ||
    v === "name_desc" ||
    v === "price_asc" ||
    v === "price_desc" ||
    v === "stock_desc" ||
    v === "stock_asc" ||
    v === "hot_first"
  )
    return v;
  return undefined;
}

/** Giá lẻ — dùng cho sort theo giá. */
function priceOf(p: Product): number {
  return Number(p.retail_price) || 0;
}

type SanPhamSearch = {
  nhom?: string;
  q?: string;
  colors?: string[];
  /** Bề mặt */
  surfaces?: string[];
  /** Kích thước */
  sizes?: string[];
  /** Kiểu dáng */
  shapes?: string[];
  /** Hiệu ứng vân/mặt gạch */
  collections?: string[];
  /** Bộ sưu tập */
  supplier?: string[];
  hot?: boolean;
  stockLocation?: string;
  web?: "all" | "public" | "hidden";
  view?: ViewMode;
  sort?: ProductSort;
};

export const Route = createFileRoute("/_app/san-pham")({
  validateSearch: (search: Record<string, unknown>): SanPhamSearch => ({
    nhom: typeof search.nhom === "string" ? search.nhom : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
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
    collections: Array.isArray(search.collections)
      ? (search.collections as string[])
      : parseCsv(search.collections),
    supplier: Array.isArray(search.supplier)
      ? (search.supplier as string[])
      : parseCsv(search.supplier),
    hot: search.hot === true || search.hot === "1",
    web: search.web === "public" || search.web === "hidden" ? search.web : undefined,
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
    // UI defaults the warehouse chip to Kho Q9 when URL has no stockLocation.
    // Must mirror that here — otherwise listProducts sums Q9+VP (no JOIN filter).
    const stockLocation =
      !deps.stockLocation || deps.stockLocation === "ALL"
        ? "KHOQ9"
        : deps.stockLocation;
    const products = await fetchProducts({ data: { stockLocation } });
    return { products };
  },
  component: ProductsPage,
});

function ProductsPage() {
  const { products } = Route.useLoaderData() as { products: Product[] };
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [createProductOpen, setCreateProductOpen] = useState(false);
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
    colors: colorsParam = [],
    surfaces: surfacesParam = [],
    sizes: sizesParam = [],
    shapes: shapesParam = [],
    collections: effectsParam = [],
    supplier: collectionsParam = [],
    hot: hotParam = false,
    web: webParam,
    view: viewParam = "grid",
    stockLocation: stockLocParam,
    sort: sortParam = "default",
  } = searchParams;

  const viewMode: ViewMode = viewParam === "list" ? "list" : "grid";

  const category = categoryFromSlug(nhom);
  const supportsSizeTab = category === "Gạch bông" || category === "Gạch Ốp Lát";
  const groupLabel = labelFromSlug(nhom);

  // Input search dùng local state + debounce vào URL để đỡ giật
  const [searchDraft, setSearchDraft] = useState(qParam);
  const committedSearchRef = useRef(qParam);
  useEffect(() => {
    if (qParam === committedSearchRef.current) return;
    committedSearchRef.current = qParam;
    setSearchDraft(qParam);
  }, [qParam]);

  useEffect(() => {
    if (searchDraft === (qParam ?? "")) return;
    const t = setTimeout(() => {
      const committedSearch = searchDraft.trim();
      committedSearchRef.current = committedSearch;
      navigate({
        search: (prev: SanPhamSearch) => ({
          ...prev,
          q: committedSearch || undefined,
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

  /**
   * Mobile sheet chỉnh filter trên bản nháp rồi commit một lần bằng nút
   * «Áp dụng» — mỗi tap trước đây đều ghi thẳng vào URL (giật trên mobile).
   */
  const [filtersDraft, setFiltersDraft] = useState<{
    sizes: string[];
    colors: string[];
    surfaces: string[];
    shapes: string[];
    collections: string[];
    supplier: string[];
  } | null>(null);

  function openMobileFilters() {
    setFiltersDraft({
      sizes: sizesParam,
      colors: colorsParam,
      surfaces: surfacesParam,
      shapes: shapesParam,
      collections: effectsParam,
      supplier: collectionsParam,
    });
    setMoreFiltersOpen(true);
  }

  function patchFiltersDraft(patch: Partial<NonNullable<typeof filtersDraft>>) {
    setFiltersDraft((d) => (d ? { ...d, ...patch } : d));
  }

  function resetMobileFilters() {
    setFiltersDraft({
      sizes: [],
      colors: [],
      surfaces: [],
      shapes: [],
      collections: [],
      supplier: [],
    });
  }

  function applyMobileFilters() {
    const d = filtersDraft;
    if (!d) {
      setMoreFiltersOpen(false);
      return;
    }
    setSearch({
      sizes: d.sizes.length ? d.sizes : undefined,
      colors: d.colors.length ? d.colors : undefined,
      surfaces: d.surfaces.length ? d.surfaces : undefined,
      shapes: d.shapes.length ? d.shapes : undefined,
      collections: d.collections.length ? d.collections : undefined,
      supplier: d.supplier.length ? d.supplier : undefined,
    });
    setMoreFiltersOpen(false);
  }

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
        collectionHay: (p.supplier || "").toLowerCase(),
        searchRow: codeRowFromProduct(p.code, p.multi_codes_list, (v) => v.trim().toLowerCase()),
      })),
    [scoped],
  );
  const exactCodeSet = useMemo(
    () => buildExactCodeSet(indexed.map((entry) => entry.searchRow)),
    [indexed],
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

  /**
   * Lọc indexed theo toàn bộ bộ lọc đang chọn (giá + facet + hot + search).
   * Truyền `exclude` để bỏ qua facet của nhóm đó — dùng để tính options facet:
   * khi chọn kích thước 75x300, các nhóm khác chỉ hiện giá trị tồn tại trên
   * những SP khớp, còn chính nhóm Kích thước vẫn giữ đủ lựa chọn đã chọn.
   */
  const matchIndexed = useCallback(
    (exclude?: FacetKey) => {
      const q = deferredSearch.trim().toLowerCase();
      const tokens = splitSearchTokens(deferredSearch, (v) => v.trim().toLowerCase());
      const isSizeQuery =
        /^\d{2,4}\s*[x×X*]\s*\d{2,4}(\s*[x×X*]\s*\d{2,4})?(\s*mm)?$/i.test(
          deferredSearch.trim(),
        ) || /^\d{3,4}\s*x\s*\d{3,4}/i.test(deferredSearch.trim());

      return indexed.filter(({ p, codeHay, nameHay, collectionHay, searchRow }) => {
        if (exclude !== "color" && !matchesFacet(colorSet, p.color)) return false;
        if (exclude !== "surface" && !matchesFacet(surfaceSet, p.surface)) return false;
        if (exclude !== "size" && !matchesFacet(sizeSet, p.size)) return false;
        if (exclude !== "shape" && !matchesFacet(shapeSet, p.shape)) return false;
        if (exclude !== "effect" && !matchesFacet(effectSet, p.collections)) return false;
        if (exclude !== "collection" && !matchesFacet(collectionSet, p.supplier)) return false;
        if (hotParam && !p.is_hot) return false;
        if (webParam === "public" && p.is_public !== 1) return false;
        if (webParam === "hidden" && p.is_public === 1) return false;
        if (!q) return true;
        if (isSizeQuery) return false;
        const searchable = [codeHay, nameHay, collectionHay].filter(Boolean).join(" ");
        return matchSearchTokens(searchRow, tokens, searchable, exactCodeSet);
      });
    },
    [
      indexed,
      exactCodeSet,
      deferredSearch,
      colorSet,
      surfaceSet,
      sizeSet,
      shapeSet,
      effectSet,
      collectionSet,
      hotParam,
      webParam,
    ],
  );

  const colorOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { p } of matchIndexed("color")) {
      addFacetCount(map, p.color);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "vi"))
      .map(toFacetOption);
  }, [matchIndexed]);

  const surfaceOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { p } of matchIndexed("surface")) {
      addFacetCount(map, p.surface);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(toFacetOption);
  }, [matchIndexed]);


  const shapeOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { p } of matchIndexed("shape")) {
      addFacetCount(map, p.shape);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "vi"))
      .map(toFacetOption);
  }, [matchIndexed]);

  const effectOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { p } of matchIndexed("effect")) {
      addFacetCount(map, p.collections);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(toFacetOption);
  }, [matchIndexed]);

  const collectionOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { p } of matchIndexed("collection")) {
      addFacetCount(map, p.supplier);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "vi"))
      .map(toFacetOption);
  }, [matchIndexed]);

  const hotInScope = useMemo(
    () => indexed.filter(({ p }) => p.is_hot).length,
    [indexed],
  );

  const filtered = useMemo(() => {
    const list = matchIndexed().map((x) => x.p);

    switch (sortParam) {
      case "code_asc":
        return list.sort(compareProductCode);
      case "code_desc":
        return list.sort((a, b) => compareProductCode(b, a));
      case "name_asc":
        return list.sort((a, b) => {
          const byName = (a.name || "").localeCompare(b.name || "", "vi", {
            sensitivity: "base",
          });
          if (byName !== 0) return byName;
          return compareProductCode(a, b);
        });
      case "name_desc":
        return list.sort((a, b) => {
          const byName = (b.name || "").localeCompare(a.name || "", "vi", {
            sensitivity: "base",
          });
          if (byName !== 0) return byName;
          return compareProductCode(a, b);
        });
      case "price_asc":
        return list.sort((a, b) => {
          const d = priceOf(a) - priceOf(b);
          return d !== 0 ? d : compareProductCode(a, b);
        });
      case "price_desc":
        return list.sort((a, b) => {
          const d = priceOf(b) - priceOf(a);
          return d !== 0 ? d : compareProductCode(a, b);
        });
      case "stock_desc":
        return list.sort((a, b) => {
          const d = (Number(b.total_stock) || 0) - (Number(a.total_stock) || 0);
          return d !== 0 ? d : compareProductCode(a, b);
        });
      case "stock_asc":
        return list.sort((a, b) => {
          const d = (Number(a.total_stock) || 0) - (Number(b.total_stock) || 0);
          return d !== 0 ? d : compareProductCode(a, b);
        });
      case "hot_first":
        return list.sort((a, b) => {
          const d = (b.is_hot ? 1 : 0) - (a.is_hot ? 1 : 0);
          return d !== 0 ? d : compareProductCode(a, b);
        });
      default:
        return list;
    }
  }, [
    matchIndexed,
    sortParam,
  ]);

  /** Infinite scroll: hiện dần theo batch */
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset khi filter / nhóm / search / sort đổi
  const filterKey = useMemo(
    () =>
      [
        nhom,
        deferredSearch,
        colorsParam.join(","),
        surfacesParam.join(","),
        sizesParam.join(","),
        shapesParam.join(","),
        effectsParam.join(","),
        collectionsParam.join(","),
        hotParam ? "1" : "0",
        webParam ?? "all",
        stockLocParam,
        sortParam,
      ].join("|"),
    [
      nhom,
      deferredSearch,
      colorsParam,
      surfacesParam,
      sizesParam,
      shapesParam,
      effectsParam,
      collectionsParam,
      hotParam,
      webParam,
      stockLocParam,
      sortParam,
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
    colorsParam.length +
    surfacesParam.length +
    sizesParam.length +
    shapesParam.length +
    effectsParam.length +
    collectionsParam.length +
    (hotParam ? 1 : 0) +
    (webParam ? 1 : 0) +
    (stockLocParam === "KHOVP" ? 1 : 0);

  const hasActiveFilter = activeCount > 0;

  /** Facet đếm cho mobile sheet (desktop đã show hết chip) */
  const secondaryFilterCount =
    shapesParam.length +
    effectsParam.length +
    collectionsParam.length;
  const primaryFilterCount =
    colorsParam.length +
    surfacesParam.length +
    sizesParam.length;
  const mobileFiltersBadge = primaryFilterCount + secondaryFilterCount;

  /** Số lựa chọn đang chờ trong bản nháp sheet mobile (hiện trên nút Áp dụng). */
  const draftFilterCount = filtersDraft
    ? filtersDraft.colors.length +
      filtersDraft.surfaces.length +
      filtersDraft.sizes.length +
      filtersDraft.shapes.length +
      filtersDraft.collections.length +
      filtersDraft.supplier.length
    : 0;

  const productSortFields = PRODUCT_SORT_FIELDS;

  function setSearch(patch: Partial<SanPhamSearch>) {
    navigate({
      search: (prev: SanPhamSearch) => {
        const next: SanPhamSearch = { ...prev, ...patch };
        // Dọn field rỗng để URL gọn
        if (!next.q) delete next.q;
        if (!next.colors || next.colors.length === 0) delete next.colors;
        if (!next.surfaces || next.surfaces.length === 0)
          delete next.surfaces;
        if (!next.sizes || next.sizes.length === 0) delete next.sizes;
        if (!next.shapes || next.shapes.length === 0) delete next.shapes;
        if (!next.collections || next.collections.length === 0) delete next.collections;
        if (!next.supplier || next.supplier.length === 0)
          delete next.supplier;
        if (!next.hot) delete next.hot;
        if (!next.view || next.view === "grid") delete next.view;
        if (!next.stockLocation || next.stockLocation === "ALL") delete next.stockLocation;
        if (!next.sort || next.sort === "default") delete next.sort;
        return next;
      },
      replace: true,
    });
  }
  useEffect(() => {
    if (!supportsSizeTab && sizesParam.length > 0) {
      setSearch({ sizes: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportsSizeTab, sizesParam]);

  function setViewMode(v: ViewMode) {
    setSearch({ view: v === "grid" ? undefined : v });
  }

  function clearFilters() {
    setSearchDraft("");
    setSearch({
      q: undefined,
      colors: undefined,
      surfaces: undefined,
      sizes: undefined,
      shapes: undefined,
      collections: undefined,
      supplier: undefined,
      hot: undefined,
      stockLocation: undefined,
    });
  }

  const onEditProduct = useCallback((p: Product) => setEditProduct(p), []);
  const onImagesProduct = useCallback((p: Product) => setImagesProduct(p), []);

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

  const onTogglePublic = useCallback(
    async (product: Product) => {
      const next = product.is_public === 1 ? 0 : 1;
      try {
        await updateProductFn({
          data: {
            id: product.id,
            is_public: next,
          },
        });
        toast.success(
          next === 1
            ? `Đã hiện mã ${product.code} trên Thư viện web`
            : `Đã ẩn mã ${product.code} khỏi Thư viện web`,
        );
        await router.invalidate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lỗi cập nhật");
      }
    },
    [router],
  );

  async function bulkPublish() {
    if (!selectedProducts.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      await bulkSetProductsPublicFn({
        data: {
          productIds: selectedProducts.map((p) => p.id),
          is_public: 1,
        },
      });
      toast.success(`Đã xuất bản ${selectedProducts.length} sản phẩm lên Thư viện web`);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkUnpublish() {
    if (!selectedProducts.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      await bulkSetProductsPublicFn({
        data: {
          productIds: selectedProducts.map((p) => p.id),
          is_public: 0,
        },
      });
      toast.success(`Đã ẩn ${selectedProducts.length} sản phẩm khỏi Thư viện web`);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật");
    } finally {
      setBulkBusy(false);
    }
  }
  async function bulkCopyCodes() {
    if (!selectedProducts.length) return;
    const text = [...new Set(selectedProducts.map((product) => product.code.trim()).filter(Boolean))].join(" ");
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
        eyebrow="Catalog"
        title={groupLabel}
        description={`${scoped.length} mã · ${withImg} ảnh · ${hotTotal} bán chạy`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" ref={stockFileRef} onChange={handleStockFileChange} />
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" ref={mappingFileRef} onChange={handleMappingFileChange} />

            {canEditProducts ? (
              <button
                type="button"
                onClick={() => setCreateProductOpen(true)}
                className="h-8 px-3.5 rounded-md text-[12px] font-semibold bg-terracotta text-primary-foreground hover:bg-terracotta/90 inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Tạo sản phẩm
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => stockFileRef.current?.click()}
              className="h-8 px-3.5 rounded-md text-[12px] font-semibold border border-border/80 bg-card hover:bg-surface-strong/60 text-foreground inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
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

          <SortMenu
            value={sortParam}
            defaultValue="default"
            fields={productSortFields}
            decode={decodeProductSort}
            encode={encodeProductSort}
            onChange={(sort) => setSearch({ sort })}
          />
        </div>

        {/* Hàng 3: facets — desktop primary chips; mobile gọn + sheet */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Desktop: facets */}
          <div className="hidden md:contents">
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
            <FilterChip label={"B\u1ed9 s\u01b0u t\u1eadp"} count={effectsParam.length}>
              <MultiSelectFilter
                title={"Ch\u1ecdn b\u1ed9 s\u01b0u t\u1eadp"}
                options={effectOptions}
                selected={effectsParam}
                onChange={(next) =>
                  setSearch({ collections: next.length ? next : undefined })
                }
                searchable
              />
            </FilterChip>
          </div>

          {/* Mobile: 1 nút mở sheet full facets */}
          <button
            type="button"
            onClick={openMobileFilters}
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
              <FilterSection title="Màu" count={filtersDraft?.colors.length ?? colorsParam.length}>
                <MultiSelectFilter
                  title="Chọn màu"
                  options={colorOptions}
                  selected={filtersDraft?.colors ?? colorsParam}
                  onChange={(next) => patchFiltersDraft({ colors: next })}
                  searchable
                />
              </FilterSection>
              <FilterSection title="Bề mặt" count={filtersDraft?.surfaces.length ?? surfacesParam.length}>
                <MultiSelectFilter
                  title="Chọn bề mặt"
                  options={surfaceOptions}
                  selected={filtersDraft?.surfaces ?? surfacesParam}
                  onChange={(next) => patchFiltersDraft({ surfaces: next })}
                  searchable
                />
              </FilterSection>
              <FilterSection title="Kiểu dáng" count={filtersDraft?.shapes.length ?? shapesParam.length}>
                <MultiSelectFilter
                  title="Chọn kiểu dáng"
                  options={shapeOptions}
                  selected={filtersDraft?.shapes ?? shapesParam}
                  onChange={(next) => patchFiltersDraft({ shapes: next })}
                  searchable
                />
              </FilterSection>
              <FilterSection title={"B\u1ed9 s\u01b0u t\u1eadp"} count={filtersDraft?.collections.length ?? effectsParam.length}>
                <MultiSelectFilter
                  title={"Ch\u1ecdn b\u1ed9 s\u01b0u t\u1eadp"}
                  options={effectOptions}
                  selected={filtersDraft?.collections ?? effectsParam}
                  onChange={(next) => patchFiltersDraft({ collections: next })}
                   searchable
                 />
               </FilterSection>
             </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <button
                type="button"
                onClick={resetMobileFilters}
                className="h-9 px-4 rounded-lg text-sm font-medium text-muted-foreground hover:text-terracotta"
              >
                Đặt lại
              </button>
              {mobileFiltersBadge > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    clearFilters();
                    setMoreFiltersOpen(false);
                  }}
                  className="h-9 px-4 rounded-lg text-sm font-medium text-muted-foreground hover:text-terracotta"
                >
                  Xoá lọc
                </button>
              ) : null}
              <button
                type="button"
                onClick={applyMobileFilters}
                className="h-9 px-5 rounded-lg text-sm font-semibold bg-terracotta text-primary-foreground hover:bg-terracotta/90 inline-flex items-center gap-1.5"
              >
                Áp dụng bộ lọc
                {draftFilterCount > 0 ? (
                  <span className="inline-flex items-center justify-center min-w-[1.25rem] h-[1.25rem] px-1 rounded-full text-[10px] font-semibold tabular-nums bg-primary-foreground/20">
                    {draftFilterCount}
                  </span>
                ) : null}
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
                    collections: effectsParam.filter((x: string) => x !== e),
                  })
                }
              >
                {"B\u1ed9 s\u01b0u t\u1eadp"}: {e}
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5">
          {visibleItems.map((t) => (
            <ProductCard
              key={t.id}
              product={t}
              selected={selectedIds.has(t.id)}
              onToggleSelect={toggleSelect}
              onTogglePublic={canEditProducts ? onTogglePublic : undefined}
              onEdit={canEditProducts ? onEditProduct : undefined}
              onImages={onImagesProduct}
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
              onTogglePublic={canEditProducts ? onTogglePublic : undefined}
              onEdit={canEditProducts ? onEditProduct : undefined}
              onImages={onImagesProduct}
            />
          ))}
        </div>
      )}

      {/* Quick actions — giữ trực tiếp trên thanh nổi, compact như catalog ban đầu */}
      {selectedCount > 0 ? (
        <div className="fixed bottom-3 left-1/2 z-40 max-w-[min(96vw,28rem)] -translate-x-1/2 safe-pb">
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-full bg-foreground/95 px-2 py-1.5 text-background shadow-lg ring-1 ring-white/10 backdrop-blur-sm sm:flex-nowrap">
            <span className="min-w-[1.25rem] text-center text-xs font-semibold tabular-nums text-primary-foreground">
              {selectedCount}
            </span>
            <span className="hidden pr-1 text-[11px] text-background/70 sm:inline">đã chọn</span>
            <span className="mx-0.5 h-4 w-px bg-white/15" aria-hidden />
            <button type="button" onClick={selectAllFiltered} disabled={bulkBusy || allFilteredSelected} title={`Chọn hết ${filtered.length} SP`} className="h-7 rounded-full px-2 text-[11px] font-medium text-background/90 transition-colors hover:bg-white/10 disabled:opacity-35">
              Hết <span className="ml-0.5 tabular-nums text-background/50">{filtered.length}</span>
            </button>
            <button type="button" onClick={() => setQuoteFromSelection(true)} disabled={bulkBusy} title={`Tạo báo giá (${selectedCount} SP)`} className="inline-flex h-7 items-center gap-1 rounded-full bg-terracotta px-2 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-35">
              <FilePlus2 className="size-3.5" />
              <span>Báo giá</span>
            </button>
            {canEditProducts ? (
              <button type="button" onClick={() => setBulkEditOpen(true)} disabled={bulkBusy} title="Gán giá trị hàng loạt" className="grid size-7 place-items-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-35">
                <Tags className="size-3.5" />
              </button>
            ) : null}
            <button type="button" onClick={bulkCopyCodes} disabled={bulkBusy} title="Copy mã đã chọn" className="grid size-7 place-items-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-35">
              <Copy className="size-3.5" />
            </button>
            {canEditProducts ? (
              pendingBulkDelete ? (
                <div className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 ring-1 ring-red-400/30">
                  <span className="text-[11px] font-medium text-red-200">Xóa {selectedCount} SP?</span>
                  <button type="button" onClick={bulkDelete} disabled={bulkBusy} className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-500 disabled:opacity-50">Xóa vĩnh viễn</button>
                  <button type="button" onClick={() => setPendingBulkDelete(false)} disabled={bulkBusy} className="grid size-6 place-items-center rounded-full hover:bg-white/10 disabled:opacity-50" title="Không xóa"><X className="size-3" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => setPendingBulkDelete(true)} disabled={bulkBusy} title="Xóa đã chọn" className="grid size-7 place-items-center rounded-full text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-35">
                  <Trash2 className="size-3.5" />
                </button>
              )
            ) : null}
            <button type="button" onClick={clearSelection} disabled={bulkBusy} title="Bỏ chọn" className="grid size-7 place-items-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-35">
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      <BulkEditFieldDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        productIds={Array.from(selectedIds)}
        canManageOptions={canEditProducts}
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
      <NewProductDialog
        open={createProductOpen}
        onOpenChange={setCreateProductOpen}
        defaultCategory={category !== "all" ? category : ""}
        canManageOptions={canEditProducts}
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
        canManageOptions={canEditProducts}
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
        readOnly={!canEditProducts}
      />

      <NewQuoteDialog
        open={quoteFromSelection}
        onOpenChange={(o) => {
          if (!o) setQuoteFromSelection(false);
        }}
        defaultProductIds={Array.from(selectedIds)}
        onCreated={() => {
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
      { kind: "finish", value: p.collections },
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
  onTogglePublic,
  onEdit,
  onImages,
}: {
  product: Product;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onTogglePublic?: (p: Product) => void;
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
        {onImages ? (
          <button
            type="button"
            onClick={() => onImages(t)}
            className="absolute inset-0 z-0 block size-full cursor-pointer text-left"
            aria-label={`Xem hình ${t.code}`}
          >
            <ProductImage
              src={t.image_path}
              alt={t.name}
              code={t.code}
              fit="contain"
            />
          </button>
        ) : (
          <ProductImage
            src={t.image_path}
            alt={t.name}
            code={t.code}
            fit="contain"
          />
        )}
        <ProductCheck
          checked={selected}
          onChange={() => onToggleSelect(t.id)}
          label={`Chọn ${t.code}`}
          className="absolute top-2 left-2 z-10"
        />
        {t.is_hot ? (
          <span className="absolute top-2.5 left-10 z-[1] text-[10px] font-semibold tracking-wide uppercase bg-terracotta text-primary-foreground px-2 py-0.5 rounded-full pointer-events-none">
            Hot
          </span>
        ) : null}
        {t.is_public === 1 ? (
          <span
            className={cn(
              "absolute top-2.5 z-[1] inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white pointer-events-none",
              t.is_hot ? "left-20" : "left-10",
            )}
          >
            <Globe className="size-2.5" /> Web
          </span>
        ) : null}
        {(t.image_count ?? 0) > 1 ? (
          <span className="absolute top-2.5 right-2.5 z-[1] text-[10px] font-medium tabular-nums bg-black/50 backdrop-blur-sm text-white px-1.5 py-0.5 rounded-md pointer-events-none">
            {t.image_count}
          </span>
        ) : null}
        {onEdit || onImages ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] hidden justify-end gap-1.5 bg-gradient-to-t from-black/25 to-transparent p-2.5 pt-8 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 translate-y-1 md:flex">
            {onImages ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onImages(t);
                }}
                className="pointer-events-auto size-8 grid place-items-center rounded-full bg-white/95 text-foreground shadow-sm hover:bg-white"
                title="Hình"
                aria-label={`Xem hình ${t.code}`}
              >
                <Images className="size-3.5" />
              </button>
            ) : null}
            {onEdit ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(t);
                }}
                className="pointer-events-auto size-8 grid place-items-center rounded-full bg-white/95 text-foreground shadow-sm hover:bg-white"
                title="Sửa"
                aria-label={`Sửa ${t.code}`}
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
  onTogglePublic,
  onEdit,
  onImages,
}: {
  product: Product;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onTogglePublic?: (p: Product) => void;
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
      className={cn(
        "rounded-2xl bg-card transition-all duration-150 p-3 sm:p-4 border",
        selected
          ? "border-2 border-terracotta shadow-xs ring-2 ring-terracotta/10 bg-terracotta/[0.015]"
          : "border-border/80 hover:border-border hover:shadow-xs",
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 sm:gap-5 justify-between">
        {/* Left column: Checkbox + Square Image + Details */}
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0 flex-1">
          <ProductCheck
            checked={selected}
            onChange={() => onToggleSelect(t.id)}
            label={`Chọn ${t.code}`}
            className="shrink-0 mt-0.5 sm:mt-0"
          />

          <div className="size-16 sm:size-[4.25rem] rounded-xl overflow-hidden bg-[#f7f6f4] ring-1 ring-black/5 shrink-0 relative">
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

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs sm:text-sm font-bold text-foreground">
                {t.code}
              </span>
              {t.multi_codes_list ? (
                <span className="text-[11px] text-muted-foreground font-mono">
                  · NB: {t.multi_codes_list}
                </span>
              ) : null}
              <span className="rounded bg-surface-strong px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t.category}
              </span>
            </div>

            <h3 className="text-sm font-semibold leading-snug text-foreground truncate">
              {t.name}
            </h3>

            {metaTags.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {metaTags.map((m) => (
                  <MetaTag key={m.kind} kind={m.kind} value={m.value} size="sm" />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right column: Price/Stock + Actions */}
        <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/50">
          {/* Price & Stock */}
          <div className="text-left sm:text-right min-w-[6.5rem]">
            <p className="text-sm sm:text-base font-bold tabular-nums tracking-tight text-foreground">
              {formatVND(t.retail_price)}
              <span className="text-[10px] font-normal text-muted-foreground ml-0.5">/m²</span>
            </p>
            <p
              className={cn(
                "text-xs font-semibold tabular-nums mt-0.5",
                stock != null && Number(t.total_stock) > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground",
              )}
            >
              {stock != null ? `Tồn: ${stock} m²` : "Tồn: —"}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
          {/* Compact status badge; web mutations live in the multi-action dialog. */}
          {t.is_public === 1 ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <Globe className="size-3 text-emerald-600" /> Web
            </span>
          ) : null}

            {onImages ? (
              <button
                type="button"
                onClick={() => onImages(t)}
                className="size-8 grid place-items-center rounded-xl bg-surface-strong hover:bg-accent text-muted-foreground hover:text-foreground transition-colors border border-border/70"
                title="Quản lý hình ảnh"
              >
                <Images className="size-3.5" />
              </button>
            ) : null}

            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(t)}
                className="size-8 grid place-items-center rounded-xl bg-surface-strong hover:bg-accent text-muted-foreground hover:text-foreground transition-colors border border-border/70"
                title="Sửa thông tin sản phẩm"
              >
                <Pencil className="size-3.5" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={copyCode}
              className="size-8 grid place-items-center rounded-xl bg-surface-strong hover:bg-accent text-muted-foreground hover:text-foreground transition-colors border border-border/70"
              title={copied ? "Đã copy!" : "Copy mã sản phẩm"}
            >
              {copied ? <Check className="size-3.5 text-emerald-600 stroke-[2.5]" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
});







