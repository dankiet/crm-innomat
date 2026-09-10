import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { bulkUpdateProductFieldFn, clearProductFieldValueFn, fetchProductFieldValues } from "@/api/functions";
import { PRODUCT_COLORS } from "@/lib/types";
import { ProductSuggestionField } from "@/components/ProductSuggestionField";
import { toast } from "sonner";
import { Tags, Check, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type BulkField = "color" | "supplier" | "category" | "surface" | "collections" | "shape" | "material" | "size";

const FIELD_OPTIONS: Array<{ value: BulkField; label: string }> = [
  { value: "category", label: "Danh mục" },
  { value: "supplier", label: "Nhà cung cấp" },
  { value: "collections", label: "Bộ sưu tập" },
  { value: "color", label: "Màu sắc" },
  { value: "surface", label: "Bề mặt" },
  { value: "shape", label: "Kiểu dáng" },
  { value: "material", label: "Chất liệu" },
  { value: "size", label: "Kích thước" },
];

type Props = { open: boolean; onOpenChange: (open: boolean) => void; productIds: number[]; onDone: () => void; canManageOptions?: boolean };

export function BulkEditFieldDialog({ open, onOpenChange, productIds, onDone, canManageOptions = false }: Props) {
  const [field, setField] = useState<BulkField>("category");
  const [value, setValue] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletingOption, setDeletingOption] = useState<string | null>(null);
  const fieldLabel = FIELD_OPTIONS.find((option) => option.value === field)?.label ?? "";

  useEffect(() => {
    if (!open) return;
    setValue("");
    setDeletingOption(null);
    let cancelled = false;
    setLoadingOptions(true);
    void fetchProductFieldValues({ data: { field } }).then((result) => {
      if (!cancelled) setOptions(field === "color" ? Array.from(new Set([...PRODUCT_COLORS, ...result])) : result);
    }).catch(() => {
      if (!cancelled) setOptions(field === "color" ? [...PRODUCT_COLORS] : []);
    }).finally(() => {
      if (!cancelled) setLoadingOptions(false);
    });
    return () => { cancelled = true; };
  }, [open, field]);

  async function handleConfirmDeleteOption(option: string) {
    if (!canManageOptions) return;
    setBusy(true);
    try {
      const result = await clearProductFieldValueFn({ data: { field, value: option } });
      toast.success(`Đã xóa "${option}" khỏi ${result.updated} sản phẩm`);
      if (value === option) setValue("");
      setDeletingOption(null);
      const refreshed = await fetchProductFieldValues({ data: { field } });
      setOptions(field === "color" ? Array.from(new Set([...PRODUCT_COLORS, ...refreshed])) : refreshed);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể xóa giá trị");
    } finally {
      setBusy(false);
    }
  }
  async function handleApply() {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!productIds.length) return;
    if (!normalized) {
      toast.error("Hãy chọn hoặc nhập giá trị cần áp dụng.");
      return;
    }
    setBusy(true);
    try {
      const result = await bulkUpdateProductFieldFn({ data: { ids: productIds, field, value: normalized } });
      toast.success(`Đã cập nhật ${result.updated ?? productIds.length} sản phẩm: ${fieldLabel} = ${normalized}`);
      onDone();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không áp dụng được giá trị hàng loạt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-6">
        <DialogHeader>
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-xl bg-terracotta/10 text-terracotta grid place-items-center">
                <Tags className="size-4.5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Gán giá trị hàng loạt
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Áp dụng giá trị mới cho <span className="font-semibold text-terracotta tabular-nums">{productIds.length}</span> sản phẩm đã chọn
                </p>
              </div>
            </div>
            <span className="rounded-full bg-surface-strong px-3 py-1 text-xs font-bold text-foreground tabular-nums border border-border/80">
              {productIds.length} SP
            </span>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-3 text-xs">
          {/* 1. Chọn trường dữ liệu qua Filter Chips */}
          <div>
            <label className="font-bold text-foreground block mb-2">
              1. Chọn trường dữ liệu cần thay đổi
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {FIELD_OPTIONS.map((option) => {
                const isActive = field === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setField(option.value);
                      setDeletingOption(null);
                    }}
                    disabled={busy}
                    className={cn(
                      "flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all border text-left",
                      isActive
                        ? "bg-terracotta text-white border-terracotta shadow-xs ring-2 ring-terracotta/20"
                        : "bg-card border-border/80 text-foreground hover:bg-surface-strong hover:border-border",
                    )}
                  >
                    <span>{option.label}</span>
                    {isActive ? <Check className="size-3.5 stroke-[2.5]" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Nhập giá trị mới */}
          <div className="rounded-xl border border-border/80 bg-surface-strong/30 p-4 space-y-2">
            <label className="font-bold text-foreground block">
              2. Nhập hoặc chọn giá trị cho &ldquo;{fieldLabel}&rdquo;
            </label>
            <div>
              <ProductSuggestionField
                value={value}
                options={options}
                onChange={setValue}
                label={fieldLabel.toLowerCase()}
                loading={loadingOptions}
                disabled={busy}
                canManageOptions={canManageOptions}
                onDeleteOption={(opt) => setDeletingOption(opt)}
              />
            </div>
          </div>

          {deletingOption ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 dark:border-red-900/50 dark:bg-red-950/30 text-xs space-y-2">
              <p className="font-medium text-red-800 dark:text-red-300">
                Xóa vĩnh viễn giá trị &ldquo;{deletingOption}&rdquo;? Thao tác này sẽ làm trống trường này trên tất cả sản phẩm đang dùng.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingOption(null)}
                  disabled={busy}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-strong"
                >
                  Không xóa
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmDeleteOption(deletingOption)}
                  disabled={busy}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "Đang xóa…" : "Xóa vĩnh viễn"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="pt-2 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-10 rounded-xl border border-border px-4 text-xs font-semibold text-foreground hover:bg-surface-strong transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={busy || !value.trim()}
            className="h-10 rounded-xl bg-terracotta px-5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-2 shadow-sm"
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Đang cập nhật…</span>
              </>
            ) : (
              <span>Áp dụng cho {productIds.length} SP</span>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
