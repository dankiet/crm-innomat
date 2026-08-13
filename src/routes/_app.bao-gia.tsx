import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { PageFilterBar, PageSearchInput } from "@/components/PageFilterBar";
import { NewQuoteDialog } from "@/components/NewQuoteDialog";
import {
  ExportQuoteDialog,
  type QuotePrintOptions,
} from "@/components/ExportQuoteDialog";
import { FilterChip } from "@/components/product-filter/FilterChip";
import { MultiSelectFilter } from "@/components/product-filter/MultiSelectFilter";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import {
  convertQuoteToOrder,
  deleteOrderFn,
  deleteQuoteFn,
  exportQuotePrintFn,
  fetchOrders,
  fetchQuotes,
  setOrderStatusFn,
} from "@/api/functions";
import {
  orderStatusMeta,
  quoteStatusMeta,
  type Order,
  type OrderStatus,
  type Quote,
  type QuoteStatus,
} from "@/lib/types";
import { formatVND } from "@/lib/format";
import { toast } from "sonner";

const QUOTE_STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "expired"];

const ORDER_STATUSES: OrderStatus[] = [
  "preparing",
  "shipping",
  "delivered",
];

export const Route = createFileRoute("/_app/bao-gia")({
  head: () => ({
    meta: [{ title: "Báo giá & Đơn hàng — Innomat CRM" }],
  }),
  loader: async () => {
    const [quotes, orders] = await Promise.all([
      fetchQuotes(),
      fetchOrders(),
    ]);
    return { quotes, orders };
  },
  component: QuotesPage,
});

