import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  FilePlus2,
  LayoutGrid,
  List,
  Pencil,
  Phone,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PageFilterBar, PageSearchInput } from "@/components/PageFilterBar";
import { CustomerCard } from "@/components/CustomerCard";
import { NewCustomerDialog } from "@/components/NewCustomerDialog";
import { NewQuoteDialog } from "@/components/NewQuoteDialog";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import {
  fetchCustomerDebts,
  fetchCustomers,
  fetchNotes,
} from "@/api/functions";
import { statusMeta, type Customer, type CustomerStatus } from "@/lib/types";
import { formatVND, formatVNDShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/khach-hang/")({
  head: () => ({
    meta: [{ title: "Khách hàng — Innomat CRM" }],
  }),
  loader: async () => {
    const [customers, debts, notes] = await Promise.all([
      fetchCustomers({ data: { status: "all" } }),
      fetchCustomerDebts(),
      fetchNotes({ data: { limit: 8 } }),
    ]);
    return { customers, debts, notes };
  },
  component: CustomersPage,
});

type ViewMode = "grid" | "list";

const filters: { key: "all" | CustomerStatus; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "consulting", label: "Đang tư vấn" },
  { key: "sample_sent", label: "Đã gửi mẫu" },
  { key: "quoted", label: "Gửi báo giá" },
  { key: "closed", label: "Đã chốt" },
  { key: "lost", label: "Bỏ lỡ" },
];

function CustomersPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const { customers, debts, notes } = Route.useLoaderData() as {
    customers: Customer[];
    debts: Array<{ customer_id: number; debt: number }>;
    notes: import("@/lib/types").Note[];
  };
  const [filter, setFilter] = useLocalStorageState<"all" | CustomerStatus>(
    "khach-hang.statusFilter",
    "all",
  );
  const [viewMode, setViewMode] = useLocalStorageState<ViewMode>(
    "khach-hang.viewMode",
    "grid",
  );
  const [search, setSearch] = useState("");
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [quoteCustomerId, setQuoteCustomerId] = useState<number | null>(null);

  const debtMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of debts) m.set(d.customer_id, d.debt);
    return m;
  }, [debts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!q) return true;
      const hay = [
        c.name,
        c.phone,
        c.region,
        c.company,
        c.short_name,
        c.email,
        c.owner_name,
        c.source,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [customers, filter, search]);

  const quotedCount = customers.filter(
    (c) => c.status === "quoted" || c.status === "consulting",
  ).length;

  async function refresh() {
    await router.invalidate();
  }

  return (
    <>
      <PageHeader
        title="Danh mục khách hàng hiện tại"
        description={`Theo dõi tiến độ dự án của ${customers.length} khách hàng. Nhấp để xem hồ sơ (BG, SP đã báo).`}
        actions={
          <div
            className="inline-flex p-0.5 rounded-lg ring-1 ring-black/5 bg-surface-strong/50"
            role="group"
            aria-label="Kiểu hiển thị"
          >
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5",
                viewMode === "grid"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={viewMode === "grid"}
              title="Lưới thẻ"
            >
              <LayoutGrid className="size-3.5" />
              <span className="hidden sm:inline">Lưới</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5",
                viewMode === "list"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={viewMode === "list"}
              title="Danh sách"
            >
              <List className="size-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        }
      />

      <PageFilterBar
        search={
          <PageSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm tên, SĐT, khu vực, sales…"
          />
        }
      >
        <div className="flex gap-1 p-1 bg-surface-strong/70 rounded-lg ring-1 ring-black/5 overflow-x-auto max-w-full">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={
                filter === f.key
                  ? "px-3 py-1 text-xs font-medium bg-card rounded shadow-sm text-foreground whitespace-nowrap"
                  : "px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </PageFilterBar>

      {visible.length === 0 ? (
        <div className="bg-card ring-1 ring-black/5 rounded-xl p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {search.trim()
              ? "Không tìm thấy khách hàng phù hợp."
              : `Chưa có khách hàng${filter !== "all" ? " ở trạng thái này" : ""}. Dùng nút "+ Khách hàng mới" trên thanh trên cùng.`}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((c) => (
            <CustomerCard
              key={c.id}
              customer={c}
              debt={debtMap.get(c.id) ?? 0}
              onClick={() =>
                navigate({
                  to: "/khach-hang/$customerId",
                  params: { customerId: String(c.id) },
                })
              }
              onQuote={() => setQuoteCustomerId(c.id)}
              onEdit={() => setEditCustomer(c)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-card ring-1 ring-black/5 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[720px]">
              <thead className="bg-surface-strong/60 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Khách hàng</th>
                  <th className="px-3 py-2.5 font-medium">Liên hệ</th>
                  <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                  <th className="px-3 py-2.5 font-medium">Sales</th>
                  <th className="px-3 py-2.5 font-medium text-right">Công nợ</th>
                  <th className="px-3 py-2.5 font-medium text-right w-[7rem]">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((c) => {
                  const debt = debtMap.get(c.id) ?? 0;
                  const st = statusMeta[c.status];
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-surface-strong/40 cursor-pointer transition-colors"
                      onClick={() =>
                        navigate({
                          to: "/khach-hang/$customerId",
                          params: { customerId: String(c.id) },
                        })
                      }
                    >
                      <td className="px-4 py-3 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {c.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {[c.company, c.source, c.region]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {c.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3 opacity-60" />
                            {c.phone}
                          </span>
                        ) : (
                          "—"
                        )}
                        {c.email ? (
                          <p className="truncate max-w-[10rem] mt-0.5" title={c.email}>
                            {c.email}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded",
                            st.className,
                          )}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {c.owner_name || "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right font-mono text-xs tabular-nums",
                          debt > 0
                            ? "text-terracotta font-medium"
                            : "text-muted-foreground",
                        )}
                      >
                        {debt > 0 ? formatVND(debt) : "—"}
                      </td>
                      <td
                        className="px-3 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-0.5">
                          <IconBtn
                            title="Báo giá"
                            onClick={() => setQuoteCustomerId(c.id)}
                          >
                            <FilePlus2 className="size-3.5" />
                          </IconBtn>
                          <IconBtn
                            title="Sửa"
                            onClick={() => setEditCustomer(c)}
                          >
                            <Pencil className="size-3.5" />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
            {visible.length} khách hàng
            {filter !== "all"
              ? ` · lọc ${filters.find((f) => f.key === filter)?.label}`
              : ""}
            {search.trim() ? ` · tìm “${search.trim()}”` : ""}
          </p>
        </div>
      )}

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Ghi chú hoạt động gần đây
          </h2>
          <div className="bg-card ring-1 ring-black/5 rounded-xl divide-y divide-border">
            {notes.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Chưa có ghi chú. Nhấp vào thẻ khách để xem hồ sơ.
              </p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="p-4 flex gap-4">
                  <div className="size-2 bg-stone-300 rounded-full mt-1.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{n.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {n.created_at} · {n.author}
                      {n.customer_name ? ` → ${n.customer_name}` : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Thống kê
          </h2>
          <div className="space-y-4">
            <div className="bg-card ring-1 ring-black/5 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">
                Đang tư vấn / báo giá
              </p>
              <p className="text-xl font-medium text-foreground">
                {quotedCount} khách
              </p>
            </div>
            <div className="bg-card ring-1 ring-black/5 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">
                Tổng công nợ phải thu
              </p>
              <p className="text-xl font-medium text-terracotta">
                {formatVNDShort(
                  debts.reduce((s, d) => s + Math.max(0, d.debt), 0),
                )}
              </p>
            </div>
            <div className="bg-card ring-1 ring-black/5 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">
                Phân bố trạng thái
              </p>
              <div className="mt-2 space-y-1">
                {(
                  [
                    "consulting",
                    "sample_sent",
                    "quoted",
                    "closed",
                    "lost",
                    "delivering",
                    "done",
                  ] as CustomerStatus[]
                ).map((k) => {
                  const n = customers.filter((c) => c.status === k).length;
                  if (!n) return null;
                  return (
                    <div
                      key={k}
                      className="flex justify-between text-xs text-muted-foreground"
                    >
                      <span>{statusMeta[k].label}</span>
                      <span className="font-medium text-foreground">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <NewCustomerDialog
        open={Boolean(editCustomer)}
        onOpenChange={(o) => {
          if (!o) setEditCustomer(null);
        }}
        customer={editCustomer}
        onCreated={refresh}
      />

      <NewQuoteDialog
        open={quoteCustomerId != null}
        onOpenChange={(o) => {
          if (!o) setQuoteCustomerId(null);
        }}
        defaultCustomerId={quoteCustomerId ?? undefined}
        onCreated={refresh}
      />
    </>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="size-7 grid place-items-center rounded-md text-muted-foreground hover:bg-surface-strong hover:text-foreground"
    >
      {children}
    </button>
  );
}
