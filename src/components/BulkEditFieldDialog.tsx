import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { bulkUpdateProductFieldFn, clearProductFieldValueFn, fetchProductFieldValues } from "@/api/functions";
import { PRODUCT_COLORS } from "@/lib/types";
import { ProductSuggestionField } from "@/components/ProductSuggestionField";
import { toast } from "sonner";

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
  const fieldLabel = FIELD_OPTIONS.find((option) => option.value === field)?.label ?? "";

  useEffect(() => {
    if (!open) return;
    setValue("");
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

  async function handleDeleteOption(option: string) {
    if (!canManageOptions) return;
    const confirmed = window.confirm(`Xóa giá trị "${option}" khỏi dữ liệu sản phẩm? Thao tác này sẽ làm trống field trên tất cả sản phẩm đang dùng giá trị này.`);
    if (!confirmed) return;
    setBusy(true);
    try {
      const result = await clearProductFieldValueFn({ data: { field, value: option } });
      toast.success(`Đã xóa "${option}" khỏi ${result.updated} sản phẩm`);
      setValue("");
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

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Gán giá trị cho {productIds.length} sản phẩm</DialogTitle></DialogHeader><div className="space-y-5 py-2"><div><label className="text-xs font-semibold text-foreground">Trường dữ liệu</label><select value={field} onChange={(event) => setField(event.target.value as BulkField)} disabled={busy} className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/10">{FIELD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div><label className="text-xs font-semibold text-foreground">Giá trị mới</label><div className="mt-1"><ProductSuggestionField value={value} options={options} onChange={setValue} label={fieldLabel.toLocaleLowerCase()} canManageOptions={canManageOptions} onDeleteOption={(option) => void handleDeleteOption(option)} placeholder={loadingOptions ? "Đang tải dữ liệu gợi ý…" : `Chọn hoặc thêm ${fieldLabel.toLocaleLowerCase()}…`} disabled={busy || loadingOptions} /></div></div><div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5 text-xs leading-5 text-muted-foreground">Giá trị mới sẽ được ghi vào <b className="text-foreground">{productIds.length} sản phẩm</b> và xuất hiện trong danh sách gợi ý sau khi lưu thành công.</div></div><DialogFooter className="gap-2"><button type="button" onClick={() => onOpenChange(false)} disabled={busy} className="h-10 rounded-xl px-4 text-sm font-medium text-muted-foreground hover:bg-accent">Hủy</button><button type="button" onClick={() => void handleApply()} disabled={busy || !productIds.length || !value.trim()} className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Đang áp dụng…" : `Áp dụng cho ${productIds.length} SP`}</button></DialogFooter></DialogContent></Dialog>;
}

