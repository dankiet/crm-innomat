import { useEffect, useState } from "react";
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
  deleteProductFn,
  updateProductFn,
  fetchProductFieldValues,
  clearProductFieldValueFn,
} from "@/api/functions";
import type { Product } from "@/lib/types";
import { PRODUCT_COLORS } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { formatVND } from "@/lib/format";
import { toast } from "sonner";

const SUGGEST_FIELDS = [
  "color",
  "supplier",
  "category",
  "surface",
  "shape",
  "collections",
] as const;
type SuggestField = (typeof SUGGEST_FIELDS)[number];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onEditImages?: () => void;
};

export function EditProductDialog({
  open,
  onOpenChange,
  product,
  onEditImages,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    size: "",
    material: "",
    surface: "",
    shape: "",
    collections: "",
    category: "",
    supplier: "",
    color: "",
    packing_m2: "",
    packing_pcs: "",
    retail_price: "",
    trade_price: "",
    b2b_price: "",
    discount_tp: "",
    discount_b2b: "",
    note: "",
    is_hot: false,
    image_path: "",
  });
  const [fieldOptions, setFieldOptions] = useState<
    Record<SuggestField, string[]>
  >({
    color: [],
    supplier: [],
    category: [],
    surface: [],
    shape: [],
    collections: [],
  });

  function loadFieldOptions() {
    return Promise.all(
      SUGGEST_FIELDS.map((field) =>
        fetchProductFieldValues({ data: { field } }).catch(() => [] as string[]),
      ),
    ).then((results) => {
      setFieldOptions(
        Object.fromEntries(
          SUGGEST_FIELDS.map((field, i) => [field, results[i]]),
        ) as Record<SuggestField, string[]>,
      );
    });
  }

  useEffect(() => {
    if (!open) return;
    void loadFieldOptions();
  }, [open]);

  async function handleDeleteOption(field: SuggestField, value: string) {
    try {
      const result = await clearProductFieldValueFn({ data: { field, value } });
      toast.success(`Đã xóa "${value}" khỏi ${result.updated} sản phẩm`);
      if (form[field] === value) {
        setForm((f) => ({ ...f, [field]: "" }));
      }
      await loadFieldOptions();
      router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thể xóa giá trị");
    }
  }

  useEffect(() => {
    if (!product || !open) return;
    setForm({
      code: product.code,
      name: product.name,
      size: product.size,
      material: product.material,
      surface: product.surface || "",
      shape: product.shape || "",
      collections: product.collections || "",
      category: product.category,
      supplier: product.supplier || "",
      color: product.color || "",
      packing_m2: product.packing_m2 != null ? String(product.packing_m2) : "",
      packing_pcs: product.packing_pcs != null ? String(product.packing_pcs) : "",
      retail_price: String(product.retail_price ?? ""),
      trade_price:
        product.trade_price != null && product.trade_price !== undefined
          ? String(product.trade_price)
          : "",
      b2b_price:
        product.b2b_price != null && product.b2b_price !== undefined
          ? String(product.b2b_price)
          : "",
      discount_tp:
        product.discount_tp != null ? String(product.discount_tp) : "",
      discount_b2b:
        product.discount_b2b != null ? String(product.discount_b2b) : "",
      note: product.note,
      is_hot: Boolean(product.is_hot),
      image_path: product.image_path || "",
    });
    setPendingDelete(false);
  }, [product, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    const price = Number(String(form.retail_price).replace(/\D/g, ""));
    const tradeRaw = String(form.trade_price).replace(/\D/g, "");
    const b2bRaw = String(form.b2b_price).replace(/\D/g, "");
    const trade_price = tradeRaw ? Number(tradeRaw) : null;
    const b2b_price = b2bRaw ? Number(b2bRaw) : null;
    if (!form.code.trim()) {
      toast.error("Mã sản phẩm bắt buộc");
      return;
    }
    if (!price || price <= 0) {
      toast.error("Giá bán lẻ không hợp lệ");
      return;
    }
    if (trade_price != null && trade_price < 0) {
      toast.error("Giá Thương Mại không hợp lệ");
      return;
    }
    if (b2b_price != null && b2b_price < 0) {
      toast.error("Giá B2B không hợp lệ");
      return;
    }
    let packing_m2: number | null = null;
    if (form.packing_m2.trim() !== "") {
      packing_m2 = Number(form.packing_m2.trim().replace(",", "."));
    }
    let packing_pcs: number | null = null;
    if (form.packing_pcs.trim() !== "") {
      packing_pcs = Number(form.packing_pcs.trim());
    }
    setSaving(true);
    try {
      await updateProductFn({
        data: {
          id: product.id,
          code: form.code.trim(),
          
          name: form.name.trim(),
          size: form.size.trim(),
          material: form.material.trim(),
          surface: form.surface.trim(),
          shape: form.shape.trim(),
          category: form.category.trim(),
          supplier: form.supplier.trim(),
          collections: form.collections.trim(),
          color: form.color.trim(),
          packing_m2,
          packing_pcs,
          retail_price: price,
          trade_price,
          b2b_price,
          discount_tp: form.discount_tp
            ? Math.round(Number(form.discount_tp))
            : null,
          discount_b2b: form.discount_b2b
            ? Math.round(Number(form.discount_b2b))
            : null,
          note: form.note.trim(),
          is_hot: form.is_hot ? 1 : 0,
          image_path: form.image_path.trim(),
        },
      });
      toast.success("Đã cập nhật sản phẩm");
      onOpenChange(false);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!product || deleting) return;
    if (!pendingDelete) {
      setPendingDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteProductFn({ data: { id: product.id } });
      toast.success(`Đã xóa ${product.code}`);
      onOpenChange(false);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xóa được");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sửa sản phẩm</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Nhận diện ── */}
          <FormSection title="Nhận diện">
            <div className="flex gap-3 items-start">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className="size-20 rounded-xl overflow-hidden ring-1 ring-black/5 bg-white">
                  <ProductImage
                    src={form.image_path}
                    code={form.code}
                    fit="contain"
                  />
                </div>
                {onEditImages ? (
                  <button
                    type="button"
                    onClick={onEditImages}
                    className="text-[10px] font-medium text-terracotta hover:underline"
                  >
                    Sửa hình
                    {product?.image_count
                      ? ` (${product.image_count})`
                      : ""}
                  </button>
                ) : null}
              </div>
              <div className="flex-1 space-y-2.5 min-w-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Field label="Mã báo giá *">
                    <input
                      className={inputCls}
                      value={form.code}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, code: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Mã nội bộ (HHDV)">
                    <div className="min-h-[38px] px-3 py-1.5 rounded-md border border-border/80 bg-surface/50 text-sm flex flex-wrap gap-1.5 items-center">
                      {product?.multi_codes_list ? (
                        product.multi_codes_list.split(',').map((code, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-card border border-border rounded-md text-xs font-semibold text-foreground shadow-xs">
                            {code.trim()}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground/50 text-[13px] italic">Chưa có liên kết mã nội bộ</span>
                      )}
                    </div>
                  </Field>
                </div>
                <Field label="Tên sản phẩm *">
                  <input
                    className={inputCls}
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </Field>
              </div>
            </div>
          </FormSection>

          {/* ── Thông số ── */}
          <FormSection title="Thông số">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Kích thước">
                <input
                  className={inputCls}
                  value={form.size}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, size: e.target.value }))
                  }
                  placeholder="vd. 600x600"
                />
              </Field>
              <Field label="Chất liệu">
                <input
                  className={inputCls}
                  value={form.material}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, material: e.target.value }))
                  }
                />
              </Field>
              <Field label="Bề mặt">
                <Combobox
                  value={form.surface}
                  onChange={(v) => setForm((f) => ({ ...f, surface: v }))}
                  options={fieldOptions.surface}
                  placeholder="vd. Bóng, Mờ, Gợn..."
                  onDeleteOption={(v) => handleDeleteOption("surface", v)}
                />
              </Field>
              <Field label="Kiểu dáng">
                <Combobox
                  value={form.shape}
                  onChange={(v) => setForm((f) => ({ ...f, shape: v }))}
                  options={fieldOptions.shape}
                  placeholder="vd. Hình vuông, vảy cá, dạng thanh KitKat..."
                  onDeleteOption={(v) => handleDeleteOption("shape", v)}
                />
              </Field>
              <Field label="Danh mục">
                <Combobox
                  value={form.category}
                  onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  options={fieldOptions.category}
                  onDeleteOption={(v) => handleDeleteOption("category", v)}
                />
              </Field>
              <Field label={"Nh\u00e0 cung c\u1ea5p"}>
                <Combobox
                  value={form.supplier}
                  onChange={(v) => setForm((f) => ({ ...f, supplier: v }))}
                  options={fieldOptions.supplier}
                  onDeleteOption={(v) => handleDeleteOption("supplier", v)}
                />
              </Field>
              <Field label={"B\u1ed9 s\u01b0u t\u1eadp"}>
                <Combobox
                  value={form.collections}
                  onChange={(v) => setForm((f) => ({ ...f, collections: v }))}
                  options={fieldOptions.collections}
                  placeholder="vd. Giả vân gỗ, giả đá, nhũ..."
                  onDeleteOption={(v) => handleDeleteOption("collections", v)}
                />
              </Field>
              <Field label="Màu sắc">
                <Combobox
                  value={form.color}
                  onChange={(v) => setForm((f) => ({ ...f, color: v }))}
                  options={Array.from(
                    new Set([...PRODUCT_COLORS, ...fieldOptions.color]),
                  )}
                  placeholder="Trắng, Xanh mint..."
                  onDeleteOption={(v) => handleDeleteOption("color", v)}
                  nonDeletableOptions={PRODUCT_COLORS}
                />
              </Field>
              <Field label="m² / Thùng">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={form.packing_m2}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, packing_m2: e.target.value }))
                  }
                  placeholder="vd. 1.44"
                />
              </Field>
              <Field label="Số lượng / Thùng">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={form.packing_pcs}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, packing_pcs: e.target.value }))
                  }
                  placeholder="vd. 4"
                />
              </Field>
            </div>
          </FormSection>

          {/* ── Giá & chiết khấu ── */}
          <FormSection title="Giá & chiết khấu">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <Field label="Giá bán lẻ (đ/m²) *">
                <input
                  className={inputCls}
                  value={form.retail_price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, retail_price: e.target.value }))
                  }
                />
              </Field>
              <Field label="Giá Thương mại (+VAT)">
                <input
                  className={inputCls}
                  value={form.trade_price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, trade_price: e.target.value }))
                  }
                  placeholder="Trade Price"
                />
              </Field>
              <Field label="Giá B2B (+VAT)">
                <input
                  className={inputCls}
                  value={form.b2b_price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, b2b_price: e.target.value }))
                  }
                  placeholder="Partner Price"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2.5 mt-2.5">
              <Field label="CK TP (%)">
                <input
                  type="number"
                  step="1"
                  className={inputCls}
                  value={form.discount_tp}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, discount_tp: e.target.value }))
                  }
                />
              </Field>
              <Field label="CK B2B (%)">
                <input
                  type="number"
                  step="1"
                  className={inputCls}
                  value={form.discount_b2b}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, discount_b2b: e.target.value }))
                  }
                />
              </Field>
            </div>
            {(form.trade_price || form.b2b_price) && (
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                Báo giá CK TP / B2B dùng giá tuyệt đối này
                {form.trade_price
                  ? ` · TP: ${formatVND(Number(String(form.trade_price).replace(/\D/g, "") || 0))}`
                  : ""}
                {form.b2b_price
                  ? ` · B2B: ${formatVND(Number(String(form.b2b_price).replace(/\D/g, "") || 0))}`
                  : ""}
              </p>
            )}
          </FormSection>

          {/* ── Tồn & ghi chú ── */}
          <FormSection title="Tồn kho & ghi chú">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex items-end pb-1">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={form.is_hot}
                  onClick={() =>
                    setForm((f) => ({ ...f, is_hot: !f.is_hot }))
                  }
                  className={
                    form.is_hot
                      ? "inline-flex items-center gap-2 h-10 px-3 rounded-lg text-sm font-medium bg-terracotta/10 text-terracotta ring-1 ring-terracotta/25 transition-colors"
                      : "inline-flex items-center gap-2 h-10 px-3 rounded-lg text-sm font-medium text-muted-foreground bg-surface-strong/50 ring-1 ring-black/5 hover:text-foreground transition-colors"
                  }
                >
                  <span
                    className={
                      form.is_hot
                        ? "size-4 rounded grid place-items-center bg-terracotta text-primary-foreground"
                        : "size-4 rounded grid place-items-center bg-card ring-1 ring-black/10"
                    }
                    aria-hidden
                  >
                    {form.is_hot ? (
                      <svg
                        viewBox="0 0 16 16"
                        className="size-2.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                      </svg>
                    ) : null}
                  </span>
                  Đánh dấu bán chạy
                </button>
              </div>
            </div>
            <div className="mt-2.5">
              <Field label="Ghi chú">
                <textarea
                  className={`${inputCls} min-h-[72px] resize-y`}
                  value={form.note}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, note: e.target.value }))
                  }
                  placeholder="Ghi chú nội bộ…"
                />
              </Field>
            </div>
          </FormSection>

          <DialogFooter className="gap-2 sm:justify-between pt-1">
            {pendingDelete ? (
              <div className="flex items-center gap-1.5 rounded-md bg-destructive/5 px-2 py-1 ring-1 ring-destructive/15 mr-auto">
                <span className="text-[11px] text-destructive font-medium">Xóa sản phẩm này?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[11px] font-medium px-2 py-1 rounded bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {deleting ? "Đang xóa…" : "Xóa"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setPendingDelete(false)}
                  className="text-[11px] font-medium px-2 py-1 rounded ring-1 ring-black/10 hover:bg-surface-strong disabled:opacity-50"
                >
                  Huỷ
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
                className="text-xs font-medium px-3 py-1.5 rounded text-destructive ring-1 ring-destructive/30 hover:bg-destructive/10 disabled:opacity-50 mr-auto"
              >
                Xóa sản phẩm
              </button>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-xs font-medium px-3 py-1.5 rounded ring-1 ring-black/5"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                className="text-xs font-medium text-primary-foreground px-3 py-1.5 bg-terracotta rounded disabled:opacity-50"
              >
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-surface-strong/25 px-3.5 py-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full text-sm px-3 py-2 rounded-md bg-background ring-1 ring-black/10 outline-none focus:ring-terracotta/40 text-foreground";
