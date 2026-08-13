import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  bulkUpdateProductFieldFn,
  clearProductFieldValueFn,
  fetchProductFieldValues,
} from "@/api/functions";
import { PRODUCT_COLORS } from "@/lib/types";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "sonner";

const FIELD_OPTIONS = [
  { value: "color", label: "Màu sắc" },
  { value: "supplier", label: "Nh\u00e0 cung c\u1ea5p" },
  { value: "category", label: "Danh mục" },
  { value: "surface", label: "Bề mặt" },
  { value: "shape", label: "Kiểu dáng" },
  { value: "collections", label: "B\u1ed9 s\u01b0u t\u1eadp" },
  { value: "material", label: "Chất liệu" },
  { value: "size", label: "Kích thước" },
] as const;
type BulkField = (typeof FIELD_OPTIONS)[number]["value"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productIds: number[];
  onDone: () => void;
};

export function BulkEditFieldDialog({
  open,
  onOpenChange,
  productIds,
  onDone,
}: Props) {
  const [field, setField] = useState<BulkField>("supplier");
  const [value, setValue] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue("");
  }, [open]);

  function loadOptions() {
    return fetchProductFieldValues({ data: { field } })
      .then((vals) => {
        setOptions(
          field === "color"
            ? Array.from(new Set([...PRODUCT_COLORS, ...vals]))
            : vals,
        );
      })
      .catch(() => {
        setOptions([]);
      });
  }

  useEffect(() => {
    if (!open) return;
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, field]);

  async function handleDeleteOption(v: string) {
    try {
      const result = await clearProductFieldValueFn({ data: { field, value: v } });
      toast.success(`Đã xóa "${v}" khỏi ${result.updated} sản phẩm`);
      if (value === v) setValue("");
      await loadOptions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thể xóa giá trị");
    }
  }

  async function handleApply(clear = false) {
    const trimmed = clear ? "" : value.trim();
    if (!clear && !trimmed) {
      toast.error("Nhập hoặc chọn giá trị cần áp dụng, hoặc dùng nút Xóa giá trị");
      return;
    }
    if (!productIds.length) return;
    if (clear) {
      const ok = window.confirm(
        `Xóa giá trị "${fieldLabel}" của ${productIds.length} sản phẩm đã chọn?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await bulkUpdateProductFieldFn({
        data: { ids: productIds, field, value: trimmed },
      });
      toast.success(
        clear
          ? `Đã xóa "${fieldLabel}" của ${productIds.length} sản phẩm`
          : `Đã áp dụng cho ${productIds.length} sản phẩm`,
      );
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không áp dụng được");
    } finally {
      setBusy(false);
    }
  }

  const fieldLabel = FIELD_OPTIONS.find((f) => f.value === field)?.label ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Gán giá trị hàng loạt</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">
            Áp dụng cho <b className="text-foreground">{productIds.length}</b>{" "}
            sản phẩm đã chọn.
          </p>

          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">
              Trường dữ liệu
            </span>
            <select
              className="mt-1 w-full text-sm px-3 py-2 rounded-md bg-background ring-1 ring-black/10 outline-none focus:ring-terracotta/40 text-foreground"
              value={field}
              onChange={(e) => setField(e.target.value as BulkField)}
            >
              {FIELD_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">
              Giá trị mới cho {fieldLabel}
            </span>
            <div className="mt-1">
              <Combobox
                options={options}
                value={value}
                onChange={setValue}
                placeholder="Chọn hoặc gõ giá trị mới…"
                onDeleteOption={handleDeleteOption}
                nonDeletableOptions={field === "color" ? PRODUCT_COLORS : undefined}
              />
            </div>
          </label>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 px-3.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-surface-strong/60 transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => handleApply(true)}
            disabled={busy || !productIds.length}
            title={`Xóa giá trị ${fieldLabel} của các SP đã chọn`}
            className="h-9 px-3.5 rounded-md text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
          >
            Xóa giá trị
          </button>
          <button
            type="button"
            onClick={() => handleApply(false)}
            disabled={busy || !productIds.length}
            className="h-9 px-3.5 rounded-md text-sm font-medium bg-terracotta text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {busy ? "Đang áp dụng…" : `Áp dụng cho ${productIds.length} SP`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
