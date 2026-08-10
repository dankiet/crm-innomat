import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { fetchDashboard } from "@/api/functions";
import { pipelineStages, type Customer, type Note } from "@/lib/types";
import { formatVNDShort } from "@/lib/format";
import { TrendingUp, Users, Wallet, Package } from "lucide-react";

type DashboardData = {
  customerCount: number;
  totalDebt: number;
  totalPaid: number;
  totalOrderAmount: number;
  pendingOrders: number;
  quotePipeline: number;
  notes: Note[];
  customers: Customer[];
};

export const Route = createFileRoute("/_app/tong-quan")({
  head: () => ({
    meta: [{ title: "Tổng quan — Innomat CRM" }],
  }),
  loader: async () => fetchDashboard(),
  component: DashboardPage,
});

function DashboardPage() {
  const data = Route.useLoaderData() as DashboardData;
  const {
    customerCount,
    totalDebt,
    totalPaid,
    totalOrderAmount,
    pendingOrders,
    quotePipeline,
    notes,
    customers,
  } = data;

  const today = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const kpis = [
    {
      label: "Pipeline báo giá",
      value: formatVNDShort(quotePipeline),
      hint: "Báo giá nháp / đã gửi",
      icon: TrendingUp,
      accent: "text-moss",
    },
    {
      label: "Khách hàng",
      value: `${customerCount}`,
      hint: "Đang chăm sóc",
      icon: Users,
      accent: "text-foreground",
    },
    {
      label: "Công nợ phải thu",
      value: formatVNDShort(totalDebt),
      hint: `Đã thu ${formatVNDShort(totalPaid)} / ${formatVNDShort(totalOrderAmount)}`,
      icon: Wallet,
      accent: "text-terracotta",
    },
    {
      label: "Đơn chờ xử lý",
      value: `${pendingOrders}`,
      hint: "Đang soạn kho + vận chuyển",
      icon: Package,
      accent: "text-foreground",
    },
  ];

  const stageCounts = pipelineStages.map((s) => ({
    ...s,
    count: customers.filter((c) => c.status === s.key).length,
  }));
  const maxCount = Math.max(...stageCounts.map((s) => s.count), 1);

  return (
    <>
      <PageHeader
        title="Tổng quan showroom"
        description={`Dữ liệu thực · ${today}`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="bg-card ring-1 ring-black/5 rounded-xl p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  {k.label}
                </p>
                <Icon className={`size-4 ${k.accent}`} />
              </div>
              <p className="text-2xl font-medium text-foreground">{k.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{k.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-card ring-1 ring-black/5 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold text-foreground">
              Pipeline theo giai đoạn
            </h2>
            <span className="text-xs text-muted-foreground">
              {customerCount} khách hàng
            </span>
          </div>
          {customerCount === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Chưa có khách hàng. Dùng &quot;+ Khách hàng mới&quot; trên thanh trên cùng.
            </p>
          ) : (
            <div className="space-y-4">
              {stageCounts.map((s) => (
                <div key={s.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-2 rounded-full flex-shrink-0 ${s.dotClass}`}
                        aria-hidden
                      />
                      <span className="text-xs font-medium text-foreground">
                        {s.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground bg-surface-strong px-1.5 py-0.5 rounded">
                        {s.count} khách
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-surface-strong rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${s.dotClass}`}
                      style={{
                        width: `${(s.count / maxCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Nhật ký hoạt động
          </h2>
          <div className="bg-card ring-1 ring-black/5 rounded-xl divide-y divide-border">
            {notes.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">
                Chưa có ghi chú hoạt động.
              </p>
            ) : (
              notes.slice(0, 5).map((n) => (
                <div key={n.id} className="p-4">
                  <p className="text-xs text-foreground line-clamp-3">
                    {n.content}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {n.created_at} · {n.author}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
