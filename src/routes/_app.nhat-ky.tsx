import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { fetchAuditLogs } from "@/api/functions";

export const Route = createFileRoute("/_app/nhat-ky")({
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { role: string } }).user;
    if (user?.role !== "admin") {
      throw redirect({ to: "/tong-quan" });
    }
  },
  component: AuditPage,
});

function AuditPage() {
  const [action, setAction] = useState("");
  const { data: logs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit-logs", action],
    queryFn: () =>
      fetchAuditLogs({
        data: { limit: 200, action: action || undefined },
      }),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        eyebrow="Vận hành"
        title="Nhật ký hệ thống"
        description="Theo dõi đăng nhập, thao tác CRM và quản lý người dùng."
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            className="h-9 px-3 rounded-lg border border-border text-xs font-medium hover:bg-surface-strong"
          >
            {isFetching ? "Đang tải…" : "Làm mới"}
          </button>
        }
      />

      <div className="flex gap-2 items-center">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Lọc action (vd: login, customer…)"
          className="h-9 px-3 rounded-lg border border-border bg-background text-sm w-full max-w-xs"
        />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm divide-y divide-border">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        ) : logs.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Chưa có nhật ký.</p>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4"
            >
              <div className="text-[11px] text-muted-foreground sm:w-36 flex-shrink-0 tabular-nums">
                {log.created_at}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {log.username || "—"}
                  </span>
                  <code className="text-[10px] px-1.5 py-0.5 rounded bg-surface-strong text-muted-foreground">
                    {log.action}
                  </code>
                  {log.entity_type ? (
                    <span className="text-[10px] text-muted-foreground">
                      {log.entity_type}
                      {log.entity_id != null ? `#${log.entity_id}` : ""}
                    </span>
                  ) : null}
                </div>
                {log.summary ? (
                  <p className="text-sm text-foreground/90 mt-0.5">
                    {log.summary}
                  </p>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
