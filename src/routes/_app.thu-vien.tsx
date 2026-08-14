import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  FolderPlus,
  ImagePlus,
  Images,
  Loader2,
  Pencil,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addGalleryProductImagesFn,
  createGalleryCollectionFn,
  deleteGalleryCollectionFn,
  fetchGalleryCollection,
  fetchGalleryCollections,
  fetchGalleryImageCandidates,
  reorderGalleryItemsFn,
  removeGalleryItemFn,
  setGalleryCoverFn,
  updateGalleryCollectionFn,
  uploadGalleryImageFn,
} from "@/api/functions";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readImageFileAsWebpDataUrl } from "@/lib/image-upload";
import {
  buildExactCodeSet,
  codeRowFromProduct,
  matchSearchTokens,
  splitSearchTokens,
} from "@/lib/product-search";
import type { GalleryCollection, GalleryCollectionItem, GalleryImageCandidate } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/thu-vien")({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const [collections, candidates] = await Promise.all([
      fetchGalleryCollections(),
      fetchGalleryImageCandidates(),
    ]);
    return { collections, candidates };
  },
  component: GalleryPage,
});

type CollectionDetail = {
  collection: GalleryCollection;
  items: GalleryCollectionItem[];
};

type FacetKey =
  "category" | "supplier" | "color" | "surface" | "size" | "shape" | "collections" | "material";

const FACETS: Array<{ key: FacetKey; label: string }> = [
  { key: "category", label: "Nhóm" },
  { key: "supplier", label: "Nh\u00e0 cung c\u1ea5p" },
  { key: "color", label: "Màu" },
  { key: "surface", label: "Bề mặt" },
  { key: "size", label: "Kích thước" },
  { key: "shape", label: "Kiểu dáng" },
  { key: "collections", label: "B\u1ed9 s\u01b0u t\u1eadp" },
  { key: "material", label: "Chất liệu" },
];

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-terracotta/50 focus:ring-2 focus:ring-terracotta/10";

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLocaleLowerCase("vi")
    .trim();
}

function searchTokens(query: string): string[] {
  return splitSearchTokens(query, normalizeSearchText);
}

async function copyProductCodes(codes: string[], successMessage: string): Promise<void> {
  const text = [...new Set(codes.map((code) => code.trim()).filter(Boolean))].join(" ");
  if (!text) {
    toast.error("Không có mã sản phẩm để copy");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("Không copy được mã sản phẩm");
  }
}

