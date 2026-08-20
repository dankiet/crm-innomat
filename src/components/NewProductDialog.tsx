import { useEffect, useRef, useState } from "react";
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
  createProductFn,
  fetchProductFieldValues,
  clearProductFieldValueFn,
  syncProductInternalCodesFn,
} from "@/api/functions";
import { PRODUCT_COLORS } from "@/lib/types";
import { ProductSuggestionField } from "@/components/ProductSuggestionField";
import { formatVND } from "@/lib/format";
import { toast } from "sonner";
import { parseInternalCodesList } from "@/lib/product-internal-codes";

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
  /** Prefill danh mục khi đang filter 1 nhóm SP */
  defaultCategory?: string;
  canManageOptions?: boolean;
  onCreated?: () => void;
};

const emptyForm = {
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
};

export function NewProductDialog({
  open,
  onOpenChange,
  defaultCategory = "",
  canManageOptions = false,
  onCreated,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [internalCodes, setInternalCodes] = useState<string[]>([]);
  const [newInternalCode, setNewInternalCode] = useState("");
  const [pendingInternalCodeDelete, setPendingInternalCodeDelete] = useState<string | null>(
    null,
  );
  const savedSinceOpenRef = useRef(false);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldOptions, setFieldOptions] = useState<Record<SuggestField, string[]>>({
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
        Object.fromEntries(SUGGEST_FIELDS.map((field, i) => [field, results[i]])) as Record<
          SuggestField,
          string[]
        >,
      );
    });
  }

  useEffect(() => {
    if (!open) return;
    void loadFieldOptions();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...emptyForm,
      category: defaultCategory.trim(),
    });
    setInternalCodes([]);
    setNewInternalCode("");
    setPendingInternalCodeDelete(null);
    setCreatedId(null);
    savedSinceOpenRef.current = false;
    setSaving(false);
  }, [open, defaultCategory]);

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

  async function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && savedSinceOpenRef.current) {
      onCreated?.();
      await router.invalidate();
    }
    onOpenChange(nextOpen);
  }

  function addInternalCode() {
    const nextCodes = parseInternalCodesList(...internalCodes, newInternalCode);
    if (nextCodes.length === internalCodes.length) {
      if (newInternalCode.trim()) toast.error("Mã nội bộ đã có trong danh sách");
      return;
    }
    setInternalCodes(nextCodes);
    setNewInternalCode("");
  }

  function resetForAnother() {
    setForm({
      ...emptyForm,
      category: defaultCategory.trim(),
    });
    setInternalCodes([]);
    setNewInternalCode("");
    setPendingInternalCodeDelete(null);
    setCreatedId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      const product = await createProductFn({
        data: {
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
          discount_tp: form.discount_tp ? Math.round(Number(form.discount_tp)) : null,
          discount_b2b: form.discount_b2b ? Math.round(Number(form.discount_b2b)) : null,
          note: form.note.trim(),
          is_hot: form.is_hot ? 1 : 0,
          image_path: form.image_path.trim(),
        },
      });

      if (internalCodes.length) {
        const synced = await syncProductInternalCodesFn({
          data: { product_id: product.id, internal_codes: internalCodes },
        });
        setInternalCodes(synced.internal_codes);
      }

      setCreatedId(product.id);
      savedSinceOpenRef.current = true;
      toast.success(`Đã tạo sản phẩm ${product.code}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi tạo sản phẩm");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => void handleOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo sản phẩm</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {createdId ? (
            <p className="rounded-lg bg-emerald-50 text-emerald-800 text-xs px-3 py-2 ring-1 ring-emerald-200/80">
              Đã tạo thành công (#{createdId}). Bấm «Tạo sản phẩm khác» để nhập tiếp, hoặc «Đóng»
              để làm mới danh sách. Ảnh có thể thêm sau bằng Sửa hình trên thẻ SP.
            </p>
          ) : null}

          <FormSection title="Nhận diện">
            <div className="flex gap-3 items-start">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className="size-20 rounded-xl overflow-hidden ring-1 ring-black/5 bg-white">
                  <ProductImage src={form.image_path} code={form.code} fit="contain" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center max-w-[5.5rem] leading-tight">
                  Thêm ảnh sau khi tạo (Sửa hình)
                </p>
              </div>
              <div className="flex-1 space-y-2.5 min-w-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Field label="Mã báo giá *">
                    <input
                      className={inputCls}
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                      autoFocus
                    />
                  </Field>
                  <Field label="Mã nội bộ (HHDV)">
                    <div className="space-y-2">
                      <div className="min-h-[38px] px-2 py-1.5 rounded-md border border-border/80 bg-surface/50 text-sm flex flex-wrap gap-1.5 items-center">
                        {internalCodes.length ? (
                          internalCodes.map((code) => (
                            <span
                              key={code}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-card border border-border rounded-md text-xs font-semibold text-foreground shadow-xs"
                            >
                              {code}
                              <button
                                type="button"
                                onClick={() => setPendingInternalCodeDelete(code)}
                                className="text-muted-foreground hover:text-red-600"
                                aria-label={`Xóa mã ${code}`}
                              >
                                ×
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground/50 text-[13px] italic">
                            Tùy chọn — liên kết sau khi tạo
                          </span>
                        )}
                      </div>
                      {pendingInternalCodeDelete ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-red-700">
                            Bỏ {pendingInternalCodeDelete} khỏi danh sách?
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setInternalCodes((codes) =>
                                codes.filter((code) => code !== pendingInternalCodeDelete),
                              );
                              setPendingInternalCodeDelete(null);
                            }}
                            className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700"
                          >
                            Xóa
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingInternalCodeDelete(null)}
                            className="rounded border border-border px-2 py-1 hover:bg-surface-strong"
                          >
                            Không xóa
                          </button>
                        </div>
                      ) : null}
                      <div className="flex gap-1.5">
                        <input
                          className={inputCls}
                          value={newInternalCode}
                          onChange={(event) => setNewInternalCode(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addInternalCode();
                            }
                          }}
                          placeholder="Nhập mã rồi nhấn Enter"
                        />
                        <button
                          type="button"
                          onClick={addInternalCode}
                          className="shrink-0 rounded-md border border-border px-3 text-xs font-semibold hover:bg-surface-strong"
                        >
                          Thêm
                        </button>
                      </div>
                    </div>
                  </Field>
                </div>
                <Field label="Tên sản phẩm">
                  <input
                    className={inputCls}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Để trống = dùng mã báo giá"
                  />
                </Field>
              </div>
            </div>
          </FormSection>

          <FormSection title="Thông số">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Kích thước">
                <input
                  className={inputCls}
                  value={form.size}
                  onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                  placeholder="vd. 600x600"
                />
              </Field>
              <Field label="Chất liệu">
                <input
                  className={inputCls}
                  value={form.material}
                  onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))}
                />
              </Field>
              <Field label="Bề mặt">
                <ProductSuggestionField
                  value={form.surface}
                  onChange={(v) => setForm((f) => ({ ...f, surface: v }))}
                  options={fieldOptions.surface}
                  placeholder="— Chọn bề mặt —"
                  label="bề mặt"
                  canManageOptions={canManageOptions}
                  onDeleteOption={(option) => void handleDeleteOption("surface", option)}
                />
              </Field>
              <Field label="Kiểu dáng">
                <ProductSuggestionField
                  value={form.shape}
                  onChange={(v) => setForm((f) => ({ ...f, shape: v }))}
                  options={fieldOptions.shape}
                  placeholder="— Chọn kiểu dáng —"
                  label="kiểu dáng"
                  canManageOptions={canManageOptions}
                  onDeleteOption={(option) => void handleDeleteOption("shape", option)}
                />
              </Field>
              <Field label="Danh mục">
                <ProductSuggestionField
                  value={form.category}
                  onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  options={fieldOptions.category}
                  placeholder="— Chọn danh mục —"
                  label="danh mục"
                  canManageOptions={canManageOptions}
                  onDeleteOption={(option) => void handleDeleteOption("category", option)}
                />
              </Field>
              <Field label={"Nh\u00e0 cung c\u1ea5p"}>
                <ProductSuggestionField
                  value={form.supplier}
                  onChange={(v) => setForm((f) => ({ ...f, supplier: v }))}
                  options={fieldOptions.supplier}
                  placeholder="— Chọn nhà cung cấp —"
                  label="nhà cung cấp"
                  canManageOptions={canManageOptions}
                  onDeleteOption={(option) => void handleDeleteOption("supplier", option)}
                />
              </Field>
              <Field label={"B\u1ed9 s\u01b0u t\u1eadp"}>
                <ProductSuggestionField
                  value={form.collections}
                  onChange={(v) => setForm((f) => ({ ...f, collections: v }))}
                  options={fieldOptions.collections}
                  placeholder="— Chọn bộ sưu tập —"
                  label="bộ sưu tập"
                  canManageOptions={canManageOptions}
                  onDeleteOption={(option) => void handleDeleteOption("collections", option)}
                />
              </Field>
              <Field label="Màu sắc">
                <ProductSuggestionField
                  value={form.color}
                  onChange={(v) => setForm((f) => ({ ...f, color: v }))}
                  options={Array.from(new Set([...PRODUCT_COLORS, ...fieldOptions.color]))}
                  placeholder="— Chọn màu sắc —"
                  label="màu sắc"
                  canManageOptions={canManageOptions}
                  onDeleteOption={(option) => void handleDeleteOption("color", option)}
                />
              </Field>
              <Field label="m² / Thùng">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={form.packing_m2}
                  onChange={(e) => setForm((f) => ({ ...f, packing_m2: e.target.value }))}
                  placeholder="vd. 1.44"
                />
              </Field>
              <Field label="Số lượng / Thùng">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={form.packing_pcs}
                  onChange={(e) => setForm((f) => ({ ...f, packing_pcs: e.target.value }))}
                  placeholder="vd. 4"
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Giá & chiết khấu">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <Field label="Giá bán lẻ (đ/m²) *">
                <input
                  className={inputCls}
                  value={form.retail_price}
                  onChange={(e) => setForm((f) => ({ ...f, retail_price: e.target.value }))}
                />
              </Field>
              <Field label="Giá Thương mại (+VAT)">
                <input
                  className={inputCls}
                  value={form.trade_price}
                  onChange={(e) => setForm((f) => ({ ...f, trade_price: e.target.value }))}
                  placeholder="Trade Price"
                />
              </Field>
              <Field label="Giá B2B (+VAT)">
                <input
                  className={inputCls}
                  value={form.b2b_price}
                  onChange={(e) => setForm((f) => ({ ...f, b2b_price: e.target.value }))}
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
                  onChange={(e) => setForm((f) => ({ ...f, discount_tp: e.target.value }))}
                />
              </Field>
              <Field label="CK B2B (%)">
                <input
                  type="number"
                  step="1"
                  className={inputCls}
                  value={form.discount_b2b}
                  onChange={(e) => setForm((f) => ({ ...f, discount_b2b: e.target.value }))}
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

          <FormSection title="Tồn kho & ghi chú">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex items-end pb-1">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={form.is_hot}
                  onClick={() => setForm((f) => ({ ...f, is_hot: !f.is_hot }))}
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
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="Ghi chú nội bộ…"
                />
              </Field>
            </div>
          </FormSection>

          <DialogFooter className="gap-2 sm:justify-between pt-1">
            {createdId ? (
              <button
                type="button"
                onClick={resetForAnother}
                disabled={saving}
                className="text-xs font-medium px-3 py-1.5 rounded ring-1 ring-black/5 hover:bg-surface-strong disabled:opacity-50 mr-auto"
              >
                Tạo sản phẩm khác
              </button>
            ) : (
              <span className="mr-auto" />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleOpenChange(false)}
                className="text-xs font-medium px-3 py-1.5 rounded ring-1 ring-black/5"
              >
                {createdId ? "Đóng" : "Huỷ"}
              </button>
              <button
                type="submit"
                disabled={saving || Boolean(createdId)}
                className="text-xs font-medium text-primary-foreground px-3 py-1.5 bg-terracotta rounded disabled:opacity-50"
              >
                {saving ? "Đang tạo..." : createdId ? "Đã tạo" : "Tạo sản phẩm"}
              </button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
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
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full text-sm px-3 py-2 rounded-md bg-background ring-1 ring-black/10 outline-none focus:ring-terracotta/40 text-foreground";