function QuotesPage() {
  const { quotes, orders } = Route.useLoaderData() as {
    quotes: Quote[];
    orders: Order[];
  };
  const router = useRouter();
  const [tab, setTab] = useState<"quotes" | "orders">("quotes");
  const [editQuoteId, setEditQuoteId] = useState<number | null>(null);
  const [exportQuote, setExportQuote] = useState<Quote | null>(null);
  const [converting, setConverting] = useState<number | null>(null);
  const [printing, setPrinting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  /** Bước 1: chọn BG cần xóa — hiện banner; bước 2: bấm «Xóa vĩnh viễn» */
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [orderStatusBusy, setOrderStatusBusy] = useState<number | null>(null);
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState<
    number | null
  >(null);
  const [deletingOrder, setDeletingOrder] = useState<number | null>(null);
  const [quoteStatusFilter, setQuoteStatusFilter] = useLocalStorageState<
    QuoteStatus[]
  >("bao-gia.quoteStatusFilter", []);
  const [orderStatusFilter, setOrderStatusFilter] = useLocalStorageState<
    OrderStatus[]
  >("bao-gia.orderStatusFilter", []);
  const [search, setSearch] = useState("");

  const filteredQuotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter((item) => {
      if (
        quoteStatusFilter.length > 0 &&
        !quoteStatusFilter.includes(item.status)
      ) {
        return false;
      }
      if (!q) return true;
      const hay = [
        item.code,
        item.customer_name,
        item.customer_source,
        item.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [quotes, quoteStatusFilter, search]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((item) => {
      if (
        orderStatusFilter.length > 0 &&
        !orderStatusFilter.includes(item.status)
      ) {
        return false;
      }
      if (!q) return true;
      const hay = [
        item.code,
        item.customer_name,
        item.customer_source,
        item.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [orders, orderStatusFilter, search]);

  async function handleOrderStatus(o: Order, status: OrderStatus) {
    if (orderStatusBusy || o.status === status) return;
    setOrderStatusBusy(o.id);
    try {
      await setOrderStatusFn({ data: { id: o.id, status } });
      toast.success(
        `Đã cập nhật ${o.code} → ${orderStatusMeta[status].label}`,
      );
      await router.invalidate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không cập nhật được trạng thái",
      );
    } finally {
      setOrderStatusBusy(null);
    }
  }

  async function handleConfirmDeleteOrder(o: Order) {
    if (deletingOrder || confirmDeleteOrderId !== o.id) return;
    setDeletingOrder(o.id);
    try {
      const res = await deleteOrderFn({ data: { id: o.id } });
      toast.success(
        res.payments_deleted
          ? `Đã xóa ${o.code} (+${res.payments_deleted} TT)`
          : `Đã xóa ${o.code}`,
      );
      setConfirmDeleteOrderId(null);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xóa được đơn");
    } finally {
      setDeletingOrder(null);
    }
  }

  async function handleConvert(q: Quote) {
    if (converting) return;
    setConverting(q.id);
    try {
      const order = await convertQuoteToOrder({ data: { quoteId: q.id } });
      toast.success(`Đã tạo đơn ${order.code} từ ${q.code}`);
      await router.invalidate();
      setTab("orders");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tạo được đơn");
    } finally {
      setConverting(null);
    }
  }

  function requestDelete(q: Quote) {
    setConfirmDeleteId(q.id);
  }

  function cancelDelete() {
    setConfirmDeleteId(null);
  }

  async function confirmDelete(q: Quote) {
    if (deleting || confirmDeleteId !== q.id) return;
    setDeleting(q.id);
    try {
      const res = await deleteQuoteFn({ data: { id: q.id } });
      toast.success(
        res.orders_deleted
          ? `Đã xóa ${q.code} và ${res.orders_deleted} đơn liên quan`
          : `Đã xóa ${q.code}`,
      );
      if (editQuoteId === q.id) setEditQuoteId(null);
      setConfirmDeleteId(null);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xóa được BG");
    } finally {
      setDeleting(null);
    }
  }

  async function handlePrint(q: Quote, opts: QuotePrintOptions) {
    if (printing) return;
    setPrinting(q.id);
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
      setPrinting(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Báo giá & Đơn hàng"
        description="Báo giá theo giá bán lẻ + chiết khấu (CK TP / CK B2B). Đơn hàng ghi nhận công nợ."
        actions={
          <div className="flex gap-1 p-1 bg-surface-strong/70 rounded-lg ring-1 ring-black/5">
            <button
              type="button"
              onClick={() => setTab("quotes")}
              className={
                tab === "quotes"
                  ? "px-3 py-1 text-xs font-medium bg-card rounded shadow-sm text-foreground"
                  : "px-3 py-1 text-xs font-medium text-muted-foreground"
              }
            >
              Báo giá ({quotes.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("orders")}
              className={
                tab === "orders"
                  ? "px-3 py-1 text-xs font-medium bg-card rounded shadow-sm text-foreground"
                  : "px-3 py-1 text-xs font-medium text-muted-foreground"
              }
            >
              Đơn hàng ({orders.length})
            </button>
          </div>
        }
      />

      <PageFilterBar
        search={
          <PageSearchInput
            value={search}
            onChange={setSearch}
            placeholder={
              tab === "quotes"
                ? "Tìm mã BG, tên khách…"
                : "Tìm mã đơn, tên khách…"
            }
          />
        }
      >
        {tab === "quotes" ? (
          <FilterChip label="Trạng thái" count={quoteStatusFilter.length}>
            <MultiSelectFilter
              title="Trạng thái báo giá"
              options={QUOTE_STATUSES.map((s) => ({
                value: s,
                label: quoteStatusMeta[s].label,
                count: quotes.filter((q) => q.status === s).length,
              }))}
              selected={quoteStatusFilter}
              onChange={(keys) =>
                setQuoteStatusFilter(
                  keys.filter((k): k is QuoteStatus =>
                    (QUOTE_STATUSES as string[]).includes(k),
                  ),
                )
              }
            />
          </FilterChip>
        ) : (
          <FilterChip label="Trạng thái" count={orderStatusFilter.length}>
            <MultiSelectFilter
              title="Trạng thái đơn hàng"
              options={ORDER_STATUSES.map((s) => ({
                value: s,
                label: orderStatusMeta[s].label,
                count: orders.filter((o) => o.status === s).length,
              }))}
              selected={orderStatusFilter}
              onChange={(keys) =>
                setOrderStatusFilter(
                  keys.filter((k): k is OrderStatus =>
                    (ORDER_STATUSES as string[]).includes(k),
                  ),
                )
              }
            />
          </FilterChip>
        )}
      </PageFilterBar>

      <div className="bg-card ring-1 ring-black/5 rounded-xl overflow-hidden">
        {tab === "quotes" ? (
          filteredQuotes.length === 0 ? (
            <Empty
              text={
                search.trim() || quoteStatusFilter.length
                  ? "Không có báo giá phù hợp bộ lọc."
                  : "Chưa có báo giá. Dùng nút «Tạo báo giá» trên thanh trên cùng."
              }
            />
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-border">
                {filteredQuotes.map((q) => (
                  <QuoteCard
                    key={q.id}
                    q={q}
                    converting={converting === q.id}
                    printing={printing === q.id}
                    deleting={deleting === q.id}
                    confirmDelete={confirmDeleteId === q.id}
                    onConvert={() => handleConvert(q)}
                    onEdit={() => setEditQuoteId(q.id)}
                    onPrint={() => setExportQuote(q)}
                    onRequestDelete={() => requestDelete(q)}
                    onConfirmDelete={() => confirmDelete(q)}
                    onCancelDelete={cancelDelete}
                  />
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block table-scroll">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-strong/40">
                      <th className="px-5 py-3 font-medium">Tên báo giá</th>
                      <th className="px-5 py-3 font-medium">Khách hàng</th>
                      <th className="px-5 py-3 font-medium">Nguồn KH</th>
                      <th className="px-5 py-3 font-medium">Ngày</th>
                      <th className="px-5 py-3 font-medium text-right">
                        Giá trị
                      </th>
                      <th className="px-5 py-3 font-medium">SL mã</th>
                      <th className="px-5 py-3 font-medium">Trạng thái</th>
                      <th className="px-5 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredQuotes.map((q) => (
                      <QuoteRow
                        key={q.id}
                        q={q}
                        converting={converting === q.id}
                        printing={printing === q.id}
                        deleting={deleting === q.id}
                        confirmDelete={confirmDeleteId === q.id}
                        onConvert={() => handleConvert(q)}
                        onEdit={() => setEditQuoteId(q.id)}
                        onPrint={() => setExportQuote(q)}
                        onRequestDelete={() => requestDelete(q)}
                        onConfirmDelete={() => confirmDelete(q)}
                        onCancelDelete={cancelDelete}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        ) : filteredOrders.length === 0 ? (
          <Empty
            text={
              search.trim() || orderStatusFilter.length
                ? "Không có đơn hàng phù hợp bộ lọc."
                : "Chưa có đơn hàng. Chuyển báo giá thành đơn để ghi nhận công nợ."
            }
          />
        ) : (
          <>
            <div className="md:hidden divide-y divide-border">
              {filteredOrders.map((o) => (
                <OrderCard
                  key={o.id}
                  o={o}
                  busy={orderStatusBusy === o.id}
                  deleting={deletingOrder === o.id}
                  confirmDelete={confirmDeleteOrderId === o.id}
                  onStatusChange={(status) => handleOrderStatus(o, status)}
                  onRequestDelete={() => setConfirmDeleteOrderId(o.id)}
                  onConfirmDelete={() => handleConfirmDeleteOrder(o)}
                  onCancelDelete={() => setConfirmDeleteOrderId(null)}
                />
              ))}
            </div>
            <div className="hidden md:block table-scroll">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-strong/40">
                    <th className="px-5 py-3 font-medium">Tên đơn hàng</th>
                    <th className="px-5 py-3 font-medium">Khách hàng</th>
                    <th className="px-5 py-3 font-medium">Nguồn KH</th>
                    <th className="px-5 py-3 font-medium">Ngày</th>
                    <th className="px-5 py-3 font-medium text-right">
                      Giá trị
                    </th>
                    <th className="px-5 py-3 font-medium text-right">Đã thu</th>
                    <th className="px-5 py-3 font-medium">Trạng thái</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredOrders.map((o) => (
                    <OrderRow
                      key={o.id}
                      o={o}
                      busy={orderStatusBusy === o.id}
                      deleting={deletingOrder === o.id}
                      confirmDelete={confirmDeleteOrderId === o.id}
                      onStatusChange={(status) => handleOrderStatus(o, status)}
                      onRequestDelete={() => setConfirmDeleteOrderId(o.id)}
                      onConfirmDelete={() => handleConfirmDeleteOrder(o)}
                      onCancelDelete={() => setConfirmDeleteOrderId(null)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

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
        isExporting={printing === exportQuote?.id}
      />
    </>
  );
}

function QuoteCard({
  q,
  converting,
  printing,
  deleting,
  confirmDelete,
  onConvert,
  onEdit,
  onPrint,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  q: Quote;
  converting: boolean;
  printing: boolean;
  deleting: boolean;
  confirmDelete: boolean;
  onConvert: () => void;
  onEdit: () => void;
  onPrint: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const meta = quoteStatusMeta[q.status];
  return (
    <div className="p-4 space-y-2.5">
      <div className="min-w-0">
        <button
          type="button"
          onClick={onEdit}
          className="font-mono text-xs font-medium text-foreground hover:underline text-left"
        >
          {q.code}
        </button>
        <p className="text-sm font-medium text-foreground mt-0.5 truncate">
          {q.customer_name}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {q.created_at}
          {q.customer_source ? ` · ${q.customer_source}` : ""}
          {" · "}
          <span className="font-semibold tabular-nums text-foreground">
            {formatVND((q.amount ?? 0) + (q.shipping_fee ?? 0))}
          </span>
          <span className="text-muted-foreground">
            {" "}
            · {q.items_count ?? 0} mã
          </span>
        </p>
      </div>
      {confirmDelete ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 space-y-2">
          <p className="text-xs text-red-900 font-medium">
            Xóa vĩnh viễn {q.code}? SP + đơn/thanh toán liên quan (nếu có) cũng
            bị xóa. Không hoàn tác.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={onConfirmDelete}
              className="h-8 px-3 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Đang xóa…" : "Xóa vĩnh viễn"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={onCancelDelete}
              className="h-8 px-3 rounded-lg text-xs font-medium ring-1 ring-black/5 bg-card"
            >
              Không xóa
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span
            className={`inline-flex h-8 items-center text-[10px] font-medium px-2.5 rounded-lg flex-shrink-0 ${meta.className}`}
          >
            {meta.label}
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="h-8 px-3 rounded-lg text-xs font-medium bg-surface-strong ring-1 ring-black/5"
          >
            Sửa
          </button>
          <button
            type="button"
            disabled={printing}
            onClick={onPrint}
            className="h-8 px-3 rounded-lg text-xs font-medium text-moss bg-moss-soft disabled:opacity-50"
          >
            {printing ? "..." : "Xuất BG"}
          </button>
          {q.status !== "accepted" && q.status !== "expired" ? (
            <button
              type="button"
              disabled={converting}
              onClick={onConvert}
              className="h-8 px-3 rounded-lg text-xs font-medium text-primary-foreground bg-terracotta disabled:opacity-50"
            >
              {converting ? "..." : "→ Đơn hàng"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={deleting}
            onClick={onRequestDelete}
            className="h-8 px-3 rounded-lg text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
          >
            Xóa
          </button>
        </div>
      )}
    </div>
  );
}

function QuoteRow({
  q,
  converting,
  printing,
  deleting,
  confirmDelete,
  onConvert,
  onEdit,
  onPrint,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  q: Quote;
  converting: boolean;
  printing: boolean;
  deleting: boolean;
  confirmDelete: boolean;
  onConvert: () => void;
  onEdit: () => void;
  onPrint: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const meta = quoteStatusMeta[q.status];
  return (
    <>
      <tr className="hover:bg-surface-strong/30 transition-colors">
        <td className="px-5 py-3 align-middle font-mono text-[11px] text-foreground">
          <button
            type="button"
            onClick={onEdit}
            className="hover:underline text-left"
          >
            {q.code}
          </button>
        </td>
        <td className="px-5 py-3 align-middle text-foreground">
          {q.customer_name}
        </td>
        <td className="px-5 py-3 align-middle text-muted-foreground truncate max-w-[220px]">
          {q.customer_source || "—"}
        </td>
        <td className="px-5 py-3 align-middle text-muted-foreground">
          {q.created_at}
        </td>
        <td className="px-5 py-3 align-middle text-right font-medium text-foreground">
          {formatVND((q.amount ?? 0) + (q.shipping_fee ?? 0))}
        </td>
        <td className="px-5 py-3 align-middle text-muted-foreground">
          {q.items_count ?? 0}
        </td>
        <td className="px-5 py-3 align-middle">
          <div className="flex items-center h-8">
            <span
              className={`inline-flex h-7 items-center text-[10px] font-medium px-2.5 rounded-md ${meta.className}`}
            >
              {meta.label}
            </span>
          </div>
        </td>
        <td className="px-5 py-3 align-middle text-right whitespace-nowrap">
          <div className="inline-flex items-center justify-end gap-2 h-8">
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onConfirmDelete}
                  className="inline-flex h-7 items-center text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 px-2.5 rounded-md disabled:opacity-50"
                >
                  {deleting ? "…" : "Xóa vĩnh viễn"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onCancelDelete}
                  className="inline-flex h-7 items-center text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Không xóa
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex h-7 items-center text-[11px] font-medium text-foreground hover:underline"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  disabled={printing}
                  onClick={onPrint}
                  className="inline-flex h-7 items-center text-[11px] font-medium text-moss hover:underline disabled:opacity-50"
                >
                  {printing ? "..." : "Xuất BG"}
                </button>
                {q.status !== "accepted" && q.status !== "expired" ? (
                  <button
                    type="button"
                    disabled={converting}
                    onClick={onConvert}
                    className="inline-flex h-7 items-center text-[11px] font-medium text-terracotta hover:underline disabled:opacity-50"
                  >
                    {converting ? "..." : "→ Đơn hàng"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onRequestDelete}
                  className="inline-flex h-7 items-center text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50"
                >
                  Xóa
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {confirmDelete ? (
        <tr>
          <td colSpan={8} className="px-5 pb-3 pt-0">
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              Xóa <strong>{q.code}</strong> sẽ xóa luôn dòng SP và đơn/thanh
              toán liên quan (nếu có). Không hoàn tác.
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function OrderStatusSelect({
  value,
  busy,
  onChange,
}: {
  value: OrderStatus;
  busy?: boolean;
  onChange: (s: OrderStatus) => void;
}) {
  const meta = orderStatusMeta[value];
  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => onChange(e.target.value as OrderStatus)}
      className={`h-8 max-w-full rounded-lg px-2 text-[11px] font-medium border-0 ring-1 ring-black/5 outline-none focus:ring-2 focus:ring-terracotta/30 disabled:opacity-50 cursor-pointer ${meta.className}`}
      aria-label="Trạng thái đơn hàng"
    >
      {ORDER_STATUSES.map((s) => (
        <option key={s} value={s}>
          {orderStatusMeta[s].label}
        </option>
      ))}
    </select>
  );
}

function OrderCard({
  o,
  busy,
  deleting,
  confirmDelete,
  onStatusChange,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  o: Order;
  busy?: boolean;
  deleting?: boolean;
  confirmDelete?: boolean;
  onStatusChange: (s: OrderStatus) => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium">{o.code}</p>
          <p className="text-sm font-medium mt-0.5 truncate">{o.customer_name}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {o.created_at}
            {o.customer_source ? ` · ${o.customer_source}` : ""}
          </p>
        </div>
        <OrderStatusSelect
          value={o.status}
          busy={busy || deleting}
          onChange={onStatusChange}
        />
      </div>
      <div className="flex justify-between text-sm pt-1">
        <span className="text-muted-foreground">Giá trị</span>
        <span className="font-semibold tabular-nums">{formatVND((o.amount || 0) + (o.shipping_fee || 0))}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Đã thu</span>
        <span className="font-medium tabular-nums text-moss">
          {formatVND(o.paid_amount ?? 0)}
        </span>
      </div>
      {confirmDelete ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 space-y-2">
          <p className="text-xs text-red-900 font-medium">
            Xóa vĩnh viễn {o.code}? Thanh toán gắn đơn (nếu có) cũng bị xóa.
            Không hoàn tác.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={onConfirmDelete}
              className="h-8 px-3 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Đang xóa…" : "Xóa vĩnh viễn"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={onCancelDelete}
              className="h-8 px-3 rounded-lg text-xs font-medium ring-1 ring-black/5 bg-card"
            >
              Không xóa
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={deleting}
          onClick={onRequestDelete}
          className="h-8 px-3 rounded-lg text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
        >
          Xóa đơn
        </button>
      )}
    </div>
  );
}

function OrderRow({
  o,
  busy,
  deleting,
  confirmDelete,
  onStatusChange,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  o: Order;
  busy?: boolean;
  deleting?: boolean;
  confirmDelete?: boolean;
  onStatusChange: (s: OrderStatus) => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-surface-strong/30 transition-colors">
        <td className="px-5 py-3 align-middle font-mono text-[11px] text-foreground">
          {o.code}
        </td>
        <td className="px-5 py-3 align-middle text-foreground">
          {o.customer_name}
        </td>
        <td className="px-5 py-3 align-middle text-muted-foreground truncate max-w-[220px]">
          {o.customer_source || "—"}
        </td>
        <td className="px-5 py-3 align-middle text-muted-foreground">
          {o.created_at}
        </td>
        <td className="px-5 py-3 align-middle text-right font-medium text-foreground">
          {formatVND((o.amount || 0) + (o.shipping_fee || 0))}
        </td>
        <td className="px-5 py-3 align-middle text-right text-moss">
          {formatVND(o.paid_amount ?? 0)}
        </td>
        <td className="px-5 py-3 align-middle">
          <OrderStatusSelect
            value={o.status}
            busy={busy || deleting}
            onChange={onStatusChange}
          />
        </td>
        <td className="px-5 py-3 align-middle text-right whitespace-nowrap">
          <div className="inline-flex items-center justify-end gap-2 h-8">
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onConfirmDelete}
                  className="inline-flex h-7 items-center text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 px-2.5 rounded-md disabled:opacity-50"
                >
                  {deleting ? "…" : "Xóa vĩnh viễn"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onCancelDelete}
                  className="inline-flex h-7 items-center text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Không xóa
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={deleting}
                onClick={onRequestDelete}
                className="inline-flex h-7 items-center text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                Xóa
              </button>
            )}
          </div>
        </td>
      </tr>
      {confirmDelete ? (
        <tr>
          <td colSpan={8} className="px-5 pb-3 pt-0">
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              Xóa <strong>{o.code}</strong> sẽ xóa luôn thanh toán gắn đơn (nếu
              có). Không hoàn tác.
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Empty({
  text,
  action,
  actionLabel,
}: {
  text: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="p-12 text-center">
      <p className="text-sm text-muted-foreground mb-4">{text}</p>
      {action && actionLabel ? (
        <button
          type="button"
          onClick={action}
          className="text-xs font-medium text-primary-foreground px-3 py-1.5 bg-terracotta rounded shadow-sm"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
