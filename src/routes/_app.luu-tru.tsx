import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  CheckSquare,
  ChevronDown,
  Clock,
  EyeOff,
  Globe,
  Grid,
  Image as ImageIcon,
  Images,
  Info,
  Layers,
  Loader2,
  Maximize2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  bulkSetProductImageKindFn,
  bulkSetProductImageRoomTagsFn,
  deleteMediaAssetFn,
  deleteProductImageFn,
  fetchFlatMediaImagesFn,
  fetchProductFieldValues,
  fetchProductImages,
  setImageRoomTagsDirectFn,
  setProductImageKindFn,
  setProductImageRoomTagsFn,
} from "@/api/functions";
import {
  fetchLpHeroImageFn,
  setLpHeroImageFn,
  setFeaturedSlotFn,
  fetchFeaturedSlotsFn,
  toggleProductPublicFn,
  bulkSetProductsPublicFn,
  demoteConceptImageFn,
  setConceptImagePublicFn,
  updateConceptDescriptionFn,
  fetchMediaUsageFn,
} from "@/api/lp";
import type { FeaturedSlotInfo } from "@/db/lp.server";
import type { ImageReference } from "@/db/image-references.server";
import {
  IMAGE_ROOM_TAGS,
  PRODUCT_COLORS,
  PRODUCT_TEXTURES,
  type ImageRoomTagSlug,
  type ProductImageKind,
  type ProductImageRow,
} from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductImage } from "@/components/ProductImage";
import { AssetUsageDialog } from "@/components/AssetUsageDialog";
import type { FlatMediaItem, FlatMediaSort, FlatMediaTab, FlatMediaUsage } from "@/db/media.server";
import { PRODUCT_GROUPS } from "@/lib/product-categories";
import { ImageRoomTagPicker } from "@/components/ImageRoomTagPicker";
import { cn, mapLimit } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActiveTag } from "@/components/product-filter/ActiveTag";
import { FilterChip } from "@/components/product-filter/FilterChip";
import { MultiSelectFilter } from "@/components/product-filter/MultiSelectFilter";
import { PaginationBar } from "@/components/PaginationBar";
import { parseCsv } from "@/lib/product-facets";
import { parsePositiveInt } from "@/lib/parse";
import { formatFileSize } from "@/lib/format";
type MediaStorageSearch = {
  tab?: FlatMediaTab;
  category?: string;
  roomSlug?: ImageRoomTagSlug;
  publicFilter?: "all" | "public" | "hidden";
  colors?: string[];
  surfaces?: string[];
  shapes?: string[];
  textures?: string[];
  collections?: string[];
  q?: string;
  sort?: FlatMediaSort;
  page?: number;
  pageSize?: number;
  usage?: FlatMediaUsage;
  selected?: "yes" | "no";
};

const FLAT_MEDIA_TABS: readonly string[] = ["all", "map", "concept", "featured", "unassigned"];
const FLAT_MEDIA_SORTS: readonly string[] = ["newest", "oldest", "code_asc", "code_desc", "priority"];
const USAGE_OPTIONS: readonly FlatMediaUsage[] = ["all", "used", "draft", "orphan"];
const PUBLIC_FILTERS: readonly string[] = ["all", "public", "hidden"];

function parseMediaTab(v: unknown): FlatMediaTab | undefined {
  return typeof v === "string" && FLAT_MEDIA_TABS.includes(v) ? (v as FlatMediaTab) : undefined;
}
function parseMediaSort(v: unknown): FlatMediaSort | undefined {
  return typeof v === "string" && FLAT_MEDIA_SORTS.includes(v) ? (v as FlatMediaSort) : undefined;
}
function parseMediaRoomSlug(v: unknown): ImageRoomTagSlug | undefined {
  if (typeof v !== "string" || v === "all") return undefined;
  return IMAGE_ROOM_TAGS.some((t) => t.id === v) ? (v as ImageRoomTagSlug) : undefined;
}
function parseMediaPublicFilter(v: unknown): "all" | "public" | "hidden" | undefined {
  return typeof v === "string" && PUBLIC_FILTERS.includes(v)
    ? (v as "all" | "public" | "hidden")
    : undefined;
}
/** Param mảng URL: nhận JSON array hoặc CSV ("a,b"). Output undefined khi rỗng. */
function parseMediaArrayParam(v: unknown): string[] | undefined {
  const arr = Array.isArray(v) ? (v as unknown[]) : parseCsv(v);
  const out = arr.filter((x): x is string => typeof x === "string" && x !== "");
  return out.length ? out : undefined;
}

export const Route = createFileRoute("/_app/luu-tru")({
  validateSearch: (search: Record<string, unknown>): MediaStorageSearch => {
    const pageSize = Number(search.pageSize);
    return {
      tab: parseMediaTab(search.tab),
      category:
        typeof search.category === "string" && search.category !== "all"
          ? search.category.slice(0, 80)
          : undefined,
      roomSlug: parseMediaRoomSlug(search.roomSlug),
      publicFilter: parseMediaPublicFilter(search.publicFilter),
      colors: parseMediaArrayParam(search.colors),
      surfaces: parseMediaArrayParam(search.surfaces),
      shapes: parseMediaArrayParam(search.shapes),
      textures: parseMediaArrayParam(search.textures),
      collections: parseMediaArrayParam(search.collections),
      q: typeof search.q === "string" ? search.q.slice(0, 120) : undefined,
      sort: parseMediaSort(search.sort),
      page: parsePositiveInt(search.page),
      pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize) ? pageSize : undefined,
      usage: USAGE_OPTIONS.includes(search.usage as FlatMediaUsage)
        ? (search.usage as FlatMediaUsage)
        : undefined,
      selected: search.selected === "yes" || search.selected === "no" ? search.selected : undefined,
    };
  },
  errorComponent: ({ error }) => (
    <div className="p-8 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300">
      <h2 className="text-base font-bold">Lỗi tải Lưu trữ</h2>
      <pre className="mt-2 text-xs font-mono whitespace-pre-wrap">{error instanceof Error ? error.stack || error.message : String(error)}</pre>
    </div>
  ),
  component: MediaStoragePage,
});

const TABS: Array<{ key: FlatMediaTab; label: string; countKey: "all" | "map" | "concept" | "featured" | "unassigned" }> = [
  { key: "all", label: "All", countKey: "all" },
  { key: "map", label: "MAP", countKey: "map" },
  { key: "concept", label: "Lookbook", countKey: "concept" },
  { key: "featured", label: "Tuyển chọn (ẩn)", countKey: "featured" },
  { key: "unassigned", label: "Uncategorized", countKey: "unassigned" },
];

const SORT_OPTIONS: Array<{ key: FlatMediaSort; label: string; icon: typeof Clock }> = [
  { key: "newest", label: "Mới nhất", icon: Clock },
  { key: "oldest", label: "Cũ nhất", icon: Clock },
  { key: "code_asc", label: "Mã SP (A-Z)", icon: ArrowDownAZ },
  { key: "code_desc", label: "Mã SP (Z-A)", icon: ArrowUpAZ },
  { key: "priority", label: "Ưu tiên (#1—#12)", icon: Sparkles },
];

const PAGE_SIZE_OPTIONS = [24, 48, 96] as const;

