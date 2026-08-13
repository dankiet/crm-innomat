import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import {
  addManualCustomerProductFn,
  convertQuoteToOrder,
  createQuoteFromMappingFn,
  deleteCustomerMappingFn,
  deleteCustomerProductSampleFn,
  deleteOrderFn,
  deleteQuoteFn,
  exportMappingPrintFn,
  exportQuotePrintFn,
  fetchCustomerDetail,
  fetchCustomerMappings,
  fetchProducts,
  saveNote,
  setCustomerProductSampleSentFn,
  setOrderStatusFn,
} from "@/api/functions";
import { NewCustomerDialog } from "@/components/NewCustomerDialog";
import { NewQuoteDialog } from "@/components/NewQuoteDialog";
import {
  CustomerMappingDialog,
  type CustomerMapping,
} from "@/components/CustomerMappingDialog";
import {
  ExportQuoteDialog,
  type QuotePrintOptions,
} from "@/components/ExportQuoteDialog";
import { ProductImage } from "@/components/ProductImage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  orderStatusMeta,
  quoteStatusMeta,
  statusMeta,
  type Customer,
  type Note,
  type Order,
  type OrderStatus,
  type Product,
  type Quote,
  type QuoteItem,
} from "@/lib/types";
import { formatVND } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ORDER_STATUSES: OrderStatus[] = [
  "preparing",
  "shipping",
  "delivered",
];

type QuotedProduct = {
  id: number;
  product_id: number | null;
  product_code: string;
  product_name: string;
  image_path: string;
  quote_count: number;
  total_m2: number;
  last_quoted_at: string | null;
  sample_sent: boolean;
  sample_sent_at: string | null;
  source: "manual" | "quote";
  retail_price: number;
  total_stock: number;
};

type Detail = {
  customer: Customer;
  quotes: Array<Quote & { items: QuoteItem[] }>;
  orders: Order[];
  notes: Note[];
  quotedProducts: QuotedProduct[];
  stats: {
    quote_count: number;
    order_count: number;
    note_count: number;
    mapping_count: number;
    debt: number;
    total_order_amount: number;
    total_paid: number;
  };
};

type Tab = "quotes" | "products" | "orders" | "mapping";

