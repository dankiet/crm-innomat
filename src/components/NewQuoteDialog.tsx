import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchCustomers,
  fetchProducts,
  fetchQuote,
  saveQuote,
  updateQuoteFn,
  convertQuoteToOrder,
  deleteQuoteFn,
  exportQuotePrintFn,
} from "@/api/functions";
import type {
  Customer,
  DiscountType,
  Product,
  Quote,
  QuoteStatus,
} from "@/lib/types";
import { quoteStatusMeta } from "@/lib/types";
import { formatVND } from "@/lib/format";
import {
  buildExactCodeSet,
  codeRowFromProduct,
  matchSearchTokens,
  splitSearchTokens,
} from "@/lib/product-search";
import {
  effectiveDiscountPct,
  estimateLineProfitInfo,
  unitPriceForProduct,
} from "@/lib/pricing";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronsDownUp, ChevronsUpDown, FileDown, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Thumbnail gọn cho form BG — có ảnh thì hiện; lỗi/không có thì ô xám (không icon vỡ layout). */
function QuoteThumb({
  src,
  alt = "",
  className,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  const clean = src?.trim() || "";
  const [brokenFor, setBrokenFor] = useState<string | null>(null);
  const broken = brokenFor === clean && clean !== "";
  const hasSrc = Boolean(clean) && !broken;

  return (
    <span
      className={cn(
        "relative flex-shrink-0 overflow-hidden rounded-md bg-[#f3f1ed] ring-1 ring-black/5",
        className,
      )}
    >
      {hasSrc ? (
        <img
          key={clean}
          src={clean}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="size-full object-contain object-center"
          onError={() => setBrokenFor(clean)}
        />
      ) : (
        <span className="absolute inset-0 bg-[#f3f1ed]" aria-hidden />
      )}
    </span>
  );
}

type Line = {
  key: string;
  collapsed: boolean;
  product: Product | null;
  /** Mã hiển thị trên BG (có thể khác mã catalog) */
  product_code: string;
  /** Tên hiển thị trên BG (có thể khác tên catalog) */
  product_name: string;
  quantity_m2: number;
  /** Chuỗi thô đang gõ trong ô SL — giữ được "0", "0." khi nhập thập phân */
  quantity_raw: string;
  discount_pct: number;
  /** Đơn giá bán / m² — có thể nhập tay */
  unit_price: number;
  area: string;
};

/** Chỉ giữ chữ số + 1 dấu thập phân; nhận cả dấu phẩy kiểu VN ("0,12" → "0.12"). */
function sanitizeQuantityInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(/,/g, ".");
  const [head, ...rest] = cleaned.split(".");
  return rest.length ? `${head}.${rest.join("")}` : head;
}