function QuickRoomTagPopover({
  item,
  onSave,
  disabled,
}: {
  item: FlatMediaItem;
  onSave: (slugs: ImageRoomTagSlug[]) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const currentSlugs = item.room_tags.map((t) => t.room_slug as ImageRoomTagSlug);
  const [tempSlugs, setTempSlugs] = useState<ImageRoomTagSlug[]>(currentSlugs);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTempSlugs(item.room_tags.map((t) => t.room_slug as ImageRoomTagSlug));
    }
  }, [open, item.room_tags]);

  function toggleSlug(slug: ImageRoomTagSlug) {
    setTempSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  async function handleApply() {
    setSaving(true);
    try {
      await onSave(tempSlugs);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[9px] font-semibold transition-colors cursor-pointer"
          title="Thêm/sửa tag không gian phòng cho ảnh này"
        >
          <Tag className="size-2.5" />
          <span>{currentSlugs.length > 0 ? `${currentSlugs.length} phòng` : "+ Gán phòng"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
            <span className="text-xs font-bold text-foreground flex items-center gap-1">
              <Sparkles className="size-3 text-amber-600" />
              Bối cảnh Lookbook
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">#{item.id}</span>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Gán phòng sẽ đưa ảnh vào Concept và hiển thị trong Lookbook.
          </p>

          <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-1">
            {IMAGE_ROOM_TAGS.map((tag) => {
              const checked = tempSlugs.includes(tag.id);
              return (
                <label
                  key={tag.id}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2 py-1 text-xs cursor-pointer transition-colors",
                    checked
                      ? "bg-amber-500/15 font-semibold text-amber-800 dark:text-amber-200"
                      : "hover:bg-surface-strong text-muted-foreground",
                  )}
                >
                  <span className="text-[11px]">{tag.label}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSlug(tag.id)}
                    className="size-3.5 rounded border-border accent-amber-600 cursor-pointer"
                  />
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
            <button
              type="button"
              onClick={() => setTempSlugs([])}
              className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Xóa hết
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-surface-strong cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleApply}
                className="rounded bg-amber-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-amber-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Đang lưu..." : "Lưu bối cảnh"}
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function QuickFeaturedRankPopover({
  item,
  onUpdated,
  disabled,
}: {
  item: FlatMediaItem;
  onUpdated: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [occupiedSlots, setOccupiedSlots] = useState<Record<number, FeaturedSlotInfo>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchFeaturedSlotsFn()
      .then((slots) => {
        if (!cancelled) {
          const map: Record<number, FeaturedSlotInfo> = {};
          for (const s of slots) {
            map[s.rank] = s;
          }
          setOccupiedSlots(map);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleAssign(rank: number) {
    setBusy(true);
    try {
      await setFeaturedSlotFn({
        data: { rank, productId: item.product_id },
      });
      toast.success(`Đã gán ${item.product_code} vào Vị trí #${rank} Tuyển chọn Trang chủ`);
      setOpen(false);
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi gán vị trí tuyển chọn");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (item.featured_rank == null) return;
    setBusy(true);
    try {
      await setFeaturedSlotFn({
        data: { rank: item.featured_rank, productId: null },
      });
      toast.success(`Đã gỡ ${item.product_code} khỏi Vị trí #${item.featured_rank}`);
      setOpen(false);
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi gỡ vị trí tuyển chọn");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || busy}
          title={item.featured_rank ? `Đang ở Vị trí #${item.featured_rank} Tuyển chọn Trang chủ` : "Gán vào 12 Vị trí Tuyển chọn"}
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer inline-flex items-center gap-1",
            item.featured_rank != null && item.featured_rank >= 1 && item.featured_rank <= 12
              ? "bg-terracotta text-white shadow-2xs font-bold"
              : "bg-surface-strong/60 text-muted-foreground hover:bg-terracotta/10 hover:text-terracotta",
          )}
        >
          <Sparkles className="size-2.5" />
          <span>{item.featured_rank ? `★ #${item.featured_rank}` : "Tuyển chọn"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3.5 text-foreground" align="start" side="top">
        <div className="space-y-3">
          <div className="border-b border-border/60 pb-2">
            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-terracotta" />
              <span>Gán vào Tuyển chọn Trang chủ</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Chọn 1 trong 12 ô hiển thị tại Section 02 (Trang chủ).
            </p>
          </div>

          {/* Grid 12 vị trí */}
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((rank) => {
              const occupant = occupiedSlots[rank];
              const isCurrent = item.featured_rank === rank || (occupant && Number(occupant.product_id) === Number(item.product_id));
              const isOccupiedByOther = occupant && !isCurrent;

              return (
                <button
                  key={rank}
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAssign(rank)}
                  title={
                    isCurrent
                      ? `Vị trí #${rank}: Đang chọn cho sản phẩm này (${item.product_code})`
                      : isOccupiedByOther
                        ? `Vị trí #${rank}: Đã có ${occupant.product_code} (${occupant.product_name}). Click để thay thế bằng ${item.product_code}.`
                        : `Vị trí #${rank}: Đang trống. Click để gán.`
                  }
                  className={cn(
                    "flex flex-col items-start justify-between p-2 rounded-lg border text-left transition-all cursor-pointer relative min-h-[52px]",
                    isCurrent
                      ? "bg-terracotta text-white border-terracotta shadow-xs ring-2 ring-terracotta/30"
                      : isOccupiedByOther
                        ? "bg-amber-500/10 border-amber-400/80 text-foreground hover:bg-amber-500/20 hover:border-amber-500"
                        : "bg-card border-border text-foreground hover:border-terracotta/60 hover:bg-terracotta/5",
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={cn("text-xs font-extrabold", isCurrent ? "text-white" : "text-foreground")}>
                      #{rank}
                    </span>
                    {isCurrent ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-white/20 px-1 py-0.5 rounded text-white">
                        Đang chọn
                      </span>
                    ) : isOccupiedByOther ? (
                      <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
                    ) : (
                      <span className="text-[9px] text-muted-foreground/60 font-medium">
                        Trống
                      </span>
                    )}
                  </div>
                  {isOccupiedByOther ? (
                    <span className="mt-1 block truncate w-full text-[10px] font-semibold text-amber-900 dark:text-amber-200">
                      {occupant.product_code}
                    </span>
                  ) : isCurrent ? (
                    <span className="mt-1 block truncate w-full text-[10px] font-medium text-white/90">
                      {item.product_code}
                    </span>
                  ) : (
                    <span className="mt-1 block text-[10px] text-muted-foreground/50 italic">
                      Chưa gán
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Chú thích màu sắc */}
          <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground border-t border-border/50">
            <div className="flex items-center gap-1">
              <span className="size-2 rounded-sm bg-terracotta" />
              <span>Hiện tại</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="size-2 rounded-sm bg-amber-400" />
              <span>Đã có SP khác</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="size-2 rounded-sm border border-border bg-card" />
              <span>Trống</span>
            </div>
          </div>

          {item.featured_rank ? (
            <div className="pt-1.5 border-t border-border/60">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRemove()}
                className="w-full text-center text-xs font-semibold text-red-600 hover:text-red-700 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
              >
                Gỡ khỏi Vị trí #{item.featured_rank}
              </button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BulkRoomTagPopover({
  selectedCount,
  onApply,
  disabled,
  open,
  onOpenChange,
}: {
  selectedCount: number;
  onApply: (slugs: ImageRoomTagSlug[]) => Promise<void>;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [slugs, setSlugs] = useState<ImageRoomTagSlug[]>([]);
  const [busy, setBusy] = useState(false);

  function toggle(slug: ImageRoomTagSlug) {
    setSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }

  async function handleConfirm() {
    if (slugs.length === 0) return;
    setBusy(true);
    try {
      await onApply(slugs);
      setSlugs([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className="size-3.5" />
          <span>Gán bối cảnh phòng...</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 text-foreground" align="center" side="top">
        <div className="space-y-2.5">
          <div className="border-b border-border/60 pb-1.5">
            <p className="text-xs font-bold text-foreground">
              Gán bối cảnh cho {selectedCount} ảnh đã chọn
            </p>
            <p className="text-[10px] text-muted-foreground">
              Các ảnh được chọn sẽ tự động chuyển thành Concept
            </p>
          </div>

          <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-1">
            {IMAGE_ROOM_TAGS.map((tag) => {
              const checked = slugs.includes(tag.id);
              return (
                <label
                  key={tag.id}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2 py-1 text-xs cursor-pointer transition-colors",
                    checked
                      ? "bg-amber-500/15 font-semibold text-amber-800 dark:text-amber-200"
                      : "hover:bg-surface-strong text-muted-foreground",
                  )}
                >
                  <span className="text-[11px]">{tag.label}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(tag.id)}
                    className="size-3.5 rounded border-border accent-amber-600 cursor-pointer"
                  />
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
            <button
              type="button"
              onClick={() => setSlugs([])}
              className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Bỏ chọn hết
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-surface-strong cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={busy || slugs.length === 0}
                onClick={handleConfirm}
                className="rounded bg-amber-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-amber-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {busy ? "Đang gán..." : `Gán vào ${selectedCount} ảnh`}
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MediaStoragePage() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  // Filter & phân trang — nguồn là URL (validateSearch), không còn useState
  const tab = searchParams.tab ?? "all";
  const category = searchParams.category ?? "all";
  const roomSlug = searchParams.roomSlug ?? "all";
  const publicFilter = searchParams.publicFilter ?? "all";
  const selectedColors = searchParams.colors ?? [];
  const selectedSurfaces = searchParams.surfaces ?? [];
  const selectedShapes = searchParams.shapes ?? [];
  const selectedTextures = searchParams.textures ?? [];
  const selectedCollections = searchParams.collections ?? [];
  const sort = searchParams.sort ?? "newest";
  const page = searchParams.page ?? 1;
  const pageSize = searchParams.pageSize ?? 24;
  const usage = searchParams.usage ?? "all";

  /** Đổi filter: ghi URL và luôn reset về trang 1 (đúng hành vi cũ). */
  function patchFilters(patch: Partial<MediaStorageSearch>) {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: undefined }) });
  }
  function gotoPage(newPage: number) {
    navigate({ search: (prev) => ({ ...prev, page: newPage === 1 ? undefined : newPage }) });
  }
  const currentSortOption = SORT_OPTIONS.find((s) => s.key === sort) ?? SORT_OPTIONS[0]!;

  const hasActiveFilters = Boolean(
    searchParams.q ||
    category !== "all" ||
    roomSlug !== "all" ||
    publicFilter !== "all" ||
    selectedColors.length > 0 ||
    selectedSurfaces.length > 0 ||
    selectedShapes.length > 0 ||
    selectedTextures.length > 0 ||
    selectedCollections.length > 0 ||
    usage !== "all" ||
    (tab !== "all" && tab !== "featured") ||
    (searchParams.selected != null)
  );

  function resetAllFilters() {
    setSearch("");
    navigate({ search: {} });
  }
  /** Số filter đang áp dụng — hiện trên nút "Xoá tất cả". Không tính tab/usage
   * vì hai thứ đó đã có segmented control riêng. */
  const activeFilterCount =
    (searchParams.q ? 1 : 0) +
    (category !== "all" ? 1 : 0) +
    (roomSlug !== "all" ? 1 : 0) +
    (publicFilter !== "all" ? 1 : 0) +
    selectedColors.length +
    selectedSurfaces.length +
    selectedShapes.length +
    selectedTextures.length +
    selectedCollections.length +
    (searchParams.selected != null ? 1 : 0);
  const [colorOptions, setColorOptions] = useState<{ value: string; label: string }[]>([]);
  const [surfaceOptions, setSurfaceOptions] = useState<{ value: string; label: string }[]>([]);
  const [shapeOptions, setShapeOptions] = useState<{ value: string; label: string }[]>([]);
  const [textureOptions, setTextureOptions] = useState<{ value: string; label: string }[]>([]);
  const [collectionOptions, setCollectionOptions] = useState<{ value: string; label: string }[]>([]);
  const [search, setSearch] = useState(() => searchParams.q ?? "");
  const [currentHeroImage, setCurrentHeroImage] = useState<string>("");

  // Load danh mục filter options scoped chính xác theo nhóm danh mục đang chọn (category)
  useEffect(() => {
    let cancelled = false;
    const catParam = category === "all" ? undefined : category;
    Promise.all([
      fetchProductFieldValues({ data: { field: "color", category: catParam } }).catch(() => [] as string[]),
      fetchProductFieldValues({ data: { field: "surface", category: catParam } }).catch(() => [] as string[]),
      fetchProductFieldValues({ data: { field: "shape", category: catParam } }).catch(() => [] as string[]),
      fetchProductFieldValues({ data: { field: "collections", category: catParam } }).catch(() => [] as string[]),
      fetchProductFieldValues({ data: { field: "texture", category: catParam } }).catch(() => [] as string[]),
    ]).then(([colors, surfaces, shapes, collections, textures]) => {
      if (cancelled) return;
      const allColors = Array.from(new Set([...(catParam ? [] : PRODUCT_COLORS), ...colors])).filter(Boolean);
      const allTextures = Array.from(new Set([...(catParam ? [] : PRODUCT_TEXTURES), ...textures])).filter(Boolean);
      setColorOptions(allColors.map((c) => ({ value: c, label: c })));
      setSurfaceOptions(surfaces.filter(Boolean).map((s) => ({ value: s, label: s })));
      setShapeOptions(shapes.filter(Boolean).map((s) => ({ value: s, label: s })));
      setTextureOptions(allTextures.map((t) => ({ value: t, label: t })));
      setCollectionOptions(collections.filter(Boolean).map((c) => ({ value: c, label: c })));
    });
    return () => {
      cancelled = true;
    };
  }, [category]);

  useEffect(() => {
    fetchLpHeroImageFn()
      .then((res) => {
        if (res && res.heroImage) {
          setCurrentHeroImage(res.heroImage);
        }
      })
      .catch(() => {});
  }, []);
  async function handleSetHeroImage(imagePath: string) {
    try {
      await setLpHeroImageFn({ data: { imagePath } });
      setCurrentHeroImage(imagePath);
      toast.success("Đã đặt làm ảnh bìa Hero Trang chủ thành công!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật ảnh Hero");
    }
  }

  async function handleTogglePublic(productId: number, currentPublic: number) {
    const next = currentPublic === 1 ? 0 : 1;
    try {
      await toggleProductPublicFn({ data: { productId, isPublic: next } });
      toast.success(
        next === 1
          ? "Đã Bật hiển thị trên Thư viện!"
          : "Đã Ẩn khỏi Thư viện!",
      );
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật hiển thị");
    }
  }


  const [items, setItems] = useState<FlatMediaItem[]>([]);

  // ── Usage: mỗi storage key đang được tham chiếu ở đâu ──
  const [usageMap, setUsageMap] = useState<{
    usage: Record<string, ImageReference[]>;
  } | null>(null);
  const [usageDialogKey, setUsageDialogKey] = useState<string | null>(null);
  const [busyLbPublicId, setBusyLbPublicId] = useState<number | null>(null);
  const [editDescId, setEditDescId] = useState<number | null>(null);
  const [descDraft, setDescDraft] = useState("");
  const [savingDescId, setSavingDescId] = useState<number | null>(null);
  const [demoteKhoConfirmId, setDemoteKhoConfirmId] = useState<number | null>(null);
  const [busyDemoteKhoId, setBusyDemoteKhoId] = useState<number | null>(null);

  const storageKeyOf = (path: string): string => {
    const i = path.lastIndexOf("/");
    return i >= 0 ? path.slice(i + 1) : path;
  };

  useEffect(() => {
    const keys = [...new Set(items.map((it) => storageKeyOf(it.path)).filter(Boolean))];
    if (keys.length === 0) {
      setUsageMap(null);
      return;
    }
    let cancelled = false;
    fetchMediaUsageFn({ data: { keys } })
      .then((res) => {
        if (cancelled) return;
        setUsageMap({ usage: res.usage ?? {} });
      })
      .catch(() => {
        if (!cancelled) setUsageMap(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function handleToggleLookbookPublic(img: FlatMediaItem) {
    setBusyLbPublicId(img.id);
    try {
      const next = img.image_is_public === 1 ? 0 : 1;
      await setConceptImagePublicFn({ data: { id: img.id, is_public: next } });
      setItems((prev) => prev.map((it) => (it.id === img.id ? { ...it, image_is_public: next } : it)));
      toast.success(next === 1 ? "Đã hiển thị concept trên Landing Page Lookbook" : "Đã ẩn khỏi Landing Page Lookbook");
    } catch (err) {
      toast.error("Lỗi cập nhật Lookbook: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusyLbPublicId(null);
    }
  }

  function openDescEditor(img: FlatMediaItem) {
    setEditDescId(img.id);
    setDescDraft(img.ai_description || "");
  }

  async function handleSaveDescription(img: FlatMediaItem) {
    setSavingDescId(img.id);
    try {
      const text = descDraft.trim();
      await updateConceptDescriptionFn({ data: { id: img.id, ai_description: text } });
      setItems((prev) => prev.map((it) => (it.id === img.id ? { ...it, ai_description: text } : it)));
      setEditDescId(null);
      toast.success("Đã cập nhật mô tả");
    } catch (err) {
      toast.error("Lỗi lưu mô tả: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingDescId(null);
    }
  }

  async function handleDemoteFromKhoAnh(img: FlatMediaItem) {
    setBusyDemoteKhoId(img.id);
    try {
      await demoteConceptImageFn({ data: { id: img.id } });
      setItems((prev) => {
        let next = prev.map((it) => (it.id === img.id ? { ...it, kind: "normal" as const, image_is_public: 0, ai_description: "" } : it));
        if (tab === "concept") next = next.filter((it) => it.id !== img.id);
        return next;
      });
      setDemoteKhoConfirmId(null);
      toast.success("Đã hạ về thường — ảnh rời khỏi Lookbook, về Kho ảnh");
    } catch (err) {
      toast.error("Lỗi hạ loại ảnh: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusyDemoteKhoId(null);
    }
  }

  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, map: 0, concept: 0, featured: 0, unassigned: 0 });
  const [publicCounts, setPublicCounts] = useState({ all: 0, public: 0, hidden: 0 });
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Multi-select for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [busyBulk, setBusyBulk] = useState(false);
  const [bulkRoomPopoverOpen, setBulkRoomPopoverOpen] = useState(false);
  const [bulkPublicConfirmOpen, setBulkPublicConfirmOpen] = useState<null | { isPublic: number; count: number; productIds: number[] }>(null);
  const [sortPopoverOpen, setSortPopoverOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  // Two-step inline delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Lightbox preview
  const [previewItem, setPreviewItem] = useState<FlatMediaItem | null>(null);
  // Modal xem toàn bộ gallery của 1 sản phẩm
  const [galleryProduct, setGalleryProduct] = useState<{
    id: number;
    code: string;
    name: string;
    category?: string;
  } | null>(null);

  const gridTopRef = useRef<HTMLDivElement | null>(null);
  const [, startTransition] = useTransition();

  // Giữ ô tìm kiếm đồng bộ khi URL đổi (Back/Forward/share link)
  useEffect(() => {
    setSearch(searchParams.q ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.q]);

  // Debounce 300ms rồi commit q lên URL (fetch được kích bởi effect phía dưới)
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === (searchParams.q ?? "")) return;
    const timer = setTimeout(() => {
      patchFilters({ q: trimmed || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  function loadData() {
    fetchFlatMediaImagesFn({
      data: {
        tab,
        category: category === "all" ? undefined : category,
        search: searchParams.q || undefined,
        roomSlug: roomSlug === "all" ? undefined : roomSlug,
        publicFilter: publicFilter === "all" ? undefined : publicFilter,
        colors: selectedColors.length ? selectedColors : undefined,
        surfaces: selectedSurfaces.length ? selectedSurfaces : undefined,
        shapes: selectedShapes.length ? selectedShapes : undefined,
        textures: selectedTextures.length ? selectedTextures : undefined,
        collections: selectedCollections.length ? selectedCollections : undefined,
        sort,
        page,
        pageSize,
        usage,
        selected: searchParams.selected ?? undefined,
      },
    })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
        setCounts(res.counts);
        if (res.publicCounts) setPublicCounts(res.publicCounts);
        if (res.roomCounts) setRoomCounts(res.roomCounts);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Không tải được danh sách ảnh");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function syncCountsOnly() {
    fetchFlatMediaImagesFn({
      data: {
        tab,
        category: category === "all" ? undefined : category,
        roomSlug: roomSlug === "all" ? undefined : roomSlug,
        publicFilter: publicFilter === "all" ? undefined : publicFilter,
        colors: selectedColors.length ? selectedColors : undefined,
        surfaces: selectedSurfaces.length ? selectedSurfaces : undefined,
        shapes: selectedShapes.length ? selectedShapes : undefined,
        textures: selectedTextures.length ? selectedTextures : undefined,
        collections: selectedCollections.length ? selectedCollections : undefined,
        sort,
        pageSize: 1,
      },
    })
      .then((res) => {
        setCounts(res.counts);
        if (res.publicCounts) setPublicCounts(res.publicCounts);
        if (res.roomCounts) setRoomCounts(res.roomCounts);
      })
      .catch(() => {});
  }

  // Fetch dữ liệu theo toàn bộ filter/sort/search/page/pageSize (nguồn URL)
  // ⚠️ Dep phải là giá trị ỔN ĐỊNH về identity: dùng searchParams.colors
  // (mảng do router giữ, chỉ đổi khi URL đổi) — KHÔNG dùng biến `?? []`
  // suy ra mỗi render (làm effect chạy vô hạn).
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category, roomSlug, publicFilter, searchParams.colors, searchParams.surfaces, searchParams.shapes, searchParams.textures, searchParams.collections, sort, searchParams.q, searchParams.usage, searchParams.selected, page, pageSize]);

  function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > totalPages || newPage === page) return;
    gotoPage(newPage);
    gridTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handlePageSizeChange(newSize: number) {
    if (newSize === pageSize) return;
    patchFilters({ pageSize: newSize === 24 ? undefined : newSize });
  }

  async function handleQuickSetRoomTags(item: FlatMediaItem, slugs: ImageRoomTagSlug[]) {
    try {
      const updatedTags = await setImageRoomTagsDirectFn({
        data: {
          imageId: item.id,
          roomSlugs: slugs,
        },
      });
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== item.id) return i;
          return {
            ...i,
            kind: slugs.length > 0 && i.kind !== "concept" ? "concept" : i.kind,
            room_tags: updatedTags,
          };
        }),
      );
      toast.success("Đã cập nhật bối cảnh phòng");
      syncCountsOnly();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể cập nhật bối cảnh");
      throw err;
    }
  }

  async function handleBulkSetRoomTags(slugs: ImageRoomTagSlug[]) {
    if (selectedIds.size === 0 || slugs.length === 0 || busyBulk) return;
    const ids = items.filter((i) => selectedIds.has(i.asset_id) && i.id > 0).map((i) => i.id);
    if (!ids.length) {
      toast.error("Không có ảnh sản phẩm nào được chọn");
      return;
    }
    setBusyBulk(true);
    try {
      const res = await bulkSetProductImageRoomTagsFn({
        data: {
          imageIds: ids,
          roomSlugs: slugs,
          mode: "replace",
        },
      });
      toast.success(`Đã gán bối cảnh cho ${res.updated} ảnh`);
      setBulkRoomPopoverOpen(false);
      clearSelection();
      loadData();
      syncCountsOnly();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi gán bối cảnh hàng loạt");
    } finally {
      setBusyBulk(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllCurrentPage() {
    const pageIds = items.map((i) => i.asset_id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function getSelectedProductIds() {
    const pIds = new Set<number>();
    for (const item of items) {
      if (selectedIds.has(item.asset_id) && item.product_id > 0) {
        pIds.add(item.product_id);
      }
    }
    return Array.from(pIds);
  }

  function requestBulkSetPublic(isPublic: number) {
    if (selectedIds.size === 0 || busyBulk) return;
    const productIds = getSelectedProductIds();
    if (!productIds.length) {
      toast.error("Không tìm thấy sản phẩm tương ứng");
      return;
    }
    setBulkPublicConfirmOpen({
      isPublic,
      count: productIds.length,
      productIds,
    });
  }

  async function executeBulkSetPublic() {
    if (!bulkPublicConfirmOpen || busyBulk) return;
    const { isPublic, productIds } = bulkPublicConfirmOpen;
    setBusyBulk(true);
    try {
      await bulkSetProductsPublicFn({
        data: {
          productIds,
          is_public: isPublic,
        },
      });
      toast.success(
        isPublic === 1
          ? `Đã BẬT hiển thị ${productIds.length} sản phẩm lên Thư viện web!`
          : `Đã ẨN ${productIds.length} sản phẩm khỏi Thư viện web!`,
      );
      setItems((prev) =>
        prev.map((i) =>
          i.product_id != null && productIds.includes(i.product_id)
            ? { ...i, product_is_public: isPublic }
            : i,
        ),
      );
      clearSelection();
      syncCountsOnly();
      setBulkPublicConfirmOpen(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật hiển thị hàng loạt");
    } finally {
      setBusyBulk(false);
    }
  }
  async function executeBulkDelete() {
    if (selectedIds.size === 0 || busyBulk) return;
    setBusyBulk(true);
    const assetIds = Array.from(selectedIds);
    let successCount = 0;
    let failCount = 0;
    let usageCount = 0;
    try {
      await mapLimit(assetIds, 5, async (assetId) => {
        try {
          const res = await deleteMediaAssetFn({ data: { assetId } });
          if (res.deleted) usageCount += res.usages_removed;
          successCount++;
        } catch {
          failCount++;
        }
      });
      if (successCount > 0) {
        toast.success(
          usageCount > 0
            ? `Đã xoá ${successCount} MediaAsset khỏi kho lưu trữ · gỡ ${usageCount} usage`
            : `Đã xoá ${successCount} MediaAsset khỏi kho lưu trữ`,
        );
      }
      if (failCount > 0) {
        toast.error(`Có ${failCount} media xóa không thành công`);
      }
      clearSelection();
      setBulkDeleteConfirmOpen(false);
      loadData();
      syncCountsOnly();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi khi xóa hàng loạt");
    } finally {
      setBusyBulk(false);
    }
  }

  async function handleBulkSetKind(kind: ProductImageKind) {
    if (selectedIds.size === 0 || busyBulk) return;
    // Chỉ ảnh có usage product mới có id row product_images tương ứng.
    const ids = items
      .filter((i) => selectedIds.has(i.asset_id) && i.id > 0)
      .map((i) => i.id);
    if (!ids.length) {
      toast.error("Không có ảnh sản phẩm nào được chọn");
      return;
    }
    setBusyBulk(true);
    try {
      const res = await bulkSetProductImageKindFn({
        data: {
          imageIds: ids,
          kind,
        },
      });
      const label = kind === "map" ? "ảnh MAP" : kind === "concept" ? "ảnh Concept" : "chưa gán";
      toast.success(`Đã cập nhật ${res.updated} ảnh thành ${label}`);
      setItems((prev) =>
        prev.map((i) => (selectedIds.has(i.asset_id) ? { ...i, kind } : i)),
      );
      clearSelection();
      syncCountsOnly();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật hàng loạt");
    } finally {
      setBusyBulk(false);
    }
  }

  async function handleSingleSetKind(item: FlatMediaItem, targetKind: ProductImageKind) {
    if (item.kind === targetKind) return;
    startTransition(async () => {
      try {
        await setProductImageKindFn({
          data: {
            productId: item.product_id,
            imageId: item.id,
            kind: targetKind,
          },
        });
        const label = targetKind === "map" ? "ảnh MAP" : targetKind === "concept" ? "ảnh Concept" : "chưa gán";
        toast.success(`Đã đổi thành ${label}`);

        // Cập nhật tại chỗ (in-place) để giữ nguyên 100% vị trí cuộn
        setItems((prev) => {
          let updated = prev.map((i) => {
            if (targetKind === "map" && i.product_id === item.product_id && i.kind === "map") {
              return { ...i, kind: "normal" as ProductImageKind };
            }
            if (i.id === item.id) {
              return { ...i, kind: targetKind };
            }
            return i;
          });
          if (tab === "map" && targetKind !== "map") {
            updated = updated.filter((i) => i.id !== item.id);
          } else if (tab === "concept" && targetKind !== "concept") {
            updated = updated.filter((i) => i.id !== item.id);
          } else if (tab === "unassigned" && targetKind !== "normal") {
            updated = updated.filter((i) => i.id !== item.id);
          }
          return updated;
        });
        syncCountsOnly();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Không thể đổi loại ảnh");
      }
    });
  }

  async function handleDeleteImage(img: FlatMediaItem) {
    const assetId = img.asset_id;
    setDeletingId(assetId);
    try {
      const res = await deleteMediaAssetFn({ data: { assetId } });
      toast.success(
        res.usages_removed > 0
          ? `Đã xoá MediaAsset khỏi kho · gỡ ${res.usages_removed} usage`
          : "Đã xoá MediaAsset khỏi kho lưu trữ",
      );
      setConfirmDeleteId(null);

      setItems((prev) => prev.filter((i) => i.asset_id !== assetId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });

      if (previewItem?.asset_id === assetId) {
        setPreviewItem(null);
      }

      syncCountsOnly();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể xóa MediaAsset");
    } finally {
      setDeletingId(null);
    }
  }

  const allPageIds = items.map((i) => i.id);
  const allPageSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id));


  return (
    <div ref={gridTopRef} className="space-y-5 pb-28">
      {/* Workspace header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <PageHeader
          eyebrow="Media Workspace"
          title="Media"
          description="Quản lý toàn diện ảnh sản phẩm: phân loại MAP/Concept, bối cảnh phòng Lookbook, tuyển chọn trang chủ, và xem mỗi ảnh đang được dùng ở đâu."
        />
      </div>

      {/* Filter toolbar — Cấu trúc 2 tầng chuẩn Advisor Astra 6 + Sub-strip bối cảnh ngữ cảnh */}
      <div className="mb-5 space-y-3">
        {/* HÀNG 1: Tìm kiếm + Nhóm sản phẩm (Pills) */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search bar — 1 hàng full-width như tab Sản phẩm */}
          <div className="relative w-full min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && patchFilters({ q: search.trim() || undefined })}
              placeholder="Tìm mã SP, tên gạch..."
              className="h-10 w-full text-sm pl-10 pr-9 rounded-full bg-transparent border border-border/80 outline-none focus:border-terracotta/50 focus:ring-2 focus:ring-terracotta/15 text-foreground placeholder:text-muted-foreground/60"
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  patchFilters({ q: undefined });
                }}
                aria-label="Xoá tìm kiếm"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {/* HÀNG 1.5: Facet Filters (Màu, Bề mặt, Dáng, Vân, BST — tự động lọc theo danh mục) */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-dashed border-border/50">
          <FilterChip label="Nhóm" count={category !== "all" ? 1 : 0}>
            <MultiSelectFilter
              title="Chọn nhóm danh mục"
              options={PRODUCT_GROUPS.filter((g) => g.slug !== "tat-ca").map((g) => ({
                value: g.category,
                label: g.label,
              }))}
              selected={category !== "all" ? [category] : []}
              onChange={(next) => {
                const picked = next[next.length - 1];
                patchFilters({
                  category: picked ?? undefined,
                  colors: undefined,
                  surfaces: undefined,
                  shapes: undefined,
                  textures: undefined,
                  collections: undefined,
                });
              }}
              searchable
            />
          </FilterChip>
          <FilterChip label="Màu" count={selectedColors.length}>
            <MultiSelectFilter
              title="Chọn màu"
              options={colorOptions}
              selected={selectedColors}
              onChange={(next) => patchFilters({ colors: next.length ? next : undefined })}
              searchable
            />
          </FilterChip>
          <FilterChip label="Bề mặt" count={selectedSurfaces.length}>
            <MultiSelectFilter
              title="Chọn bề mặt"
              options={surfaceOptions}
              selected={selectedSurfaces}
              onChange={(next) => patchFilters({ surfaces: next.length ? next : undefined })}
              searchable
            />
          </FilterChip>
          <FilterChip label="Dáng" count={selectedShapes.length}>
            <MultiSelectFilter
              title="Chọn kiểu dáng"
              options={shapeOptions}
              selected={selectedShapes}
              onChange={(next) => patchFilters({ shapes: next.length ? next : undefined })}
              searchable
            />
          </FilterChip>
          <FilterChip label="Vân" count={selectedTextures.length}>
            <MultiSelectFilter
              title="Chọn hiệu ứng vân"
              options={textureOptions}
              selected={selectedTextures}
              onChange={(next) => patchFilters({ textures: next.length ? next : undefined })}
              searchable
            />
          </FilterChip>
          <FilterChip label="BST" count={selectedCollections.length}>
            <MultiSelectFilter
              title="Chọn bộ sưu tập"
              options={collectionOptions}
              selected={selectedCollections}
              onChange={(next) => patchFilters({ collections: next.length ? next : undefined })}
              searchable
            />
          </FilterChip>
        </div>

        {/* HÀNG 1.6: Chip các bộ lọc đang áp dụng — bỏ riêng từng cái hoặc xoá hết (giống tab Sản phẩm) */}
        {activeFilterCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-dashed border-border/50">
            {searchParams.q ? (
              <ActiveTag label="Xoá từ khoá tìm kiếm" onClear={() => patchFilters({ q: undefined })}>
                “{searchParams.q}”
              </ActiveTag>
            ) : null}
            {category !== "all" ? (
              <ActiveTag label="Xoá lọc nhóm" onClear={() => patchFilters({ category: undefined })}>
                Nhóm:{" "}
                {PRODUCT_GROUPS.find((g) => g.category === category)?.label ?? category}
              </ActiveTag>
            ) : null}
            {selectedColors.map((c) => (
              <ActiveTag
                key={`c-${c}`}
                label={`Xoá lọc màu ${c}`}
                onClear={() =>
                  patchFilters({
                    colors: selectedColors.filter((x) => x !== c),
                  })
                }
              >
                Màu: {c}
              </ActiveTag>
            ))}
            {selectedSurfaces.map((s) => (
              <ActiveTag
                key={`s-${s}`}
                label={`Xoá lọc bề mặt ${s}`}
                onClear={() =>
                  patchFilters({
                    surfaces: selectedSurfaces.filter((x) => x !== s),
                  })
                }
              >
                Bề mặt: {s}
              </ActiveTag>
            ))}
            {selectedShapes.map((s) => (
              <ActiveTag
                key={`shape-${s}`}
                label={`Xoá lọc kiểu dáng ${s}`}
                onClear={() =>
                  patchFilters({
                    shapes: selectedShapes.filter((x) => x !== s),
                  })
                }
              >
                Dáng: {s}
              </ActiveTag>
            ))}
            {selectedTextures.map((t) => (
              <ActiveTag
                key={`texture-${t}`}
                label={`Xoá lọc hiệu ứng vân ${t}`}
                onClear={() =>
                  patchFilters({
                    textures: selectedTextures.filter((x) => x !== t),
                  })
                }
              >
                Vân: {t}
              </ActiveTag>
            ))}
            {selectedCollections.map((e) => (
              <ActiveTag
                key={`collection-${e}`}
                label={`Xoá lọc bộ sưu tập ${e}`}
                onClear={() =>
                  patchFilters({
                    collections: selectedCollections.filter((x) => x !== e),
                  })
                }
              >
                BST: {e}
              </ActiveTag>
            ))}
            {roomSlug !== "all" ? (
              <ActiveTag
                label="Xoá lọc bối cảnh phòng"
                onClear={() => patchFilters({ roomSlug: undefined })}
              >
                Bối cảnh:{" "}
                {IMAGE_ROOM_TAGS.find((t) => t.id === roomSlug)?.label ?? roomSlug}
              </ActiveTag>
            ) : null}
            {publicFilter !== "all" ? (
              <ActiveTag
                label="Xoá lọc hiển thị web"
                onClear={() => patchFilters({ publicFilter: undefined })}
              >
                Web: {publicFilter === "public" ? "Hiện" : "Ẩn"}
              </ActiveTag>
            ) : null}
            {searchParams.selected != null ? (
              <ActiveTag
                label="Xoá lọc ảnh đã chọn"
                onClear={() => patchFilters({ selected: undefined })}
              >
                {searchParams.selected === "yes" ? "Đã chọn" : "Chưa chọn"}
              </ActiveTag>
            ) : null}
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-xs text-muted-foreground hover:text-terracotta transition-colors ml-1 cursor-pointer"
            >
              Xoá tất cả ({activeFilterCount})
            </button>
          </div>
        ) : null}

        {/* HÀNG 2: Tabs Loại ảnh (KIND) bên trái + Sắp xếp, Size trang, Thao tác bên phải */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5 border-t border-border/60 pt-2.5">
          {/* Segmented Control: KIND ảnh */}
          <div className="flex flex-wrap items-center bg-surface-strong/60 p-0.5 rounded-full border border-border/80 shrink-0">
            {TABS.filter((t) => t.key !== "featured").map((t) => {
              const active = tab === t.key;
              const count = counts[t.countKey];
              const isMapTab = t.key === "map";
              const isConceptTab = t.key === "concept";
              const isFeaturedTab = t.key === "featured";
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    patchFilters({ tab: t.key === "all" ? undefined : t.key, roomSlug: t.key !== "concept" ? undefined : roomSlug === "all" ? undefined : roomSlug, selected: undefined });
                    clearSelection();
                  }}
                  className={cn(
                    "inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer",
                    active
                      ? isMapTab
                        ? "bg-indigo-600 text-white font-semibold shadow-xs"
                        : isConceptTab
                          ? "bg-amber-600 text-white font-semibold shadow-xs"
                          : isFeaturedTab
                            ? "bg-terracotta text-white font-semibold shadow-xs"
                            : "bg-card text-foreground font-semibold shadow-xs ring-1 ring-black/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                  )}
                >
                  <span>{t.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px] tabular-nums font-bold",
                      active
                        ? "bg-white/20 text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sắp xếp, Trạng thái & Tiện ích phân trang */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Bộ lọc trạng thái Thư viện Web — Chỉ hiển thị khi đang ở tab "Chỉ ảnh MAP" */}
            {tab === "map" ? (
              <div className="flex bg-surface-strong/50 p-0.5 rounded-full border border-border/80 shrink-0 text-xs items-center animate-in fade-in-0 duration-150">
                <button
                  type="button"
                  onClick={() => patchFilters({ publicFilter: undefined })}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors cursor-pointer",
                    publicFilter === "all"
                      ? "bg-card text-foreground shadow-xs ring-1 ring-black/5 font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                  )}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => patchFilters({ publicFilter: "public" })}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors inline-flex items-center gap-1 cursor-pointer",
                    publicFilter === "public"
                      ? "bg-emerald-600 text-white shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                  )}
                >
                  <Globe className="size-2.5" />
                  <span>Hiện Web</span>
                  {publicCounts.public > 0 ? (
                    <span className={cn("text-[9px] px-1 rounded-full font-bold tabular-nums", publicFilter === "public" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground")}>
                      {publicCounts.public}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => patchFilters({ publicFilter: "hidden" })}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors inline-flex items-center gap-1 cursor-pointer",
                    publicFilter === "hidden"
                      ? "bg-card text-foreground shadow-xs ring-1 ring-black/5 font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                  )}
                >
                  <EyeOff className="size-2.5" />
                  <span>Ẩn Web</span>
                  {publicCounts.hidden > 0 ? (
                    <span className={cn("text-[9px] px-1 rounded-full font-bold tabular-nums", publicFilter === "hidden" ? "bg-black/10 text-foreground font-bold" : "bg-muted text-muted-foreground")}>
                      {publicCounts.hidden}
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}

            {/* Status — segmented: Tất cả | Used | Draft | Orphan */}
            <div
              className="flex items-center gap-0.5 bg-surface-strong/50 p-0.5 rounded-full border border-border/80 shrink-0 text-xs"
              title="Lọc theo trạng thái dùng của MediaAsset: Used = có ≥1 usage đang active (MAP/Thư viện/Lookbook public/Tuyển chọn/Đề xuất/Hero); Draft = có usage nhưng chưa active; Orphan = không nơi nào dùng"
            >
              {(
                [
                  { key: undefined, label: "Tất cả" },
                  { key: "used", label: "Used" },
                  { key: "draft", label: "Draft" },
                  { key: "orphan", label: "Orphan" },
                ] as const
              ).map(({ key, label }) => {
                const active = usage === (key ?? "all") || ((usage === undefined || usage === "all") && key === undefined);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => patchFilters({ usage: key })}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer",
                      active
                        ? key === "orphan"
                          ? "bg-terracotta text-white shadow-xs font-bold"
                          : "bg-card text-foreground shadow-xs ring-1 ring-black/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                    )}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                );
              })}
            </div>



            {/* Sắp xếp Popover gọn gàng */}
            <Popover open={sortPopoverOpen} onOpenChange={setSortPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-border/80 bg-card text-foreground hover:bg-surface-strong/60 transition-colors cursor-pointer"
                  title="Sắp xếp danh sách ảnh"
                >
                  <currentSortOption.icon className="size-3 text-muted-foreground" />
                  <span>{currentSortOption.label}</span>
                  <ChevronDown className="size-3 text-muted-foreground/60" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1 text-foreground" align="end">
                <div className="space-y-0.5">
                  {SORT_OPTIONS.map((opt) => {
                    const active = sort === opt.key;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          patchFilters({ sort: opt.key === "newest" ? undefined : opt.key });
                          setSortPopoverOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                          active
                            ? "bg-terracotta/10 text-terracotta font-semibold"
                            : "text-muted-foreground hover:bg-surface-strong hover:text-foreground",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="size-3.5" />
                          <span>{opt.label}</span>
                        </span>
                        {active ? <Check className="size-3 text-terracotta stroke-[2.5]" /> : null}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {/* Chọn kích thước trang (Page Size Selector) */}
            <div className="flex items-center bg-surface-strong/50 p-0.5 rounded-full border border-border/80 shrink-0 text-xs">
              {PAGE_SIZE_OPTIONS.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => handlePageSizeChange(sz)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                    pageSize === sz
                      ? "bg-card font-semibold text-foreground shadow-xs ring-1 ring-black/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                  )}
                >
                  {sz}/tr
                </button>
              ))}
            </div>

            {/* Chọn tất cả ảnh trang này */}
            {allPageIds.length > 0 ? (
              <button
                type="button"
                onClick={selectAllCurrentPage}
                className="h-7 px-2.5 rounded-full border border-border/80 bg-card hover:bg-surface-strong/60 text-[11px] font-medium text-foreground inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {allPageSelected ? (
                  <>
                    <CheckSquare className="size-3 text-terracotta" />
                    <span>Bỏ chọn</span>
                  </>
                ) : (
                  <>
                    <Square className="size-3" />
                    <span>Chọn trang ({allPageIds.length})</span>
                  </>
                )}
              </button>
            ) : null}

            {/* Refresh */}
            <button
              type="button"
              onClick={() => loadData()}
              title="Tải lại dữ liệu"
              className="size-7 grid place-items-center rounded-full border border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-surface-strong/60 transition-colors cursor-pointer"
            >
              <RefreshCw className={cn("size-3", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* HÀNG 3: Dải Bối cảnh Lookbook ngữ cảnh (Chỉ mở khi ở Tab Concept hoặc khi đang lọc roomSlug) */}
        {(tab === "concept" || roomSlug !== "all") ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-dashed border-border/60 animate-in fade-in-0 slide-in-from-top-1 duration-150">
            <button
              type="button"
              onClick={() => patchFilters({ tab: "concept", roomSlug: undefined })}
              className={cn(
                "inline-flex items-center gap-1.5 h-7 rounded-full px-3 text-xs font-medium transition-colors cursor-pointer",
                tab === "concept" && roomSlug === "all"
                  ? "bg-amber-600 text-white font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-surface-strong/60 hover:text-foreground",
              )}
            >
              <span>Tất cả bối cảnh</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] tabular-nums font-bold",
                  tab === "concept" && roomSlug === "all"
                    ? "bg-white/25 text-white"
                    : "bg-surface-strong text-muted-foreground",
                )}
              >
                {counts.concept}
              </span>
            </button>
            {IMAGE_ROOM_TAGS.map((tag) => {
              const active = tab === "concept" && roomSlug === tag.id;
              const tagCount = roomCounts[tag.id] || 0;
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => patchFilters({ tab: "concept", roomSlug: tag.id })}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-7 rounded-full px-3 text-xs font-medium transition-colors cursor-pointer",
                    active
                      ? "bg-amber-600 text-white font-semibold shadow-xs"
                      : "text-muted-foreground hover:bg-surface-strong/60 hover:text-foreground",
                  )}
                >
                  <span>{tag.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px] tabular-nums font-bold",
                      active
                        ? "bg-white/25 text-white"
                        : "bg-surface-strong text-muted-foreground",
                    )}
                  >
                    {tagCount}
                  </span>
                </button>
              );
            })}
            {roomSlug !== "all" ? (
              <button
                type="button"
                onClick={() => patchFilters({ roomSlug: undefined })}
                className="h-7 px-2.5 rounded-full text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
              >
                Xóa lọc bối cảnh
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Banner ngữ cảnh khi lọc Orphan */}
      {usage === "orphan" ? (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200 animate-in fade-in-0 duration-150">
          <div className="flex items-start gap-2.5">
            <Info className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold text-foreground">MediaAsset không còn nơi nào dùng (Orphan)</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Không bảng nào khác (sản phẩm, đề xuất vật liệu, Hero trang chủ) trỏ tới những file
                này — chúng chỉ còn tồn tại trong kho media. File vẫn nằm nguyên trong kho lưu trữ;
                xoá ở đây là xoá thật, không thể hoàn tác. Bấm chip trên ảnh để xem chi tiết nơi
                đang dùng.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => patchFilters({ usage: undefined })}
            className="shrink-0 rounded-lg border border-amber-500/30 bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-surface-strong transition-colors cursor-pointer"
          >
            Xem tất cả ảnh
          </button>
        </div>
      ) : null}

      {/* Main Flat Media Grid */}
      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5">
          {Array.from({ length: Math.min(pageSize, 10) }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xs animate-pulse"
            >
              <div className="aspect-4/3 w-full bg-muted/60" />
              <div className="p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-3 w-16 rounded bg-muted/60" />
                  <div className="h-2.5 w-10 rounded bg-muted/40" />
                </div>
                <div className="h-2.5 w-3/4 rounded bg-muted/40" />
                <div className="pt-2 flex items-center justify-between border-t border-border/40">
                  <div className="h-4 w-14 rounded bg-muted/50" />
                  <div className="h-4 w-5 rounded bg-muted/40" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <ImageIcon className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold text-foreground">Không tìm thấy ảnh nào phù hợp</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            {usage === "orphan"
              ? "Không có MediaAsset nào rơi vào trạng thái Orphan — mọi file đều đang được ít nhất một nơi dùng. Gỡ ảnh khỏi sản phẩm/đề xuất vật liệu/Hero để file xuất hiện ở đây."
              : hasActiveFilters
                ? "Hãy thử bỏ bớt bộ lọc màu, nhóm sản phẩm, hoặc từ khóa tìm kiếm để xem thêm kết quả."
                : "Chưa có ảnh nào trong mục này."}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetAllFilters}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-strong shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="size-3 text-muted-foreground" />
              <span>Đặt lại tất cả bộ lọc</span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5">
          {items.map((img) => {
            const isSelected = selectedIds.has(img.asset_id);
            const hasProductUsage = img.id > 0;
            const isMap = img.kind === "map";
            const isConcept = img.kind === "concept";
            const isConfirmingDelete = confirmDeleteId === img.asset_id;
            const isDeletingThis = deletingId === img.asset_id;

            return (
              <div
                key={img.asset_id}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all duration-150 shadow-2xs",
                  isSelected
                    ? "border-terracotta ring-2 ring-terracotta/25 shadow-xs"
                    : "border-border/70 hover:border-border hover:shadow-xs",
                )}
              >
                {/* Image Container */}
                <div className="relative aspect-4/3 w-full overflow-hidden bg-muted/40">
                  <img
                    src={img.path}
                    alt={img.caption || img.product_code || img.storage_key}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-200 group-hover:scale-103"
                  />

                  {/* Multi-select Checkbox (top-left) */}
                  <button
                    type="button"
                    onClick={() => toggleSelect(img.asset_id)}
                    aria-label="Chọn ảnh này"
                    className={cn(
                      "absolute left-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-md transition-all cursor-pointer",
                      isSelected
                        ? "bg-terracotta text-white shadow-xs"
                        : "bg-black/40 text-white/80 backdrop-blur-xs hover:bg-black/60",
                    )}
                  >
                    {isSelected ? (
                      <Check className="size-3.5 stroke-[3]" />
                    ) : (
                      <Square className="size-3.5" />
                    )}
                  </button>

                  {/* Badge (top-right) — Hero / Thư viện / MAP / Concept */}
                  <div className="absolute right-1.5 top-1.5 z-10 flex flex-col items-end gap-1">
                    {img.path === currentHeroImage ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-terracotta px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                        <Sparkles className="size-2.5" />
                        Hero
                      </span>
                    ) : null}
                    {img.featured_rank != null && img.featured_rank >= 1 && img.featured_rank <= 12 ? (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-terracotta/95 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                        <Sparkles className="size-2.5" />
                        #{img.featured_rank}
                      </span>
                    ) : null}
                    {img.product_is_public === 1 && tab === "map" ? (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                        <Globe className="size-2.5" />
                        Thư viện
                      </span>
                    ) : null}
                    {isMap ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                        <Grid className="size-2.5" />
                        MAP
                      </span>
                    ) : isConcept ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                        <Sparkles className="size-2.5" />
                        Concept
                      </span>
                    ) : null}
                  </div>

                  {/* Quick Zoom Preview button */}
                  <button
                    type="button"
                    onClick={() => setPreviewItem(img)}
                    title="Xem phóng to ảnh"
                    className="absolute bottom-1.5 right-1.5 z-10 hidden size-6 items-center justify-center rounded-md bg-black/50 text-white backdrop-blur-xs transition-opacity hover:bg-black/75 group-hover:flex cursor-pointer"
                  >
                    <Maximize2 className="size-3" />
                  </button>
                </div>

                {/* ── Asset Identity & Usage ── */}
                <div className="flex flex-1 flex-col justify-between p-2.5">
                  <div>
                    {/* Asset header: hash + status badge */}
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <p
                          className="truncate font-mono text-[11px] font-semibold text-foreground"
                          title={`${img.storage_key} · Asset #${img.asset_id}`}
                        >
                          {img.storage_key.slice(0, 12)}…
                        </p>
                        <p className="mt-0.5 text-[9px] text-muted-foreground/70">
                          Asset #{img.asset_id} · {img.created_at.slice(0, 10)}
                        </p>
                        {img.width && img.height ? (
                          <p className="mt-0.5 text-[9px] text-muted-foreground/70">
                            {img.width}×{img.height}
                            {formatFileSize(img.file_size) ? ` · ${formatFileSize(img.file_size)}` : ""}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                          img.status === "orphan"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : img.status === "draft"
                              ? "bg-surface-strong text-muted-foreground"
                              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                        )}
                      >
                        {img.status}
                      </span>
                    </div>

                    {/* Usage breakdown — prominent list */}
                    <button
                      type="button"
                      onClick={() => setUsageDialogKey(img.storage_key)}
                      title="Xem chi tiết nơi đang dùng"
                      className="mt-1.5 w-full rounded-md border border-border/60 bg-surface-strong/40 px-2 py-1.5 text-left transition-colors hover:bg-surface-strong/80 cursor-pointer"
                    >
                      {img.usage_count > 0 ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                          {img.usage_groups.product > 0 && (
                            <span className="text-foreground">
                              <span className="font-semibold">{img.usage_groups.product}</span>{" "}
                              <span className="text-muted-foreground">Sản phẩm</span>
                            </span>
                          )}
                          {img.usage_groups.lookbook > 0 && (
                            <span className="text-foreground">
                              <span className="font-semibold">{img.usage_groups.lookbook}</span>{" "}
                              <span className="text-muted-foreground">Lookbook</span>
                            </span>
                          )}
                          {img.usage_groups.featured > 0 && (
                            <span className="text-foreground">
                              <span className="font-semibold">{img.usage_groups.featured}</span>{" "}
                              <span className="text-muted-foreground">Tuyển chọn</span>
                            </span>
                          )}
                          {img.usage_groups.mapping > 0 && (
                            <span className="text-foreground">
                              <span className="font-semibold">{img.usage_groups.mapping}</span>{" "}
                              <span className="text-muted-foreground">Đề xuất</span>
                            </span>
                          )}
                          {img.usage_groups.hero > 0 && (
                            <span className="text-foreground">
                              <span className="font-semibold">{img.usage_groups.hero}</span>{" "}
                              <span className="text-muted-foreground">Hero</span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] italic text-muted-foreground/60">
                          Không nơi nào dùng
                        </span>
                      )}
                    </button>

                    {/* Representative product (secondary, muted) */}
                    {hasProductUsage ? (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setGalleryProduct({
                              id: img.product_id,
                              code: img.product_code,
                              name: img.product_name,
                              category: img.product_category,
                            })
                          }
                          title="Xem toàn bộ ảnh của sản phẩm này"
                          className="inline-flex items-center gap-1 truncate text-[10px] text-muted-foreground hover:text-terracotta hover:underline cursor-pointer"
                        >
                          <Images className="size-3 shrink-0" />
                          <span className="font-mono font-medium">{img.product_code}</span>
                          <span className="truncate">{img.product_name}</span>
                        </button>
                      </div>
                    ) : null}

                    {/* Room tags (Lookbook) */}
                    {hasProductUsage && (isConcept || img.room_tags.length > 0) ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {img.room_tags.map((tag) => (
                          <span
                            key={tag.room_slug}
                            className="rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-300"
                          >
                            {IMAGE_ROOM_TAGS.find((option) => option.id === tag.room_slug)?.label ??
                              tag.room_slug}
                          </span>
                        ))}
                        <QuickRoomTagPopover
                          item={img}
                          onSave={(slugs) => handleQuickSetRoomTags(img, slugs)}
                        />
                      </div>
                    ) : null}
                  </div>

                  {/* Lookbook (Concept) controls */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {hasProductUsage && isConcept ? (
                      <>
                        <button
                          type="button"
                          disabled={busyLbPublicId === img.id}
                          onClick={() => void handleToggleLookbookPublic(img)}
                          title={img.image_is_public === 1 ? "Đang hiển thị trên Landing Page Lookbook (Bấm để ẩn)" : "Đang ẩn trên Landing Page Lookbook (Bấm để hiển thị)"}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold border transition-all cursor-pointer disabled:opacity-50",
                            img.image_is_public === 1
                              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                              : "bg-surface-strong/60 border-border/80 text-muted-foreground/70 hover:text-emerald-600",
                          )}
                        >
                          {img.image_is_public === 1 ? <Check className="size-2.5" /> : <EyeOff className="size-2.5" />}
                          <span>{img.image_is_public === 1 ? "LD-page" : "Ẩn LD"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openDescEditor(img)}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground border border-border/70 bg-surface-strong/60 hover:text-foreground hover:bg-surface-strong transition-colors cursor-pointer"
                          title="Mô tả concept"
                          aria-label="Mô tả concept"
                        >
                          <Sparkles className="size-2.5" />
                          <span>Mô tả</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDemoteKhoConfirmId(img.id)}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground border border-border/70 bg-surface-strong/60 hover:text-red-600 hover:border-red-500/30 transition-colors cursor-pointer"
                          title="Hạ về thường (rời khỏi Lookbook)"
                          aria-label="Hạ về thường"
                        >
                          <Tag className="size-2.5" />
                          <span>Hạ về thường</span>
                        </button>
                      </>
                    ) : null}
                  </div>

                  {isConcept && editDescId === img.id ? (
                    <div className="mt-1.5 rounded-lg bg-surface-strong/70 p-1.5 text-[11px]">
                      <textarea
                        value={descDraft}
                        onChange={(e) => setDescDraft(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:border-terracotta"
                        placeholder="Mô tả concept (AI-generated, có thể chỉnh sửa)"
                      />
                      <div className="mt-1 flex items-center justify-end gap-1.5">
                        <button type="button" onClick={() => setEditDescId(null)} className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer">
                          Hủy
                        </button>
                        <button
                          type="button"
                          disabled={savingDescId === img.id}
                          onClick={() => void handleSaveDescription(img)}
                          className="rounded-md bg-terracotta px-2 py-1 text-[10px] font-bold text-white hover:bg-terracotta/90 disabled:opacity-50 cursor-pointer"
                        >
                          {savingDescId === img.id ? "Đang lưu…" : "Lưu mô tả"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {isConcept && demoteKhoConfirmId === img.id ? (
                    <div className="mt-1.5 rounded-lg bg-red-500/10 p-1.5 text-[10px]">
                      <span className="font-semibold text-red-600 dark:text-red-400">Hạ về thường?</span>
                      <p className="mt-0.5 text-muted-foreground">
                        Ảnh sẽ rời khỏi Concept/Lookbook và trở lại trạng thái ảnh thường.
                      </p>
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busyDemoteKhoId === img.id}
                          onClick={() => void handleDemoteFromKhoAnh(img)}
                          className="flex-1 rounded bg-red-600 py-1 font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                        >
                          {busyDemoteKhoId === img.id ? "Đang hạ…" : "Xác nhận hạ"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDemoteKhoConfirmId(null)}
                          className="rounded border border-border bg-card px-2 py-1 font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Action Toolbar Below Image */}
                  <div className="mt-2 flex flex-col gap-1.5 border-t border-border/60 pt-2 text-xs">
                    {/* Inline Delete 2-step confirm */}
                    {isConfirmingDelete ? (
                      <div className="flex flex-col gap-1 rounded-lg bg-red-500/10 p-1.5 text-[10px]">
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {img.usage_count > 0
                            ? `Xóa MediaAsset này? (đang dùng ở ${img.usage_count} nơi)`
                            : "Xóa MediaAsset này?"}
                        </span>
                        {img.usage_count > 0 ? (
                          <button
                            type="button"
                            onClick={() => setUsageDialogKey(img.storage_key)}
                            className="text-left text-[10px] text-red-700 dark:text-red-300 underline cursor-pointer"
                          >
                            Xem {img.usage_count} nơi đang dùng trước khi xóa
                          </button>
                        ) : null}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isDeletingThis}
                            onClick={() => void handleDeleteImage(img)}
                            className="flex-1 rounded bg-red-600 py-1 font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                          >
                            {isDeletingThis ? "Đang xóa…" : "Xóa vĩnh viễn"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded border border-border bg-card px-2 py-1 font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            Không xóa
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-1">
                        {/* Pure Icon-Based Contextual Actions (Click directly on icon to Toggle ON/OFF) */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {hasProductUsage ? (
                            <>
                              {tab === "map" ? (
                            <>
                              {/* Toggle Thư viện icon button (Green on, Gray off) */}
                              <button
                                type="button"
                                onClick={() => handleTogglePublic(img.product_id, img.product_is_public)}
                                title={img.product_is_public === 1 ? "Đang hiển thị trên Thư viện (Bấm để Ẩn)" : "Đang ẩn khỏi Thư viện (Bấm để hiển thị)"}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer border",
                                  img.product_is_public === 1
                                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 shadow-2xs"
                                    : "bg-surface-strong/60 border-border/80 text-muted-foreground/60 hover:text-emerald-600 hover:border-emerald-500/30",
                                )}
                              >
                                <Globe className={cn("size-3.5", img.product_is_public === 1 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/60")} />
                                <span>{img.product_is_public === 1 ? "Thư viện" : "Ẩn"}</span>
                              </button>

                              {/* Popover gán 12 vị trí Tuyển chọn */}
                              <QuickFeaturedRankPopover
                                item={img}
                                onUpdated={() => loadData()}
                              />

                              {/* Toggle MAP icon button (Indigo on, Click to turn off) */}
                              <button
                                type="button"
                                onClick={() => handleSingleSetKind(img, isMap ? "normal" : "map")}
                                title={isMap ? "Đang là ảnh MAP (Bấm để tắt)" : "Gán làm ảnh MAP"}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer border",
                                  isMap
                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                                    : "bg-surface-strong/60 border-border/80 text-muted-foreground/60 hover:bg-indigo-50 hover:text-indigo-600",
                                )}
                              >
                                <Grid className="size-3.5" />
                                <span>MAP</span>
                              </button>
                            </>
                          ) : tab === "featured" ? (
                            <>
                              {/* Popover đổi/gỡ 12 vị trí Tuyển chọn */}
                              <QuickFeaturedRankPopover
                                item={img}
                                onUpdated={() => loadData()}
                              />
                              {/* Toggle MAP icon button */}
                              <button
                                type="button"
                                onClick={() => handleSingleSetKind(img, isMap ? "normal" : "map")}
                                title={isMap ? "Đang là ảnh MAP (Bấm để tắt)" : "Gán làm ảnh MAP"}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer border",
                                  isMap
                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                                    : "bg-surface-strong/60 border-border/80 text-muted-foreground/60 hover:bg-indigo-50 hover:text-indigo-600",
                                )}
                              >
                                <Grid className="size-3.5" />
                                <span>MAP</span>
                              </button>
                            </>
                          ) : tab === "concept" ? (
                            <>
                              {/* 1. Hero icon button (Terracotta on, Gray off) */}
                              <button
                                type="button"
                                onClick={() => handleSetHeroImage(img.path === currentHeroImage ? "" : img.path)}
                                title={img.path === currentHeroImage ? "Đang là ảnh bìa Hero Trang chủ (Bấm để tắt)" : "Đặt làm ảnh bìa Hero Trang chủ"}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer border",
                                  img.path === currentHeroImage
                                    ? "bg-terracotta text-white border-terracotta shadow-2xs"
                                    : "bg-surface-strong/60 border-border/80 text-muted-foreground/60 hover:text-terracotta hover:border-terracotta/30",
                                )}
                              >
                                <Sparkles className="size-3.5" />
                                <span>{img.path === currentHeroImage ? "★ Hero" : "Hero"}</span>
                              </button>

                              {/* 2. Toggle Concept icon button (Amber on, Click to turn off) */}
                              <button
                                type="button"
                                onClick={() => handleSingleSetKind(img, isConcept ? "normal" : "concept")}
                                title={isConcept ? "Đang là ảnh Concept (Bấm để tắt)" : "Gán làm ảnh Concept"}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer border",
                                  isConcept
                                    ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                                    : "bg-surface-strong/60 border-border/80 text-muted-foreground/60 hover:bg-amber-50 hover:text-amber-600",
                                )}
                              >
                                <Sparkles className="size-3.5" />
                                <span>Concept</span>
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Tab Tất cả ảnh / Chưa gán thẻ */}
                              <button
                                type="button"
                                onClick={() => handleSingleSetKind(img, isMap ? "normal" : "map")}
                                title={isMap ? "Đang là MAP (Bấm để tắt)" : "Gán làm MAP"}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer border",
                                  isMap
                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                                    : "bg-surface-strong/60 border-border/80 text-muted-foreground/60 hover:bg-indigo-50 hover:text-indigo-600",
                                )}
                              >
                                <Grid className="size-3.5" />
                                <span>MAP</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSingleSetKind(img, isConcept ? "normal" : "concept")}
                                title={isConcept ? "Đang là Concept (Bấm để tắt)" : "Gán làm Concept"}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer border",
                                  isConcept
                                    ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                                    : "bg-surface-strong/60 border-border/80 text-muted-foreground/60 hover:bg-amber-50 hover:text-amber-600",
                                )}
                              >
                                <Sparkles className="size-3.5" />
                                <span>Concept</span>
                              </button>
                              {isMap ? (
                                <QuickFeaturedRankPopover
                                  item={img}
                                  onUpdated={() => loadData()}
                                />
                              ) : null}
                              {isConcept ? (
                                <button
                                  type="button"
                                  onClick={() => handleSetHeroImage(img.path === currentHeroImage ? "" : img.path)}
                                  title={img.path === currentHeroImage ? "Đang là ảnh bìa Hero (Bấm để tắt)" : "Đặt làm ảnh bìa Hero Trang chủ"}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer border",
                                    img.path === currentHeroImage
                                      ? "bg-terracotta text-white border-terracotta font-bold"
                                      : "bg-surface-strong/60 border-border/80 text-muted-foreground/60 hover:text-terracotta",
                                  )}
                                >
                                  <Sparkles className="size-3.5" />
                                  <span>{img.path === currentHeroImage ? "★ Hero" : "Hero"}</span>
                                </button>
                              ) : null}
                            </>
                          )}
                            </>
                          ) : null}
                        </div>
                        {/* Trash icon */}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(img.asset_id)}
                          title="Xóa MediaAsset và mọi usage của nó"
                          className="grid size-6 place-items-center rounded text-muted-foreground/60 transition-colors hover:bg-red-500/15 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PaginationBar
        page={page}
        total={total}
        pageSize={pageSize}
        totalPages={totalPages}
        loading={loading}
        itemNoun="ảnh"
        onPageChange={handlePageChange}
      />

      {/* Floating Action Bar (Bulk Selection) */}
      {selectedIds.size > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 safe-pb">
          <div className="flex items-center gap-2 rounded-2xl bg-foreground/95 px-3 py-2 text-background shadow-xl ring-1 ring-white/10 backdrop-blur-md">
            <div className="flex items-center gap-1.5 pl-1 pr-2 border-r border-white/15 text-xs font-semibold">
              <span className="grid size-5 place-items-center rounded-full bg-terracotta text-[10px] text-white">
                {selectedIds.size}
              </span>
              <span>ảnh đã chọn</span>
            </div>
            {/* 1. Bulk Bật Thư viện Web (Chỉ hiện khi ở tab MAP hoặc khi có ảnh MAP) */}
            {tab === "map" ? (
              <>
                <button
                  type="button"
                  disabled={busyBulk}
                  onClick={() => requestBulkSetPublic(1)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  <Globe className="size-3.5" />
                  <span>Bật Thư viện</span>
                </button>

                {/* 2. Bulk Ẩn khỏi Thư viện */}
                <button
                  type="button"
                  disabled={busyBulk}
                  onClick={() => requestBulkSetPublic(0)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50 cursor-pointer"
                >
                  <EyeOff className="size-3.5" />
                  <span>Ẩn Thư viện</span>
                </button>
              </>
            ) : null}
            {/* Bulk set MAP */}
            <button
              type="button"
              disabled={busyBulk}
              onClick={() => handleBulkSetKind("map")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <Grid className="size-3.5" />
              <span>Gán MAP</span>
            </button>

            {/* Bulk set Concept */}
            <button
              type="button"
              disabled={busyBulk}
              onClick={() => handleBulkSetKind("concept")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="size-3.5" />
              <span>Gán Concept</span>
            </button>

            {/* Bulk set Room Tags Popover */}
            <BulkRoomTagPopover
              selectedCount={selectedIds.size}
              onApply={handleBulkSetRoomTags}
              disabled={busyBulk}
              open={bulkRoomPopoverOpen}
              onOpenChange={setBulkRoomPopoverOpen}
            />
            {/* Bulk clear tag */}
            <button
              type="button"
              disabled={busyBulk}
              onClick={() => handleBulkSetKind("normal")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50 cursor-pointer"
            >
              <span>Bỏ gán thẻ</span>
            </button>
            {/* Bulk Delete */}
            <button
              type="button"
              disabled={busyBulk}
              onClick={() => setBulkDeleteConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600/90 hover:bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
              title="Xóa các ảnh đã chọn"
            >
              <Trash2 className="size-3.5" />
              <span>Xóa ({selectedIds.size})</span>
            </button>

            {/* Deselect All */}
            <button
              type="button"
              onClick={clearSelection}
              disabled={busyBulk}
              title="Bỏ chọn tất cả"
              className="ml-1 grid size-7 place-items-center rounded-full text-white/70 hover:bg-white/15 hover:text-white cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
      {/* Dialog Xác nhận Thao tác Hàng loạt lên Thư viện Web */}
      <Dialog open={Boolean(bulkPublicConfirmOpen)} onOpenChange={(o) => !o && setBulkPublicConfirmOpen(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              {bulkPublicConfirmOpen?.isPublic === 1 ? (
                <>
                  <Globe className="size-5 text-emerald-600" />
                  <span>Xác nhận Bật Thư viện web</span>
                </>
              ) : (
                <>
                  <EyeOff className="size-5 text-amber-600" />
                  <span>Xác nhận Ẩn khỏi Thư viện web</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">
            {bulkPublicConfirmOpen?.isPublic === 1 ? (
              <>
                Bạn có chắc chắn muốn <b>BẬT hiển thị {bulkPublicConfirmOpen?.count} sản phẩm</b> đã chọn lên Thư viện mã gạch công khai?
              </>
            ) : (
              <>
                Bạn có chắc chắn muốn <b>ẨN {bulkPublicConfirmOpen?.count} sản phẩm</b> đã chọn khỏi Thư viện mã gạch công khai?
              </>
            )}
          </p>
          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={busyBulk}
              onClick={() => setBulkPublicConfirmOpen(null)}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-strong transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              disabled={busyBulk}
              onClick={executeBulkSetPublic}
              className={cn(
                "rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5",
                bulkPublicConfirmOpen?.isPublic === 1 ? "bg-emerald-600" : "bg-red-600",
              )}
            >
              {busyBulk ? <Loader2 className="size-3.5 animate-spin" /> : null}
              <span>
                {bulkPublicConfirmOpen?.isPublic === 1 ? "Đồng ý Bật Thư viện" : "Đồng ý Ẩn Thư viện"}
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Dialog Xác nhận Xóa Hàng loạt ảnh */}
      <Dialog open={bulkDeleteConfirmOpen} onOpenChange={(o) => !o && !busyBulk && setBulkDeleteConfirmOpen(false)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-red-600 dark:text-red-400">
              <Trash2 className="size-5" />
              <span>Xác nhận xóa vĩnh viễn {selectedIds.size} ảnh</span>
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground mt-2 space-y-2">
            <p>
              Bạn có chắc chắn muốn xóa <b>{selectedIds.size} ảnh đã chọn</b>?
            </p>
            <p className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 p-2.5 rounded-lg">
              Lưu ý: Ảnh sẽ bị gỡ khỏi sản phẩm. File trong kho lưu trữ chỉ bị xoá khi không còn bảng nào khác (đề xuất vật liệu, Hero trang chủ, sản phẩm khác) trỏ tới. Hành động này không thể hoàn tác.
            </p>
          </div>
          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={busyBulk}
              onClick={() => setBulkDeleteConfirmOpen(false)}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-strong transition-colors cursor-pointer"
            >
              Không xóa
            </button>
            <button
              type="button"
              disabled={busyBulk}
              onClick={executeBulkDelete}
              className="rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition-opacity disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
            >
              {busyBulk ? <Loader2 className="size-3.5 animate-spin" /> : null}
              <span>Xóa vĩnh viễn {selectedIds.size} ảnh</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox Preview Dialog */}
      <Dialog open={Boolean(previewItem)} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          {previewItem ? (
            <div>
              <div className="relative aspect-16/10 w-full bg-black/95">
                <img
                  src={previewItem.path}
                  alt={previewItem.product_code || previewItem.storage_key}
                  className="size-full object-contain"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-base font-bold text-foreground font-mono">
                      {previewItem.product_code || `MediaAsset #${previewItem.asset_id}`}
                    </DialogTitle>
                    {previewItem.id > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const prod = {
                            id: previewItem.product_id,
                            code: previewItem.product_code,
                            name: previewItem.product_name,
                            category: previewItem.product_category,
                          };
                          setPreviewItem(null);
                          setGalleryProduct(prod);
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-surface-strong px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-terracotta hover:text-white transition-colors cursor-pointer"
                      >
                        <Images className="size-3" />
                        <span>Mở toàn bộ gallery của SP</span>
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {previewItem.id > 0
                      ? `${previewItem.product_name} · ${previewItem.product_category || "Chưa phân loại"}`
                      : previewItem.storage_key}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {previewItem.id > 0 ? (
                    <>
                      {/* 1. Toggle Thư viện icon button in modal */}
                      <button
                        type="button"
                        onClick={() => {
                          void handleTogglePublic(previewItem.product_id, previewItem.product_is_public);
                          setPreviewItem((prev) =>
                            prev ? { ...prev, product_is_public: prev.product_is_public === 1 ? 0 : 1 } : null,
                          );
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all shadow-xs cursor-pointer border",
                          previewItem.product_is_public === 1
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-surface-strong border-border text-muted-foreground hover:text-emerald-600 hover:border-emerald-500/40",
                        )}
                      >
                        <Globe className="size-3.5" />
                        <span>{previewItem.product_is_public === 1 ? "Thư viện: Bật" : "Thư viện: Ẩn"}</span>
                      </button>
                    </>
                  ) : null}

                  {/* 2. Hero Banner Button */}
                  <button
                    type="button"
                    onClick={() => handleSetHeroImage(previewItem.path)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all shadow-xs cursor-pointer border",
                      previewItem.path === currentHeroImage
                        ? "bg-terracotta text-white border-terracotta"
                        : "bg-surface-strong border-border text-muted-foreground hover:text-terracotta hover:border-terracotta/40",
                    )}
                  >
                    <Sparkles className="size-3.5" />
                    <span>
                      {previewItem.path === currentHeroImage
                        ? "Đang là Hero"
                        : "Đặt làm Hero"}
                    </span>
                  </button>

                  {previewItem.id > 0 ? (
                    <>
                      {/* 3. Popover gán Tuyển chọn */}
                      <QuickFeaturedRankPopover
                        item={previewItem}
                        onUpdated={() => {
                          loadData();
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleSingleSetKind(
                            previewItem,
                            previewItem.kind === "map" ? "normal" : "map",
                          )
                        }
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer",
                          previewItem.kind === "map"
                            ? "bg-indigo-600 text-white"
                            : "border border-border text-muted-foreground hover:bg-accent",
                        )}
                      >
                        MAP
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSingleSetKind(
                            previewItem,
                            previewItem.kind === "concept" ? "normal" : "concept",
                          )
                        }
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer",
                          previewItem.kind === "concept"
                            ? "bg-amber-600 text-white"
                            : "border border-border text-muted-foreground hover:bg-accent",
                        )}
                      >
                        Concept
                      </button>
                      {previewItem.kind !== "normal" ? (
                        <button
                          type="button"
                          onClick={() => handleSingleSetKind(previewItem, "normal")}
                          className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent cursor-pointer"
                        >
                          Bỏ gán
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Modal Xem toàn bộ ảnh của Sản phẩm để chọn lại MAP / Concept chính xác */}
      <ProductGalleryDialog
        product={galleryProduct}
        onUpdated={(updatedImages) => {
          const imgMap = new Map(
            updatedImages.map((img) => [img.id, { kind: img.kind, room_tags: img.room_tags }]),
          );
          setItems((prev) => {
            let updated = prev.map((i) => {
              const next = imgMap.get(i.id);
              return next ? { ...i, ...next } : i;
            });
            if (tab === "map") {
              updated = updated.filter((i) => i.kind === "map");
            } else if (tab === "concept") {
              updated = updated.filter((i) => i.kind === "concept");
            } else if (tab === "unassigned") {
              updated = updated.filter((i) => i.kind === "normal");
            }
            return updated;
          });
          syncCountsOnly();
        }}
        onClose={() => {
          setGalleryProduct(null);
        }}
      />

      {/* Usage detail — ngay trong workspace */}
      {(() => {
        if (!usageDialogKey) return null;
        const dialogItem = items.find((it) => storageKeyOf(it.path) === usageDialogKey) ?? null;
        return (
          <AssetUsageDialog
            open
            onClose={() => setUsageDialogKey(null)}
            item={dialogItem}
            references={(usageMap?.usage?.[usageDialogKey] ?? []).filter(
              (r) =>
                !(r.role === "product_image" && String(r.id) === String(dialogItem?.id ?? "")),
            )}
          />
        );
      })()}
    </div>
  );
}
function ProductGalleryDialog({
  product,
  onClose,
  onUpdated,
}: {
  product: { id: number; code: string; name: string; category?: string } | null;
  onClose: () => void;
  onUpdated?: (updatedImages: ProductImageRow[]) => void;
}) {
  const [images, setImages] = useState<ProductImageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function loadImages() {
    if (!product) return;
    setLoading(true);
    fetchProductImages({ data: { productId: product.id } })
      .then((res) => {
        setImages(res);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Không tải được bộ ảnh sản phẩm");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    if (product) {
      loadImages();
      setConfirmDeleteId(null);
    } else {
      setImages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  async function handleSetKind(image: ProductImageRow, targetKind: ProductImageKind) {
    if (!product || image.kind === targetKind) return;
    try {
      const updatedList = await setProductImageKindFn({
        data: {
          productId: product.id,
          imageId: image.id,
          kind: targetKind,
        },
      });
      const label = targetKind === "map" ? "ảnh MAP" : targetKind === "concept" ? "ảnh Concept" : "chưa gán";
      toast.success(`Đã đổi thành ${label}`);
      setImages(updatedList);
      onUpdated?.(updatedList);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể đổi loại ảnh");
    }
  }

  async function handleSetRoomTags(image: ProductImageRow, roomSlugs: ImageRoomTagSlug[]) {
    if (!product || image.kind !== "concept") return;
    try {
      const updatedList = await setProductImageRoomTagsFn({
        data: { productId: product.id, imageId: image.id, roomSlugs },
      });
      setImages(updatedList);
      onUpdated?.(updatedList);
      toast.success("Đã cập nhật bối cảnh ảnh");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi gán bối cảnh ảnh");
    }
  }

  async function handleDelete(imageId: number) {
    setDeletingId(imageId);
    try {
      await deleteProductImageFn({ data: { imageId } });
      toast.success("Đã xóa ảnh thành công");
      setConfirmDeleteId(null);
      setImages((prev) => {
        const next = prev.filter((img) => img.id !== imageId);
        onUpdated?.(next);
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể xóa ảnh");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Dialog open={Boolean(product)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl max-h-[92vh] overflow-y-auto">
        {product ? (
          <div className="space-y-4">
            <DialogHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <DialogTitle className="font-mono text-base font-bold text-foreground">
                    {product.code}
                  </DialogTitle>
                  {product.category ? (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {product.category}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">({images.length} ảnh)</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {product.name} · <span className="italic text-foreground/80">Bấm MAP vào ảnh gạch đúng để đổi, hoặc chọn Concept cho các ảnh phối cảnh.</span>
              </p>
            </DialogHeader>

            {/* Gallery Grid chuẩn EditProductImagesDialog */}
            {loading ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-terracotta" />
                <p className="text-xs">Đang tải bộ ảnh sản phẩm…</p>
              </div>
            ) : images.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Sản phẩm này hiện chưa có ảnh nào.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {images.map((img) => {
                  const isMap = img.kind === "map";
                  const isConcept = img.kind === "concept";
                  const isConfirmingDelete = confirmDeleteId === img.id;
                  const isDeletingThis = deletingId === img.id;

                  return (
                    <div
                      key={img.id}
                      className={cn(
                        "rounded-xl overflow-hidden ring-1 bg-card transition-all",
                        isMap
                          ? "ring-blue-600 shadow-sm"
                          : isConcept
                            ? "ring-emerald-600 shadow-sm"
                            : "ring-black/5",
                      )}
                    >
                      {/* Image Frame - 1:1 contain chuẩn EditProductImagesDialog */}
                      <div className="aspect-square relative bg-white ring-inset ring-1 ring-black/5">
                        <ProductImage src={img.path} alt={product.code} fit="contain" />
                        {img.is_primary ? (
                          <span className="absolute top-2 left-2 text-[10px] font-medium bg-terracotta text-primary-foreground px-1.5 py-0.5 rounded shadow-xs">
                            Đại diện
                          </span>
                        ) : null}
                        {isMap ? (
                          <span className="absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded text-white bg-blue-600 shadow-xs">
                            MAP
                          </span>
                        ) : isConcept ? (
                          <span className="absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded text-white bg-emerald-600 shadow-xs">
                            Concept
                          </span>
                        ) : null}
                      </div>

                      {/* Action Bar */}
                      <div className="p-2 space-y-1.5">
                        {isConfirmingDelete ? (
                          <div className="space-y-1 rounded-md bg-destructive/5 p-1.5 ring-1 ring-destructive/15">
                            <p className="text-[10px] text-destructive font-medium">Xoá ảnh này?</p>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={isDeletingThis}
                                onClick={() => handleDelete(img.id)}
                                className="flex-1 rounded bg-destructive py-1 text-[10px] font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
                              >
                                {isDeletingThis ? "Đang xoá…" : "Xoá ảnh"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded px-2 py-1 text-[10px] font-medium ring-1 ring-black/10 hover:bg-surface-strong cursor-pointer"
                              >
                                Huỷ
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {/* Nút 3 trạng thái chuẩn EditProductImagesDialog */}
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => handleSetKind(img, isMap ? "normal" : "map")}
                                className={cn(
                                  "flex-1 text-[10px] font-medium py-1 rounded ring-1 transition-colors cursor-pointer",
                                  isMap
                                    ? "bg-blue-600 text-white ring-blue-600 font-bold shadow-xs"
                                    : "ring-black/10 hover:bg-surface-strong text-muted-foreground hover:text-foreground",
                                )}
                              >
                                MAP
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetKind(img, isConcept ? "normal" : "concept")}
                                className={cn(
                                  "flex-1 text-[10px] font-medium py-1 rounded ring-1 transition-colors cursor-pointer",
                                  isConcept
                                    ? "bg-emerald-600 text-white ring-emerald-600 font-bold shadow-xs"
                                    : "ring-black/10 hover:bg-surface-strong text-muted-foreground hover:text-foreground",
                                )}
                              >
                                Concept
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetKind(img, "normal")}
                                disabled={!isMap && !isConcept}
                                className={cn(
                                  "flex-1 text-[10px] font-medium py-1 rounded ring-1 transition-colors cursor-pointer",
                                  !isMap && !isConcept
                                    ? "bg-foreground/80 text-background ring-foreground/80 font-medium cursor-default"
                                    : "ring-black/10 hover:bg-surface-strong text-muted-foreground hover:text-foreground",
                                )}
                              >
                                Thường
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(img.id)}
                                title="Xoá ảnh"
                                className="size-6 grid place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                            {isConcept ? (
                              <ImageRoomTagPicker
                                value={img.room_tags.map((tag) => tag.room_slug)}
                                onChange={(roomSlugs) => void handleSetRoomTags(img, roomSlugs)}
                              />
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
