import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Globe,
  Grid,
  Image as ImageIcon,
  Images,
  Layers,
  Loader2,
  Maximize2,
  RefreshCw,
  Search,
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
  deleteProductImageFn,
  fetchFlatMediaImagesFn,
  fetchProductImages,
  setImageRoomTagsDirectFn,
  setProductImageKindFn,
  setProductImageRoomTagsFn,
} from "@/api/functions";
import { fetchLpHeroImageFn, setLpHeroImageFn, setFeaturedSlotFn, toggleProductPublicFn, bulkSetProductsPublicFn } from "@/api/lp";
import type { ProductImageRow, ProductImageKind, ImageRoomTagSlug } from "@/lib/types";
import { IMAGE_ROOM_TAGS } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductImage } from "@/components/ProductImage";
import type { FlatMediaItem, FlatMediaSort, FlatMediaTab } from "@/db/crm.server";
import { PRODUCT_GROUPS } from "@/lib/product-categories";
import { ImageRoomTagPicker } from "@/components/ImageRoomTagPicker";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const Route = createFileRoute("/_app/luu-tru")({
  component: MediaStoragePage,
});

const TABS: Array<{ key: FlatMediaTab; label: string; countKey: "all" | "map" | "concept" | "featured" | "unassigned" }> = [
  { key: "all", label: "Tất cả ảnh", countKey: "all" },
  { key: "map", label: "Chỉ ảnh MAP", countKey: "map" },
  { key: "concept", label: "Bối cảnh (Concept)", countKey: "concept" },
  { key: "featured", label: "★ Tuyển chọn Trang chủ (#1—#12)", countKey: "featured" },
  { key: "unassigned", label: "Chưa gán thẻ", countKey: "unassigned" },
];

const SORT_OPTIONS: Array<{ key: FlatMediaSort; label: string; icon: typeof Clock }> = [
  { key: "newest", label: "Mới nhất", icon: Clock },
  { key: "oldest", label: "Cũ nhất", icon: Clock },
  { key: "code_asc", label: "Mã SP (A-Z)", icon: ArrowDownAZ },
  { key: "code_desc", label: "Mã SP (Z-A)", icon: ArrowUpAZ },
];

const PAGE_SIZE_OPTIONS = [24, 48, 96] as const;

function getPageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [];
  pages.push(1);
  if (currentPage > 3) {
    pages.push("...");
  }
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (currentPage < totalPages - 2) {
    pages.push("...");
  }
  pages.push(totalPages);
  return pages;
}

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
      <PopoverContent className="w-64 p-3 text-foreground" align="start" side="top">
        <div className="space-y-2.5">
          <div className="border-b border-border/60 pb-1.5">
            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-terracotta" />
              <span>Gán vào Tuyển chọn Trang chủ</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Chọn 1 trong 12 ô hiển thị tại Section 02 (Trang chủ)
            </p>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((rank) => {
              const isCurrent = item.featured_rank === rank;
              return (
                <button
                  key={rank}
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAssign(rank)}
                  className={cn(
                    "flex flex-col items-center justify-center p-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer",
                    isCurrent
                      ? "bg-terracotta text-white border-terracotta shadow-xs"
                      : "bg-card border-border text-foreground hover:border-terracotta/60 hover:bg-terracotta/5",
                  )}
                >
                  <span>#{rank}</span>
                </button>
              );
            })}
          </div>

          {item.featured_rank ? (
            <div className="pt-1.5 border-t border-border/60">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRemove()}
                className="w-full text-center text-xs font-semibold text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
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
  const [tab, setTab] = useState<FlatMediaTab>("all");
  const [category, setCategory] = useState<string>("all");
  const [roomSlug, setRoomSlug] = useState<ImageRoomTagSlug | "all">("all");
  const [publicFilter, setPublicFilter] = useState<"all" | "public" | "hidden">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<FlatMediaSort>("newest");
  const [currentHeroImage, setCurrentHeroImage] = useState<string>("");
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

  // Debounce search 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  function loadData(targetPage = page, targetPageSize = pageSize) {
    fetchFlatMediaImagesFn({
      data: {
        tab,
        category: category === "all" ? undefined : category,
        search: debouncedSearch || undefined,
        roomSlug: roomSlug === "all" ? undefined : roomSlug,
        publicFilter: publicFilter === "all" ? undefined : publicFilter,
        sort,
        page: targetPage,
        pageSize: targetPageSize,
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
        sort,
        page: 1,
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

  // Khi đổi filter, sort, search, pageSize -> về trang 1
  useEffect(() => {
    setPage(1);
    loadData(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category, roomSlug, publicFilter, sort, debouncedSearch, pageSize]);


  function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > totalPages || newPage === page) return;
    setPage(newPage);
    loadData(newPage, pageSize);
    gridTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handlePageSizeChange(newSize: number) {
    if (newSize === pageSize) return;
    setPageSize(newSize);
    setPage(1);
    loadData(1, newSize);
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
    const ids = Array.from(selectedIds);
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
      loadData(page, pageSize);
      syncCountsOnly();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi gán bối cảnh hàng loạt");
    } finally {
      setBusyBulk(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNumbers = getPageNumbers(page, totalPages);
  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllCurrentPage() {
    const pageIds = items.map((i) => i.id);
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
      if (selectedIds.has(item.id)) {
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
          productIds.includes(i.product_id) ? { ...i, product_is_public: isPublic } : i,
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

  async function handleBulkSetKind(kind: ProductImageKind) {
    if (selectedIds.size === 0 || busyBulk) return;
    const ids = Array.from(selectedIds);
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
        prev.map((i) => (selectedIds.has(i.id) ? { ...i, kind } : i)),
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

  async function handleDeleteImage(imageId: number) {
    setDeletingId(imageId);
    try {
      await deleteProductImageFn({ data: { imageId } });
      toast.success("Đã xóa ảnh thành công");
      setConfirmDeleteId(null);

      setItems((prev) => prev.filter((i) => i.id !== imageId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });

      if (previewItem?.id === imageId) {
        setPreviewItem(null);
      }

      syncCountsOnly();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể xóa ảnh");
    } finally {
      setDeletingId(null);
    }
  }

  const allPageIds = items.map((i) => i.id);
  const allPageSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id));


  return (
    <div ref={gridTopRef} className="space-y-5 pb-28">
      <PageHeader
        eyebrow="Landing Page"
        title="Kho ảnh"
        description="Quản lý toàn bộ tài nguyên ảnh sản phẩm: phân loại ảnh MAP, Concept, gán thẻ phòng Lookbook, chọn ảnh bìa Hero và 12 vị trí Tuyển chọn trang chủ."
      />

      {/* Filter toolbar — Cấu trúc 2 tầng chuẩn Advisor Astra 6 + Sub-strip bối cảnh ngữ cảnh */}
      <div className="mb-5 space-y-3">
        {/* HÀNG 1: Tìm kiếm + Nhóm sản phẩm (Pills) */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 min-w-0 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadData(1, pageSize)}
              placeholder="Tìm mã SP, tên gạch..."
              className="h-9 w-full text-xs pl-9 pr-8 rounded-full bg-card border border-border/80 outline-none focus:border-terracotta/50 focus:ring-2 focus:ring-terracotta/15 text-foreground placeholder:text-muted-foreground/60 shadow-2xs"
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                }}
                aria-label="Xoá tìm kiếm"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          {/* Nhóm sản phẩm (Category Pills) */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Nhóm
            </span>
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={cn(
                "h-7 px-3 rounded-full text-xs font-medium transition-colors cursor-pointer",
                category === "all"
                  ? "bg-foreground text-background font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
              )}
            >
              Tất cả nhóm
            </button>
            {PRODUCT_GROUPS.filter((g) => g.slug !== "tat-ca").map((g) => {
              const active = category === g.category;
              return (
                <button
                  key={g.slug}
                  type="button"
                  onClick={() => setCategory(g.category)}
                  className={cn(
                    "h-7 px-3 rounded-full text-xs font-medium transition-colors cursor-pointer",
                    active
                      ? "bg-foreground text-background font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                  )}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* HÀNG 2: Tabs Loại ảnh (KIND) bên trái + Sắp xếp, Size trang, Thao tác bên phải */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5 border-t border-border/60 pt-2.5">
          {/* Segmented Control: KIND ảnh */}
          <div className="flex flex-wrap items-center bg-surface-strong/60 p-0.5 rounded-full border border-border/80 shrink-0">
            {TABS.map((t) => {
              const active = tab === t.key;
              const count = counts[t.countKey];
              const isMapTab = t.key === "map";
              const isConceptTab = t.key === "concept";
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setTab(t.key);
                    if (t.key !== "concept") {
                      setRoomSlug("all");
                    }
                    clearSelection();
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer",
                    active
                      ? isMapTab
                        ? "bg-indigo-600 text-white font-semibold shadow-xs"
                        : isConceptTab
                          ? "bg-amber-600 text-white font-semibold shadow-xs"
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
          {/* Sắp xếp & Tiện ích phân trang */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Bộ lọc trạng thái Thư viện Web */}
            <div className="flex bg-surface-strong/50 p-0.5 rounded-full border border-border/80 shrink-0 text-xs items-center">
              <button
                type="button"
                onClick={() => setPublicFilter("all")}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors cursor-pointer",
                  publicFilter === "all"
                    ? "bg-card text-foreground shadow-xs ring-1 ring-black/5 font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                )}
              >
                Tất cả Web
              </button>
              <button
                type="button"
                onClick={() => setPublicFilter("public")}
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
                onClick={() => setPublicFilter("hidden")}
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

            {/* Sắp xếp */}
            <div className="flex bg-surface-strong/50 p-0.5 rounded-full border border-border/80 shrink-0 text-xs">
              {SORT_OPTIONS.map((opt) => {
                const active = sort === opt.key;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSort(opt.key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                      active
                        ? "bg-card font-semibold text-foreground shadow-xs ring-1 ring-black/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                    )}
                  >
                    <Icon className="size-3" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

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
              onClick={() => loadData(page, pageSize)}
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
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <Sparkles className="size-3 text-amber-600" />
              Bối cảnh Lookbook
            </span>
            <button
              type="button"
              onClick={() => {
                setTab("concept");
                setRoomSlug("all");
              }}
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
                  onClick={() => {
                    setTab("concept");
                    setRoomSlug(tag.id);
                  }}
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
                onClick={() => setRoomSlug("all")}
                className="h-7 px-2.5 rounded-full text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
              >
                Xóa lọc bối cảnh
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Main Flat Media Grid */}
      {loading && items.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-terracotta" />
          <p className="text-xs">Đang tải kho ảnh…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <ImageIcon className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium text-foreground">Không tìm thấy ảnh nào phù hợp</p>
          <p className="text-xs text-muted-foreground">Thử đổi tab lọc hoặc từ khóa tìm kiếm</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5">
          {items.map((img) => {
            const isSelected = selectedIds.has(img.id);
            const isMap = img.kind === "map";
            const isConcept = img.kind === "concept";
            const hasTag = isMap || isConcept;
            const isConfirmingDelete = confirmDeleteId === img.id;
            const isDeletingThis = deletingId === img.id;

            return (
              <div
                key={img.id}
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
                    alt={img.caption || img.product_code}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-200 group-hover:scale-103"
                  />

                  {/* Multi-select Checkbox (top-left) */}
                  <button
                    type="button"
                    onClick={() => toggleSelect(img.id)}
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
                    {img.product_is_public === 1 && (tab === "map" || tab === "all" || tab === "featured") ? (
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

                {/* Product Metadata & Actions */}
                <div className="flex flex-1 flex-col justify-between p-2.5">
                  {/* Product Details */}
                  <div>
                    <div className="flex items-center justify-between gap-1">
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
                        title="Xem toàn bộ ảnh của sản phẩm này để chọn lại MAP/Concept"
                        className="inline-flex items-center gap-1 font-mono text-xs font-bold text-foreground hover:text-terracotta hover:underline truncate cursor-pointer text-left"
                      >
                        <span>{img.product_code}</span>
                        <Images className="size-3 text-muted-foreground/60 shrink-0" />
                      </button>
                      {img.product_category ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground/80">
                          {img.product_category}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={img.product_name}>
                      {img.product_name}
                    </p>
                    {/* Bối cảnh phòng Lookbook (hiển thị khi là Concept hoặc có tag) */}
                    {isConcept || img.room_tags.length > 0 ? (
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

                  {/* Action Toolbar Below Image */}
                  <div className="mt-2 flex flex-col gap-1.5 border-t border-border/60 pt-2 text-xs">
                    {/* Inline Delete 2-step confirm */}
                    {isConfirmingDelete ? (
                      <div className="flex flex-col gap-1 rounded-lg bg-red-500/10 p-1.5 text-[10px]">
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          Xóa ảnh này?
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isDeletingThis}
                            onClick={() => handleDeleteImage(img.id)}
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
                              {/* Toggle Thư viện icon button */}
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
                                <button
                                  type="button"
                                  onClick={() => handleTogglePublic(img.product_id, img.product_is_public)}
                                  title={img.product_is_public === 1 ? "Đang hiển thị trên Thư viện (Bấm để Ẩn)" : "Đang ẩn khỏi Thư viện (Bấm để hiển thị)"}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer border",
                                    img.product_is_public === 1
                                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold"
                                      : "bg-surface-strong/60 border-border/80 text-muted-foreground/60 hover:text-emerald-600",
                                  )}
                                >
                                  <Globe className="size-3.5" />
                                  <span>{img.product_is_public === 1 ? "Thư viện" : "Ẩn"}</span>
                                </button>
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
                        </div>
                        {/* Trash icon */}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(img.id)}
                          title="Xóa ảnh"
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

      {/* Pagination Bar */}
      {totalPages > 1 ? (
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border/70 pt-5 text-xs text-muted-foreground">
          <p>
            Hiển thị{" "}
            <span className="font-semibold text-foreground">
              {total === 0 ? 0 : ((page - 1) * pageSize + 1).toLocaleString("vi-VN")}
            </span>{" "}
            –{" "}
            <span className="font-semibold text-foreground">
              {Math.min(page * pageSize, total).toLocaleString("vi-VN")}
            </span>{" "}
            trên tổng số{" "}
            <span className="font-semibold text-foreground">{total.toLocaleString("vi-VN")}</span>{" "}
            ảnh
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => handlePageChange(page - 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-strong transition-colors disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="size-3.5" />
              <span>Trước</span>
            </button>

            <div className="flex items-center gap-1">
              {pageNumbers.map((p, idx) => {
                if (p === "...") {
                  return (
                    <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground">
                      …
                    </span>
                  );
                }
                const num = Number(p);
                const active = num === page;
                return (
                  <button
                    key={num}
                    type="button"
                    disabled={loading}
                    onClick={() => handlePageChange(num)}
                    className={cn(
                      "size-8 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                      active
                        ? "bg-foreground text-background font-bold shadow-xs"
                        : "border border-border/70 bg-card text-muted-foreground hover:bg-surface-strong hover:text-foreground",
                    )}
                  >
                    {num}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => handlePageChange(page + 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-strong transition-colors disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <span>Sau</span>
              <ChevronRight className="size-3.5" />
            </button>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const target = parseInt(jumpPageInput, 10);
                if (!isNaN(target) && target >= 1 && target <= totalPages) {
                  handlePageChange(target);
                  setJumpPageInput("");
                }
              }}
              className="ml-2 flex items-center gap-1"
            >
              <span className="text-[11px] text-muted-foreground">Đến:</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpPageInput}
                onChange={(e) => setJumpPageInput(e.target.value)}
                placeholder={`${page}`}
                className="h-8 w-14 rounded-lg border border-border/80 bg-card px-1.5 text-center text-xs text-foreground outline-none focus:border-terracotta"
              />
              <button
                type="submit"
                className="h-8 rounded-lg border border-border/80 bg-card px-2 text-xs font-medium text-foreground hover:bg-surface-strong cursor-pointer"
              >
                Đi
              </button>
            </form>
          </div>
        </div>
      ) : null}

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
            {/* 1. Bulk Bật Thư viện Web */}
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

      {/* Lightbox Preview Dialog */}
      <Dialog open={Boolean(previewItem)} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          {previewItem ? (
            <div>
              <div className="relative aspect-16/10 w-full bg-black/95">
                <img
                  src={previewItem.path}
                  alt={previewItem.product_code}
                  className="size-full object-contain"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-base font-bold text-foreground font-mono">
                      {previewItem.product_code}
                    </DialogTitle>
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
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {previewItem.product_name} ·{" "}
                    {previewItem.product_category || "Chưa phân loại"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
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