export const Route = createFileRoute("/_app/khach-hang/$customerId")({
  head: () => ({
    meta: [{ title: "Chi tiết khách hàng — Innomat CRM" }],
  }),
  loader: async ({ params }) => {
    const id = Number(params.customerId);
    if (!Number.isFinite(id)) throw new Error("ID không hợp lệ");
    const detail = await fetchCustomerDetail({ data: { id } });
    if (!detail) throw new Error("Không tìm thấy khách hàng");
    return { detail: detail as Detail };
  },
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { detail: initial } = Route.useLoaderData() as { detail: Detail };
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("quotes");
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [editQuoteId, setEditQuoteId] = useState<number | null>(null);
  const [exportQuote, setExportQuote] = useState<Quote | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [editMapping, setEditMapping] = useState<CustomerMapping | null>(null);
  const [mappings, setMappings] = useState<CustomerMapping[] | null>(null);
  const [exportingMappingId, setExportingMappingId] = useState<number | null>(null);
  const [convertingMappingId, setConvertingMappingId] = useState<number | null>(null);
  const [confirmDeleteMappingId, setConfirmDeleteMappingId] = useState<
    number | null
  >(null);
  const [deletingMappingId, setDeletingMappingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [allProducts, setAllProducts] = useState<Product[] | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [addingProductId, setAddingProductId] = useState<number | null>(null);
  const [samplePending, setSamplePending] = useState<Set<number>>(
    () => new Set(),
  );
  const [deletingProductId, setDeletingProductId] = useState<number | null>(
    null,
  );
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<
    number | null
  >(null);

  const c = initial.customer;
  const status = statusMeta[c.status];

  const existingProductIds = useMemo(
    () =>
      new Set(
        initial.quotedProducts
          .map((p) => p.product_id)
          .filter((id): id is number => id != null),
      ),
    [initial.quotedProducts],
  );

  const filteredPickerProducts = useMemo(() => {
    const list = allProducts ?? [];
    const q = productSearch.trim().toLowerCase();
    const notAdded = list.filter((p) => !existingProductIds.has(p.id));
    if (!q) return notAdded.slice(0, 50);
    return notAdded
      .filter(
        (p) =>
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [allProducts, productSearch, existingProductIds]);

  async function refresh() {
    await router.invalidate();
  }

  async function loadMappings() {
    try {
      const res = await fetchCustomerMappings({ data: { customerId: c.id } });
      setMappings(res);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không tải được đề xuất vật liệu",
      );
    }
  }

  useEffect(() => {
    if (tab === "mapping") {
      void loadMappings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, initial]);

  function openEditMapping(m: CustomerMapping) {
    setEditMapping(m);
    setMappingOpen(true);
  }

  async function handleExportMapping(mappingId: number) {
    setExportingMappingId(mappingId);
    try {
      const file = await exportMappingPrintFn({ data: { mappingId } });
      const bin = atob(file.base64);
      const bytes = Uint8Array.from(bin, (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
      const opened = window.open(url, "_blank");
      if (!opened) toast.error("Trình duyệt đang chặn cửa sổ xuất tài liệu");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xuất thất bại");
    } finally {
      setExportingMappingId(null);
    }
  }

  async function handleConvertMapping(mappingId: number) {
    setConvertingMappingId(mappingId);
    try {
      const quote = await createQuoteFromMappingFn({ data: { mappingId } });
      await refresh();
      setTab("quotes");
      setEditQuoteId(quote.id);
      toast.success(`Đã tạo ${quote.code}. Nhập số lượng để hoàn tất báo giá.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Không tạo được báo giá từ đề xuất",
      );
    } finally {
      setConvertingMappingId(null);
    }
  }

  async function handleDeleteMapping(mappingId: number) {
    setDeletingMappingId(mappingId);
    try {
      await deleteCustomerMappingFn({ data: { id: mappingId } });
      setConfirmDeleteMappingId(null);
      await loadMappings();
      toast.success("Đã xóa đề xuất vật liệu");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không xóa được đề xuất",
      );
    } finally {
      setDeletingMappingId(null);
    }
  }

  async function handlePostNote(e?: React.FormEvent) {
    e?.preventDefault();
    const content = noteDraft.trim();
    if (!content) {
      toast.error("Nhập nội dung ghi chú");
      return;
    }
    if (noteSaving) return;
    setNoteSaving(true);
    try {
      await saveNote({
        data: { content, customer_id: c.id },
      });
      setNoteDraft("");
      toast.success("Đã thêm ghi chú");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được ghi chú");
    } finally {
      setNoteSaving(false);
    }
  }

  async function openPicker() {
    setPickerOpen(true);
    if (allProducts) return;
    setProductsLoading(true);
    try {
      const products = await fetchProducts({ data: { limit: 2000 } });
      setAllProducts(products);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không tải được danh mục SP",
      );
    } finally {
      setProductsLoading(false);
    }
  }

  async function handleAddProduct(productId: number) {
    if (addingProductId) return;
    setAddingProductId(productId);
    try {
      await addManualCustomerProductFn({
        data: { customer_id: c.id, product_id: productId },
      });
      toast.success("Đã thêm sản phẩm");
      setPickerOpen(false);
      setProductSearch("");
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thêm được sản phẩm",
      );
    } finally {
      setAddingProductId(null);
    }
  }

  async function handleToggleSample(row: QuotedProduct) {
    if (samplePending.has(row.id)) return;
    setSamplePending((prev) => new Set(prev).add(row.id));
    try {
      await setCustomerProductSampleSentFn({
        data: { id: row.id, sample_sent: !row.sample_sent },
      });
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không cập nhật được",
      );
    } finally {
      setSamplePending((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  async function handleDeleteProduct(row: QuotedProduct) {
    if (deletingProductId || confirmDeleteProductId !== row.id) return;
    setDeletingProductId(row.id);
    try {
      await deleteCustomerProductSampleFn({ data: { id: row.id } });
      toast.success("Đã xóa khỏi danh sách SP đã báo");
      setConfirmDeleteProductId(null);
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không xóa được sản phẩm",
      );
    } finally {
      setDeletingProductId(null);
    }
  }

  function toggleQuote(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConvert(q: Quote) {
    if (busyId) return;
    setBusyId(q.id);
    try {
      const order = await convertQuoteToOrder({ data: { quoteId: q.id } });
      toast.success(`Đã tạo đơn ${order.code}`);
      await refresh();
      setTab("orders");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tạo được đơn");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePrint(q: Quote, opts: QuotePrintOptions) {
    if (busyId) return;
    setBusyId(q.id);
    try {
      const file = await exportQuotePrintFn({ data: { quoteId: q.id, ...opts } });
      const bin = atob(file.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: file.mimeType || "text/html; charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success(`Đã mở báo giá: ${file.filename}`);
      setExportQuote(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không xuất được báo giá",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmDeleteQuote(q: Quote) {
    if (busyId || confirmDeleteId !== q.id) return;
    setBusyId(q.id);
    try {
      const res = await deleteQuoteFn({ data: { id: q.id } });
      toast.success(
        res.orders_deleted
          ? `Đã xóa ${q.code} và ${res.orders_deleted} đơn liên quan`
          : `Đã xóa ${q.code}`,
      );
      if (editQuoteId === q.id) setEditQuoteId(null);
      setConfirmDeleteId(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xóa được BG");
    } finally {
      setBusyId(null);
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = useMemo(
    () => [
      { key: "quotes", label: "Báo giá", count: initial.stats.quote_count },
      {
        key: "products",
        label: "SP đã báo",
        count: initial.quotedProducts.length,
      },
      { key: "orders", label: "Đơn hàng", count: initial.stats.order_count },
      {
        key: "mapping",
        label: "Đề xuất vật liệu",
        count: mappings?.length ?? initial.stats.mapping_count,
      },
    ],
    [initial, mappings],
  );

  return (
    <>
      <div className="mb-4">
        <Link
          to="/khach-hang"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Khách hàng
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-foreground">
            {c.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {[c.company, c.phone, c.email, c.source, c.region]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded ${status.className}`}
            >
              {status.label}
            </span>
            {c.owner_name ? (
              <span className="text-[11px] text-muted-foreground">
                Sales:{" "}
                <span className="text-foreground/80 font-medium">
                  {c.owner_name}
                </span>
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setQuoteOpen(true)}
            className="h-8 px-2.5 rounded-lg text-xs font-medium ring-1 ring-black/5 bg-card hover:bg-surface-strong inline-flex items-center gap-1"
          >
            <FilePlus2 className="size-3.5" /> Báo giá
          </button>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="h-8 px-2.5 rounded-lg text-xs font-medium bg-terracotta text-primary-foreground inline-flex items-center gap-1"
          >
            <Pencil className="size-3.5" /> Sửa
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <Stat label="Báo giá" value={String(initial.stats.quote_count)} />
        <Stat label="Đơn hàng" value={String(initial.stats.order_count)} />
        <Stat
          label="Công nợ"
          value={formatVND(Math.max(0, initial.stats.debt))}
          accent={initial.stats.debt > 0}
        />
        <Stat label="Ghi chú" value={String(initial.stats.note_count)} />
      </div>

      <div className="flex gap-1 p-1 mb-4 bg-surface-strong/70 rounded-lg ring-1 ring-black/5 w-fit max-w-full overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? "px-3 py-1.5 text-xs font-medium bg-card rounded shadow-sm text-foreground whitespace-nowrap"
                : "px-3 py-1.5 text-xs font-medium text-muted-foreground whitespace-nowrap"
            }
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      <div className="bg-card ring-1 ring-black/5 rounded-xl overflow-hidden">
        {tab === "quotes" ? (
          initial.quotes.length === 0 ? (
            <Empty text="Chưa có báo giá cho khách này." />
          ) : (
            <div className="divide-y divide-border">
              {initial.quotes.map((q) => {
                const open = expanded.has(q.id);
                const meta = quoteStatusMeta[q.status];
                return (
                  <div key={q.id} className="p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleQuote(q.id)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      >
                        {open ? (
                          <ChevronDown className="size-4 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-medium">
                            {q.code}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {q.created_at}
                            {" · "}
                            <span className="font-medium text-foreground tabular-nums">
                              {formatVND((q.amount ?? 0) + (q.shipping_fee ?? 0))}
                            </span>
                            {" · "}
                            {q.items?.length ?? 0} mã
                          </p>
                        </div>
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto sm:ml-auto">
                        <span
                          className={`inline-flex h-7 items-center text-[10px] font-medium px-2.5 rounded-md ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                        {confirmDeleteId === q.id ? (
                          <>
                            <SmallBtn
                              onClick={() => handleConfirmDeleteQuote(q)}
                              label={
                                busyId === q.id ? "Đang xóa…" : "Xóa vĩnh viễn"
                              }
                              disabled={busyId === q.id}
                              danger
                              solid
                            />
                            <SmallBtn
                              onClick={() => setConfirmDeleteId(null)}
                              label="Không xóa"
                              disabled={busyId === q.id}
                            />
                          </>
                        ) : (
                          <>
                            <SmallBtn
                              onClick={() => setEditQuoteId(q.id)}
                              label="Sửa"
                            />
                            <SmallBtn
                              onClick={() => setExportQuote(q)}
                              label={busyId === q.id ? "..." : "Xuất BG"}
                              disabled={busyId === q.id}
                            />
                            {q.status !== "accepted" &&
                            q.status !== "expired" ? (
                              <SmallBtn
                                onClick={() => handleConvert(q)}
                                label={busyId === q.id ? "…" : "→ Đơn"}
                                disabled={busyId === q.id}
                              />
                            ) : null}
                            <SmallBtn
                              onClick={() => setConfirmDeleteId(q.id)}
                              label="Xóa"
                              disabled={busyId === q.id}
                              danger
                            />
                          </>
                        )}
                      </div>
                    </div>
                    {confirmDeleteId === q.id ? (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                        Xóa <strong>{q.code}</strong> sẽ xóa luôn dòng SP và
                        đơn/thanh toán liên quan (nếu có). Không hoàn tác.
                      </div>
                    ) : null}
                    {open ? (
                      <div className="mt-3 ml-6 overflow-x-auto">
                        {(q.items?.length ?? 0) === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Không có dòng SP
                          </p>
                        ) : (
                          <table className="w-full text-xs min-w-[480px]">
                            <thead>
                              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                                <th className="py-1.5 pr-2 font-medium">Mã</th>
                                <th className="py-1.5 pr-2 font-medium">Tên</th>
                                <th className="py-1.5 pr-2 font-medium text-right">
                                  SL
                                </th>
                                <th className="py-1.5 pr-2 font-medium text-right">
                                  Đơn giá
                                </th>
                                <th className="py-1.5 font-medium text-right">
                                  TT
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {q.items.map((it) => (
                                <tr
                                  key={it.id}
                                  className="border-b border-border/50 last:border-0"
                                >
                                  <td className="py-1.5 pr-2 font-mono">
                                    {it.product_code}
                                  </td>
                                  <td className="py-1.5 pr-2 max-w-[12rem] truncate">
                                    {it.product_name}
                                  </td>
                                  <td className="py-1.5 pr-2 text-right tabular-nums">
                                    {it.quantity_m2}
                                  </td>
                                  <td className="py-1.5 pr-2 text-right tabular-nums">
                                    {formatVND(it.unit_price)}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums font-medium">
                                    {formatVND(it.line_total)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )
        ) : null}

        {tab === "products" ? (
          <div>
            <div className="p-3 sm:p-4 flex justify-end border-b border-border">
              <button
                type="button"
                onClick={openPicker}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90"
              >
                <Plus className="size-3.5" />
                Thêm sản phẩm
              </button>
            </div>
            {initial.quotedProducts.length === 0 ? (
              <Empty text="Chưa từng báo SP nào cho khách này." />
            ) : (
              <div className="divide-y divide-border">
                {initial.quotedProducts.map((p, i) => {
                  const pending = samplePending.has(p.id);
                  const deleting = deletingProductId === p.id;
                  const confirming = confirmDeleteProductId === p.id;
                  return (
                    <div
                      key={`${p.id}-${i}`}
                      className="p-3 sm:p-4 flex flex-wrap sm:flex-nowrap gap-3 items-center"
                    >
                      <div className="size-12 sm:size-14 rounded-lg overflow-hidden bg-[#f3f1ed] ring-1 ring-black/5 flex-shrink-0">
                        <ProductImage
                          src={p.image_path}
                          code={p.product_code}
                          className="size-full"
                          fit="contain"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">
                            {p.product_code}
                          </span>
                          {p.product_name}
                          {p.source === "manual" ? (
                            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                              (thêm tay)
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {p.retail_price > 0 && (
                            <span className="text-foreground/70 font-medium mr-1.5">
                              {formatVND(p.retail_price)}
                            </span>
                          )}
                          {p.quote_count > 0
                            ? `${p.quote_count} BG · ${Number(p.total_m2).toLocaleString(
                                "vi-VN",
                                { maximumFractionDigits: 2 },
                              )} m² · gần nhất ${p.last_quoted_at}`
                            : "Chưa có trong báo giá"}
                          {" · "}
                          Tồn {Number(p.total_stock ?? 0).toLocaleString("vi-VN")} m²
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto sm:ml-0">
                        <label
                          className={cn(
                            "flex items-center gap-1.5 text-xs font-medium flex-shrink-0 cursor-pointer select-none px-2.5 h-8 rounded-md ring-1 transition-colors",
                            p.sample_sent
                              ? "ring-emerald-200 bg-emerald-50 text-emerald-700"
                              : "ring-black/5 bg-surface-strong/40 text-muted-foreground",
                            pending && "opacity-60 pointer-events-none",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={p.sample_sent}
                            disabled={pending}
                            onChange={() => handleToggleSample(p)}
                            className="size-3.5"
                          />
                          Đã gửi mẫu
                        </label>
                        {confirming ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p)}
                              disabled={deleting}
                              className="h-8 px-2.5 rounded-md text-[11px] font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                            >
                              {deleting ? "Đang xóa…" : "Xác nhận xóa"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteProductId(null)}
                              disabled={deleting}
                              className="h-8 px-2.5 rounded-md text-[11px] font-medium ring-1 ring-black/5 hover:bg-surface-strong disabled:opacity-40"
                            >
                              Hủy
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteProductId(p.id)}
                            title="Xóa khỏi danh sách"
                            className="size-8 flex-shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {tab === "orders" ? (
          initial.orders.length === 0 ? (
            <Empty text="Chưa có đơn hàng." />
          ) : (
            <div className="divide-y divide-border">
              {initial.orders.map((o) => {
                const meta = orderStatusMeta[o.status];
                // id âm = đang confirm xóa đơn (tránh đụng confirm xóa BG)
                const orderConfirm = confirmDeleteId === -o.id;
                return (
                  <div key={o.id} className="p-3 sm:p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-medium">
                          {o.code}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {o.created_at}
                          {" · "}
                          <span className="font-semibold text-foreground tabular-nums">
                            {formatVND((o.amount || 0) + (o.shipping_fee || 0))}
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          value={o.status}
                          disabled={busyId === o.id}
                          onChange={async (e) => {
                            const status = e.target.value as OrderStatus;
                            if (status === o.status || busyId) return;
                            setBusyId(o.id);
                            try {
                              await setOrderStatusFn({
                                data: { id: o.id, status },
                              });
                              toast.success(
                                `Đã cập nhật ${o.code} → ${orderStatusMeta[status].label}`,
                              );
                              await refresh();
                            } catch (err) {
                              toast.error(
                                err instanceof Error
                                  ? err.message
                                  : "Không cập nhật được",
                              );
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className={`h-8 rounded-lg px-2 text-[11px] font-medium border-0 ring-1 ring-black/5 outline-none focus:ring-2 focus:ring-terracotta/30 disabled:opacity-50 cursor-pointer ${meta.className}`}
                          aria-label="Trạng thái đơn hàng"
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {orderStatusMeta[s].label}
                            </option>
                          ))}
                        </select>
                        {orderConfirm ? (
                          <>
                            <SmallBtn
                              onClick={async () => {
                                if (busyId) return;
                                setBusyId(o.id);
                                try {
                                  const res = await deleteOrderFn({
                                    data: { id: o.id },
                                  });
                                  toast.success(
                                    res.payments_deleted
                                      ? `Đã xóa ${o.code} (+${res.payments_deleted} TT)`
                                      : `Đã xóa ${o.code}`,
                                  );
                                  setConfirmDeleteId(null);
                                  await refresh();
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error
                                      ? err.message
                                      : "Không xóa được đơn",
                                  );
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              label={
                                busyId === o.id ? "Đang xóa…" : "Xóa vĩnh viễn"
                              }
                              disabled={busyId === o.id}
                              danger
                              solid
                            />
                            <SmallBtn
                              onClick={() => setConfirmDeleteId(null)}
                              label="Không xóa"
                              disabled={busyId === o.id}
                            />
                          </>
                        ) : (
                          <SmallBtn
                            onClick={() => setConfirmDeleteId(-o.id)}
                            label="Xóa"
                            disabled={busyId === o.id}
                            danger
                          />
                        )}
                      </div>
                    </div>
                    {orderConfirm ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                        Xóa <strong>{o.code}</strong> sẽ xóa luôn thanh toán
                        gắn đơn (nếu có). Không hoàn tác.
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )
        ) : null}

        {tab === "mapping" ? (
          mappings === null ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Đang tải đề xuất…
            </div>
          ) : mappings.length === 0 ? (
            <Empty text="Chưa có đề xuất vật liệu cho khách này." />
          ) : (
            <div className="divide-y divide-border">
              {mappings.map((m) => {
                const deleting = confirmDeleteMappingId === m.id;
                const areaCount = new Set(
                  m.items.map((item) => item.area_group_key || `item-${item.id}`),
                ).size;
                const mappingStatus = quoteStatusMeta[m.status];
                return (
                  <div key={m.id} className="p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs font-medium">{m.code}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {m.created_at} · {areaCount} khu vực · {m.items.length}{" "}
                          phương án
                          {m.linked_quotes.length
                            ? ` · ${m.linked_quotes.length} báo giá`
                            : ""}
                        </p>
                        {m.name ? (
                          <p className="text-xs font-medium text-foreground mt-0.5 truncate">
                            {m.name}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto sm:ml-auto">
                        <span
                          className={`inline-flex h-7 items-center text-[10px] font-medium px-2.5 rounded-md ${mappingStatus.className}`}
                        >
                          {mappingStatus.label}
                        </span>
                        {deleting ? (
                          <>
                            <SmallBtn
                              onClick={() => void handleDeleteMapping(m.id)}
                              label={
                                deletingMappingId === m.id
                                  ? "Đang xóa…"
                                  : "Xóa vĩnh viễn"
                              }
                              disabled={deletingMappingId === m.id}
                              danger
                              solid
                            />
                            <SmallBtn
                              onClick={() => setConfirmDeleteMappingId(null)}
                              label="Không xóa"
                              disabled={deletingMappingId === m.id}
                            />
                          </>
                        ) : (
                          <>
                            <SmallBtn onClick={() => openEditMapping(m)} label="Sửa" />
                            <SmallBtn
                              onClick={() => void handleExportMapping(m.id)}
                              label={
                                exportingMappingId === m.id ? "…" : "Xuất ĐX"
                              }
                              disabled={exportingMappingId === m.id}
                            />
                            <SmallBtn
                              onClick={() => void handleConvertMapping(m.id)}
                              label={
                                convertingMappingId === m.id ? "…" : "→ Báo giá"
                              }
                              disabled={convertingMappingId === m.id}
                            />
                            <SmallBtn
                              onClick={() => setConfirmDeleteMappingId(m.id)}
                              label="Xóa"
                              danger
                            />
                          </>
                        )}
                      </div>
                    </div>
                    {deleting ? (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                        Xóa <strong>{m.code}</strong> sẽ xóa các khu vực, phương
                        án và ảnh liên quan. Các báo giá đã tạo vẫn được giữ lại.
                        Không hoàn tác.
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )
        ) : null}

      </div>

      {/* Ghi chú — comment box + timeline */}
      <div className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Ghi chú
          <span className="ml-1.5 text-muted-foreground font-normal tabular-nums">
            ({initial.stats.note_count})
          </span>
        </h2>

        <form
          onSubmit={handlePostNote}
          className="bg-card ring-1 ring-black/5 rounded-xl p-3 sm:p-4"
        >
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={3}
            placeholder="Viết ghi chú / comment về khách này…"
            className="w-full text-sm px-3 py-2 rounded-lg bg-background ring-1 ring-black/10 outline-none focus:ring-terracotta/40 text-foreground placeholder:text-muted-foreground/70 resize-y min-h-[72px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handlePostNote();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2 mt-2">
            <p className="text-[10px] text-muted-foreground">
              Ctrl+Enter để gửi
            </p>
            <button
              type="submit"
              disabled={noteSaving || !noteDraft.trim()}
              className="h-8 px-3 rounded-lg text-xs font-medium text-primary-foreground bg-terracotta hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Send className="size-3.5" />
              {noteSaving ? "Đang gửi…" : "Gửi"}
            </button>
          </div>
        </form>

        <div className="bg-card ring-1 ring-black/5 rounded-xl overflow-hidden">
          {initial.notes.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Chưa có ghi chú — viết ở ô trên để bắt đầu.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {initial.notes.map((n) => (
                <div key={n.id} className="p-3 sm:p-4">
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {n.content}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {n.created_at} · {n.author}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <NewCustomerDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        customer={c}
        onCreated={refresh}
      />
      <NewQuoteDialog
        open={quoteOpen}
        onOpenChange={(o) => {
          setQuoteOpen(o);
          if (!o) void router.invalidate();
        }}
        defaultCustomerId={c.id}
      />
      <NewQuoteDialog
        open={editQuoteId != null}
        quoteId={editQuoteId}
        onOpenChange={(o) => {
          if (!o) {
            setEditQuoteId(null);
            void router.invalidate();
          }
        }}
      />
      <ExportQuoteDialog
        open={exportQuote != null}
        customerId={exportQuote?.customer_id}
        onOpenChange={(o) => {
          if (!o) setExportQuote(null);
        }}
        onExport={(opts) => {
          if (exportQuote) handlePrint(exportQuote, opts);
        }}
        isExporting={busyId === exportQuote?.id}
      />
      <CustomerMappingDialog
        open={mappingOpen}
        onOpenChange={setMappingOpen}
        defaultCustomerId={c.id}
        mapping={editMapping}
        onSaved={async () => {
          await loadMappings();
          if (editMapping == null) setTab("mapping");
        }}
      />

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm sản phẩm vào "SP đã báo"</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg ring-1 ring-black/10 bg-surface-strong/40 mb-2">
            <Search className="size-3.5 text-muted-foreground flex-shrink-0" />
            <input
              autoFocus
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Tìm theo mã hoặc tên sản phẩm…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-80 overflow-y-auto -mx-1 px-1">
            {productsLoading ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                Đang tải danh mục…
              </p>
            ) : filteredPickerProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                Không tìm thấy sản phẩm.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {filteredPickerProducts.map((p) => {
                  const already = existingProductIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={already || addingProductId === p.id}
                      onClick={() => handleAddProduct(p.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors",
                        already
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-surface-strong/60",
                      )}
                    >
                      <div className="size-10 rounded-md overflow-hidden bg-[#f3f1ed] ring-1 ring-black/5 flex-shrink-0">
                        <ProductImage
                          src={p.image_path}
                          code={p.code}
                          className="size-full"
                          fit="contain"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">
                            {p.code}
                          </span>
                          {p.name}
                        </p>
                      </div>
                      {already ? (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          Đã có
                        </span>
                      ) : addingProductId === p.id ? (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          Đang thêm…
                        </span>
                      ) : (
                        <Plus className="size-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl bg-card ring-1 ring-black/5 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={
          accent
            ? "text-base font-semibold text-terracotta tabular-nums mt-0.5 truncate"
            : "text-base font-semibold text-foreground tabular-nums mt-0.5 truncate"
        }
      >
        {value}
      </p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="p-10 text-center text-sm text-muted-foreground">{text}</p>
  );
}

function SmallBtn({
  label,
  onClick,
  disabled,
  danger,
  solid,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  solid?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        solid && danger
          ? "inline-flex h-7 items-center px-2.5 rounded-md text-[11px] font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
          : danger
            ? "inline-flex h-7 items-center px-2.5 rounded-md text-[11px] font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-40"
            : "inline-flex h-7 items-center px-2.5 rounded-md text-[11px] font-medium ring-1 ring-black/5 bg-surface-strong/50 hover:bg-surface-strong disabled:opacity-40"
      }
    >
      {label}
    </button>
  );
}
