import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Check,
  Crop,
  FileDown,
  FileImage,
  FileText,
  Image,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteCustomerMappingFn,
  exportMappingPrintFn,
  fetchCustomers,
  fetchProducts,
  saveCustomerMappingFn,
  uploadMappingImageFn,
} from "@/api/functions";
import { ProductImage } from "@/components/ProductImage";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatVND } from "@/lib/format";
import type { Customer, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CustomerMappingItem = {
  id: number;
  mapping_id: number;
  sort_order: number;
  area_group_key: string;
  description: string;
  size: string;
  product_id: number | null;
  image_path: string;
  custom_product_code: string;
  custom_product_name: string;
  custom_product_size: string;
  custom_product_surface: string;
  custom_product_retail_price: number;
  custom_product_image_path: string;
};

export type CustomerMapping = {
  id: number;
  code: string;
  customer_id: number;
  status: "draft" | "sent" | "accepted" | "expired";
  name: string;
  version: string;
  note: string;
  created_at: string;
  updated_at: string;
  linked_quotes: Array<{
    id: number;
    code: string;
    status: "draft" | "sent" | "accepted" | "expired";
  }>;
  items: CustomerMappingItem[];
};

type Draft = {
  key: string;
  areaGroupKey: string;
  collapsed: boolean;
  imagePath: string;
  imageDataUrl: string | null;
  sourceName: string;
  description: string;
  size: string;
  product: Product | null;
  customProduct: CustomProduct | null;
};

type CustomProduct = {
  code: string;
  name: string;
  size: string;
  surface: string;
  retailPrice: string;
  imagePath: string;
  imageDataUrl: string | null;
  imageName: string;
};

type ImportItem = {
  key: string;
  name: string;
  dataUrl: string;
  source: "image" | "pdf" | "crop";
};

type CropRect = { x: number; y: number; width: number; height: number };
type View = "editor" | "import" | "crop";

const MAX_IMPORT_ITEMS = 100;
const MAX_PDF_PAGES = 50;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PDF_BYTES = 100 * 1024 * 1024;

function key() {
  return Math.random().toString(36).slice(2);
}

function blankDraft(): Draft {
  return {
    key: key(),
    areaGroupKey: key(),
    collapsed: false,
    imagePath: "",
    imageDataUrl: null,
    sourceName: "",
    description: "",
    size: "",
    product: null,
    customProduct: null,
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Không đọc được ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCustomerId?: number;
  mapping?: CustomerMapping | null;
  /** Được gọi sau khi lưu/xóa — kèm bản ghi vừa lưu (nếu lưu) */
  onSaved?: (mapping?: CustomerMapping) => void;
};

export function CustomerMappingDialog({
  open,
  onOpenChange,
  defaultCustomerId,
  mapping = null,
  onSaved,
}: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const importScrollRef = useRef<HTMLDivElement>(null);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  /** Bản ghi vừa tạo khi giữ popup mở — sau lần lưu đầu, các lần lưu sau update bản ghi này */
  const [savedMapping, setSavedMapping] = useState<CustomerMapping | null>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("01");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Draft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** Xác nhận xóa 2 bước inline (thay window.confirm) */
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Hiện check V trong nút Lưu sau khi lưu xong (thay toast) */
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activePickerKey, setActivePickerKey] = useState<string | null>(null);
  const [manualProductKey, setManualProductKey] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [view, setView] = useState<View>("editor");
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [cropIndex, setCropIndex] = useState<number | null>(null);

  /** Mapping hiệu lực: prop khi sửa, hoặc bản ghi vừa tạo khi đang tạo mới */
  const effectiveMapping = mapping ?? savedMapping;

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setLoaded(false);
    setView("editor");
    setImports([]);
    setActivePickerKey(null);
    setSavedMapping(null);
    setName(mapping?.name || "");
    setVersion(mapping?.version || "01");
    setNote(mapping?.note ?? "");
    setCustomerId(defaultCustomerId ?? mapping?.customer_id ?? "");
    void (async () => {
      setLoading(true);
      try {
        const [cs, ps] = await Promise.all([
          defaultCustomerId != null ? Promise.resolve<Customer[]>([]) : fetchCustomers(),
          fetchProducts({ data: { limit: 2000 } }),
        ]);
        setCustomers(cs);
        setProducts(ps);
        const byId = new Map(ps.map((product) => [product.id, product]));
        const drafts = mapping?.items.length
          ? mapping.items
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((item) => ({
                key: key(),
                areaGroupKey: item.area_group_key || key(),
                collapsed: mapping.items.length > 2,
                imagePath: item.image_path || "",
                imageDataUrl: null,
                sourceName: "",
                description: item.description || "",
                size: item.size || "",
                product: item.product_id ? byId.get(item.product_id) ?? null : null,
                customProduct: item.custom_product_name
                  ? {
                      code: item.custom_product_code || "",
                      name: item.custom_product_name,
                      size: item.custom_product_size || "",
                      surface: item.custom_product_surface || "",
                      retailPrice: String(item.custom_product_retail_price || ""),
                      imagePath: item.custom_product_image_path || "",
                      imageDataUrl: null,
                      imageName: "",
                    }
                  : null,
              }))
                  : [];
        setItems(drafts);
        setLoaded(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Không tải được dữ liệu");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, mapping?.id, defaultCustomerId]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products.slice(0, 50);
    return products
      .filter(
        (product) =>
          product.code.toLowerCase().includes(query) ||
          product.name.toLowerCase().includes(query) ||
          product.size.toLowerCase().includes(query) ||
          (product.surface || "").toLowerCase().includes(query),
      )
      .slice(0, 80);
  }, [products, productSearch]);

  function patchItem(itemKey: string, patch: Partial<Draft>) {
    setItems((current) =>
      current.map((item) => (item.key === itemKey ? { ...item, ...patch } : item)),
    );
  }

  function addBlankArea() {
    setItems((current) => [...current, blankDraft()]);
  }

  function removeArea(itemKey: string) {
    setItems((current) => {
      const next = current.filter((item) => item.key !== itemKey);
      return next.length ? next : [blankDraft()];
    });
  }

  function removeAreaGroup(groupKey: string) {
    setItems((current) =>
      current.filter((item) => item.areaGroupKey !== groupKey),
    );
  }

  const areaGroups = useMemo(() => {
    const groups: Array<{ key: string; items: Draft[] }> = [];
    for (const item of items) {
      const group = groups.find((candidate) => candidate.key === item.areaGroupKey);
      if (group) group.items.push(item);
      else groups.push({ key: item.areaGroupKey, items: [item] });
    }
    return groups;
  }, [items]);

  function moveAreaGroup(groupIndex: number, delta: number) {
    const targetIndex = groupIndex + delta;
    if (targetIndex < 0 || targetIndex >= areaGroups.length) return;
    const nextGroups = move(areaGroups, groupIndex, targetIndex);
    setItems(nextGroups.flatMap((group) => group.items));
  }

  async function replaceAreaImage(itemKey: string, file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Chỉ hỗ trợ file ảnh");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`${file.name} vượt quá 12 MB`);
      return;
    }
    try {
      patchItem(itemKey, {
        imageDataUrl: await fileToDataUrl(file),
        sourceName: file.name,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không đọc được ảnh");
    }
  }

  async function renderPdf(file: File): Promise<ImportItem[]> {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const pdfDocument = await loadingTask.promise;
    if (pdfDocument.numPages > MAX_PDF_PAGES) {
      await loadingTask.destroy();
      throw new Error(`${file.name} có ${pdfDocument.numPages} trang, tối đa ${MAX_PDF_PAGES}`);
    }
    const pages: ImportItem[] = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      setImportProgress(`${file.name}: đang xử lý trang ${pageNumber}/${pdfDocument.numPages}`);
      const page = await pdfDocument.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, 1800 / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Trình duyệt không tạo được canvas PDF");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      pages.push({
        key: key(),
        name: `${file.name} · Trang ${pageNumber}`,
        dataUrl: canvas.toDataURL("image/jpeg", 0.88),
        source: "pdf",
      });
      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();
    }
    await loadingTask.destroy();
    return pages;
  }

  async function processFiles(files: File[]) {
    if (!files.length) return;
    setView("import");
    setImporting(true);
    const output: ImportItem[] = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        setImportProgress(`Đang đọc ${index + 1}/${files.length}: ${file.name}`);
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          if (file.size > MAX_PDF_BYTES) throw new Error(`${file.name} vượt quá 100 MB`);
          output.push(...(await renderPdf(file)));
        } else if (file.type.startsWith("image/")) {
          if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} vượt quá 12 MB`);
          output.push({
            key: key(),
            name: file.webkitRelativePath || file.name,
            dataUrl: await fileToDataUrl(file),
            source: "image",
          });
        }
        if (imports.length + output.length > MAX_IMPORT_ITEMS) {
          throw new Error(`Mỗi lần chỉ nhập tối đa ${MAX_IMPORT_ITEMS} khu vực`);
        }
      }
      setImports((current) => [...current, ...output]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không xử lý được file");
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  }

  function commitImports() {
    if (!imports.length) return;
    const generated = imports.map<Draft>((item) => ({
      key: key(),
      areaGroupKey: key(),
      collapsed: false,
      imagePath: "",
      imageDataUrl: item.dataUrl,
      sourceName: item.name,
      description: item.name.replace(/\.[^.]+$/, ""),
      size: "",
      product: null,
      customProduct: null,
    }));
    setItems((current) => {
      const withoutEmpty = current.filter(
        (item) =>
          item.imagePath ||
          item.imageDataUrl ||
          item.description.trim() ||
          item.size.trim() ||
          item.product ||
          item.customProduct,
      );
      return [...withoutEmpty, ...generated];
    });
    setImports([]);
    setView("editor");
    toast.success(`Đã thêm ${generated.length} khu vực`);
  }

  async function handleSave() {
    if (!customerId) return toast.error("Chọn khách hàng");
    const meaningfulItems = items.filter(
      (item) =>
        item.imagePath ||
        item.imageDataUrl ||
        item.description.trim() ||
        item.size.trim() ||
        item.product ||
        item.customProduct,
    );
    if (!meaningfulItems.length)
      return toast.error("Đề xuất vật liệu cần ít nhất một khu vực");
    setSaving(true);
    try {
      const output = [];
      for (let index = 0; index < meaningfulItems.length; index++) {
        const item = meaningfulItems[index];
        let imagePath = item.imagePath;
        if (item.imageDataUrl) {
          const uploaded = await uploadMappingImageFn({
            data: {
              filename: item.sourceName || `mapping-${index + 1}.jpg`,
              dataBase64: item.imageDataUrl,
            },
          });
          imagePath = uploaded.path;
        }
        let customProductImagePath = item.customProduct?.imagePath || "";
        if (item.customProduct?.imageDataUrl) {
          const uploaded = await uploadMappingImageFn({
            data: {
              filename:
                item.customProduct.imageName || `material-${index + 1}.jpg`,
              dataBase64: item.customProduct.imageDataUrl,
            },
          });
          customProductImagePath = uploaded.path;
        }
        output.push({
          description: item.description.trim(),
          size: item.size.trim(),
          product_id: item.product?.id ?? null,
          image_path: imagePath,
          sort_order: index,
          area_group_key: item.areaGroupKey,
          custom_product_code: item.customProduct?.code.trim() || "",
          custom_product_name: item.customProduct?.name.trim() || "",
          custom_product_size: item.customProduct?.size.trim() || "",
          custom_product_surface: item.customProduct?.surface.trim() || "",
          custom_product_retail_price: Number(
            (item.customProduct?.retailPrice || "").replace(/\D/g, ""),
          ),
          custom_product_image_path: customProductImagePath,
        });
      }
      const saved = await saveCustomerMappingFn({
        data: {
          id: effectiveMapping?.id,
          customer_id: Number(customerId),
          name: name.trim(),
          version: version.trim() || "01",
          note: note.trim(),
          items: output,
        },
      });
      // Giữ popup mở, chuyển sang trạng thái sửa bản ghi vừa tạo
      setSavedMapping(saved);
      onSaved?.(saved);
      setJustSaved(true);
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setJustSaved(false), 1500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!effectiveMapping) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteCustomerMappingFn({ data: { id: effectiveMapping.id } });
      toast.success("Đã xóa đề xuất vật liệu");
    setConfirmDelete(false);
    setJustSaved(false);
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Xóa thất bại");
    } finally {
      setDeleting(false);
    }
  }

  async function handleExport() {
    if (!effectiveMapping) return;
    setExporting(true);
    try {
      const file = await exportMappingPrintFn({
        data: { mappingId: effectiveMapping.id },
      });
      const binary = atob(file.base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
      if (!window.open(url, "_blank"))
        toast.error("Trình duyệt đang chặn cửa sổ xuất tài liệu");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Xuất thất bại");
    } finally {
      setExporting(false);
    }
  }

  function closeDialog(nextOpen: boolean) {
    if (!nextOpen && (saving || importing || exporting || deleting)) return;
    onOpenChange(nextOpen);
  }

  const inputClass =
    "w-full h-10 rounded-lg bg-background px-3 text-sm ring-1 ring-black/10 outline-none transition-shadow focus:ring-2 focus:ring-terracotta/35 placeholder:text-muted-foreground/65";

  const activeCrop = cropIndex == null ? null : imports[cropIndex] ?? null;

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent
        className="sm:max-w-5xl h-[94dvh] sm:h-[90dvh] overflow-hidden flex flex-col p-0 gap-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {view === "editor" ? (
          <EditorHeader
            mapping={effectiveMapping}
            exporting={exporting}
            deleting={deleting}
            busy={saving || importing || exporting || deleting}
            confirmDelete={confirmDelete}
            onExport={() => void handleExport()}
            onDelete={handleDelete}
            onCancelDelete={() => setConfirmDelete(false)}
          />
        ) : (
          <DialogHeader className="px-4 sm:px-6 py-4 border-b border-border flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (view === "crop") {
                    setCropIndex(null);
                    setView("import");
                  } else {
                    setView("editor");
                  }
                }}
                className="size-8 grid place-items-center rounded-lg hover:bg-surface-strong"
                aria-label="Quay lại"
              >
                <ArrowLeft className="size-4" />
              </button>
              {view === "crop" ? "Cắt nhiều khu vực" : "Kiểm tra file nhập"}
            </DialogTitle>
          </DialogHeader>
        )}

        {loading || !loaded ? (
          <div className="flex-1 min-h-0 animate-in fade-in duration-150 px-4 sm:px-6 py-4 space-y-4" aria-label="Đang tải đề xuất vật liệu">
            <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-3">
              <div className="h-14 rounded-lg bg-surface-strong/70 animate-pulse" />
              <div className="h-14 rounded-lg bg-surface-strong/70 animate-pulse" />
            </div>
            <div className="h-12 rounded-lg bg-surface-strong/60 animate-pulse" />
            <div className="h-56 rounded-xl bg-surface-strong/50 animate-pulse" />
          </div>
        ) : view === "crop" && activeCrop ? (
          <CropWorkspace
            item={activeCrop}
            onCancel={() => {
              setCropIndex(null);
              setView("import");
            }}
            onConfirm={(crops) => {
              setImports((current) => [
                ...current.slice(0, cropIndex!),
                ...crops,
                ...current.slice(cropIndex! + 1),
              ]);
              setCropIndex(null);
              setView("import");
            }}
          />
        ) : view === "import" ? (
          <ImportPreview
            items={imports}
            importing={importing}
            progress={importProgress}
            scrollRef={importScrollRef}
            onAddFiles={() => imageInputRef.current?.click()}
            onMove={(index, delta) => setImports((current) => move(current, index, index + delta))}
            onRemove={(itemKey) =>
              setImports((current) => current.filter((item) => item.key !== itemKey))
            }
            onCrop={(index) => {
              setCropIndex(index);
              setView("crop");
            }}
            onCancel={() => {
              setImports([]);
              setView("editor");
            }}
            onConfirm={commitImports}
          />
        ) : (
          <form
            id="mapping-form"
            className="flex flex-col flex-1 min-h-0"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
              {!defaultCustomerId ? (
                <section>
                  <div className="grid grid-cols-1 gap-3">
                  <label>
                    <FieldLabel>Khách hàng *</FieldLabel>
                    <select
                      className={cn(inputClass, "mt-1")}
                      value={customerId}
                      onChange={(event) =>
                        setCustomerId(event.target.value ? Number(event.target.value) : "")
                      }
                    >
                      <option value="">Chọn khách hàng</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}{customer.company ? ` · ${customer.company}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  </div>
                </section>
              ) : null}

              <section>
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px] gap-3">
                  <label>
                    <FieldLabel>Tên công trình</FieldLabel>
                    <input
                      className={cn(inputClass, "mt-1")}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Tên công trình (không bắt buộc)"
                    />
                  </label>
                  <label>
                    <FieldLabel>Phiên bản</FieldLabel>
                    <input
                      className={cn(inputClass, "mt-1")}
                      value={version}
                      onChange={(event) => setVersion(event.target.value)}
                      placeholder="01"
                      maxLength={30}
                    />
                  </label>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Khu vực ({areaGroups.length}) · {items.length} phương án
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Ảnh khu vực và các phương án được trình bày dạng gallery.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      title="Thu gọn tất cả"
                      aria-label="Thu gọn tất cả"
                      onClick={() =>
                        setItems((current) =>
                          current.map((item) => ({ ...item, collapsed: true })),
                        )
                      }
                      className="size-10 grid place-items-center rounded-lg bg-card ring-1 ring-black/8 text-muted-foreground hover:bg-surface-strong hover:text-foreground"
                    >
                      <ChevronsDownUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      title="Mở rộng tất cả"
                      aria-label="Mở rộng tất cả"
                      onClick={() =>
                        setItems((current) =>
                          current.map((item) => ({ ...item, collapsed: false })),
                        )
                      }
                      className="size-10 grid place-items-center rounded-lg bg-card ring-1 ring-black/8 text-muted-foreground hover:bg-surface-strong hover:text-foreground"
                    >
                      <ChevronsUpDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="h-10 px-3 rounded-lg bg-terracotta text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90"
                    >
                      <Upload className="size-3.5" /> Nhập ảnh / PDF
                    </button>
                    <button
                      type="button"
                      onClick={addBlankArea}
                      className="h-10 px-3 rounded-lg bg-card ring-1 ring-black/8 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-surface-strong"
                    >
                      <Plus className="size-3.5" /> Thêm thủ công
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {areaGroups.map((group, groupIndex) => (
                    <AreaGroup
                      key={group.key}
                      group={group}
                      groupIndex={groupIndex}
                      groupCount={areaGroups.length}
                      inputClass={inputClass}
                      onMoveGroup={(delta) => moveAreaGroup(groupIndex, delta)}
                      onPatch={patchItem}
                      onPatchGroup={(patch) =>
                        setItems((current) =>
                          current.map((candidate) =>
                            candidate.areaGroupKey === group.key
                              ? { ...candidate, ...patch }
                              : candidate,
                          ),
                        )
                      }
                      onReplaceImage={(itemKey, file) =>
                        void replaceAreaImage(itemKey, file)
                      }
                      onPickProduct={(itemKey) => {
                        setProductSearch("");
                        setActivePickerKey(itemKey);
                      }}
                      onManualProduct={setManualProductKey}
                      onDuplicate={(item) =>
                        setItems((current) => {
                          const sourceIndex = current.findIndex(
                            (candidate) => candidate.key === item.key,
                          );
                          if (sourceIndex < 0) return current;
                          const blankOption: Draft = {
                            key: key(),
                            areaGroupKey: item.areaGroupKey,
                            collapsed: false,
                            imagePath: item.imagePath,
                            imageDataUrl: item.imageDataUrl,
                            sourceName: item.sourceName,
                            description: item.description,
                            size: "",
                            product: null,
                            customProduct: null,
                          };
                          const lastGroupIndex =
                            current.length -
                            1 -
                            [...current].reverse().findIndex(
                              (candidate) =>
                                candidate.areaGroupKey === item.areaGroupKey,
                            );
                          const next = current.slice();
                          next.splice(lastGroupIndex + 1, 0, blankOption);
                          return next;
                        })
                      }
                      onRemove={removeArea}
                      onRemoveGroup={removeAreaGroup}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addBlankArea}
                  className="w-full h-12 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-strong/40 inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="size-4" /> Thêm khu vực
                </button>
              </section>

              <section>
                <label>
                  <FieldLabel>Ghi chú</FieldLabel>
                  <textarea
                    className={cn(inputClass, "mt-1 h-20 resize-none py-2.5 leading-relaxed")}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Lưu ý cần gửi khách hàng..."
                  />
                </label>
              </section>
            </div>

            <DialogFooter className="flex-shrink-0 border-t border-border px-4 sm:px-6 py-3 gap-2 bg-card">
              <button
                type="button"
                onClick={() => closeDialog(false)}
                disabled={saving || importing || exporting || deleting}
                className="h-10 px-4 rounded-lg text-xs font-medium ring-1 ring-black/8 hover:bg-surface-strong disabled:opacity-50"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={saving || importing || exporting || deleting}
                className={
                  "h-10 px-5 rounded-lg text-xs font-medium text-primary-foreground " +
                  (justSaved
                    ? "bg-green-600 hover:bg-green-600"
                    : "bg-terracotta hover:opacity-90") +
                  " disabled:opacity-50 inline-flex items-center justify-center relative"
                }
              >
                <span className={saving || justSaved ? "opacity-0" : ""}>
                  Lưu đề xuất
                </span>
                <span className="absolute inset-0 flex items-center justify-center">
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : justSaved ? (
                    <Check className="size-4" />
                  ) : null}
                </span>
              </button>
            </DialogFooter>
          </form>
        )}

        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(event) => {
            void processFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />

        {activePickerKey ? (
          <ProductPicker
            products={filteredProducts}
            search={productSearch}
            onSearchChange={setProductSearch}
            onClose={() => setActivePickerKey(null)}
            onSelect={(product) => {
              patchItem(activePickerKey, { product, customProduct: null });
              setActivePickerKey(null);
            }}
            onClear={() => {
              patchItem(activePickerKey, { product: null });
              setActivePickerKey(null);
            }}
          />
        ) : null}
        {manualProductKey ? (
          <ManualProductEditor
            value={
              items.find((item) => item.key === manualProductKey)
                ?.customProduct ?? null
            }
            onClose={() => setManualProductKey(null)}
            onSave={(customProduct) => {
              patchItem(manualProductKey, {
                product: null,
                customProduct,
              });
              setManualProductKey(null);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function EditorHeader({
  mapping,
  exporting,
  deleting,
  busy,
  confirmDelete,
  onExport,
  onDelete,
  onCancelDelete,
}: {
  mapping: CustomerMapping | null;
  exporting: boolean;
  deleting: boolean;
  busy: boolean;
  confirmDelete: boolean;
  onExport: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <DialogHeader className="px-4 sm:px-6 py-4 border-b border-border flex-shrink-0">
      <div className="flex items-center justify-between gap-3 pr-8">
        <DialogTitle className="flex items-center gap-2">
          <Image className="size-4 text-terracotta" />
          {mapping ? "Sửa đề xuất vật liệu" : "Tạo đề xuất vật liệu"}
        </DialogTitle>
        {mapping ? (
          <div className="relative flex items-center rounded-lg border border-border/70 bg-card p-0.5 shadow-sm">
            <button
              type="button"
              onClick={onExport}
              disabled={busy || exporting || deleting}
              className="h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 hover:bg-surface-strong disabled:opacity-50"
            >
              {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
              <span className="hidden sm:inline">Xuất PDF</span>
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy || exporting || deleting}
              aria-label="Xóa đề xuất vật liệu"
              className={
                confirmDelete
                  ? "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  : "size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              }
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              {confirmDelete ? <span className="hidden sm:inline">Xóa vĩnh viễn</span> : null}
            </button>
            {confirmDelete ? (
              <button
                type="button"
                onClick={onCancelDelete}
                disabled={deleting}
                className="h-8 px-2.5 rounded-md text-xs font-medium bg-card hover:bg-surface-strong disabled:opacity-50"
              >
                Không xóa
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </DialogHeader>
  );
}

function AreaGroup({
  group,
  groupIndex,
  groupCount,
  inputClass,
  onMoveGroup,
  onPatch,
  onPatchGroup,
  onReplaceImage,
  onPickProduct,
  onManualProduct,
  onDuplicate,
  onRemove,
  onRemoveGroup,
}: {
  group: { key: string; items: Draft[] };
  groupIndex: number;
  groupCount: number;
  inputClass: string;
  onMoveGroup: (delta: number) => void;
  onPatch: (key: string, patch: Partial<Draft>) => void;
  onPatchGroup: (patch: Partial<Draft>) => void;
  onReplaceImage: (key: string, file?: File) => void;
  onPickProduct: (key: string) => void;
  onManualProduct: (key: string) => void;
  onDuplicate: (item: Draft) => void;
  onRemove: (key: string) => void;
  onRemoveGroup: (key: string) => void;
}) {
  const area = group.items[0];
  const areaImageInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <section className="rounded-2xl border border-border/80 bg-surface-strong/20 overflow-hidden">
      <div className="min-h-12 px-3 sm:px-4 flex items-center gap-2 bg-surface-strong/55 border-b border-border">
        <button
          type="button"
          onClick={() => onPatchGroup({ collapsed: !area.collapsed })}
          aria-label={area.collapsed ? "Mở rộng khu vực" : "Thu gọn khu vực"}
          title={area.collapsed ? "Mở rộng khu vực" : "Thu gọn khu vực"}
          aria-expanded={!area.collapsed}
          className="size-8 shrink-0 grid place-items-center rounded-md text-muted-foreground hover:bg-surface-strong hover:text-foreground"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", area.collapsed && "-rotate-90")}
          />
        </button>
        <span className="size-7 rounded-lg bg-terracotta text-primary-foreground grid place-items-center text-[10px] font-bold">
          {groupIndex + 1}
        </span>
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <input
            className={cn(inputClass, "h-9 bg-card font-medium")}
            value={area.description}
            onChange={(event) => onPatchGroup({ description: event.target.value })}
            placeholder={`Tên khu vực ${groupIndex + 1}`}
            aria-label={`Tên khu vực ${groupIndex + 1}`}
          />
          <span className="hidden sm:block shrink-0 text-[9px] text-muted-foreground">
            {group.items.length} phương án
          </span>
        </div>
        <button
          type="button"
          onClick={() => onDuplicate(area)}
          className="h-8 px-2.5 rounded-lg bg-card ring-1 ring-black/5 text-[10px] font-medium text-terracotta hover:bg-terracotta/5"
        >
          <Plus className="size-3.5 inline mr-1" /> Thêm phương án
        </button>
        <div className="flex items-center rounded-lg bg-card ring-1 ring-black/5 p-0.5">
          <button type="button" onClick={() => onMoveGroup(-1)} disabled={groupIndex === 0} className="size-8 grid place-items-center rounded-md hover:bg-surface-strong disabled:opacity-25" aria-label="Đưa khu vực lên"><ChevronUp className="size-3.5" /></button>
          <button type="button" onClick={() => onMoveGroup(1)} disabled={groupIndex === groupCount - 1} className="size-8 grid place-items-center rounded-md hover:bg-surface-strong disabled:opacity-25" aria-label="Đưa khu vực xuống"><ChevronDown className="size-3.5" /></button>
        </div>
        <button
          type="button"
          onClick={() =>
            window.confirm(
              `Xóa khu vực ${groupIndex + 1} và ${group.items.length} phương án bên trong?`,
            ) && onRemoveGroup(group.key)
          }
          title="Xóa khu vực"
          aria-label="Xóa khu vực"
          className="size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {area.collapsed ? null : (
        <div className="grid grid-cols-1 md:grid-cols-[190px_minmax(0,1fr)] gap-3 p-3 bg-card">
          <div className="space-y-2">
          <div>
            <FieldLabel>Ảnh khu vực</FieldLabel>
            <button
              type="button"
              onClick={() => areaImageInputRef.current?.click()}
              className="block w-full cursor-pointer group text-left"
            >
              <div className="relative mt-1 aspect-[4/3] rounded-lg overflow-hidden bg-[#f3f1ed] ring-1 ring-black/5">
                {area.imageDataUrl || area.imagePath ? (
                  <img
                    src={area.imageDataUrl || area.imagePath}
                    alt={area.description || `Khu vực ${groupIndex + 1}`}
                    className="size-full object-contain"
                  />
                ) : (
                  <div className="size-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <FileImage className="size-6 opacity-45" />
                    <span className="text-[10px] font-medium">Chọn ảnh khu vực</span>
                  </div>
                )}
                <span className="absolute inset-x-2 bottom-2 h-7 rounded-md bg-black/65 text-white text-[10px] font-medium grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {area.imageDataUrl || area.imagePath ? "Thay ảnh" : "Chọn ảnh"}
                </span>
              </div>
            </button>
            <input
              ref={areaImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                onReplaceImage(area.key, event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
          {area.imageDataUrl || area.imagePath ? (
            <button
              type="button"
              onClick={() =>
                onPatchGroup({ imagePath: "", imageDataUrl: null, sourceName: "" })
              }
              className="w-full h-8 rounded-md text-[10px] font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600"
            >
              Xóa ảnh khu vực
            </button>
          ) : null}
        </div>
        <div className="space-y-2 min-w-0">
          {group.items.map((item, optionIndex) => (
            <AreaCard
              key={item.key}
              item={item}
              index={optionIndex}
              inputClass={inputClass}
              onPatch={(patch) => onPatch(item.key, patch)}
              onPickProduct={() => onPickProduct(item.key)}
              onManualProduct={() => onManualProduct(item.key)}
              onRemove={() => onRemove(item.key)}
            />
          ))}
        </div>
        </div>
      )}
    </section>
  );
}

function AreaCard({
  item,
  index,
  inputClass,
  onPatch,
  onPickProduct,
  onManualProduct,
  onRemove,
}: {
  item: Draft;
  index: number;
  inputClass: string;
  onPatch: (patch: Partial<Draft>) => void;
  onPickProduct: () => void;
  onManualProduct: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="rounded-lg ring-1 ring-black/8 bg-card p-2 flex items-center gap-2 min-w-0">
      <span className="size-7 shrink-0 grid place-items-center rounded-md bg-surface-strong text-[11px] font-semibold text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      {item.customProduct?.imageDataUrl || item.customProduct?.imagePath ? (
        <img
          src={item.customProduct.imageDataUrl || item.customProduct.imagePath}
          alt={item.customProduct.name}
          className="size-10 shrink-0 rounded-md bg-[#f3f1ed] object-contain"
        />
      ) : item.product ? (
        <ProductImage
          src={item.product.image_path}
          alt={item.product.name}
          code={item.product.code}
          className="size-10 shrink-0 rounded-md bg-[#f3f1ed]"
        />
      ) : (
        <div className="size-10 shrink-0 rounded-md bg-[#f3f1ed] grid place-items-center">
          <FileImage className="size-4 text-muted-foreground/45" />
        </div>
      )}
      <button
        type="button"
        onClick={onPickProduct}
        className={cn(inputClass, "flex-1 min-w-0 text-left flex items-center justify-between gap-2")}
      >
        <span className={cn("truncate", !item.product && !item.customProduct && "text-muted-foreground")}>
          {item.customProduct
            ? `${item.customProduct.code || "Ngoài danh mục"} — ${item.customProduct.name}`
            : item.product
              ? `${item.product.code} — ${item.product.name}`
              : "Chọn sản phẩm"}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      <input
        className={cn(inputClass, "w-24 sm:w-32 shrink-0 text-xs")}
        placeholder="Khu vực"
        value={item.size}
        onChange={(event) => onPatch({ size: event.target.value })}
      />
      <button
        type="button"
        onClick={onManualProduct}
        className="size-8 shrink-0 grid place-items-center rounded-md text-terracotta hover:bg-terracotta/5"
        aria-label={item.customProduct ? "Sửa sản phẩm ngoài danh mục" : "Thêm sản phẩm ngoài danh mục"}
        title={item.customProduct ? "Sửa sản phẩm ngoài danh mục" : "Sản phẩm ngoài danh mục"}
      >
        {item.customProduct ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="size-8 shrink-0 grid place-items-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600"
        aria-label={`Xóa phương án ${index + 1}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </article>
  );
}

function ProductPicker({
  products,
  search,
  onSearchChange,
  onClose,
  onSelect,
  onClear,
}: {
  products: Product[];
  search: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  onSelect: (product: Product) => void;
  onClear: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 bg-black/35 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Chọn sản phẩm">
      <div className="w-full sm:max-w-2xl h-[82dvh] sm:h-[72dvh] bg-card rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-semibold">Chọn sản phẩm đề xuất</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Tìm theo mã, tên, kích thước hoặc bề mặt.</p>
          </div>
          <button type="button" onClick={onClose} className="size-9 grid place-items-center rounded-lg hover:bg-surface-strong" aria-label="Đóng"><X className="size-4" /></button>
        </div>
        <div className="p-3 border-b border-border">
          <div className="h-10 rounded-lg bg-surface-strong/50 px-3 flex items-center gap-2 ring-1 ring-black/5">
            <Search className="size-4 text-muted-foreground" />
            <input autoFocus value={search} onChange={(event) => onSearchChange(event.target.value)} className="flex-1 min-w-0 bg-transparent text-sm outline-none" placeholder="Gõ mã / tên / size / bề mặt..." />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          <button type="button" onClick={onClear} className="w-full px-4 py-3 text-left text-xs text-muted-foreground hover:bg-surface-strong/50">Không chọn sản phẩm</button>
          {products.map((product) => (
            <button key={product.id} type="button" onClick={() => onSelect(product)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-surface-strong/50">
              <ProductImage src={product.image_path} alt={product.name} code={product.code} className="size-14 shrink-0 rounded-lg bg-[#f3f1ed]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate">{product.code} · {product.name}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{[product.size, product.surface].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold tabular-nums">{formatVND(product.retail_price)}</p>
                <p className="text-[9px] text-muted-foreground">/m² · gồm VAT</p>
              </div>
            </button>
          ))}
          {!products.length ? <p className="p-8 text-center text-xs text-muted-foreground">Không tìm thấy sản phẩm.</p> : null}
        </div>
      </div>
    </div>
  );
}

function ManualProductEditor({
  value,
  onClose,
  onSave,
}: {
  value: CustomProduct | null;
  onClose: () => void;
  onSave: (value: CustomProduct) => void;
}) {
  const [draft, setDraft] = useState<CustomProduct>(
    value ?? {
      code: "",
      name: "",
      size: "",
      surface: "",
      retailPrice: "",
      imagePath: "",
      imageDataUrl: null,
      imageName: "",
    },
  );
  const inputClass =
    "w-full h-10 rounded-lg bg-background px-3 text-sm ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-terracotta/35";
  const imageSource = draft.imageDataUrl || draft.imagePath;
  const productImageInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      className="absolute inset-0 z-[60] bg-black/35 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Sản phẩm ngoài danh mục"
    >
      <div className="w-full sm:max-w-2xl max-h-[88dvh] bg-card rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col">
        <div className="px-4 sm:px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-semibold">Sản phẩm ngoài danh mục</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Lưu riêng trong đề xuất này, không thêm vào database sản phẩm.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 grid place-items-center rounded-lg hover:bg-surface-strong"
            aria-label="Đóng"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] gap-4">
            <div className="space-y-2">
              <div>
                <FieldLabel>Ảnh sản phẩm</FieldLabel>
                <button
                  type="button"
                  onClick={() => productImageInputRef.current?.click()}
                  className="block w-full cursor-pointer group text-left"
                >
                  <div className="mt-1 aspect-square rounded-xl overflow-hidden bg-[#f3f1ed] ring-1 ring-black/5 relative">
                    {imageSource ? (
                      <img
                        src={imageSource}
                        alt={draft.name || "Sản phẩm ngoài danh mục"}
                        className="size-full object-contain"
                      />
                    ) : (
                      <div className="size-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <FileImage className="size-7 opacity-45" />
                        <span className="text-[10px] font-medium">Chọn ảnh mẫu</span>
                      </div>
                    )}
                    <span className="absolute inset-x-2 bottom-2 h-8 rounded-md bg-black/65 text-white text-[10px] font-medium grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {imageSource ? "Thay ảnh" : "Chọn ảnh"}
                    </span>
                  </div>
                </button>
                <input
                  ref={productImageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > MAX_IMAGE_BYTES) {
                      toast.error(`${file.name} vượt quá 12 MB`);
                    } else {
                      void fileToDataUrl(file).then((imageDataUrl) =>
                        setDraft((current) => ({
                          ...current,
                          imageDataUrl,
                          imageName: file.name,
                        })),
                      );
                    }
                    event.target.value = "";
                  }}
                />
              </div>
              {imageSource ? (
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      imagePath: "",
                      imageDataUrl: null,
                      imageName: "",
                    }))
                  }
                  className="w-full h-9 rounded-lg text-[10px] font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600"
                >
                  Xóa ảnh
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
              <label className="sm:col-span-2">
                <FieldLabel>Tên sản phẩm *</FieldLabel>
                <input
                  className={cn(inputClass, "mt-1")}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Tên mẫu gạch / vật liệu"
                />
              </label>
              <label>
                <FieldLabel>Mã sản phẩm</FieldLabel>
                <input
                  className={cn(inputClass, "mt-1")}
                  value={draft.code}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, code: event.target.value }))
                  }
                  placeholder="VD: EXT-001"
                />
              </label>
              <label>
                <FieldLabel>Kích thước</FieldLabel>
                <input
                  className={cn(inputClass, "mt-1")}
                  value={draft.size}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, size: event.target.value }))
                  }
                  placeholder="VD: 600 × 1200 mm"
                />
              </label>
              <label>
                <FieldLabel>Bề mặt</FieldLabel>
                <input
                  className={cn(inputClass, "mt-1")}
                  value={draft.surface}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, surface: event.target.value }))
                  }
                  placeholder="VD: Matt, bóng, nhám"
                />
              </label>
              <label>
                <FieldLabel>Giá bán lẻ</FieldLabel>
                <input
                  inputMode="numeric"
                  className={cn(inputClass, "mt-1 tabular-nums")}
                  value={draft.retailPrice}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      retailPrice: event.target.value.replace(/\D/g, ""),
                    }))
                  }
                  placeholder="VNĐ / m²"
                />
                <span className="block text-[9px] text-muted-foreground mt-1">
                  Giá nhập tại đây được hiển thị là đã bao gồm VAT 8%.
                </span>
              </label>
            </div>
          </div>
        </div>
        <div className="border-t border-border px-4 sm:px-5 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-lg ring-1 ring-black/8 text-xs font-medium hover:bg-surface-strong"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              if (!draft.name.trim()) {
                toast.error("Nhập tên sản phẩm ngoài danh mục");
                return;
              }
              onSave({ ...draft, name: draft.name.trim() });
            }}
            className="h-10 px-4 rounded-lg bg-terracotta text-primary-foreground text-xs font-medium"
          >
            Dùng sản phẩm này
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportPreview({
  items,
  importing,
  progress,
  scrollRef,
  onAddFiles,
  onMove,
  onRemove,
  onCrop,
  onCancel,
  onConfirm,
}: {
  items: ImportItem[];
  importing: boolean;
  progress: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onAddFiles: () => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (key: string) => void;
  onCrop: (index: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 sm:px-6 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{items.length} ảnh / trang sẽ thành khu vực</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Đổi thứ tự, loại bỏ hoặc cắt một trang thành nhiều vùng trước khi xác nhận.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onAddFiles} disabled={importing} className="h-9 px-3 rounded-lg ring-1 ring-black/8 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-surface-strong disabled:opacity-50"><FileImage className="size-3.5" /> Thêm file</button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {importing ? (
          <div className="mb-4 rounded-lg bg-terracotta/8 text-terracotta px-3 py-2.5 flex items-center gap-2 text-xs"><Loader2 className="size-4 animate-spin" /> {progress || "Đang xử lý file…"}</div>
        ) : null}
        {items.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((item, index) => (
              <article key={item.key} className="rounded-xl overflow-hidden bg-card ring-1 ring-black/8">
                <div className="relative aspect-[4/3] bg-[#f3f1ed]">
                  <img src={item.dataUrl} alt={item.name} className="size-full object-contain" />
                  <span className="absolute left-2 top-2 size-6 rounded-full bg-black/70 text-white grid place-items-center text-[9px] font-bold">{index + 1}</span>
                </div>
                <div className="p-2.5">
                  <p className="text-[10px] font-medium truncate" title={item.name}>{item.name}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{item.source === "pdf" ? "Trang PDF" : item.source === "crop" ? "Vùng đã cắt" : "Ảnh"}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} className="size-8 grid place-items-center rounded-md hover:bg-surface-strong disabled:opacity-25" aria-label="Đưa lên"><ChevronUp className="size-3.5" /></button>
                    <button type="button" onClick={() => onMove(index, 1)} disabled={index === items.length - 1} className="size-8 grid place-items-center rounded-md hover:bg-surface-strong disabled:opacity-25" aria-label="Đưa xuống"><ChevronDown className="size-3.5" /></button>
                    <button type="button" onClick={() => onCrop(index)} className="size-8 grid place-items-center rounded-md hover:bg-surface-strong" aria-label="Cắt nhiều vùng"><Crop className="size-3.5" /></button>
                    <button type="button" onClick={() => onRemove(item.key)} className="ml-auto size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600" aria-label="Loại bỏ"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : !importing ? (
          <div className="py-16 text-center">
            <FileText className="size-9 mx-auto text-muted-foreground/40" />
            <p className="text-sm font-medium mt-3">Chưa có file để kiểm tra</p>
            <p className="text-xs text-muted-foreground mt-1">Chọn một hoặc nhiều ảnh, hoặc PDF để bắt đầu.</p>
          </div>
        ) : null}
      </div>
      <DialogFooter className="border-t border-border px-4 sm:px-6 py-3 gap-2 bg-card">
        <button type="button" onClick={onCancel} disabled={importing} className="h-10 px-4 rounded-lg ring-1 ring-black/8 text-xs font-medium hover:bg-surface-strong disabled:opacity-50">Hủy import</button>
        <button type="button" onClick={onConfirm} disabled={importing || !items.length} className="h-10 px-4 rounded-lg bg-terracotta text-primary-foreground text-xs font-medium disabled:opacity-50">Thêm {items.length} khu vực</button>
      </DialogFooter>
    </div>
  );
}

function CropWorkspace({
  item,
  onCancel,
  onConfirm,
}: {
  item: ImportItem;
  onCancel: () => void;
  onConfirm: (items: ImportItem[]) => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const [rects, setRects] = useState<CropRect[]>([]);
  const [drawing, setDrawing] = useState<CropRect | null>(null);

  function pointerPosition(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  async function createCrops() {
    const image = imageRef.current;
    if (!image || !rects.length) return;
    const output = rects.map((rect, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(rect.width * image.naturalWidth));
      canvas.height = Math.max(1, Math.round(rect.height * image.naturalHeight));
      const context = canvas.getContext("2d")!;
      context.drawImage(
        image,
        Math.round(rect.x * image.naturalWidth),
        Math.round(rect.y * image.naturalHeight),
        canvas.width,
        canvas.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      return {
        key: key(),
        name: `${item.name} · Vùng ${index + 1}`,
        dataUrl: canvas.toDataURL("image/jpeg", 0.9),
        source: "crop" as const,
      };
    });
    onConfirm(output);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 sm:px-6 py-3 border-b border-border">
        <p className="text-xs text-muted-foreground">Kéo trực tiếp trên ảnh để tạo khung. Mỗi khung sẽ thành một khu vực riêng.</p>
      </div>
      <div className="flex-1 min-h-0 overflow-auto bg-[#282b2a] p-4 sm:p-8 grid place-items-center">
        <div className="relative inline-block max-w-full select-none touch-none">
          <img ref={imageRef} src={item.dataUrl} alt={item.name} draggable={false} className="block max-w-full max-h-[64dvh] object-contain" />
          <div
            className="absolute inset-0 cursor-crosshair"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              const point = pointerPosition(event);
              cropStartRef.current = point;
              setDrawing({ ...point, width: 0, height: 0 });
            }}
            onPointerMove={(event) => {
              const start = cropStartRef.current;
              if (!start) return;
              const point = pointerPosition(event);
              setDrawing({
                x: Math.min(start.x, point.x),
                y: Math.min(start.y, point.y),
                width: Math.abs(point.x - start.x),
                height: Math.abs(point.y - start.y),
              });
            }}
            onPointerUp={(event) => {
              event.currentTarget.releasePointerCapture(event.pointerId);
              if (drawing && drawing.width > 0.03 && drawing.height > 0.03) {
                setRects((current) => [...current, drawing]);
              }
              cropStartRef.current = null;
              setDrawing(null);
            }}
          >
            {[...rects, ...(drawing ? [drawing] : [])].map((rect, index) => (
              <div key={index} className="absolute border-2 border-terracotta bg-terracotta/15" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}>
                <span className="absolute -top-6 left-0 h-5 px-1.5 rounded-sm bg-terracotta text-white text-[9px] font-bold grid place-items-center">{index + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="px-4 sm:px-6 py-3 border-t border-border bg-card flex flex-col sm:flex-row sm:items-center gap-2">
        <p className="text-xs text-muted-foreground flex-1">{rects.length ? `${rects.length} vùng đã chọn` : "Chưa có vùng nào"}</p>
        <button type="button" onClick={() => setRects([])} disabled={!rects.length} className="h-10 px-3 rounded-lg text-xs font-medium hover:bg-surface-strong disabled:opacity-40">Xóa tất cả khung</button>
        <button type="button" onClick={onCancel} className="h-10 px-3 rounded-lg ring-1 ring-black/8 text-xs font-medium hover:bg-surface-strong">Hủy</button>
        <button type="button" onClick={() => void createCrops()} disabled={!rects.length} className="h-10 px-4 rounded-lg bg-terracotta text-primary-foreground text-xs font-medium disabled:opacity-50">Tạo {rects.length} khu vực</button>
      </div>
    </div>
  );
}
