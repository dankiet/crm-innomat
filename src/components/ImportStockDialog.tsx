import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { importInternalCodeMappingFn, importStockUpdateFn } from "@/api/functions";

type Tab = "mapping" | "stock";

export function ImportStockDialog({
  open,
  onOpenChange,
  tab = "stock",
  previewData,
  onClearPreview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab?: Tab;
  previewData?: any[] | null;
  onClearPreview?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  function handleClose() {
    onOpenChange(false);
    if (onClearPreview) onClearPreview();
  }

  async function handleConfirm() {
    if (!previewData || previewData.length === 0) return;
    setLoading(true);
    try {
      if (tab === "mapping") {
        const res = await importInternalCodeMappingFn({ data: { items: previewData } });
        toast.success(`Đã Thêm / Cập Nhật ${res.added} Liên Kết Mã Nội Bộ`);
      } else {
        const res = await importStockUpdateFn({ data: { items: previewData } });
        toast.success(`Đã Cập Nhật Tồn Kho Cho ${res.updated} Mã`);
      }
      handleClose();
      await router.invalidate();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Có Lỗi Xảy Ra Khi Lưu Dữ Liệu");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>
            {tab === "mapping" ? "Bảng Xem Trước: Nhập Mã Nội Bộ" : "Bảng Xem Trước: Nhập Tồn Kho"}
          </DialogTitle>
        </DialogHeader>

        {previewData && previewData.length > 0 ? (
          <div className="flex flex-col gap-4 pt-1">
            <p className="text-sm font-medium text-foreground">
              Tìm Thấy <span className="text-terracotta font-bold">{previewData.length}</span> Dòng Dữ Liệu Hợp Lệ. Vui Lòng Xác Nhận Trước Khi Import.
            </p>
            <div className="max-h-[340px] overflow-auto border border-border/80 rounded-lg shadow-xs">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-surface-strong/60 sticky top-0 border-b border-border font-semibold">
                  {tab === "mapping" ? (
                    <tr>
                      <th className="px-4 py-2.5">Mã Báo Giá</th>
                      <th className="px-4 py-2.5">Mã Nội Bộ</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="px-4 py-2.5">Mã Nội Bộ</th>
                      <th className="px-4 py-2.5">Mã Kho</th>
                      <th className="px-4 py-2.5">Tồn Kho</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-border/40">
                  {previewData.slice(0, 100).map((row, idx) => (
                    <tr key={idx} className="hover:bg-surface-strong/30 transition-colors">
                      {tab === "mapping" ? (
                        <>
                          <td className="px-4 py-2 font-semibold text-foreground">{row.product_code}</td>
                          <td className="px-4 py-2 text-muted-foreground">{row.internal_code}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 font-semibold text-foreground">{row.internal_code}</td>
                          <td className="px-4 py-2 text-muted-foreground">{row.stock_location}</td>
                          <td className="px-4 py-2 text-terracotta font-bold tabular-nums">{row.quantity}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {previewData.length > 100 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-center text-xs text-muted-foreground italic bg-surface-strong/20">
                        ... Và {previewData.length - 100} Dòng Nữa
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                disabled={loading}
                type="button"
                onClick={handleClose}
                className="h-10 px-4 rounded-lg bg-surface text-foreground font-medium text-sm hover:bg-surface-strong disabled:opacity-50 border border-border/80 transition-colors cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                disabled={loading}
                type="button"
                onClick={handleConfirm}
                className="h-10 px-5 rounded-lg bg-terracotta text-primary-foreground font-semibold text-sm hover:bg-terracotta/90 disabled:opacity-50 shadow-xs transition-colors cursor-pointer"
              >
                {loading ? "Đang Lưu..." : "Xác Nhận Import"}
              </button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
