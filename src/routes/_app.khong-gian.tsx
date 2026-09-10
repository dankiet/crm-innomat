/**
 * Lookbook Concept Hub — Trung tâm Quản trị & Kiểm duyệt Bối cảnh.
 *
 * Cho phép Admin:
 *   - Kiểm duyệt ảnh không gian kiến trúc thực tế do AI Vision phân tích.
 *   - Bật / Tắt hiển thị công khai trên Landing Page Lookbook.
 *   - Chỉnh sửa lời bình kiến trúc (AI Description).
 *   - Hạ loại ảnh nhầm về ảnh thường (demote to normal) qua 2-step inline confirm.
 *
 * Tuân thủ quy chuẩn Innomat CRM / Arch Journal:
 *   - Tone màu tối giản, sang trọng, bo nhẹ, border sắc sảo.
 *   - Trực quan hóa mẫu gạch swatch, nhãn phòng AI, lời bình thiết kế.
 *   - Cập nhật state trực tiếp không giật màn hình (no router.invalidate).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Layers3,
  Eye,
  EyeOff,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Pencil,
  ArrowDownToDot,
  Loader2,
  Check,
  Maximize2,
  SlidersHorizontal,
  Compass,
  Building2,
  CheckCircle2,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchCrmConceptImagesFn,
  setConceptImagePublicFn,
  updateConceptDescriptionFn,
  demoteConceptImageFn,
} from "@/api/lp";
import type { CrmConceptItem, CrmConceptTag } from "@/lib/lp-types";
import { cn } from "@/lib/utils";
import { COLOR_PALETTES } from "@/lib/color-palette";
import { setImageRoomTagsDirectFn } from "@/api/functions";
import { PRODUCT_GROUPS } from "@/lib/product-categories";
import { IMAGE_ROOM_TAGS, type ImageRoomTagSlug } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PAGE_LIMIT_OPTIONS = [24, 48, 96] as const;

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

function QuickConceptRoomTagPopover({
  item,
  onSave,
  disabled,
}: {
  item: CrmConceptItem;
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
          className="inline-flex items-center gap-1 rounded-md bg-black/60 hover:bg-black/80 backdrop-blur-md px-2 py-0.5 text-[9px] font-semibold text-white/90 border border-white/10 transition-colors cursor-pointer"
          title="Sửa danh sách phòng gán cho bối cảnh này"
        >
          <Tag className="size-2.5 text-amber-300" />
          <span>Sửa phòng</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 text-foreground" align="start">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
            <span className="text-xs font-bold text-foreground flex items-center gap-1">
              <Sparkles className="size-3 text-amber-600" />
              Gán phòng bối cảnh
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">#{item.image_id}</span>
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
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Danh mục Tab không gian kiến trúc theo quy chuẩn Lookbook
const ROOM_TABS = [
  { id: "all", label: "Tất cả không gian" },
  { id: "living_room", label: "Phòng khách" },
  { id: "kitchen_dining", label: "Bếp & Dining" },
  { id: "bathroom_spa", label: "Phòng tắm & Spa" },
  { id: "bedroom", label: "Phòng ngủ" },
  { id: "outdoor_balcony", label: "Ban công & Sân trong" },
  { id: "fnb_hospitality", label: "Thương mại & F&B" },
] as const;

// Bản đồ tên hiển thị chi tiết cho từng loại phòng
const ROOM_NAMES: Record<string, string> = {
  living_room: "Phòng khách & Lounge",
  kitchen_dining: "Bếp & Dining",
  bathroom_spa: "Phòng tắm & Spa",
  bedroom: "Phòng ngủ & Suite",
  outdoor_balcony: "Ban công & Sân trong",
  fnb_hospitality: "Thương mại & F&B",
  office_workspace: "Văn phòng & Workspace",
  other: "Không gian khác",
  unknown: "Chưa xác định",
};

export const Route = createFileRoute("/_app/khong-gian")({
  head: () => ({
    meta: [{ title: "Lookbook Bối Cảnh — Innomat CRM" }],
  }),
  loader: async () => {
    const initialData = await fetchCrmConceptImagesFn({
      data: {
        page: 1,
        limit: 24,
        room_slug: "all",
        is_public: "all",
      },
    });
    return { initialData };
  },
  component: ConceptHubPage,
});

function ConceptHubPage() {
  const { initialData } = Route.useLoaderData();

  // Dữ liệu chính
  const [items, setItems] = useState<CrmConceptItem[]>(initialData?.items ?? []);
  const [total, setTotal] = useState<number>(initialData?.total ?? 0);
  const [page, setPage] = useState<number>(initialData?.page ?? 1);
  const [limit, setLimit] = useState<number>(24);
  const [totalPages, setTotalPages] = useState<number>(initialData?.totalPages ?? 1);
  const [jumpPageInput, setJumpPageInput] = useState<string>("");
  const [stats, setStats] = useState(
    initialData?.stats ?? {
      total: 0,
      publicCount: 0,
      hiddenCount: 0,
      withDescCount: 0,
    },
  );
  const [roomStats, setRoomStats] = useState<Record<string, number>>(initialData?.roomStats ?? {});

  // Bộ lọc & Tìm kiếm
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeRoom, setActiveRoom] = useState<string>("all");
  const [activeStatus, setActiveStatus] = useState<"all" | "1" | "0">("all");
  const [activeColor, setActiveColor] = useState<string>("all");
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [isFetching, setIsFetching] = useState<boolean>(false);

  // Thao tác inline
  const [busyPublicId, setBusyPublicId] = useState<number | null>(null);
  const [busyDemoteId, setBusyDemoteId] = useState<number | null>(null);
  const [demoteConfirmId, setDemoteConfirmId] = useState<number | null>(null);

  // Dialog Quick Edit Description
  const [editingItem, setEditingItem] = useState<CrmConceptItem | null>(null);
  const [editDescText, setEditDescText] = useState<string>("");
  const [isSavingDesc, setIsSavingDesc] = useState<boolean>(false);

  // Dialog Image Inspection Preview
  const [previewItem, setPreviewItem] = useState<CrmConceptItem | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Cờ nhận biết lần render đầu để tránh double-fetch với loader
  const isFirstRender = useRef(true);

  // Fetch dữ liệu khi thay đổi filter hoặc search
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    let isMounted = true;
    async function loadData() {
      setIsFetching(true);
      try {
        const res = await fetchCrmConceptImagesFn({
          data: {
            category: activeCategory === "all" ? null : activeCategory,
            room_slug: activeRoom === "all" ? null : activeRoom,
            is_public: activeStatus === "all" ? "all" : Number(activeStatus),
            color: activeColor === "all" ? null : activeColor,
            search: debouncedSearch || null,
            page: 1, // Reset về trang 1 khi đổi bộ lọc
            limit,
          },
        });
        if (!isMounted) return;
        setItems(res.items);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setPage(res.page);
        setStats(res.stats);
        setRoomStats(res.roomStats);
      } catch (err) {
        if (!isMounted) return;
        toast.error(
          "Lỗi khi tải danh sách bối cảnh: " + (err instanceof Error ? err.message : String(err)),
        );
      } finally {
        if (isMounted) setIsFetching(false);
      }
    }

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [activeCategory, activeRoom, activeStatus, activeColor, debouncedSearch, limit]);

  // Chuyển trang (Pagination)
  async function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > totalPages || newPage === page) return;
    setIsFetching(true);
    try {
      const res = await fetchCrmConceptImagesFn({
        data: {
          category: activeCategory === "all" ? null : activeCategory,
          room_slug: activeRoom === "all" ? null : activeRoom,
          is_public: activeStatus === "all" ? "all" : Number(activeStatus),
          color: activeColor === "all" ? null : activeColor,
          search: debouncedSearch || null,
          page: newPage,
          limit,
        },
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setPage(res.page);
      setStats(res.stats);
      setRoomStats(res.roomStats);

      // Cuộn mượt lên đầu danh sách
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error("Lỗi phân trang: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsFetching(false);
    }
  }

  function handleLimitChange(newLimit: number) {
    if (newLimit === limit) return;
    setLimit(newLimit);
    setPage(1);
  }

  async function handleQuickSetRoomTags(item: CrmConceptItem, slugs: ImageRoomTagSlug[]) {
    try {
      await setImageRoomTagsDirectFn({
        data: {
          imageId: item.image_id,
          roomSlugs: slugs,
        },
      });
      const updatedTags: CrmConceptTag[] = slugs.map((s) => ({
        room_slug: s,
        confidence: null,
        source: "manual",
        review_status: "accepted",
      }));
      setItems((prev) =>
        prev.map((it) => (it.image_id === item.image_id ? { ...it, room_tags: updatedTags } : it)),
      );
      if (previewItem?.image_id === item.image_id) {
        setPreviewItem((prev) => (prev ? { ...prev, room_tags: updatedTags } : null));
      }
      toast.success("Đã cập nhật bối cảnh phòng");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi khi cập nhật bối cảnh");
      throw err;
    }
  }

  const pageNumbers = getPageNumbers(page, totalPages);

  // Bật/Tắt hiển thị công khai trên Landing Page (Cập nhật trực tiếp local state)
  async function handleTogglePublic(item: CrmConceptItem) {
    const nextVal = item.is_public === 1 ? 0 : 1;
    setBusyPublicId(item.image_id);

    // Optimistic local state update
    setItems((prev) =>
      prev.map((it) => (it.image_id === item.image_id ? { ...it, is_public: nextVal } : it)),
    );
    setStats((prev) => ({
      ...prev,
      publicCount: prev.publicCount + (nextVal === 1 ? 1 : -1),
      hiddenCount: prev.hiddenCount + (nextVal === 0 ? 1 : -1),
    }));

    if (previewItem?.image_id === item.image_id) {
      setPreviewItem((prev) => (prev ? { ...prev, is_public: nextVal } : null));
    }

    try {
      await setConceptImagePublicFn({
        data: { id: item.image_id, is_public: nextVal },
      });
      toast.success(
        nextVal === 1
          ? `Đã bật hiển thị ảnh #${item.image_id} trên Landing Page`
          : `Đã ẩn ảnh #${item.image_id} khỏi Landing Page`,
      );
    } catch (err) {
      // Revert if error
      setItems((prev) =>
        prev.map((it) => (it.image_id === item.image_id ? { ...it, is_public: item.is_public } : it)),
      );
      setStats((prev) => ({
        ...prev,
        publicCount: prev.publicCount + (nextVal === 1 ? -1 : 1),
        hiddenCount: prev.hiddenCount + (nextVal === 0 ? -1 : 1),
      }));
      toast.error(
        "Không thể cập nhật trạng thái hiển thị: " +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setBusyPublicId(null);
    }
  }

  // Hạ loại ảnh concept về ảnh thường (2-step inline confirm)
  async function handleDemote(item: CrmConceptItem) {
    setBusyDemoteId(item.image_id);
    try {
      await demoteConceptImageFn({
        data: { id: item.image_id },
      });

      // Xóa card khỏi local state tức thì
      setItems((prev) => prev.filter((it) => it.image_id !== item.image_id));
      setTotal((prev) => Math.max(0, prev - 1));
      setStats((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
        publicCount: item.is_public === 1 ? Math.max(0, prev.publicCount - 1) : prev.publicCount,
        hiddenCount: item.is_public === 0 ? Math.max(0, prev.hiddenCount - 1) : prev.hiddenCount,
        withDescCount: item.ai_description
          ? Math.max(0, prev.withDescCount - 1)
          : prev.withDescCount,
      }));

      // Cập nhật roomStats
      if (item.room_tags && item.room_tags.length > 0) {
        setRoomStats((prev) => {
          const next = { ...prev };
          for (const tag of item.room_tags) {
            if (next[tag.room_slug]) {
              next[tag.room_slug] = Math.max(0, next[tag.room_slug] - 1);
            }
          }
          return next;
        });
      }

      setDemoteConfirmId(null);
      if (previewItem?.image_id === item.image_id) {
        setPreviewItem(null);
      }
      toast.success(`Đã hạ ảnh #${item.image_id} về kho ảnh thường`);
    } catch (err) {
      toast.error("Lỗi khi hạ loại ảnh: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusyDemoteId(null);
    }
  }

  // Mở modal sửa lời bình AI
  function openEditDescription(item: CrmConceptItem) {
    setEditingItem(item);
    setEditDescText(item.ai_description || "");
  }

  // Lưu lời bình kiến trúc AI
  async function handleSaveDescription() {
    if (!editingItem) return;
    setIsSavingDesc(true);
    const newDesc = editDescText.trim();
    const id = editingItem.image_id;

    try {
      await updateConceptDescriptionFn({
        data: { id, ai_description: newDesc },
      });

      // Cập nhật local state
      setItems((prev) =>
        prev.map((it) => {
          if (it.image_id !== id) return it;
          const hadDesc = Boolean(it.ai_description);
          const hasDesc = Boolean(newDesc);
          if (!hadDesc && hasDesc) {
            setStats((s) => ({ ...s, withDescCount: s.withDescCount + 1 }));
          } else if (hadDesc && !hasDesc) {
            setStats((s) => ({ ...s, withDescCount: Math.max(0, s.withDescCount - 1) }));
          }
          return { ...it, ai_description: newDesc };
        }),
      );

      if (previewItem?.image_id === id) {
        setPreviewItem((prev) => (prev ? { ...prev, ai_description: newDesc } : null));
      }

      toast.success("Đã cập nhật lời bình kiến trúc AI");
      setEditingItem(null);
    } catch (err) {
      toast.error("Lỗi khi lưu mô tả: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingDesc(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header trang */}
      <PageHeader
        eyebrow="Lookbook & Phối cảnh AI"
        title="Lookbook Bối Cảnh"
        description="Kiểm duyệt ảnh không gian thực tế do AI phân tích, điều khiển hiển thị trên Landing Page."
      />

      {/* 2. Stats Bar (4 Stat Chips phong cách Innomat Arch Journal) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Chip 1: Tổng Concept */}
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs transition-all hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Tổng concept AI</span>
            <div className="grid size-8 place-items-center rounded-xl bg-terracotta/10 text-terracotta">
              <Layers3 className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {stats.total.toLocaleString("vi-VN")}
            </span>
            <span className="text-[11px] text-muted-foreground">bối cảnh</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground/80">Kho phối cảnh được phát hiện</p>
        </div>

        {/* Chip 2: Đang hiện LD-page */}
        <div className="rounded-2xl border border-emerald-500/20 bg-card p-4 shadow-2xs transition-all hover:border-emerald-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
              Đang hiện LD-page
            </span>
            <div className="grid size-8 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Eye className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400 tabular-nums">
              {stats.publicCount.toLocaleString("vi-VN")}
            </span>
            <span className="text-[11px] text-muted-foreground">ảnh công khai</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground/80">Đã xuất bản trên Landing Page</p>
        </div>

        {/* Chip 3: Đang ẩn */}
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs transition-all hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Đang ẩn</span>
            <div className="grid size-8 place-items-center rounded-xl bg-surface-strong text-muted-foreground">
              <EyeOff className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {stats.hiddenCount.toLocaleString("vi-VN")}
            </span>
            <span className="text-[11px] text-muted-foreground">ảnh ẩn</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground/80">Lưu trữ nội bộ, chưa xuất bản</p>
        </div>

        {/* Chip 4: Đã có lời bình AI */}
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs transition-all hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Đã có lời bình AI</span>
            <div className="grid size-8 place-items-center rounded-xl bg-moss/10 text-moss">
              <Sparkles className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {stats.withDescCount.toLocaleString("vi-VN")}
            </span>
            <span className="text-[11px] text-muted-foreground">có mô tả</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            {stats.total > 0
              ? `${Math.round((stats.withDescCount / stats.total) * 100)}% tổng số ảnh`
              : "0%"}
          </p>
        </div>
      </div>

      {/* 3. Filter & Search Bar */}
      <div className="space-y-3 pt-2">
        {/* Row 1: Space Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
          {ROOM_TABS.map((tab) => {
            const count = tab.id === "all" ? stats.total : roomStats[tab.id] || 0;
            const active = activeRoom === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveRoom(tab.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer",
                  active
                    ? "bg-foreground text-background shadow-xs"
                    : "border border-border/70 bg-card text-muted-foreground hover:bg-surface-strong hover:text-foreground",
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                    active
                      ? "bg-background/20 text-background"
                      : "bg-surface-strong text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        {/* Row 1.5: Nhóm sản phẩm (Category Pills) đồng bộ Kho ảnh */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 border-t border-border/40 pt-2">
          <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Nhóm
          </span>
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={cn(
              "h-7 px-3 rounded-full text-xs font-medium transition-colors cursor-pointer",
              activeCategory === "all"
                ? "bg-foreground text-background font-semibold shadow-xs"
                : "border border-border/70 bg-card text-muted-foreground hover:bg-surface-strong hover:text-foreground",
            )}
          >
            Tất cả nhóm
          </button>
          {PRODUCT_GROUPS.filter((g) => g.slug !== "tat-ca").map((g) => {
            const active = activeCategory === g.category;
            return (
              <button
                key={g.slug}
                type="button"
                onClick={() => setActiveCategory(g.category)}
                className={cn(
                  "h-7 px-3 rounded-full text-xs font-medium transition-colors cursor-pointer",
                  active
                    ? "bg-foreground text-background font-semibold shadow-xs"
                    : "border border-border/70 bg-card text-muted-foreground hover:bg-surface-strong hover:text-foreground",
                )}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        {/* Row 2: Search input + Status segmented toggle */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          {/* Search Box with Debounce */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/70" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo mã gạch, tên gạch, hoặc từ khóa mô tả..."
              className="w-full rounded-xl border border-border/80 bg-card pl-9 pr-9 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 shadow-2xs focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta transition-all"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 size-5 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-surface-strong transition-colors"
                title="Xóa tìm kiếm"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>

          {/* Lọc theo gam màu kiến trúc */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Tông màu:
            </span>
            <select
              value={activeColor}
              onChange={(e) => setActiveColor(e.target.value)}
              className="h-8 rounded-xl border border-border/80 bg-card px-2.5 py-1 text-xs font-medium text-foreground outline-none focus:border-terracotta transition-colors cursor-pointer"
            >
              <option value="all">Tất cả tông màu</option>
              {COLOR_PALETTES.map((palette) => (
                <option key={palette.id} value={palette.id}>
                  {palette.label}
                </option>
              ))}
            </select>
          </div>

          {/* Segmented control: Lọc trạng thái xuất bản */}
          <div className="inline-flex items-center rounded-xl border border-border/80 bg-surface-strong/60 p-1 text-xs font-medium self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveStatus("all")}
              className={cn(
                "rounded-lg px-3 py-1.5 transition-all cursor-pointer",
                activeStatus === "all"
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Tất cả trạng thái
            </button>
            <button
              type="button"
              onClick={() => setActiveStatus("1")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all cursor-pointer",
                activeStatus === "1"
                  ? "bg-card text-emerald-700 dark:text-emerald-400 font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Đang hiện LD Page
            </button>
            <button
              type="button"
              onClick={() => setActiveStatus("0")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all cursor-pointer",
                activeStatus === "0"
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="size-1.5 rounded-full bg-zinc-400" />
              Đang ẩn
            </button>
          </div>
        </div>
      </div>

      {/* 4. Loading indicator overlay or bar */}
      {isFetching ? (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground animate-pulse">
          <Loader2 className="size-4 animate-spin text-terracotta" />
          <span>Đang tải danh sách bối cảnh...</span>
        </div>
      ) : null}

      {/* 5. Concept Card Grid (Visual Inspection Cards) */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/90 bg-card p-12 text-center">
          <Compass className="size-10 mx-auto text-muted-foreground/60 mb-3" />
          <h3 className="text-sm font-bold text-foreground">Không tìm thấy bối cảnh phù hợp</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
            Không có ảnh concept nào khớp với bộ lọc không gian hoặc từ khóa tìm kiếm hiện tại.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveRoom("all");
                setActiveStatus("all");
                setActiveColor("all");
                setSearchInput("");
              }}
            >
              Đặt lại bộ lọc
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {items.map((item) => {
            // Lấy nhãn phòng đầu tiên hoặc nhãn phù hợp với active filter
            const matchedTag =
              item.room_tags.find((t) => t.room_slug === activeRoom) || item.room_tags[0];
            const roomDisplayName = matchedTag
              ? ROOM_NAMES[matchedTag.room_slug] || matchedTag.room_slug
              : "Không gian kiến trúc";

            const confidencePercent = matchedTag?.confidence
              ? Math.round(matchedTag.confidence * 100)
              : null;

            return (
              <div
                key={item.image_id}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs hover:shadow-md hover:border-border transition-all duration-200"
              >
                {/* Visual Header: Concept Image with hover zoom */}
                <div
                  className="relative aspect-[16/10] overflow-hidden bg-muted/30 cursor-pointer"
                  onClick={() => setPreviewItem(item)}
                  title="Nhấn để xem ảnh phóng to và chi tiết"
                >
                  <img
                    src={item.image_path}
                    alt={item.caption || item.product_name}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  />

                  {/* Gradient shadow overlay for badge readability */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/35 pointer-events-none" />

                  {/* Top-left: Nhãn phòng từ AI Vision */}
                  {/* Top-left: Nhãn phòng từ AI Vision + Nút sửa nhanh bối cảnh */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1 z-10">
                    <span className="inline-flex items-center gap-1 rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] font-semibold text-white tracking-wide border border-white/10">
                      <Sparkles className="size-2.5 text-amber-300" />
                      <span>{roomDisplayName}</span>
                      {confidencePercent ? (
                        <span className="text-white/60 font-mono text-[9px]">
                          {confidencePercent}%
                        </span>
                      ) : null}
                    </span>
                    {item.room_tags.length > 1 ? (
                      <span className="rounded-md bg-black/60 backdrop-blur-md px-1.5 py-0.5 text-[9px] font-medium text-white/80 border border-white/10">
                        +{item.room_tags.length - 1}
                      </span>
                    ) : null}
                    <QuickConceptRoomTagPopover
                      item={item}
                      onSave={(slugs) => handleQuickSetRoomTags(item, slugs)}
                    />
                  </div>

                  {/* Top-right: Badge Trạng thái Public trên Landing Page */}
                  <div className="absolute top-2.5 right-2.5">
                    {item.is_public === 1 ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-950/80 backdrop-blur-md px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30 shadow-xs">
                        <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Hiện LD-page</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-900/80 backdrop-blur-md px-2 py-0.5 text-[10px] font-medium text-zinc-300 border border-zinc-700/40">
                        <span>Đang ẩn</span>
                      </span>
                    )}
                  </div>

                  {/* Hover icon zoom */}
                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-sm rounded-lg p-1.5 text-white">
                    <Maximize2 className="size-3.5" />
                  </div>
                </div>

                {/* Card Body: Swatch Thumbnail + Product Info + AI Quote */}
                <div className="p-4 flex-1 flex flex-col justify-between gap-3.5">
                  {/* Row thông tin mẫu gạch (Swatch + Code + Name + Surface) */}
                  <div className="flex items-center gap-3 pb-3 border-b border-border/60">
                    {/* Swatch thumbnail mẫu gạch thật */}
                    <div className="relative size-12 rounded-lg border border-border/80 overflow-hidden bg-surface-strong shrink-0 shadow-2xs">
                      {item.map_image ? (
                        <img
                          src={item.map_image}
                          alt={item.product_code}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-muted-foreground/50">
                          <Layers3 className="size-5" />
                        </div>
                      )}
                    </div>

                    {/* Thông tin định danh sản phẩm */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-xs font-bold text-foreground tracking-tight line-clamp-1">
                          {item.product_code}
                        </span>
                        {item.product_category ? (
                          <span className="shrink-0 rounded bg-surface-strong px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground">
                            {item.product_category}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-foreground/90 font-medium line-clamp-1 mt-0.5">
                        {item.product_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                        {item.product_size}
                        {item.product_surface ? ` · ${item.product_surface}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Trích dẫn AI Description (Văn phong kiến trúc) */}
                  <div className="rounded-xl bg-surface/80 border border-border/50 p-2.5 flex flex-col justify-between gap-1.5 flex-1">
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <span className="inline-flex items-center gap-1 text-terracotta">
                        <Sparkles className="size-3" />
                        Lời bình AI
                      </span>
                      <button
                        type="button"
                        onClick={() => openEditDescription(item)}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-surface-strong transition-colors cursor-pointer"
                        title="Chỉnh sửa nhanh lời bình kiến trúc"
                      >
                        <Pencil className="size-2.5" />
                        <span>Sửa</span>
                      </button>
                    </div>

                    {item.ai_description ? (
                      <p className="text-xs text-foreground/85 leading-relaxed line-clamp-3">
                        "{item.ai_description}"
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/60 italic">
                        Chưa có lời bình AI cho bối cảnh này. Nhấn nút "Sửa" để bổ sung.
                      </p>
                    )}
                  </div>
                </div>

                {/* Quick Controls ở chân card */}
                <div className="border-t border-border/60 p-3 bg-surface/50 flex items-center justify-between gap-2">
                  {/* 1. Toggle Switch / Button: "Hiện trên LD-page" vs "Ẩn khỏi LD-page" */}
                  {item.is_public === 1 ? (
                    <button
                      type="button"
                      disabled={busyPublicId === item.image_id}
                      onClick={() => void handleTogglePublic(item)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-2xs cursor-pointer active:scale-98 disabled:opacity-50"
                      title="Đang hiện trên Landing page. Bấm để ẩn khỏi web."
                    >
                      {busyPublicId === item.image_id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                      <span>Hiện LD-page</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyPublicId === item.image_id}
                      onClick={() => void handleTogglePublic(item)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface-strong transition-colors cursor-pointer active:scale-98 disabled:opacity-50"
                      title="Đang ẩn khỏi Landing page. Bấm để hiển thị trên web."
                    >
                      {busyPublicId === item.image_id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <EyeOff className="size-3.5" />
                      )}
                      <span>Ẩn khỏi LD-page</span>
                    </button>
                  )}

                  {/* 2. Nút "Hạ về thường" (Demote to normal): 2-step inline confirm */}
                  {demoteConfirmId === item.image_id ? (
                    <div className="flex items-center gap-1 animate-in fade-in-0 duration-150">
                      <button
                        type="button"
                        disabled={busyDemoteId === item.image_id}
                        onClick={() => void handleDemote(item)}
                        className="rounded-lg bg-destructive px-2 py-1 text-xs font-bold text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-2xs disabled:opacity-50"
                      >
                        {busyDemoteId === item.image_id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "Xác nhận hạ"
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={busyDemoteId === item.image_id}
                        onClick={() => setDemoteConfirmId(null)}
                        className="rounded-lg border border-border bg-surface-strong px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDemoteConfirmId(item.image_id)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                      title="Hạ ảnh concept này về ảnh thường (loại bỏ khỏi Lookbook)"
                    >
                      <ArrowDownToDot className="size-3.5" />
                      <span>Hạ về thường</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Phân trang (Pagination bar ở cuối trang) */}
      {/* 6. Phân trang (Pagination bar ở cuối trang đồng bộ Kho ảnh) */}
      {totalPages > 1 ? (
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border/70 pt-5 text-xs text-muted-foreground">
          <p>
            Hiển thị{" "}
            <span className="font-semibold text-foreground">
              {total === 0 ? 0 : ((page - 1) * limit + 1).toLocaleString("vi-VN")}
            </span>{" "}
            –{" "}
            <span className="font-semibold text-foreground">
              {Math.min(page * limit, total).toLocaleString("vi-VN")}
            </span>{" "}
            trên tổng số{" "}
            <span className="font-semibold text-foreground">{total.toLocaleString("vi-VN")}</span>{" "}
            bối cảnh
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Limit selector */}
            <div className="flex items-center bg-surface-strong/60 p-0.5 rounded-full border border-border/80 text-xs mr-1">
              {PAGE_LIMIT_OPTIONS.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => handleLimitChange(sz)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                    limit === sz
                      ? "bg-card font-semibold text-foreground shadow-xs ring-1 ring-black/5"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {sz}/tr
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={page <= 1 || isFetching}
              onClick={() => void handlePageChange(page - 1)}
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
                    disabled={isFetching}
                    onClick={() => void handlePageChange(num)}
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
              disabled={page >= totalPages || isFetching}
              onClick={() => void handlePageChange(page + 1)}
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
                  void handlePageChange(target);
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

      {/* 7. Dialog Quick Edit Description (Chỉnh sửa Lời bình Kiến trúc) */}
      <Dialog
        open={Boolean(editingItem)}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold tracking-tight">
              Biên tập Lời bình Kiến trúc AI
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Mô tả phong cách kiến trúc và cảm xúc không gian xuất hiện trang trọng bên cạnh ảnh bối
              cảnh trên Landing Page.
            </DialogDescription>
          </DialogHeader>

          {editingItem ? (
            <div className="space-y-4 py-2">
              {/* Reference Card: Mã gạch & Ảnh bối cảnh */}
              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface/60 p-3">
                <div className="size-14 rounded-lg overflow-hidden border border-border/80 bg-muted/40 shrink-0">
                  <img
                    src={editingItem.image_path}
                    alt={editingItem.product_code}
                    className="size-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-foreground">
                      {editingItem.product_code}
                    </span>
                    <span className="rounded bg-surface-strong px-1.5 py-0.2 text-[10px] text-muted-foreground">
                      {editingItem.product_category}
                    </span>
                  </div>
                  <p className="font-medium text-foreground/90 line-clamp-1 mt-0.5">
                    {editingItem.product_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {editingItem.product_size} · {editingItem.product_surface}
                  </p>
                </div>
              </div>

              {/* Textarea nhập lời bình */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Nội dung lời bình (Phong cách / Cảm hứng thiết kế)
                </label>
                <textarea
                  rows={4}
                  value={editDescText}
                  onChange={(e) => setEditDescText(e.target.value)}
                  placeholder="Ví dụ: Không gian phòng khách hiện đại với mảng tường ốp gạch men matt tone xám xi măng, kết hợp ánh sáng tự nhiên và nội thất gỗ tạo chiều sâu tĩnh tại..."
                  className="w-full rounded-xl border border-border/80 bg-card p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta transition-all resize-y font-sans"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Văn phong kiến trúc, gợi ý ứng dụng thực tế.</span>
                  <span>{editDescText.length} / 2000 ký tự</span>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              disabled={isSavingDesc}
              onClick={() => setEditingItem(null)}
              className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-surface-strong transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isSavingDesc}
              onClick={() => void handleSaveDescription()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-terracotta px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSavingDesc ? <Loader2 className="size-3.5 animate-spin" /> : null}
              <span>Lưu lời bình</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 8. Dialog Image Inspection Preview (Kiểm duyệt Phóng to Chi tiết) */}
      <Dialog
        open={Boolean(previewItem)}
        onOpenChange={(open) => {
          if (!open) setPreviewItem(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold tracking-tight">
              Chi tiết Bối cảnh Kiến trúc
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Xem chi tiết chất lượng ảnh phối cảnh, nhãn phòng AI và liên kết sản phẩm.
            </DialogDescription>
          </DialogHeader>

          {previewItem ? (
            <div className="space-y-4 py-2">
              {/* Main Image */}
              <div className="relative aspect-[16/10] w-full rounded-xl overflow-hidden bg-muted border border-border/80">
                <img
                  src={previewItem.image_path}
                  alt={previewItem.caption || previewItem.product_name}
                  className="size-full object-contain bg-black/90"
                />
              </div>

              {/* Grid thông tin bối cảnh & sản phẩm */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Cột 1: Thông tin sản phẩm gán vào ảnh */}
                <div className="rounded-xl border border-border/70 bg-surface/60 p-3.5 space-y-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Sản phẩm liên kết
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-lg border border-border/80 overflow-hidden bg-surface-strong shrink-0">
                      {previewItem.map_image ? (
                        <img
                          src={previewItem.map_image}
                          alt={previewItem.product_code}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-muted-foreground/50">
                          <Layers3 className="size-4" />
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="font-mono text-xs font-bold text-foreground">
                        {previewItem.product_code}
                      </span>
                      <p className="text-xs text-foreground/90 font-medium line-clamp-1">
                        {previewItem.product_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {previewItem.product_size} · {previewItem.product_surface}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cột 2: Tag không gian từ AI Vision */}
                <div className="rounded-xl border border-border/70 bg-surface/60 p-3.5 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Không gian nhận diện (AI Vision)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {previewItem.room_tags.length > 0 ? (
                      previewItem.room_tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground"
                        >
                          <Sparkles className="size-3 text-terracotta" />
                          <span>{ROOM_NAMES[tag.room_slug] || tag.room_slug}</span>
                          {tag.confidence ? (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              ({Math.round(tag.confidence * 100)}%)
                            </span>
                          ) : null}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        Chưa có tag không gian
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Lời bình AI */}
              <div className="rounded-xl border border-border/70 bg-surface/60 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-terracotta flex items-center gap-1">
                    <Sparkles className="size-3" />
                    Lời bình kiến trúc
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const it = previewItem;
                      setPreviewItem(null);
                      openEditDescription(it);
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline"
                  >
                    Chỉnh sửa lời bình
                  </button>
                </div>
                <p className="text-xs text-foreground/90 leading-relaxed">
                  {previewItem.ai_description ? (
                    `"${previewItem.ai_description}"`
                  ) : (
                    <span className="text-muted-foreground/60">
                      Chưa có lời bình cho ảnh này.
                    </span>
                  )}
                </p>
              </div>

              {/* Actions chân modal preview */}
              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyPublicId === previewItem.image_id}
                    onClick={() => void handleTogglePublic(previewItem)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer",
                      previewItem.is_public === 1
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "border border-border/80 bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {previewItem.is_public === 1 ? (
                      <>
                        <Eye className="size-3.5" />
                        <span>Đang hiện trên Landing Page (Bấm để ẩn)</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="size-3.5" />
                        <span>Đang ẩn khỏi Landing Page (Bấm để hiện)</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {demoteConfirmId === previewItem.image_id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busyDemoteId === previewItem.image_id}
                        onClick={() => void handleDemote(previewItem)}
                        className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground hover:bg-destructive/90 transition-colors"
                      >
                        {busyDemoteId === previewItem.image_id ? "Đang hạ..." : "Xác nhận hạ"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDemoteConfirmId(null)}
                        className="rounded-lg border border-border bg-surface-strong px-2.5 py-1.5 text-xs text-foreground hover:bg-accent"
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDemoteConfirmId(previewItem.image_id)}
                      className="inline-flex items-center gap-1 rounded-xl border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                    >
                      <ArrowDownToDot className="size-3.5" />
                      <span>Hạ về thường</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