function GalleryPage() {
  const router = useRouter();
  const loaderData = Route.useLoaderData() as {
    collections: GalleryCollection[];
    candidates: GalleryImageCandidate[];
  };
  const { user } = Route.useRouteContext();
  const isAdmin = user.role === "admin";
  const [collections, setCollections] = useState(loaderData.collections);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GalleryCollection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "created_at">("name");
  const deferredSearch = useDeferredValue(search);
  const uploadRef = useRef<HTMLInputElement>(null);
  const sortedCollections = useMemo(() => {
    const needle = normalizeSearchText(deferredSearch);
    const matchingCollectionNames = needle
      ? new Set(
          loaderData.candidates
            .filter((candidate) => normalizeSearchText(candidate.code).includes(needle))
            .map((candidate) => candidate.collections),
        )
      : null;
    return collections
      .filter(
        (collection) =>
          !needle ||
          normalizeSearchText(collection.name).includes(needle) ||
          matchingCollectionNames?.has(collection.name),
      )
      .sort((left, right) =>
        sortBy === "name"
          ? left.name.localeCompare(right.name, "vi", { sensitivity: "base" })
          : new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      );
  }, [collections, deferredSearch, loaderData.candidates, sortBy]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function refreshCollections() {
    const rows = await fetchGalleryCollections();
    setCollections(rows);
    return rows;
  }

  async function openCollection(id: number) {
    setSelectedId(id);
    setLoadingDetail(true);
    try {
      const result = await fetchGalleryCollection({ data: { id } });
      setDetail(result);
    } catch (error) {
      toast.error(errorMessage(error, "Không tải được bộ sưu tập"));
      setSelectedId(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function copyCollectionCodes(collection: GalleryCollection) {
    setBusy(true);
    try {
      const result = await fetchGalleryCollection({ data: { id: collection.id } });
      const codes = result.items.map((item) => item.product_code);
      await copyProductCodes(codes, `Đã copy mã sản phẩm của ${collection.name}`);
    } catch (error) {
      toast.error(errorMessage(error, "Không tải được mã sản phẩm"));
    } finally {
      setBusy(false);
    }
  }

  async function refreshDetail() {
    if (selectedId == null) return;
    const result = await fetchGalleryCollection({ data: { id: selectedId } });
    setDetail(result);
    await refreshCollections();
  }

  async function deleteCollection(collection: GalleryCollection) {
    if (confirmDeleteId !== collection.id) {
      setConfirmDeleteId(collection.id);
      return;
    }
    setBusy(true);
    try {
      await deleteGalleryCollectionFn({ data: { id: collection.id } });
      toast.success("Đã xóa bộ sưu tập");
      if (selectedId === collection.id) {
        setSelectedId(null);
        setDetail(null);
      }
      await refreshCollections();
    } catch (error) {
      toast.error(errorMessage(error, "Không xóa được bộ sưu tập"));
    } finally {
      setConfirmDeleteId(null);
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!detail || !files?.length) return;
    setBusy(true);
    let uploaded = 0;
    try {
      for (const file of Array.from(files)) {
        const dataBase64 = await readImageFileAsWebpDataUrl(file);
        await uploadGalleryImageFn({
          data: {
            collectionId: detail.collection.id,
            dataBase64,
            caption: file.name.replace(/\.[^.]+$/, ""),
          },
        });
        uploaded++;
      }
      toast.success(`Đã upload ${uploaded} ảnh WebP`);
      await refreshDetail();
    } catch (error) {
      toast.error(errorMessage(error, `Đã upload ${uploaded} ảnh trước khi gặp lỗi`));
    } finally {
      setBusy(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function removeItem(item: GalleryCollectionItem) {
    setBusy(true);
    try {
      await removeGalleryItemFn({ data: { itemId: item.id } });
      toast.success("Đã gỡ ảnh");
      await refreshDetail();
    } catch (error) {
      toast.error(errorMessage(error, "Không gỡ được ảnh"));
    } finally {
      setBusy(false);
    }
  }

  async function setCover(item: GalleryCollectionItem) {
    if (!detail) return;
    setBusy(true);
    try {
      await setGalleryCoverFn({
        data: { collectionId: detail.collection.id, itemId: item.id },
      });
      toast.success("Đã đặt ảnh đại diện");
      await refreshDetail();
    } catch (error) {
      toast.error(errorMessage(error, "Không đặt được ảnh đại diện"));
    } finally {
      setBusy(false);
    }
  }

  async function reorderItems(event: DragEndEvent) {
    if (!detail || event.over == null || event.active.id === event.over.id) return;
    const oldIndex = detail.items.findIndex((item) => item.id === event.active.id);
    const newIndex = detail.items.findIndex((item) => item.id === event.over!.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const previousItems = detail.items;
    const items = arrayMove(previousItems, oldIndex, newIndex).map((item, sortOrder) => ({
      ...item,
      sort_order: sortOrder,
    }));
    setDetail({ ...detail, items });
    setReordering(true);
    try {
      await reorderGalleryItemsFn({
        data: { collectionId: detail.collection.id, itemIds: items.map((item) => item.id) },
      });
      await refreshCollections();
    } catch (error) {
      setDetail({ ...detail, items: previousItems });
      toast.error(errorMessage(error, "Không lưu được thứ tự ảnh"));
    } finally {
      setReordering(false);
    }
  }

  if (selectedId != null) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setDetail(null);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Tất cả bộ sưu tập
        </button>
        {loadingDetail || !detail ? (
          <div className="grid min-h-64 place-items-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <>
            <PageHeader
              title={detail.collection.name}
              description={
                detail.collection.description || `${detail.items.length} ảnh trong bộ sưu tập`
              }
              actions={
                <>
                  <button
                    type="button"
                    disabled={!detail.items.some((item) => item.product_code)}
                    onClick={() =>
                      void copyProductCodes(
                        detail.items.map((item) => item.product_code),
                        `Đã copy toàn bộ mã trong ${detail.collection.name}`,
                      )
                    }
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-strong disabled:opacity-40 sm:h-9 sm:flex-none"
                  >
                    <Copy className="size-4" /> Copy toàn bộ mã
                  </button>
                  {isAdmin ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-terracotta px-3 text-xs font-medium text-primary-foreground sm:h-9 sm:flex-none"
                      >
                        <ImagePlus className="size-4" /> Chọn ảnh sản phẩm
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => uploadRef.current?.click()}
                        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-strong disabled:opacity-50 sm:h-9 sm:flex-none"
                      >
                        <Upload className="size-4" /> Upload ảnh
                      </button>
                      <input
                        ref={uploadRef}
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={(event) => void uploadFiles(event.target.files)}
                      />
                    </>
                  ) : null}
                </>
              }
            />
            {detail.items.length ? (
              <div className="space-y-2">
                {reordering ? (
                  <p className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Đang lưu thứ tự…
                  </p>
                ) : isAdmin ? (
                  <p className="text-right text-xs text-muted-foreground">
                    Kéo nút <GripVertical className="inline size-3.5" /> để đổi vị trí ảnh.
                  </p>
                ) : null}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => void reorderItems(event)}
                >
                  <SortableContext
                    items={detail.items.map((item) => item.id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
                      {detail.items.map((item, index) => (
                        <SortableGalleryCard
                          key={item.id}
                          item={item}
                          isCover={detail.collection.cover_path === item.path}
                          canEdit={isAdmin}
                          disabled={busy || reordering}
                          onView={() => setViewerIndex(index)}
                          onSetCover={() => void setCover(item)}
                          onRemove={() => void removeItem(item)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            ) : (
              <EmptyCollection canEdit={isAdmin} onAdd={() => setPickerOpen(true)} />
            )}
          </>
        )}
        {detail ? (
          <>
            <ImagePickerDialog
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              collection={detail}
              candidates={loaderData.candidates}
              onAdded={refreshDetail}
            />
            <GalleryViewerDialog
              open={viewerIndex !== null}
              items={detail.items}
              initialIndex={viewerIndex ?? 0}
              onOpenChange={(open) => {
                if (!open) setViewerIndex(null);
              }}
            />
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Thư viện"
        description="Tạo bộ sưu tập từ ảnh sản phẩm hoặc upload ảnh riêng. Ảnh được chuẩn hóa WebP và chỉ xóa khỏi Storage khi hết mọi tham chiếu."
        actions={
          isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-terracotta px-3 text-xs font-medium text-primary-foreground"
            >
              <FolderPlus className="size-4" /> Tạo bộ sưu tập
            </button>
          ) : null
        }
      />
      {collections.length ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="relative inline-flex items-center">
            <ArrowUpDown className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "name" | "created_at")}
              className="h-9 rounded-lg border border-border bg-card pl-9 pr-3 text-xs font-medium outline-none"
              aria-label="Sắp xếp bộ sưu tập"
            >
              <option value="name">Theo tên</option>
              <option value="created_at">Theo ngày tạo</option>
            </select>
          </label>
          <label className="relative min-w-56 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm tên thư viện hoặc mã sản phẩm..."
              className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-terracotta/50 focus:ring-2 focus:ring-terracotta/10"
            />
          </label>
        </div>
      ) : null}
      {sortedCollections.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {sortedCollections.map((collection) => (
            <article
              key={collection.id}
              className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <button
                type="button"
                onClick={() => void openCollection(collection.id)}
                className="block w-full text-left"
              >
                <div className="aspect-[16/10] bg-white">
                  <ProductImage
                    src={collection.cover_path}
                    alt={collection.name}
                    fit="cover"
                    loading="eager"
                    placeholderClassName="bg-surface-strong/40"
                  />
                </div>
                <div className="min-w-0 space-y-1 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="truncate text-sm font-medium">{collection.name}</h2>
                    <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[10px] text-muted-foreground">
                      {collection.item_count} ảnh
                    </span>
                  </div>
                  <p className="line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
                    {collection.description || "Chưa có mô tả"}
                  </p>
                </div>
              </button>
              {isAdmin ? (
                <div className="flex justify-end gap-1 border-t border-border px-3 py-2">
                  <button
                    type="button"
                    disabled={busy || collection.item_count === 0}
                    onClick={() => void copyCollectionCodes(collection)}
                    className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-surface-strong hover:text-foreground disabled:opacity-40"
                    aria-label={`Copy toàn bộ mã sản phẩm của ${collection.name}`}
                    title="Copy toàn bộ mã sản phẩm"
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditing(collection);
                      setFormOpen(true);
                    }}
                    className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-surface-strong hover:text-foreground"
                    aria-label="Sửa bộ sưu tập"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  {confirmDeleteId === collection.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void deleteCollection(collection)}
                        className="h-8 shrink-0 rounded-md bg-red-600 px-2.5 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-40"
                      >
                        Xóa vĩnh viễn
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmDeleteId(null)}
                        className="h-8 shrink-0 rounded-md px-2.5 text-[11px] font-medium ring-1 ring-black/5 hover:bg-surface-strong disabled:opacity-40"
                      >
                        Không xóa
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDeleteId(collection.id)}
                      className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Xóa bộ sưu tập"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex justify-end border-t border-border px-3 py-2">
                  <button
                    type="button"
                    disabled={busy || collection.item_count === 0}
                    onClick={() => void copyCollectionCodes(collection)}
                    className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-surface-strong hover:text-foreground disabled:opacity-40"
                    aria-label={`Copy toàn bộ mã sản phẩm của ${collection.name}`}
                    title="Copy toàn bộ mã sản phẩm"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border bg-card/50 text-center">
          <div className="space-y-3">
            <Images className="mx-auto size-10 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">Chưa có bộ sưu tập</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tạo bộ đầu tiên để gom ảnh theo dự án hoặc ý tưởng.
              </p>
            </div>
          </div>
        </div>
      )}
      <CollectionFormDialog
        key={`${editing?.id ?? "new"}:${formOpen ? "open" : "closed"}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        collection={editing}
        onSaved={async (saved) => {
          await refreshCollections();
          setFormOpen(false);
          setEditing(null);
          if (!editing) await openCollection(saved.id);
          await router.invalidate();
        }}
      />
    </div>
  );
}

function SortableGalleryCard({
  item,
  isCover,
  canEdit,
  disabled,
  onView,
  onSetCover,
  onRemove,
}: {
  item: GalleryCollectionItem;
  isCover: boolean;
  canEdit: boolean;
  disabled: boolean;
  onView: () => void;
  onSetCover: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: disabled || !canEdit,
  });
  const [confirming, setConfirming] = useState(false);

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        isDragging && "z-20 opacity-80 shadow-xl ring-2 ring-terracotta/40",
      )}
    >
      <button
        type="button"
        onClick={onView}
        className="relative block aspect-square w-full bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-terracotta"
        aria-label={`Xem ảnh ${item.product_code || item.caption || "tải lên"}`}
      >
        <ProductImage
          src={item.path}
          alt={item.caption || item.product_name}
          fit="contain"
          loading="eager"
          className="p-2"
        />
        {isCover ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-terracotta px-2 py-1 text-[10px] font-medium text-white shadow">
            <Star className="size-3 fill-current" /> Đại diện
          </span>
        ) : null}
      </button>
      <div className="space-y-2 p-2.5 sm:p-3">
        <div className="min-h-9">
          <div className="flex items-center gap-1">
            <p className="min-w-0 flex-1 truncate text-xs font-medium">
              {item.product_code || item.caption || "Ảnh tải lên"}
            </p>
            {item.product_code ? (
              <button
                type="button"
                onClick={() =>
                  void copyProductCodes([item.product_code], `Đã copy ${item.product_code}`)
                }
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-strong hover:text-foreground"
                aria-label={`Copy mã ${item.product_code}`}
                title="Copy mã sản phẩm"
              >
                <Copy className="size-3.5" />
              </button>
            ) : null}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {item.product_name || item.caption || "Không gắn sản phẩm"}
          </p>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={disabled}
              className="grid size-10 shrink-0 touch-none place-items-center rounded-lg border border-border text-muted-foreground hover:bg-surface-strong hover:text-foreground disabled:opacity-50"
              aria-label="Kéo để đổi vị trí"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onRemove}
                  className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg bg-red-600 px-1.5 text-[10px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Xóa vĩnh viễn
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setConfirming(false)}
                  className="flex h-10 shrink-0 items-center justify-center rounded-lg border border-border px-2 text-[10px] hover:bg-surface-strong disabled:opacity-50"
                >
                  Không xóa
                </button>
              </>
            ) : (
              <>
                {!isCover ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={onSetCover}
                    className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-border px-1.5 text-[10px] hover:bg-surface-strong disabled:opacity-50"
                  >
                    <Star className="size-3.5" /> <span className="truncate">Đại diện</span>
                  </button>
                ) : (
                  <span className="flex-1" />
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setConfirming(true)}
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  aria-label="Gỡ ảnh"
                >
                  <Trash2 className="size-4" />
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function GalleryViewerDialog({
  open,
  items,
  initialIndex,
  onOpenChange,
}: {
  open: boolean;
  items: GalleryCollectionItem[];
  initialIndex: number;
  onOpenChange: (open: boolean) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const item = items[index];
  const hasMultiple = items.length > 1;

  useEffect(() => {
    if (open) setIndex(Math.min(initialIndex, Math.max(items.length - 1, 0)));
  }, [initialIndex, items.length, open]);

  useEffect(() => {
    if (!open || !hasMultiple) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((current) => (current - 1 + items.length) % items.length);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((current) => (current + 1) % items.length);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasMultiple, items.length, open]);

  function move(direction: -1 | 1) {
    setIndex((current) => (current + direction + items.length) % items.length);
  }

  function finishSwipe(clientX: number, clientY: number) {
    if (!swipeStart.current || !hasMultiple) return;
    const deltaX = clientX - swipeStart.current.x;
    const deltaY = clientY - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) move(deltaX < 0 ? 1 : -1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 flex h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-black p-0 text-white sm:inset-0 sm:h-[100dvh] sm:max-h-none sm:w-screen sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-0 [&>button]:z-30 [&>button]:grid [&>button]:size-11 [&>button]:place-items-center [&>button]:rounded-full [&>button]:bg-black/50 [&>button]:text-white">
        <DialogHeader className="sr-only">
          <DialogTitle>Xem ảnh bộ sưu tập</DialogTitle>
        </DialogHeader>
        {item ? (
          <>
            <div
              className="relative min-h-0 flex-1 touch-pan-y select-none"
              onPointerDown={(event) => {
                swipeStart.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerUp={(event) => finishSwipe(event.clientX, event.clientY)}
              onPointerCancel={() => {
                swipeStart.current = null;
              }}
            >
              <ProductImage
                key={item.id}
                src={item.path}
                alt={item.caption || item.product_name}
                fit="contain"
                loading="eager"
                className="p-3 pb-20 pt-[max(3.5rem,env(safe-area-inset-top))] sm:p-8 sm:pb-24"
              />
              {hasMultiple ? (
                <>
                  <button
                    type="button"
                    onClick={() => move(-1)}
                    className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 sm:left-5"
                    aria-label="Ảnh trước"
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(1)}
                    className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 sm:right-5"
                    aria-label="Ảnh sau"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pb-3 pt-14 sm:px-6">
                <div className="mx-auto flex max-w-4xl items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.product_code || item.caption || "Ảnh tải lên"}
                    </p>
                    <p className="truncate text-xs text-white/65">
                      {item.product_name || item.caption || "Không gắn sản phẩm"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-white/70">
                    {index + 1} / {items.length}
                  </span>
                </div>
              </div>
            </div>
            {hasMultiple ? (
              <div className="shrink-0 border-t border-white/10 bg-black px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
                <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto overscroll-x-contain pb-1">
                  {items.map((thumbnail, thumbnailIndex) => (
                    <button
                      key={thumbnail.id}
                      type="button"
                      onClick={() => setIndex(thumbnailIndex)}
                      className={cn(
                        "size-14 shrink-0 overflow-hidden rounded-lg border-2 bg-white sm:size-16",
                        thumbnailIndex === index
                          ? "border-terracotta"
                          : "border-transparent opacity-60",
                      )}
                      aria-label={`Xem ảnh ${thumbnailIndex + 1}`}
                    >
                      <ProductImage
                        src={thumbnail.path}
                        alt={thumbnail.caption || thumbnail.product_name}
                        loading="eager"
                        className="p-0.5"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CollectionFormDialog({
  open,
  onOpenChange,
  collection,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: GalleryCollection | null;
  onSaved: (collection: GalleryCollection) => Promise<void>;
}) {
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [busy, setBusy] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(collection?.name ?? "");
      setDescription(collection?.description ?? "");
    }
    onOpenChange(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = collection
        ? await updateGalleryCollectionFn({
            data: { id: collection.id, name, description },
          })
        : await createGalleryCollectionFn({ data: { name, description } });
      toast.success(collection ? "Đã cập nhật bộ sưu tập" : "Đã tạo bộ sưu tập");
      await onSaved(saved);
    } catch (error) {
      toast.error(errorMessage(error, "Không lưu được bộ sưu tập"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{collection ? "Sửa bộ sưu tập" : "Tạo bộ sưu tập"}</DialogTitle>
          </DialogHeader>
          <label className="block space-y-1.5 text-xs">
            <span className="text-muted-foreground">Tên bộ sưu tập</span>
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="block space-y-1.5 text-xs">
            <span className="text-muted-foreground">Mô tả</span>
            <textarea
              className={cn(inputClass, "min-h-24 resize-y")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-lg border border-border px-3 text-xs"
            >
              Hủy
            </button>
            <button
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-terracotta px-4 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Lưu
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImagePickerDialog({
  open,
  onOpenChange,
  collection,
  candidates,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: CollectionDetail;
  candidates: GalleryImageCandidate[];
  onAdded: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Partial<Record<FacetKey, string>>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const existingPaths = useMemo(
    () => new Set(collection.items.map((item) => item.path)),
    [collection.items],
  );
  const available = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          !existingPaths.has(candidate.path) &&
          (candidate.gallery_collection_ids.length === 0 ||
            candidate.gallery_collection_ids.some(
              (collectionId) => Number(collectionId) === collection.collection.id,
            )),
      ),
    [candidates, collection.collection.id, existingPaths],
  );
  const searchRows = useMemo(
    () =>
      available.map((row) => ({
        row,
        index: codeRowFromProduct(row.code, row.internal_codes, normalizeSearchText),
          searchable: normalizeSearchText(
            [row.code, row.internal_codes, row.name, row.supplier]
              .filter(Boolean)
              .join(" "),
          ),
      })),
    [available],
  );
  const exactSet = useMemo(
    () =>
      buildExactCodeSet(
        candidates.map((row) =>
          codeRowFromProduct(row.code, row.internal_codes, normalizeSearchText),
        ),
      ),
    [candidates],
  );
  const tokens = useMemo(() => searchTokens(deferredQuery), [deferredQuery]);
  const options = useMemo(() => {
    const result = {} as Record<FacetKey, Array<{ value: string; count: number }>>;
    for (const facet of FACETS) {
      const productsByValue = new Map<string, Set<number>>();
      for (const { row, index, searchable } of searchRows) {
        if (!matchSearchTokens(index, tokens, searchable, exactSet)) continue;
        if (
          FACETS.some(({ key }) => key !== facet.key && filters[key] && row[key] !== filters[key])
        ) {
          continue;
        }
        const value = row[facet.key]?.trim();
        if (!value) continue;
        const productIds = productsByValue.get(value) ?? new Set<number>();
        productIds.add(row.product_id);
        productsByValue.set(value, productIds);
      }
      result[facet.key] = [...productsByValue.entries()]
        .map(([value, productIds]) => ({ value, count: productIds.size }))
        .sort((a, b) => a.value.localeCompare(b.value, "vi"));
    }
    return result;
  }, [searchRows, tokens, exactSet, filters]);
  const filtered = useMemo(() => {
    const matches = searchRows
      .filter(({ row, index, searchable }) => {
        if (!matchSearchTokens(index, tokens, searchable, exactSet)) return false;
        return FACETS.every(({ key }) => !filters[key] || row[key] === filters[key]);
      })
      .map(({ row }) => row);
    const uniqueByPath = new Map<string, GalleryImageCandidate>();
    for (const candidate of matches) {
      if (!uniqueByPath.has(candidate.path)) uniqueByPath.set(candidate.path, candidate);
    }
    return [...uniqueByPath.values()];
  }, [searchRows, tokens, exactSet, filters]);
  const groups = useMemo(() => {
    const map = new Map<number, GalleryImageCandidate[]>();
    for (const image of filtered) {
      const rows = map.get(image.product_id) ?? [];
      rows.push(image);
      map.set(image.product_id, rows);
    }
    return [...map.values()];
  }, [filtered]);
  useEffect(() => {
    if (!open) {
      setQuery("");
      setFilters({});
      setSelected(new Set());
    }
  }, [open]);

  function toggle(ids: number[]) {
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function addSelected() {
    if (!selected.size) return;
    setBusy(true);
    try {
      const result = await addGalleryProductImagesFn({
        data: {
          collectionId: collection.collection.id,
          productImageIds: [...selected],
        },
      });
      toast.success(`Đã thêm ${result.added} ảnh`);
      setSelected(new Set());
      await onAdded();
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Không thêm được ảnh"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:h-[90vh] sm:max-w-6xl sm:p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 sm:px-6">
          <DialogTitle>Chọn ảnh sản phẩm · {collection.collection.name}</DialogTitle>
        </DialogHeader>
        <div className="z-10 shrink-0 space-y-3 border-b border-border bg-background px-4 py-3 sm:px-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm mã sản phẩm, tên hoặc mã nội bộ…"
              autoComplete="off"
              inputMode="search"
              enterKeyHint="search"
              className={cn(inputClass, "h-11 pl-9 pr-10")}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-strong hover:text-foreground"
                aria-label="Xóa nội dung tìm kiếm"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {FACETS.map((facet) => (
              <select
                key={facet.key}
                value={filters[facet.key] ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, [facet.key]: event.target.value }))
                }
                className="h-10 min-w-0 rounded-lg border border-border bg-background px-2 text-xs"
              >
                <option value="">{facet.label}</option>
                {options[facet.key].map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value} ({option.count})
                  </option>
                ))}
              </select>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {FACETS.filter(({ key }) => filters[key]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilters((current) => ({ ...current, [key]: "" }))}
                className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft px-2.5 py-1 text-[11px] text-terracotta"
              >
                {label}: {filters[key]} <X className="size-3" />
              </button>
            ))}
            <span className="text-xs text-muted-foreground">
              {groups.length} sản phẩm · {filtered.length} ảnh
            </span>
          </div>
          <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto rounded-lg bg-surface-strong/50 p-2 sm:max-h-none">
            <QuickSelect
              label="Chọn mọi ảnh đang lọc"
              onClick={() => setSelected(new Set(filtered.map((row) => row.product_image_id)))}
            />
            <QuickSelect
              label="Chọn ảnh chính đang lọc"
              onClick={() =>
                setSelected(
                  new Set(
                    groups.map(
                      (rows) => (rows.find((row) => row.is_primary) ?? rows[0])!.product_image_id,
                    ),
                  ),
                )
              }
            />
            <QuickSelect label="Bỏ chọn" onClick={() => setSelected(new Set())} />
            <span className="ml-auto self-center text-xs font-medium text-terracotta">
              Đã chọn {selected.size}
            </span>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
          {groups.map((images) => {
            const first = images[0]!;
            const ids = images.map((image) => image.product_image_id);
            const allSelected = ids.every((id) => selected.has(id));
            return (
              <section key={first.product_id} className="rounded-xl border border-border p-3">
                <div className="mb-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggle(ids)}
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-md border text-white",
                      allSelected
                        ? "border-terracotta bg-terracotta"
                        : "border-border bg-background",
                    )}
                  >
                    {allSelected ? <Check className="size-4" /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {first.code} · {first.name}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {first.internal_codes || "Không có mã nội bộ"} · {images.length} ảnh
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(ids)}
                    className="min-h-10 shrink-0 px-1 text-[11px] font-medium text-terracotta"
                  >
                    {allSelected ? "Bỏ cả SP" : "Chọn cả SP"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 sm:grid-cols-5 lg:grid-cols-8">
                  {images.map((image) => {
                    const checked = selected.has(image.product_image_id);
                    return (
                      <button
                        key={image.product_image_id}
                        type="button"
                        onClick={() => toggle([image.product_image_id])}
                        className={cn(
                          "relative aspect-square overflow-hidden rounded-lg border-2 bg-white p-1",
                          checked ? "border-terracotta" : "border-transparent ring-1 ring-border",
                        )}
                      >
                        <ProductImage src={image.path} alt={image.caption || first.code} />
                        <span
                          className={cn(
                            "absolute right-1 top-1 grid size-7 place-items-center rounded-full border text-white shadow",
                            checked
                              ? "border-terracotta bg-terracotta"
                              : "border-white bg-black/25",
                          )}
                        >
                          {checked ? <Check className="size-3" /> : null}
                        </span>
                        {image.is_primary ? (
                          <Star className="absolute bottom-1 left-1 size-4 fill-amber-400 text-amber-500 drop-shadow" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {!groups.length ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Không có ảnh phù hợp bộ lọc.
            </p>
          ) : null}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-lg border border-border px-4 text-xs"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={!selected.size || busy}
            onClick={() => void addSelected()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-terracotta px-4 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}{" "}
            Thêm {selected.size} ảnh
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickSelect({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] hover:border-terracotta/40"
    >
      {label}
    </button>
  );
}

function EmptyCollection({ canEdit, onAdd }: { canEdit: boolean; onAdd: () => void }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border text-center">
      <div className="space-y-3">
        <Images className="mx-auto size-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">Bộ sưu tập đang trống</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Chọn nhanh ảnh theo sản phẩm hoặc upload ảnh riêng.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-lg bg-terracotta px-3 py-2 text-xs font-medium text-white"
          >
            Chọn ảnh sản phẩm
          </button>
        ) : null}
      </div>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