/** Số m² từ chuỗi thô — rỗng hoặc không hợp lệ = 0. */
function parseQuantityInput(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function calcUnit(
  product: Product,
  discountType: DiscountType,
  discountPct: number,
): number {
  return unitPriceForProduct(
    product,
    discountType,
    discountType === "custom" ? discountPct : undefined,
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Được gọi sau khi lưu thành công — kèm bản ghi vừa tạo/cập nhật */
  onCreated?: (quote: Quote) => void;
  /** Được gọi sau khi xóa báo giá thành công */
  onDeleted?: () => void;
  defaultCustomerId?: number;
  /** Prefill dòng SP (vd. chọn nhanh từ catalog) */
  defaultProductIds?: number[];
  /** When set → edit existing quote */
  quoteId?: number | null;
};

export function NewQuoteDialog({
  open,
  onOpenChange,
  onCreated,
  onDeleted,
  defaultCustomerId,
  defaultProductIds,
  quoteId = null,
}: Props) {
  const router = useRouter();
  /** Bản ghi vừa tạo khi giữ popup mở — sau lần lưu đầu, các lần lưu sau update bản ghi này */
  const [savedQuote, setSavedQuote] = useState<Quote | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const activeQuoteId = quoteId ?? savedQuote?.id ?? null;
  const isEdit = Boolean(activeQuoteId);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [discountType, setDiscountType] = useState<DiscountType>("custom");
  const [status, setStatus] = useState<QuoteStatus>("draft");
  const [quoteCode, setQuoteCode] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [productSearch, setProductSearch] = useState("");
  const [activeLineKey, setActiveLineKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [alsoCreateOrder, setAlsoCreateOrder] = useState(false);
  /** true = đơn giá đã gồm VAT; false = chưa VAT (export +8%) */
  const [pricesIncludeVat, setPricesIncludeVat] = useState(false);
  /** Phí vận chuyển nhập tay (chưa VAT) */
  const [shippingFee, setShippingFee] = useState(0);
  const [sourceMapping, setSourceMapping] = useState<{
    id: number;
    code: string;
    name: string;
  } | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [locked, setLocked] = useState(false);
  /** Hiện ô sửa mã/tên trên BG (mặc định ẩn — dùng giá trị tự điền từ catalog) */
  const [editQuoteLabels, setEditQuoteLabels] = useState(false);
  /** Xác nhận xóa 2 bước inline (thay window.confirm) */
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Hiện check V trong nút Lưu sau khi lưu xong (thay toast) */
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    void (async () => {
      setLoadingEdit(true);
      try {
        const [cs, ps, detail] = await Promise.all([
          fetchCustomers({ data: { limit: 300 } }),
          fetchProducts({ data: { limit: 2000 } }),
          quoteId ? fetchQuote({ data: { id: quoteId } }) : Promise.resolve(null),
        ]);
        setCustomers(cs);
        setProducts(ps);

        if (quoteId) {
          if (!detail) {
            toast.error("Không tìm thấy báo giá");
            onOpenChange(false);
            return;
          }
          const q = detail.quote as Quote;
          setSourceMapping(detail.source_mapping ?? null);
          setQuoteCode(q.code);
          setCustomerId(q.customer_id);
          // "none" (cũ) → coi như Tùy chọn
          setDiscountType(
            q.discount_type === "none" ? "custom" : q.discount_type,
          );
          setStatus(q.status);
          setNotes(q.notes || "");
          setLocked(q.status === "accepted" || q.status === "expired");
          setAlsoCreateOrder(false);
          setPricesIncludeVat(Boolean(q.prices_include_vat));
          setShippingFee(q.shipping_fee ?? 0);

          const productMap = new Map(ps.map((p) => [p.id, p]));
          const loadedLines: Line[] = detail.items.map((item) => {
            const product =
              productMap.get(item.product_id) ??
              ({
                id: item.product_id,
                code: item.product_code,
                name: item.product_name,
                size: item.size,
                material: "",
                category: "",
                supplier: "",

                color: "",
                retail_price: item.retail_price,
                discount_tp: null,
                discount_b2b: null,
                total_stock: null, multi_codes_list: "",
                note: "",
                is_hot: 0,
                image_path: "",
              } satisfies Product);
            return {
              key: Math.random().toString(36).slice(2),
              collapsed: false,
              product,
              product_code: item.product_code || product.code,
              product_name: item.product_name || product.name,
              quantity_m2: item.quantity_m2,
              quantity_raw:
                item.quantity_m2 == null ? "" : String(item.quantity_m2),
              discount_pct: item.discount_pct,
              unit_price: item.unit_price,
              area: item.area,
            };
          });
          setLines(loadedLines.length ? loadedLines : [emptyLine()]);
          // Tự bật nếu BG cũ đã sửa mã/tên khác catalog
          const customized = loadedLines.some(
            (l) =>
              l.product &&
              (l.product_code.trim() !== l.product.code.trim() ||
                l.product_name.trim() !== l.product.name.trim()),
          );
          setEditQuoteLabels(customized);
        } else {
          setSavedQuote(null);
          setSourceMapping(null);
          setQuoteCode("");
          setCustomerId(defaultCustomerId ?? "");
          setDiscountType("custom");
          setStatus("draft");
          setNotes("");
          setAlsoCreateOrder(false);
          setPricesIncludeVat(false);
          setShippingFee(0);
          setLocked(false);
          setEditQuoteLabels(false);

          // Prefill từ catalog (chọn nhiều SP → tạo BG)
          const ids = defaultProductIds?.filter((id) => Number.isFinite(id));
          if (ids?.length) {
            const productMap = new Map(ps.map((p) => [p.id, p]));
            const prefilled: Line[] = [];
            for (const id of ids) {
              const product = productMap.get(id);
              if (!product) continue;
              prefilled.push({
                key: Math.random().toString(36).slice(2),
                collapsed: false,
                product,
                product_code: product.code,
                product_name: product.name,
                quantity_m2: 1,
                quantity_raw: "1",
                discount_pct: 0,
                unit_price: calcUnit(product, "custom", 0),
                area: "",
              });
            }
            setLines(prefilled.length ? prefilled : [emptyLine()]);
          } else {
            setLines([emptyLine()]);
          }
        }
      } finally {
        setLoadingEdit(false);
      }
    })();
    // defaultProductIds: join key so array identity changes still re-run when open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    defaultCustomerId,
    quoteId,
    onOpenChange,
    defaultProductIds?.join(","),
  ]);

  function applyDiscountType(type: DiscountType, current: Line[]): Line[] {
    return current.map((line) => {
      if (!line.product) return line;
      let pct = 0;
      if (type === "tp") pct = line.product.discount_tp ?? 0;
      else if (type === "b2b") pct = line.product.discount_b2b ?? 0;
      else if (type === "none") pct = 0;
      else pct = line.discount_pct;
      const unit = calcUnit(line.product, type, pct);
      return { ...line, discount_pct: pct, unit_price: unit };
    });
  }

  function setProductForLine(key: string, product: Product) {
    setLines((prev) => {
      const next = prev.map((l) => {
        if (l.key !== key) return l;
        let pct = l.discount_pct;
        if (discountType === "tp") pct = product.discount_tp ?? 0;
        else if (discountType === "b2b") pct = product.discount_b2b ?? 0;
        else if (discountType === "none") pct = 0;
        const unit = calcUnit(product, discountType, pct);
        return {
          ...l,
          product,
          product_code: product.code,
          product_name: product.name,
          discount_pct: pct,
          unit_price: unit,
        };
      });
      return next;
    });
    setActiveLineKey(null);
    setProductSearch("");
  }

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 40);
    const tokens = splitSearchTokens(productSearch, (v) => v.trim().toLowerCase());
    const rows = products.map((p) => ({
      p,
      index: codeRowFromProduct(p.code, p.multi_codes_list, (v) => v.trim().toLowerCase()),
      searchable: [p.code, p.name, p.size, p.category || ""]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    }));
    const exactSet = buildExactCodeSet(rows.map((entry) => entry.index));
    return rows
      .filter(({ index, searchable }) => matchSearchTokens(index, tokens, searchable, exactSet))
      .map(({ p }) => p)
      .slice(0, 40);
  }, [products, productSearch]);

  const totals = useMemo(() => {
    let retail = 0;
    let after = 0;
    for (const l of lines) {
      if (!l.product || !l.quantity_m2) continue;
      retail += l.product.retail_price * l.quantity_m2;
      after += (l.unit_price || 0) * l.quantity_m2;
    }
    return { retail: Math.round(retail), after: Math.round(after) };
  }, [lines]);

  /** Tổng lợi nhuận ước tính các dòng (không trừ phí vận chuyển). */
  const totalProfit = useMemo(() => {
    let sum = 0;
    let hasData = false;
    for (const l of lines) {
      const info = estimateLineProfitInfo(
        l.unit_price || 0,
        l.quantity_m2 || 0,
        l.product?.trade_price,
        pricesIncludeVat,
      );
      if (info) {
        sum += info.amount;
        hasData = true;
      }
    }
    return hasData ? sum : null;
  }, [lines, pricesIncludeVat]);

  async function saveCurrentQuote(): Promise<Quote | null> {
    if (locked) {
      toast.error("Báo giá đã chốt/hết hạn — không thể sửa");
      return null;
    }
    if (!customerId) {
      toast.error("Chọn khách hàng");
      return null;
    }
    const items = lines
      // Cho phép SL = 0 (dòng tham khảo giá) — chỉ cần đã chọn sản phẩm
      .filter((l) => l.product && l.quantity_m2 >= 0)
      .map((l) => ({
        product_id: l.product!.id,
        product_code: l.product_code.trim() || l.product!.code,
        product_name: l.product_name.trim() || l.product!.name,
        quantity_m2: l.quantity_m2,
        discount_pct: l.discount_pct,
        unit_price: Math.round(Number(l.unit_price) || 0),
        area: l.area,
      }));
    if (!items.length) {
      toast.error("Thêm ít nhất 1 sản phẩm");
      return null;
    }
    setSaving(true);
    try {
      let quote: Quote;
      if (activeQuoteId) {
        quote = await updateQuoteFn({
          data: {
            id: activeQuoteId,
            customer_id: Number(customerId),
            discount_type: discountType,
            status,
            notes,
            prices_include_vat: pricesIncludeVat,
            shipping_fee: shippingFee,
            items,
          },
        });
      } else {
        quote = await saveQuote({
          data: {
            customer_id: Number(customerId),
            discount_type: discountType,
            notes,
            prices_include_vat: pricesIncludeVat,
            shipping_fee: shippingFee,
            items,
          },
        });
        // Chuyển sang trạng thái sửa bản ghi vừa tạo — popup vẫn mở
        setSavedQuote(quote);
        setQuoteCode(quote.code);
      }
      if (alsoCreateOrder) {
        await convertQuoteToOrder({ data: { quoteId: quote.id } });
      }
      setAlsoCreateOrder(false);
      return quote;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi lưu báo giá");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    /** true = mở form tạo mới (không phải sửa BG có sẵn qua quoteId) */
    const isCreateFlow = quoteId == null;
    const quote = await saveCurrentQuote();
    if (!quote) return;
    onCreated?.(quote);
    if (isCreateFlow) {
      // Tạo mới: đóng ngay sau lưu — không giữ popup / không chuyển sang form sửa bản vừa tạo
      setSavedQuote(null);
      setJustSaved(false);
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      onOpenChange(false);
      return;
    }
    setJustSaved(true);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setJustSaved(false), 1500);
  }

  async function handleExportPdf() {
    if (!activeQuoteId) return;
    setExporting(true);
    try {
      const file = await exportQuotePrintFn({
        data: { quoteId: activeQuoteId },
      });
      const binary = atob(file.base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], { type: file.mimeType }),
      );
      if (!window.open(url, "_blank"))
        toast.error("Trình duyệt đang chặn cửa sổ xuất tài liệu");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xuất PDF thất bại");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!activeQuoteId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteQuoteFn({ data: { id: activeQuoteId } });
      toast.success("Đã xóa báo giá");
    setConfirmDelete(false);
    setJustSaved(false);
      onDeleted?.();
      onOpenChange(false);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa báo giá thất bại");
    } finally {
      setDeleting(false);
    }
  }

  function closeDialog(nextOpen: boolean) {
    if (!nextOpen && (saving || exporting || deleting)) return;
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent
        className="sm:max-w-3xl max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 flex-shrink-0">
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle>
              {isEdit
                ? `Sửa báo giá${quoteCode ? ` ${quoteCode}` : ""}`
                : "Tạo báo giá"}
            </DialogTitle>
            {activeQuoteId ? (
              <div className="relative flex items-center rounded-lg border border-border/70 bg-card p-0.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  disabled={saving || exporting || deleting}
                  className="h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 hover:bg-surface-strong disabled:opacity-50"
                >
                  {exporting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <FileDown className="size-3.5" />
                  )}
                  <span className="hidden sm:inline">Xuất PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={saving || exporting || deleting}
                  aria-label="Xóa báo giá"
                  className={
                    confirmDelete
                      ? "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      : "size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  }
                >
                  {deleting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  {confirmDelete ? (
                    <span className="hidden sm:inline">Xóa vĩnh viễn</span>
                  ) : null}
                </button>
                {confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
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

        {/* ── Product picker overlay ── render as sibling INSIDE DialogContent
             so Radix never sees it as an "outside" click. Position absolute
             covers the whole dialog without any portal hackery. */}
        {activeLineKey !== null && !locked && (() => {
          const activeIdx = lines.findIndex((l) => l.key === activeLineKey);
          return (
            <div
              className="absolute inset-0 z-[100] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Chọn sản phẩm"
            >
              {/* backdrop */}
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Đóng"
                onClick={() => { setActiveLineKey(null); setProductSearch(""); }}
              />
              {/* picker panel */}
              <div className="relative z-10 w-full sm:max-w-md max-h-[85dvh] sm:max-h-[70vh] flex flex-col bg-card rounded-t-2xl sm:rounded-xl shadow-xl ring-1 ring-black/10 overflow-hidden safe-pb">
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border">
                  <p className="text-sm font-medium">
                    Chọn sản phẩm
                    {activeIdx >= 0 && (
                      <span className="text-muted-foreground font-normal"> · dòng {activeIdx + 1}</span>
                    )}
                  </p>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground px-2 py-1 rounded-md hover:bg-surface-strong"
                    onClick={() => { setActiveLineKey(null); setProductSearch(""); }}
                  >
                    Đóng
                  </button>
                </div>
                <div className="p-2 border-b border-border flex items-center gap-2">
                  <Search className="size-3.5 text-muted-foreground flex-shrink-0" />
                  <input
                    autoFocus
                    className="flex-1 text-sm outline-none bg-transparent min-w-0 h-9"
                    placeholder="Gõ mã / tên / size / BST..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
                <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2.5 hover:bg-surface-strong/70 active:bg-surface-strong border-b border-border/40 last:border-0 flex gap-2.5 items-center"
                      onClick={() => setProductForLine(activeLineKey, p)}
                    >
                      <QuoteThumb src={p.image_path} alt={p.code} className="size-12" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">
                          {p.code}
                          <span className="font-normal text-muted-foreground"> · {p.name}</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {[p.size, formatVND(p.retail_price) + "/m²"].filter(Boolean).join(" · ")}
                          {p.total_stock != null
                            ? ` · Tồn ${Number(p.total_stock).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} m²`
                            : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                  {!filteredProducts.length && (
                    <p className="p-4 text-xs text-muted-foreground text-center">Không tìm thấy sản phẩm</p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {loadingEdit ? (
          <div className="flex-1 min-h-0 animate-in fade-in duration-150 px-4 sm:px-6 py-4 space-y-4" aria-label="Đang tải báo giá">
            <div className="h-10 rounded-lg bg-surface-strong/70 animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-16 rounded-lg bg-surface-strong/60 animate-pulse" />
              <div className="h-16 rounded-lg bg-surface-strong/60 animate-pulse" />
            </div>
            <div className="h-44 rounded-xl bg-surface-strong/50 animate-pulse" />
          </div>
        ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0"
        >
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 space-y-4 pb-3">
          {sourceMapping ? (
            <div className="rounded-lg bg-blue-50 text-blue-900 px-3 py-2 text-xs flex flex-wrap items-center gap-1.5">
              <span className="font-medium">Tạo từ đề xuất:</span>
              <span className="font-mono font-semibold">{sourceMapping.code}</span>
              {sourceMapping.name ? (
                <span className="text-blue-700">· {sourceMapping.name}</span>
              ) : null}
            </div>
          ) : null}
          {locked && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
              Báo giá đã duyệt hoặc hết hạn — chỉ xem, không chỉnh sửa.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Khách hàng *
              </span>
              <select
                className={inputCls}
                value={customerId}
                disabled={locked}
                onChange={(e) =>
                  setCustomerId(e.target.value ? Number(e.target.value) : "")
                }
              >
                <option value="">— Chọn khách hàng —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.source ? ` · ${c.source}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Căn cứ chiết khấu
              </span>
              <select
                className={inputCls}
                value={discountType === "none" ? "custom" : discountType}
                disabled={locked}
                onChange={(e) => {
                  const t = e.target.value as DiscountType;
                  setDiscountType(t);
                  setLines((prev) => applyDiscountType(t, prev));
                }}
              >
                <option value="custom">Tùy chọn</option>
                <option value="tp">CK TP (Trade)</option>
                <option value="b2b">CK B2B (Partner)</option>
              </select>
            </label>
            {isEdit && (
              <label className="block sm:col-span-2">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Trạng thái báo giá
                </span>
                <select
                  className={inputCls}
                  value={status}
                  disabled={locked}
                  onChange={(e) => setStatus(e.target.value as QuoteStatus)}
                >
                  {(Object.keys(quoteStatusMeta) as QuoteStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {quoteStatusMeta[k].label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Sản phẩm ({lines.filter((l) => l.product).length}/{lines.length}{" "}
                dòng)
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  title="Thu gọn tất cả"
                  aria-label="Thu gọn tất cả"
                  onClick={() =>
                    setLines((prev) =>
                      prev.map((line) => ({ ...line, collapsed: true })),
                    )
                  }
                  className="size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-surface-strong hover:text-foreground"
                >
                  <ChevronsDownUp className="size-4" />
                </button>
                <button
                  type="button"
                  title="Mở rộng tất cả"
                  aria-label="Mở rộng tất cả"
                  onClick={() =>
                    setLines((prev) =>
                      prev.map((line) => ({ ...line, collapsed: false })),
                    )
                  }
                  className="size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-surface-strong hover:text-foreground"
                >
                  <ChevronsUpDown className="size-4" />
                </button>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-border accent-terracotta"
                    checked={editQuoteLabels}
                    disabled={locked}
                    onChange={(e) => setEditQuoteLabels(e.target.checked)}
                  />
                  Sửa mã/tên trên BG
                </label>
                {!locked ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLines((p) => [...p, emptyLine()]);
                      setActiveLineKey(null);
                      setProductSearch("");
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-terracotta hover:opacity-80"
                  >
                    <Plus className="size-3.5" /> Thêm dòng
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((line, index) => {
                const unit = line.unit_price || 0;
                const lineTotal = Math.round(unit * (line.quantity_m2 || 0));
                const isPickerOpen = activeLineKey === line.key;
                const profitInfo = estimateLineProfitInfo(
                  unit,
                  line.quantity_m2 || 0,
                  line.product?.trade_price,
                  pricesIncludeVat,
                );
                return (
                  <div
                    key={line.key}
                    className="rounded-lg ring-1 ring-black/8 bg-card p-2.5 sm:p-3 space-y-2"
                  >
                    {/* Row header: # + thumb + product + khu vực + delete */}
                    <div className="flex gap-2 items-center">
                      <span
                        className="size-7 flex-shrink-0 grid place-items-center rounded-md bg-surface-strong text-[11px] font-semibold text-muted-foreground tabular-nums"
                        title={`Dòng ${index + 1}`}
                      >
                        {index + 1}
                      </span>
                      <QuoteThumb
                        src={line.product?.image_path}
                        alt={line.product?.code ?? ""}
                        className="size-10"
                      />
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          disabled={locked}
                          className={`${inputCls} text-left flex items-center justify-between gap-2 ${
                            !line.product
                              ? "text-muted-foreground"
                              : "text-foreground"
                          }`}
                          onClick={() => {
                            if (locked) return;
                            setActiveLineKey(isPickerOpen ? null : line.key);
                            setProductSearch("");
                          }}
                        >
                          <span className="truncate text-sm">
                            {line.product
                              ? `${line.product_code || line.product.code} — ${line.product_name || line.product.name}`
                              : "Chọn sản phẩm"}
                          </span>
                          <ChevronDown
                            className={`size-3.5 flex-shrink-0 text-muted-foreground transition-transform ${
                              isPickerOpen ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </div>

                      <div className="w-24 sm:w-32 flex-shrink-0">
                        <input
                          className={`${inputCls} text-xs`}
                          placeholder="Khu vực"
                          value={line.area || ""}
                          disabled={locked}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key
                                  ? { ...l, area: e.target.value }
                                  : l,
                              ),
                            )
                          }
                        />
                      </div>

                      <button
                        type="button"
                        title={line.collapsed ? "Mở rộng dòng" : "Thu gọn dòng"}
                        aria-label={
                          line.collapsed
                            ? `Mở rộng dòng ${index + 1}`
                            : `Thu gọn dòng ${index + 1}`
                        }
                        aria-expanded={!line.collapsed}
                        onClick={() =>
                          setLines((prev) =>
                            prev.map((item) =>
                              item.key === line.key
                                ? { ...item, collapsed: !item.collapsed }
                                : item,
                            ),
                          )
                        }
                        className="size-8 flex-shrink-0 grid place-items-center rounded-md text-muted-foreground hover:bg-surface-strong hover:text-foreground"
                      >
                        <ChevronDown
                          className={cn(
                            "size-3.5 transition-transform",
                            line.collapsed && "-rotate-90",
                          )}
                        />
                      </button>

                      {!locked ? (
                        <button
                          type="button"
                          title="Xóa dòng"
                          onClick={() => {
                            setLines((prev) =>
                              prev.length === 1
                                ? [emptyLine()]
                                : prev.filter((l) => l.key !== line.key),
                            );
                            if (activeLineKey === line.key) {
                              setActiveLineKey(null);
                            }
                          }}
                          className="size-8 flex-shrink-0 grid place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>

                    {!line.collapsed && (line.product ? (
                      <>
                        {editQuoteLabels ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="block">
                              <span className="text-[10px] text-muted-foreground">
                                Mã trên BG
                              </span>
                              <input
                                className={inputCls}
                                value={line.product_code || ""}
                                disabled={locked}
                                onChange={(e) =>
                                  setLines((prev) =>
                                    prev.map((l) =>
                                      l.key === line.key
                                        ? {
                                            ...l,
                                            product_code: e.target.value,
                                          }
                                        : l,
                                    ),
                                  )
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="text-[10px] text-muted-foreground">
                                Tên trên BG
                              </span>
                              <input
                                className={inputCls}
                                value={line.product_name || ""}
                                disabled={locked}
                                onChange={(e) =>
                                  setLines((prev) =>
                                    prev.map((l) =>
                                      l.key === line.key
                                        ? {
                                            ...l,
                                            product_name: e.target.value,
                                          }
                                        : l,
                                    ),
                                  )
                                }
                              />
                            </label>
                          </div>
                        ) : null}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <label className="block">
                            <div className="flex justify-between items-baseline mb-1">
                              <span className="text-[10px] text-muted-foreground">
                                SL (m²)
                              </span>
                              {line.product?.packing_m2 ? (
                                <span 
                                  className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200/60" 
                                  title={`Quy cách: ${line.product.packing_m2} m²/thùng${line.product.packing_pcs ? ` - ${line.product.packing_pcs} viên` : ''}`}
                                >
                                  {line.quantity_m2 
                                    ? `~ ${+(line.quantity_m2 / line.product.packing_m2).toFixed(2)} thùng${line.product.packing_pcs ? ` (${Math.round((line.quantity_m2 / line.product.packing_m2) * line.product.packing_pcs)} viên)` : ''}` 
                                    : `${line.product.packing_m2}m²/th`}
                                </span>
                              ) : null}
                            </div>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              className={inputCls}
                              value={line.quantity_raw}
                              disabled={locked}
                              onChange={(e) => {
                                const raw = sanitizeQuantityInput(
                                  e.target.value,
                                );
                                setLines((prev) =>
                                  prev.map((l) =>
                                    l.key === line.key
                                      ? {
                                          ...l,
                                          quantity_raw: raw,
                                          quantity_m2: parseQuantityInput(raw),
                                        }
                                      : l,
                                  ),
                                );
                              }}
                              onBlur={() => {
                                setLines((prev) =>
                                  prev.map((l) => {
                                    if (l.key !== line.key) return l;
                                    const qty = parseQuantityInput(
                                      l.quantity_raw,
                                    );
                                    return {
                                      ...l,
                                      quantity_raw:
                                        l.quantity_raw.trim() === ""
                                          ? ""
                                          : String(qty),
                                      quantity_m2: qty,
                                    };
                                  }),
                                );
                              }}
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] text-muted-foreground">
                              CK %
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              className={inputCls}
                              value={line.discount_pct || 0}
                              disabled={
                                locked || discountType !== "custom"
                              }
                              onChange={(e) => {
                                const pct = Number(e.target.value) || 0;
                                setLines((prev) =>
                                  prev.map((l) => {
                                    if (l.key !== line.key) return l;
                                    const unitPrice = l.product
                                      ? calcUnit(l.product, "custom", pct)
                                      : 0;
                                    return {
                                      ...l,
                                      discount_pct: pct,
                                      unit_price: unitPrice,
                                    };
                                  }),
                                );
                              }}
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] text-muted-foreground">
                              Giá bán (đ/m²)
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={10}
                              inputMode="numeric"
                              className={inputCls}
                              value={line.unit_price || ""}
                              disabled={locked}
                              onChange={(e) => {
                                const raw = e.target.value;
                                // step=10: spinner theo hàng chục; gõ tự do vẫn được
                                const unitPrice =
                                  raw === ""
                                    ? 0
                                    : Math.max(0, Math.round(Number(raw) || 0));
                                setLines((prev) =>
                                  prev.map((l) => {
                                    if (l.key !== line.key) return l;
                                    const retail =
                                      l.product?.retail_price ?? 0;
                                    return {
                                      ...l,
                                      unit_price: unitPrice,
                                      discount_pct: effectiveDiscountPct(
                                        retail,
                                        unitPrice,
                                      ),
                                    };
                                  }),
                                );
                              }}
                              onBlur={() => {
                                // Chuẩn hóa về bội số 10 khi rời ô
                                setLines((prev) =>
                                  prev.map((l) => {
                                    if (l.key !== line.key) return l;
                                    const unitPrice =
                                      Math.round((l.unit_price || 0) / 10) * 10;
                                    const retail =
                                      l.product?.retail_price ?? 0;
                                    return {
                                      ...l,
                                      unit_price: unitPrice,
                                      discount_pct: effectiveDiscountPct(
                                        retail,
                                        unitPrice,
                                      ),
                                    };
                                  }),
                                );
                              }}
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] text-muted-foreground">
                              Thành tiền
                            </span>
                            <div
                              className={`${inputCls} bg-surface-strong/40 font-medium tabular-nums`}
                            >
                              {line.quantity_raw.trim() !== ""
                                ? formatVND(lineTotal)
                                : "—"}
                            </div>
                          </label>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          DB: {line.product.code}
                          {line.product.size
                            ? ` · ${line.product.size}`
                            : ""}
                          {" · lẻ "}
                          {formatVND(line.product.retail_price)}/m²
                        </p>
                        {profitInfo ? (
                          <p
                            className={cn(
                              "text-[11px] font-medium tabular-nums truncate",
                              profitInfo.amount > 0
                                ? "text-emerald-700"
                                : profitInfo.amount < 0
                                  ? "text-red-600"
                                  : "text-muted-foreground",
                            )}
                          >
                            Lợi nhuận dự kiến:{" "}
                            {formatVND(profitInfo.amount)} (
                            {profitInfo.pct.toFixed(1)}%)
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground/70 truncate">
                            Lợi nhuận dự kiến: — (chưa có giá vốn TP)
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[11px] text-muted-foreground pl-9">
                        Chọn sản phẩm từ danh sách để nhập số lượng và giá.
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Ghi chú báo giá
            </span>
            <textarea
              className={`${inputCls} min-h-[64px] resize-y mt-1`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

          {/* Sticky footer */}
          <div className="flex-shrink-0 border-t border-border bg-card/95 backdrop-blur-sm px-3 sm:px-4 py-2.5 space-y-2">
            {/* Summary rows */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                SP:{" "}
                <span className="font-medium text-foreground tabular-nums">{formatVND(totals.after)}</span>
              </span>
              {shippingFee > 0 && (
                <span>
                  Phí VC:{" "}
                  <span className="font-medium text-foreground tabular-nums">{formatVND(shippingFee)}</span>
                  <span className="text-[10px] ml-0.5">(chưa VAT)</span>
                </span>
              )}
              {totalProfit != null ? (
                <span>
                  Lợi nhuận dự kiến:{" "}
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      totalProfit > 0
                        ? "text-emerald-700"
                        : totalProfit < 0
                          ? "text-red-600"
                          : "text-foreground",
                    )}
                  >
                    {formatVND(totalProfit)}
                  </span>
                </span>
              ) : null}
            </div>

            {/* Main action row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* Total highlight */}
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Tổng</span>
                <span className="text-base sm:text-lg font-semibold tabular-nums text-foreground">
                  {formatVND(totals.after + shippingFee)}
                </span>
              </div>

              {/* Shipping fee input */}
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="whitespace-nowrap">Phí VC</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  disabled={locked}
                  className="w-28 h-7 px-2 rounded-md bg-background ring-1 ring-black/10 text-xs text-foreground outline-none focus:ring-terracotta/40 disabled:opacity-50 tabular-nums"
                  value={shippingFee || ""}
                  placeholder="0"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setShippingFee(Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
                  }}
                />
              </label>

              <div
                className="inline-flex h-8 rounded-full ring-1 ring-black/8 bg-surface-strong/50 p-0.5 text-[11px] font-medium"
                role="group"
                aria-label="VAT"
              >
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => setPricesIncludeVat(false)}
                  className={
                    !pricesIncludeVat
                      ? "px-2.5 rounded-full bg-card text-foreground shadow-sm"
                      : "px-2.5 rounded-full text-muted-foreground hover:text-foreground"
                  }
                >
                  Chưa VAT
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => setPricesIncludeVat(true)}
                  className={
                    pricesIncludeVat
                      ? "px-2.5 rounded-full bg-card text-foreground shadow-sm"
                      : "px-2.5 rounded-full text-muted-foreground hover:text-foreground"
                  }
                >
                  Gồm VAT
                </button>
              </div>

              {!locked ? (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded accent-terracotta"
                    checked={alsoCreateOrder}
                    onChange={(e) => setAlsoCreateOrder(e.target.checked)}
                  />
                  Tạo đơn
                </label>
              ) : null}

              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  type="button"
                  onClick={() => closeDialog(false)}
                  disabled={saving || exporting || deleting}
                  className="h-8 px-3 rounded-lg text-xs font-medium ring-1 ring-black/5 bg-card hover:bg-surface-strong disabled:opacity-50"
                >
                  Đóng
                </button>
                {!locked ? (
                  <button
                    type="submit"
                    disabled={saving || exporting || deleting}
                    className={
                      "h-8 px-3 rounded-lg text-xs font-medium text-primary-foreground " +
                      (justSaved
                        ? "bg-green-600 hover:bg-green-600"
                        : "bg-terracotta hover:opacity-90") +
                      " disabled:opacity-50 inline-flex items-center justify-center relative"
                    }
                  >
                    <span className={saving || justSaved ? "opacity-0" : ""}>
                      {isEdit ? "Lưu" : "Lưu báo giá"}
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center">
                      {saving ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : justSaved ? (
                        <Check className="size-4" />
                      ) : null}
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function emptyLine(): Line {
  return {
    key: Math.random().toString(36).slice(2),
    collapsed: false,
    product: null,
    product_code: "",
    product_name: "",
    quantity_m2: 0,
    quantity_raw: "",
    discount_pct: 0,
    unit_price: 0,
    area: "",
  };
}

const inputCls =
  "w-full text-sm px-3 py-2 rounded-md bg-background ring-1 ring-black/10 outline-none focus:ring-terracotta/40 text-foreground placeholder:text-muted-foreground/70 disabled:opacity-60";
