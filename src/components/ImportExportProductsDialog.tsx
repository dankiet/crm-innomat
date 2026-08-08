import { useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  exportProductsXlsxFn,
  exportInternalCodesXlsxFn,
  importProductsFn,
  previewProductImportFn,
} from "@/api/functions";
import { Download, Upload, Check, AlertCircle, FileSpreadsheet, Package } from "lucide-react";

type PreviewItem = {
  action: "create" | "update";
  code: string;
  name: string;
  product_id?: number;
  changes?: string[];
  row: Record<string, unknown>;
};

type Preview = {
  create: PreviewItem[];
  update: PreviewItem[];
  errors: Array<{ code: string; message: string }>;
  create_count: number;
  update_count: number;
  error_count: number;
};

function downloadBase64File(
  base64: string,
  filename: string,
  mimeType: string,
) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function parseFileToRows(data: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(data, { type: "array" });
  const name = wb.SheetNames[0];
  if (!name) throw new Error("File không có sheet");
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });
  if (!rows.length) throw new Error("Sheet trống");
  return rows;
}

export function ImportExportProductsDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Record<string, unknown>[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  function resetImport() {
    setFileName(null);
    setParsed(null);
    setPreview(null);
    setParsing(false);
    setImporting(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleExport(all = false) {
    setExporting(true);
    try {
      const file = await exportProductsXlsxFn({
        data: all ? {} : category && category !== "all" ? { category } : {},
      });
      downloadBase64File(file.base64, file.filename, file.mimeType);
      toast.success(`Đã Tải ${file.filename}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không Xuất Được Excel",
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setPreview(null);
    setParsed(null);
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      const rows = parseFileToRows(buf);
      setParsed(rows);
      const result = (await previewProductImportFn({
        data: { items: rows },
      })) as Preview;
      setPreview(result);
      toast.success(
        `Tạo Mới ${result.create_count} · Cập Nhật ${result.update_count}` +
          (result.error_count ? ` · Lỗi ${result.error_count}` : ""),
      );
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Lỗi Đọc / Đối Chiếu File",
      );
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (!parsed?.length || !preview) return;
    if (!preview.create_count && !preview.update_count) {
      toast.error("Không Có Dòng Nào Để Import");
      return;
    }
    setImporting(true);
    try {
      const res = (await importProductsFn({
        data: { items: parsed },
      })) as { created: number; updated: number; skipped: number };
      toast.success(
        `Đã Thêm Mới ${res.created} SP · Cập Nhật ${res.updated} SP`,
      );
      resetImport();
      onOpenChange(false);
      await router.invalidate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Import Thất Bại",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetImport();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-5 border-b border-border/80 flex-shrink-0">
          <DialogTitle className="text-lg font-bold">Import / Export Dữ Liệu</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* KHU 1: XUẤT & NHẬP SẢN PHẨM (CÙNG 1 KHU) */}
          <div className="p-4 rounded-xl border border-border/80 bg-surface/40 space-y-3">
            <div className="flex items-center gap-2 font-bold text-foreground text-sm">
              <Package className="w-4 h-4 text-terracotta" />
              1. Quản Lý File Sản Phẩm (Xuất & Nhập)
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Xuất hoặc nhập file Excel danh mục sản phẩm (mã, tên, giá bán lẻ, giá B2B, kích thước, màu sắc...).
            </p>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" ref={inputRef} onChange={handleFileChange} />
              
              {/* Nút Xuất Sản Phẩm */}
              <button
                type="button"
                disabled={exporting}
                onClick={() => handleExport(true)}
                className="h-9 px-3.5 rounded-lg text-xs font-semibold bg-terracotta text-primary-foreground inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-terracotta/90 transition-colors cursor-pointer"
              >
                <Download className="size-3.5" />
                {exporting ? "Đang Xuất…" : "Xuất Tất Cả Sản Phẩm"}
              </button>
              
              {category && category !== "all" && (
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => handleExport(false)}
                  className="h-9 px-3.5 rounded-lg text-xs font-medium border border-border/80 bg-card hover:bg-surface-strong inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Download className="size-3.5 text-muted-foreground" />
                  Xuất Nhóm Đang Xem ({category})
                </button>
              )}

              {/* Nút Nhập Sản Phẩm */}
              <button
                type="button"
                disabled={parsing || importing}
                onClick={() => inputRef.current?.click()}
                className="h-9 px-3.5 rounded-lg text-xs font-semibold border border-terracotta/40 bg-terracotta/10 text-terracotta hover:bg-terracotta/20 inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Upload className="size-3.5" />
                {parsing ? "Đang Đọc File…" : "Nhập File Excel Sản Phẩm"}
              </button>
            </div>
          </div>

          {/* KHU 2: XUẤT TỒN KHO & MÃ NỘI BỘ (TÁCH RIÊNG KHU KHÁC) */}
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
            <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400 text-sm">
              <FileSpreadsheet className="w-4 h-4 text-amber-600" />
              2. Xuất Báo Cáo Tồn Kho & Mã Nội Bộ (Tách Riêng)
            </div>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
              Tải file tổng hợp liên kết Mã Báo Giá ↔ Mã Nội Bộ ↔ Tồn Kho (Kho VP / Kho Q9) để đối soát kho. (File dành riêng cho bộ phận kho).
            </p>
            <div className="pt-1">
              <button
                type="button"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    const file = await exportInternalCodesXlsxFn();
                    downloadBase64File(file.base64, file.filename, file.mimeType);
                    toast.success("Đã Tải " + file.filename);
                  } catch (err) {
                    toast.error("Không Xuất Được File Tồn Kho");
                  } finally {
                    setExporting(false);
                  }
                }}
                className="h-9 px-3.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 inline-flex items-center gap-1.5 disabled:opacity-50 shadow-xs transition-colors cursor-pointer"
              >
                <Download className="size-3.5" />
                Xuất File Tồn Kho & Mã Nội Bộ
              </button>
            </div>
          </div>

          {/* Preview result */}
          {preview ? (
            <div className="p-4 rounded-xl border border-border/80 bg-card space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    Kết Quả Đọc File: <span className="text-terracotta">{fileName}</span>
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tạo mới: <strong className="text-foreground">{preview.create_count}</strong> · Cập nhật: <strong className="text-foreground">{preview.update_count}</strong> · Lỗi: <strong className="text-destructive">{preview.error_count}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetImport}
                    className="h-8 px-3 rounded-lg text-xs font-medium border border-border bg-surface hover:bg-surface-strong transition-colors cursor-pointer"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="button"
                    disabled={importing || (!preview.create_count && !preview.update_count)}
                    onClick={handleImport}
                    className="h-8 px-4 rounded-lg text-xs font-semibold bg-terracotta text-primary-foreground hover:bg-terracotta/90 disabled:opacity-50 shadow-xs transition-colors cursor-pointer"
                  >
                    {importing ? "Đang Lưu..." : "Xác Nhận Import"}
                  </button>
                </div>
              </div>

              {preview.create.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-foreground flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    Sản Phẩm Tạo Mới ({preview.create.length})
                  </div>
                  <div className="max-h-36 overflow-y-auto border border-border/60 rounded-lg text-xs divide-y divide-border/40 bg-surface/30">
                    {preview.create.map((item, idx) => (
                      <div key={idx} className="p-2 flex items-center justify-between">
                        <span className="font-semibold text-foreground">{item.code}</span>
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.update.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-foreground flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-blue-500" />
                    Sản Phẩm Cập Nhật ({preview.update.length})
                  </div>
                  <div className="max-h-36 overflow-y-auto border border-border/60 rounded-lg text-xs divide-y divide-border/40 bg-surface/30">
                    {preview.update.map((item, idx) => (
                      <div key={idx} className="p-2 flex items-center justify-between">
                        <span className="font-semibold text-foreground">{item.code}</span>
                        <span className="text-muted-foreground truncate max-w-[300px]">{item.changes?.join(", ")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                    Dòng Bị Lỗi ({preview.errors.length})
                  </div>
                  <div className="max-h-36 overflow-y-auto border border-destructive/30 rounded-lg text-xs divide-y divide-border/40 bg-destructive/5">
                    {preview.errors.map((item, idx) => (
                      <div key={idx} className="p-2 flex items-center justify-between text-destructive">
                        <span className="font-semibold">{item.code || "—"}</span>
                        <span>{item.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
