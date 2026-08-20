import { Link, createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { fetchDashboard } from "@/api/functions";
import { pipelineStages, type Customer, type Note } from "@/lib/types";
import { formatVNDShort } from "@/lib/format";
import { ArrowUpRight, ClipboardList, FileText, Package, TrendingUp, Users, Wallet } from "lucide-react";

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
  head: () => ({ meta: [{ title: "Tổng quan — Innomat CRM" }] }),
  loader: async () => fetchDashboard(),
  component: DashboardPage,
});

function DashboardPage() {
  const data = Route.useLoaderData() as DashboardData;
  const { customerCount, totalDebt, totalPaid, totalOrderAmount, pendingOrders, quotePipeline, notes, customers } = data;
  const today = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const stageCounts = pipelineStages.map((stage) => ({ ...stage, count: customers.filter((customer) => customer.status === stage.key).length }));
  const maxCount = Math.max(...stageCounts.map((stage) => stage.count), 1);
  const kpis = [
    { label: "Pipeline báo giá", value: formatVNDShort(quotePipeline), hint: "Giá trị đang theo dõi", icon: TrendingUp, tone: "text-primary", href: "/bao-gia" },
    { label: "Khách hàng", value: `${customerCount}`, hint: "Tổng hồ sơ đang quản lý", icon: Users, tone: "text-sky-600", href: "/khach-hang" },
    { label: "Công nợ phải thu", value: formatVNDShort(totalDebt), hint: `Đã thu ${formatVNDShort(totalPaid)}`, icon: Wallet, tone: "text-amber-600", href: "/cong-no" },
    { label: "Đơn hàng", value: `${pendingOrders}`, hint: `Tổng giá trị ${formatVNDShort(totalOrderAmount)}`, icon: Package, tone: "text-emerald-600", href: "/bao-gia" },
  ];

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Workspace" title="Tổng quan showroom" description={`Dữ liệu thực · ${today}`} actions={<Link to="/khach-hang" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"><Users className="size-4" />Khách hàng</Link>} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return <Link key={kpi.label} to={kpi.href} className="group crm-surface rounded-2xl p-5 transition-transform hover:-translate-y-0.5">
            <div className="mb-4 flex items-center justify-between"><span className={`grid size-9 place-items-center rounded-xl bg-accent ${kpi.tone}`}><Icon className="size-[18px]" /></span><ArrowUpRight className="size-4 text-muted-foreground/45 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{kpi.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{kpi.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </Link>;
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <div className="crm-surface rounded-2xl p-5 sm:p-6">
          <div className="mb-6 flex items-start justify-between gap-4"><div><p className="crm-eyebrow">Pipeline</p><h3 className="mt-1 text-lg font-bold tracking-tight">Tiến độ khách hàng</h3><p className="mt-1 text-xs text-muted-foreground">Nhìn nhanh các cơ hội đang đi qua từng giai đoạn.</p></div><Link to="/khach-hang" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Mở pipeline <ArrowUpRight className="size-3.5" /></Link></div>
          <div className="space-y-5">{stageCounts.map((stage) => <div key={stage.key}><div className="mb-2 flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className={`size-2.5 shrink-0 rounded-full ${stage.dotClass}`} /><span className="truncate text-sm font-semibold text-foreground">{stage.label}</span></div><span className="shrink-0 text-xs font-medium text-muted-foreground">{stage.count} khách</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${stage.dotClass} transition-all`} style={{ width: `${Math.max((stage.count / maxCount) * 100, stage.count ? 8 : 0)}%` }} /></div><p className="mt-1.5 text-[11px] text-muted-foreground">{stage.hint}</p></div>)}</div>
        </div>

        <div className="crm-surface rounded-2xl p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4"><div><p className="crm-eyebrow">Cần xử lý</p><h3 className="mt-1 text-lg font-bold tracking-tight">Ưu tiên hôm nay</h3></div><ClipboardList className="size-5 text-primary" /></div>
          <div className="space-y-3">
            <Link to="/bao-gia" className="group flex items-center gap-3 rounded-xl border border-border/70 p-3 transition-colors hover:bg-accent/60"><span className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-700"><FileText className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">Báo giá cần theo dõi</span><span className="block text-xs text-muted-foreground">{pendingOrders} đơn/báo giá đang chờ xử lý</span></span><ArrowUpRight className="size-4 text-muted-foreground/50 group-hover:text-primary" /></Link>
            <Link to="/cong-no" className="group flex items-center gap-3 rounded-xl border border-border/70 p-3 transition-colors hover:bg-accent/60"><span className="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700"><Wallet className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">Công nợ cần kiểm tra</span><span className="block text-xs text-muted-foreground">Tổng phải thu {formatVNDShort(totalDebt)}</span></span><ArrowUpRight className="size-4 text-muted-foreground/50 group-hover:text-primary" /></Link>
            <Link to="/khach-hang" className="group flex items-center gap-3 rounded-xl border border-border/70 p-3 transition-colors hover:bg-accent/60"><span className="grid size-9 place-items-center rounded-lg bg-sky-50 text-sky-700"><Users className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">Chăm sóc khách hàng</span><span className="block text-xs text-muted-foreground">{customerCount} hồ sơ trong hệ thống</span></span><ArrowUpRight className="size-4 text-muted-foreground/50 group-hover:text-primary" /></Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <div className="crm-surface rounded-2xl p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="crm-eyebrow">Activity</p><h3 className="mt-1 text-lg font-bold tracking-tight">Hoạt động gần đây</h3></div><StickyNoteIcon /></div>{notes.length === 0 ? <p className="rounded-xl bg-muted/60 px-4 py-8 text-center text-xs text-muted-foreground">Chưa có ghi chú hoạt động.</p> : <div className="space-y-1">{notes.slice(0, 5).map((note) => <div key={note.id} className="border-b border-border/60 py-3 last:border-0"><p className="line-clamp-2 text-sm text-foreground">{note.content}</p><p className="mt-1 text-[11px] text-muted-foreground">{note.created_at} · {note.author}</p></div>)}</div>}</div>
        <div className="crm-surface rounded-2xl p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="crm-eyebrow">Shortcuts</p><h3 className="mt-1 text-lg font-bold tracking-tight">Đi nhanh đến workspace</h3></div><ArrowUpRight className="size-5 text-primary" /></div><div className="grid gap-3 sm:grid-cols-2"><Shortcut href="/khach-hang" icon={Users} title="Khách hàng" text="Tìm kiếm, phân loại và chăm sóc hồ sơ." /><Shortcut href="/co-hoi" icon={TrendingUp} title="Cơ hội" text="Theo dõi pipeline và giai đoạn bán hàng." /><Shortcut href="/san-pham" icon={Package} title="Sản phẩm" text="Tra cứu catalog và chỉnh dữ liệu." /><Shortcut href="/thu-vien" icon={FileText} title="Thư viện" text="Mở tài sản hình ảnh cho showroom." /></div></div>
      </section>
    </div>
  );
}

function Shortcut({ href, icon: Icon, title, text }: { href: "/khach-hang" | "/co-hoi" | "/san-pham" | "/thu-vien"; icon: typeof Users; title: string; text: string }) {
  return <Link to={href} className="group rounded-xl border border-border/70 p-4 transition-colors hover:bg-accent/60"><span className="mb-3 grid size-8 place-items-center rounded-lg bg-accent text-primary"><Icon className="size-4" /></span><span className="block text-sm font-semibold text-foreground">{title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{text}</span></Link>;
}

function StickyNoteIcon() { return <FileText className="size-5 text-primary" />; }
