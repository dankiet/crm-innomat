import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { PageFilterBar, PageSearchInput } from "@/components/PageFilterBar";
import {
  deletePaymentFn,
  fetchCustomerDebtDetail,
  fetchCustomerDebts,
  savePayment,
  updatePaymentFn,
} from "@/api/functions";
import type { CustomerDebt, CustomerDebtDetail, Payment } from "@/lib/types";
import { formatVND, formatVNDShort } from "@/lib/format";
import { AlertTriangle, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useHistoryLayer } from "@/hooks/useHistoryLayer";

export const Route = createFileRoute("/_app/cong-no")({
  head: () => ({
    meta: [{ title: "Công nợ — Innomat CRM" }],
  }),
  loader: async () => {
    const debts = await fetchCustomerDebts();
    return { debts };
  },
  component: DebtPage,
});

type Filter = "all" | "has-debt" | "cleared";

function DebtPage() {
  const { debts } = Route.useLoaderData() as { debts: CustomerDebt[] };
  const { user } = Route.useRouteContext() as { user: { role: string } };
  const isAdmin = user.role === "admin";
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<CustomerDebtDetail | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payOrderId, setPayOrderId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useHistoryLayer(detail != null, () => {
    setDetail(null);
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return debts.filter((d) => {
      if (filter === "has-debt" && !(d.debt > 0)) return false;
      if (filter === "cleared" && !(d.debt <= 0 && d.order_count > 0))
        return false;
      if (!q) return true;
      const hay = [d.customer_name, d.phone, d.region, d.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [debts, filter, search]);

  const totals = useMemo(() => {
    const debt = debts.reduce((s, d) => s + Math.max(0, d.debt), 0);
    const paid = debts.reduce((s, d) => s + d.total_paid, 0);
    const orders = debts.reduce((s, d) => s + d.total_order_amount, 0);
    return { debt, paid, orders };
  }, [debts]);

  async function openDetail(row: CustomerDebt) {
    setLoadingId(row.customer_id);
    try {
      const d = await fetchCustomerDebtDetail({
        data: { customerId: row.customer_id },
      });
      setDetail(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tải được chi tiết");
    } finally {
      setLoadingId(null);
    }
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    const amount = Number(payAmount.replace(/\D/g, ""));
    if (!amount || amount <= 0) {
      toast.error("Nhập số tiền thanh toán");
      return;
    }
    setSaving(true);
    try {
      await savePayment({
        data: {
          customer_id: detail.customer_id,
          amount,
          order_id: payOrderId === "" ? null : Number(payOrderId),
          note: payNote,
        },
      });
      toast.success("Đã ghi nhận thanh toán");
      setPayOpen(false);
      setPayAmount("");
      setPayNote("");
      setPayOrderId("");
      const d = await fetchCustomerDebtDetail({
        data: { customerId: detail.customer_id },
      });
      setDetail(d);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi ghi thanh toán");
    } finally {
      setSaving(false);
    }
  }

  async function refreshDetail(customerId: number) {
    const d = await fetchCustomerDebtDetail({ data: { customerId } });
    setDetail(d);
    await router.invalidate();
  }

  function openEdit(p: Payment) {
    setEditPayment(p);
    setEditAmount(String(p.amount));
    setEditNote(p.note ?? "");
    setConfirmDeleteId(null);
  }

  async function handleEditPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!editPayment || !detail) return;
    const amount = Number(editAmount.replace(/\D/g, ""));
    if (!amount || amount <= 0) {
      toast.error("Nhập số tiền thanh toán");
      return;
    }
    setEditSaving(true);
    try {
      await updatePaymentFn({
        data: { id: editPayment.id, amount, note: editNote },
      });
      toast.success("Đã cập nhật thanh toán");
      setEditPayment(null);
      await refreshDetail(detail.customer_id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi sửa thanh toán");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeletePayment(p: Payment) {
    if (!detail || confirmDeleteId !== p.id) return;
    setDeletingId(p.id);
    try {
      await deletePaymentFn({ data: { id: p.id } });
      toast.success("Đã xóa thanh toán");
      setConfirmDeleteId(null);
      await refreshDetail(detail.customer_id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi xóa thanh toán");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Tài chính"
        title="Quản lý công nợ"
        description="Công nợ cộng dồn theo khách hàng: tổng đơn hàng − tổng đã thanh toán."
      />

      <PageFilterBar
        search={
          <PageSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm tên khách, SĐT, khu vực…"
          />
        }
      >
        <div className="flex gap-1 p-1 bg-surface-strong/70 rounded-lg ring-1 ring-black/5">
          {(
            [
              { key: "all", label: "Tất cả" },
              { key: "has-debt", label: "Còn nợ" },
              { key: "cleared", label: "Đã tất toán" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={
                filter === f.key
                  ? "px-3 py-1 text-xs font-medium bg-card rounded shadow-sm text-foreground whitespace-nowrap"
                  : "px-3 py-1 text-xs font-medium text-muted-foreground whitespace-nowrap"
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </PageFilterBar>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-card ring-1 ring-black/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-destructive" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Còn phải thu
            </p>
          </div>
          <p className="text-2xl font-medium text-destructive">
            {formatVNDShort(totals.debt)}
          </p>
        </div>
        <div className="bg-card ring-1 ring-black/5 rounded-xl p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Đã thanh toán (cộng dồn)
          </p>
          <p className="text-2xl font-medium text-moss">
            {formatVNDShort(totals.paid)}
          </p>
        </div>
        <div className="bg-card ring-1 ring-black/5 rounded-xl p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Tổng giá trị đơn
          </p>
          <p className="text-2xl font-medium text-foreground">
            {formatVNDShort(totals.orders)}
          </p>
        </div>
      </div>

      <div className="bg-card ring-1 ring-black/5 rounded-xl overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            {search.trim() || filter !== "all"
              ? "Không có khách phù hợp bộ lọc."
              : "Chưa có công nợ. Tạo đơn hàng từ báo giá để ghi nhận."}
          </div>
        ) : (
          <div className="table-scroll">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-strong/40">
                <th className="px-5 py-3 font-medium">Khách hàng</th>
                <th className="px-5 py-3 font-medium">Nguồn KH</th>
                <th className="px-5 py-3 font-medium text-center">Số đơn</th>
                <th className="px-5 py-3 font-medium text-right">
                  Tổng đơn hàng
                </th>
                <th className="px-5 py-3 font-medium text-right">
                  Đã thanh toán
                </th>
                <th className="px-5 py-3 font-medium text-right">Còn nợ</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((r) => (
                <tr
                  key={r.customer_id}
                  className="hover:bg-surface-strong/30 transition-colors cursor-pointer"
                  onClick={() => openDetail(r)}
                >
                  <td className="px-5 py-3 text-foreground font-medium">
                    {r.customer_name}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground truncate max-w-[200px]">
                    {r.source || "—"}
                  </td>
                  <td className="px-5 py-3 text-center text-foreground">
                    {r.order_count}
                  </td>
                  <td className="px-5 py-3 text-right text-foreground">
                    {formatVND(r.total_order_amount)}
                  </td>
                  <td className="px-5 py-3 text-right text-moss">
                    {formatVND(r.total_paid)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right font-medium ${
                      r.debt > 0 ? "text-destructive" : "text-moss"
                    }`}
                  >
                    {formatVND(r.debt)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                      {loadingId === r.customer_id ? "..." : "Chi tiết"}
                      <ChevronRight className="size-3.5" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Customer debt detail panel */}
      {detail && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div
            className="absolute inset-0"
            onClick={() => setDetail(null)}
            aria-hidden
          />
          <div className="relative w-full max-w-lg bg-card h-full max-h-[100dvh] shadow-xl overflow-y-auto ring-1 ring-black/10 safe-pb">
            <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {detail.customer_name}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {detail.source
                    ? `Nguồn: ${detail.source}`
                    : "Chưa có nguồn"}{" "}
                  ·{" "}
                  {detail.phone || "Chưa có SĐT"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="size-8 grid place-items-center rounded-full hover:bg-surface-strong"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              <div className="grid grid-cols-3 gap-3">
                <Stat
                  label="Số đơn"
                  value={String(detail.order_count)}
                />
                <Stat
                  label="Đã thanh toán"
                  value={formatVNDShort(detail.total_paid)}
                  accent="text-moss"
                />
                <Stat
                  label="Còn nợ"
                  value={formatVNDShort(detail.debt)}
                  accent={detail.debt > 0 ? "text-destructive" : "text-moss"}
                />
              </div>

              <button
                type="button"
                onClick={() => setPayOpen(true)}
                className="w-full text-xs font-medium text-primary-foreground py-2 bg-terracotta rounded shadow-sm hover:opacity-90"
              >
                + Ghi nhận thanh toán
              </button>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Đơn hàng ({detail.orders.length})
                </h3>
                <div className="space-y-2">
                  {detail.orders.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Chưa có đơn</p>
                  ) : (
                    detail.orders.map((o) => (
                      <div
                        key={o.id}
                        className="rounded-lg ring-1 ring-black/5 p-3"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="font-mono text-[11px]">{o.code}</span>
                          <span className="text-xs font-medium">
                            {formatVND((o.amount || 0) + (o.shipping_fee || 0))}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                          <span>{o.created_at}</span>
                          <span className="text-moss">
                            Đã thu: {formatVND(o.paid_amount)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Lịch sử thanh toán ({detail.payments.length})
                </h3>
                <div className="space-y-2">
                  {detail.payments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Chưa có thanh toán
                    </p>
                  ) : (
                    detail.payments.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-lg ring-1 ring-black/5 p-3 flex justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-moss">
                            +{formatVND(p.amount)}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {p.paid_at}
                            {p.note ? ` · ${p.note}` : ""}
                          </p>
                        </div>
                        {isAdmin && (
                          <div className="flex items-start gap-1 flex-shrink-0">
                            {confirmDeleteId === p.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePayment(p)}
                                  disabled={deletingId === p.id}
                                  className="text-[10px] font-medium px-2 py-1 rounded bg-destructive text-white disabled:opacity-50"
                                >
                                  {deletingId === p.id ? "..." : "Xác nhận xóa"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-[10px] font-medium px-2 py-1 rounded ring-1 ring-black/10"
                                >
                                  Hủy
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  title="Sửa"
                                  aria-label="Sửa thanh toán"
                                  onClick={() => openEdit(p)}
                                  className="size-7 grid place-items-center rounded-md text-muted-foreground hover:bg-surface-strong hover:text-foreground"
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Xóa"
                                  aria-label="Xóa thanh toán"
                                  onClick={() => setConfirmDeleteId(p.id)}
                                  className="size-7 grid place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ghi nhận thanh toán</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePayment} className="space-y-3">
            <label className="block">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Số tiền *
              </span>
              <input
                className={inputCls}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="VD: 50000000"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Gắn với đơn (tuỳ chọn)
              </span>
              <select
                className={inputCls}
                value={payOrderId}
                onChange={(e) =>
                  setPayOrderId(
                    e.target.value ? Number(e.target.value) : "",
                  )
                }
              >
                <option value="">— Thanh toán chung KH —</option>
                {detail?.orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · {formatVND((o.amount || 0) + (o.shipping_fee || 0))}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Ghi chú
              </span>
              <input
                className={inputCls}
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="CK, tiền mặt, đợt 1..."
              />
            </label>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setPayOpen(false)}
                className="text-xs font-medium px-3 py-1.5 rounded ring-1 ring-black/5"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={saving}
                className="text-xs font-medium text-primary-foreground px-3 py-1.5 bg-terracotta rounded disabled:opacity-50"
              >
                {saving ? "Đang lưu..." : "Lưu thanh toán"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editPayment != null}
        onOpenChange={(o) => {
          if (!o) setEditPayment(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sửa thanh toán</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditPayment} className="space-y-3">
            <label className="block">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Số tiền *
              </span>
              <input
                className={inputCls}
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder="VD: 50000000"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Ghi chú
              </span>
              <input
                className={inputCls}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="CK, tiền mặt, đợt 1..."
              />
            </label>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setEditPayment(null)}
                className="text-xs font-medium px-3 py-1.5 rounded ring-1 ring-black/5"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="text-xs font-medium text-primary-foreground px-3 py-1.5 bg-terracotta rounded disabled:opacity-50"
              >
                {editSaving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  accent = "text-foreground",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg ring-1 ring-black/5 p-3 bg-surface-strong/30">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-sm font-medium mt-1 ${accent}`}>{value}</p>
    </div>
  );
}

const inputCls =
  "mt-1 w-full text-sm px-3 py-2 rounded-md bg-background ring-1 ring-black/10 outline-none focus:ring-terracotta/40";
