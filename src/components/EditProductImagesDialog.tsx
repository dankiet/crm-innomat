import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ProductImage } from "@/components/ProductImage";
import {
  addProductImageByPathFn,
  deleteProductImageFn,
  fetchProductImages,
  setPrimaryProductImageFn,
  setProductImageKindFn,
  uploadProductImageFn,
} from "@/api/functions";
import type { Product, ProductImageRow, ProductImageKind } from "@/lib/types";
import { PRODUCT_IMAGE_KINDS, PRODUCT_IMAGE_KIND_LABELS } from "@/lib/types";
import { toast } from "sonner";
import { ImagePlus, Loader2, Star, Trash2, Upload, Link2 } from "lucide-react";
import { readImageFileAsWebpDataUrl } from "@/lib/image-upload";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  readOnly?: boolean;
};

export function EditProductImagesDialog({
  open,
  onOpenChange,
  product,
  readOnly = false,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ProductImageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<number | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [showPath, setShowPath] = useState(false);

  const load = useCallback(async (productId: number) => {
    setLoading(true);
    try {
      const rows = await fetchProductImages({
        data: { productId },
      });
      setImages(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tải được ảnh");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !product) return;
    void load(product.id);
    setPathInput("");
    setShowPath(false);
    setPendingDeleteId(null);
    setDeletingImageId(null);
  }, [open, product, load]);

  async function refreshAndInvalidate(productId: number) {
    await load(productId);
    await router.invalidate();
  }

  async function handleFiles(files: FileList | null) {
    if (!product || !files?.length) return;
    setBusy(true);
    try {
      let first = true;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`Bỏ qua ${file.name}: không phải ảnh`);
          continue;
        }
        if (file.size > 30 * 1024 * 1024) {
          toast.error(`Bỏ qua ${file.name}: ảnh gốc quá 30MB`);
          continue;
        }
        const dataBase64 = await readImageFileAsWebpDataUrl(file);
        await uploadProductImageFn({
          data: {
            product_id: product.id,
            filename: `${file.name.replace(/\.[^.]+$/, "")}.webp`,
            dataBase64,
            mimeType: "image/webp",
            is_primary: images.length === 0 && first,
          },
        });
        first = false;
      }
      toast.success("Đã thêm ảnh");
      await refreshAndInvalidate(product.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi upload");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleAddPath() {
    if (!product) return;
    const path = pathInput.trim();
    if (!path) {
      toast.error("Nhập đường dẫn / URL ảnh");
      return;
    }
    setBusy(true);
    try {
      await addProductImageByPathFn({
        data: {
          product_id: product.id,
          path,
          is_primary: images.length === 0,
        },
      });
      toast.success("Đã gắn ảnh theo đường dẫn");
      setPathInput("");
      await refreshAndInvalidate(product.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi thêm ảnh");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetPrimary(imageId: number) {
    if (!product) return;
    setBusy(true);
    try {
      const rows = await setPrimaryProductImageFn({
        data: { productId: product.id, imageId },
      });
      setImages(rows);
      toast.success("Đã đặt ảnh đại diện");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetKind(imageId: number, kind: ProductImageKind) {
    if (!product) return;
    setBusy(true);
    try {
      const rows = await setProductImageKindFn({
        data: { productId: product.id, imageId, kind },
      });
      setImages(rows);
      toast.success(`Đã gán: ${PRODUCT_IMAGE_KIND_LABELS[kind]}`);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi gán loại ảnh");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(imageId: number) {
    if (!product || pendingDeleteId !== imageId || deletingImageId !== null) return;
    setBusy(true);
    setDeletingImageId(imageId);
    try {
      const res = await deleteProductImageFn({ data: { imageId } });
      setImages(res.images);
      setPendingDeleteId(null);
      toast.success("Đã xoá ảnh");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi xoá");
    } finally {
      setDeletingImageId(null);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Hình sản phẩm
            {product ? (
              <span className="font-normal text-muted-foreground text-sm ml-2">
                {product.code} · {product.name}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Một mã có thể có nhiều ảnh. Ảnh gắn sao là ảnh đại diện trên danh mục.
            Gán loại: <b>Ảnh gạch (MAP)</b> — tối đa 1/sản phẩm; <b>Ảnh bối cảnh</b>; hoặc <b>Ảnh thường</b>.
          </p>

          {/* Add controls */}
          {!readOnly ? (
            <div className="rounded-lg ring-1 ring-black/5 bg-surface-strong/30 p-3 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                disabled={busy || !product}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-foreground px-3 py-2 bg-terracotta rounded shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                Tải ảnh lên
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowPath((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded ring-1 ring-black/10 bg-card hover:bg-surface-strong"
              >
                <Link2 className="size-3.5" />
                Gắn đường dẫn
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void handleFiles(e.target.files)}
              />
            </div>
            {showPath && (
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  placeholder="/images/... hoặc URL"
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAddPath()}
                  className="text-xs font-medium text-primary-foreground px-3 py-2 bg-terracotta rounded whitespace-nowrap disabled:opacity-50"
                >
                  Thêm
                </button>
              </div>
            )}
            </div>
          ) : null}

          {/* Gallery */}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">Đang tải...</p>
          ) : images.length === 0 ? (
            <div className="rounded-xl ring-1 ring-dashed ring-black/10 py-12 text-center">
              <ImagePlus className="size-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Chưa có ảnh. Tải ảnh lên.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {images.map((img) => (
                <div
                  key={img.id}
                  className={`rounded-xl overflow-hidden ring-1 bg-card ${
                    img.is_primary ? "ring-terracotta/50 shadow-sm" : "ring-black/5"
                  }`}
                >
                  <div className="aspect-square relative bg-white ring-inset ring-1 ring-black/5">
                    <ProductImage src={img.path} alt={img.caption || ""} fit="contain" />
                    {img.is_primary ? (
                      <span className="absolute top-2 left-2 text-[10px] font-medium bg-terracotta text-primary-foreground px-1.5 py-0.5 rounded">
                        Đại diện
                      </span>
                    ) : null}
                    {img.kind && img.kind !== "normal" ? (
                      <span
                        className={`absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded text-white ${
                          img.kind === "map" ? "bg-blue-600" : "bg-emerald-600"
                        }`}
                      >
                        {PRODUCT_IMAGE_KIND_LABELS[img.kind]}
                      </span>
                    ) : null}
                  </div>
                  {!readOnly ? (
                    <div className="p-2 space-y-1.5">
                    {pendingDeleteId === img.id ? (
                      <div className="space-y-1.5 rounded-md bg-destructive/5 p-1.5 ring-1 ring-destructive/15">
                        <p className="text-[10px] text-destructive">
                          Xoá ảnh này? Không thể hoàn tác.
                        </p>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={deletingImageId === img.id}
                            onClick={() => void handleDelete(img.id)}
                            className="flex-1 rounded bg-destructive px-2 py-1.5 text-[10px] font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            {deletingImageId === img.id ? "Đang xoá…" : "Xoá ảnh"}
                          </button>
                          <button
                            type="button"
                            disabled={deletingImageId === img.id}
                            onClick={() => setPendingDeleteId(null)}
                            className="rounded px-2 py-1.5 text-[10px] font-medium ring-1 ring-black/10 hover:bg-surface-strong disabled:opacity-50"
                          >
                            Huỷ
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        {!img.is_primary && (
                          <button
                            type="button"
                            disabled={busy}
                            title="Đặt làm đại diện"
                            onClick={() => void handleSetPrimary(img.id)}
                            className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] font-medium py-1.5 rounded ring-1 ring-black/10 hover:bg-surface-strong disabled:opacity-50"
                          >
                            <Star className="size-3" /> Đại diện
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          title="Xoá"
                          aria-label="Xoá ảnh"
                          onClick={() => setPendingDeleteId(img.id)}
                          className="size-8 grid place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                    {!readOnly && pendingDeleteId !== img.id ? (
                      <div className="flex gap-1">
                        {PRODUCT_IMAGE_KINDS.map((k) => {
                          const active = (img.kind ?? "normal") === k;
                          return (
                            <button
                              key={k}
                              type="button"
                              disabled={busy || active}
                              title={PRODUCT_IMAGE_KIND_LABELS[k]}
                              onClick={() => void handleSetKind(img.id, k)}
                              className={`flex-1 text-[10px] font-medium py-1 rounded ring-1 disabled:opacity-100 ${
                                active
                                  ? k === "map"
                                    ? "bg-blue-600 text-white ring-blue-600"
                                    : k === "concept"
                                      ? "bg-emerald-600 text-white ring-emerald-600"
                                      : "bg-foreground/80 text-background ring-foreground/80"
                                  : "ring-black/10 hover:bg-surface-strong disabled:opacity-50"
                              }`}
                            >
                              {k === "map" ? "MAP" : k === "concept" ? "Bối cảnh" : "Thường"}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">{images.length} ảnh</p>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-xs font-medium px-3 py-1.5 rounded ring-1 ring-black/5"
          >
            Đóng
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const inputCls =
  "w-full text-sm px-3 py-2 rounded-md bg-background ring-1 ring-black/10 outline-none focus:ring-terracotta/40 text-foreground";
