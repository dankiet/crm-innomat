/**
 * Hộp thư lead từ landing page (ads).
 *
 * Lead KHÔNG tự động vào bảng `customers`. Ở đây sales xem, đánh dấu
 * trạng thái, và bấm "Chuyển thành KH" khi lead đáng vào pipeline —
 * lúc đó `createCustomer` mới chạy với `owner_id` là người bấm.
 * Lý do: traffic ads submit trùng là bình thường, còn `customers` yêu
 * cầu SĐT không trùng và phải có chủ sở hữu.
 */
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { fetchLpLeadsFn, setLpLeadStatusFn, convertLpLeadFn, deleteLpLeadFn } from "@/api/lp";
import { LP_LEAD_STATUS_LABEL, type LpLead, type LpLeadStatus } from "@/lib/lp-types";

type LeadsSearch = { status?: LpLeadStatus | "all"; q?: string };

const STATUS_TABS: (LpLeadStatus | "all")[] = ["all", "new", "contacted", "converted", "spam"];

const STATUS_CLS: Record<LpLeadStatus, string> = {
  new: "bg-terracotta/10 text-terracotta ring-terracotta/20",
  contacted: "bg-amber-500/10 text-amber-700 ring-amber-500/20",
  converted: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  spam: "bg-muted text-muted-foreground ring-black/5",
};

export const Route = createFileRoute("/_app/leads")({
  head: () => ({
    meta: [{ title: "Lead từ Landing page — Innomat CRM" }],
  }),
  validateSearch: (search: Record<string, unknown>): LeadsSearch => ({
    status:
      search.status === "new" ||
      search.status === "contacted" ||
      search.status === "converted" ||
      search.status === "spam" ||
      search.status === "all"
        ? search.status
        : undefined,
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
  }),
  loaderDeps: ({ search }: { search: LeadsSearch }) => ({
    status: search.status ?? "all",
    q: search.q?.trim() ?? "",
  }),
  loader: async ({ deps }) => {
    const leads = await fetchLpLeadsFn({
      data: { status: deps.status, search: deps.q || undefined, limit: 300 },
    });
    return { leads, status: deps.status, q: deps.q };
  },
  component: LeadsPage,
});

function LeadsPage() {
  const { leads, status, q } = Route.useLoaderData();
  const router = useRouter();
  const navigate = Route.useNavigate();

  const [search, setSearch] = useState(q);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  async function onStatus(lead: LpLead, next: LpLeadStatus) {
    setBusyId(lead.id);
    try {
      await setLpLeadStatusFn({ data: { id: lead.id, status: next } });
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không đổi được trạng thái");
    } finally {
      setBusyId(null);
    }
  }

  async function onConvert(lead: LpLead) {
    setBusyId(lead.id);
    try {
      const res = await convertLpLeadFn({ data: { id: lead.id } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Đã tạo khách hàng #${res.customer_id}`);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không chuyển được lead");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(lead: LpLead) {
    setBusyId(lead.id);
    try {
      await deleteLpLeadFn({ data: { id: lead.id } });
      setPendingDelete(null);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xóa được");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Landing Page"
        title="Hộp thư Lead"
        description="Lead do quảng cáo & KTS gửi về, chưa nằm trong pipeline. Xác minh rồi chuyển thành khách hàng."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void navigate({ search: (p) => ({ ...p, status: s }) })}
            className={
              (status ?? "all") === s
                ? "rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background"
                : "rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-black/5 hover:bg-surface-strong"
            }
          >
            {s === "all" ? "Tất cả" : LP_LEAD_STATUS_LABEL[s]}
          </button>
        ))}

        <form
          className="ml-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void navigate({
              search: (p) => ({ ...p, q: search.trim() || undefined }),
            });
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tên, SĐT hoặc campaign"
            className="w-56 rounded-lg bg-card px-3 py-1.5 text-xs ring-1 ring-black/5"
          />
          <button
            type="submit"
            className="rounded-lg bg-surface-strong px-3 py-1.5 text-xs font-medium ring-1 ring-black/5"
          >
            Tìm
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-black/5">
        {leads.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted-foreground">
            Chưa có lead nào ở trạng thái này.
          </p>
        ) : (
          leads.map((lead, idx) => (
            <div
              key={lead.id}
              className={idx === 0 ? "p-4 sm:p-5" : "border-t border-border p-4 sm:p-5"}
            >
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                <span className="text-sm font-semibold text-foreground">
                  {lead.full_name || "(không tên)"}
                </span>
                {lead.studio ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    · {lead.studio}
                  </span>
                ) : null}
                <a href={`tel:${lead.phone}`} className="text-sm font-medium text-terracotta">
                  {lead.phone}
                </a>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${STATUS_CLS[lead.status]}`}
                >
                  {LP_LEAD_STATUS_LABEL[lead.status]}
                </span>
                <span
                  className={
                    lead.form_kind === "library-gate"
                      ? "rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-500/20"
                      : "rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-500/20"
                  }
                >
                  {lead.form_kind === "library-gate" ? "Mở thư viện" : "Brief KTS"}
                </span>
                {(lead.dup_count ?? 1) > 1 ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-black/5">
                    {lead.dup_count} lần gửi
                  </span>
                ) : null}
                <span className="ml-auto text-[11px] text-muted-foreground">{lead.created_at}</span>
              </div>

              {/* Chi tiết dự án KTS */}
              {(lead.project_name || lead.project_type || lead.project_stage || lead.area || lead.attachment_names) ? (
                <div className="mt-2 rounded-lg bg-surface-strong/60 p-2.5 text-xs text-foreground ring-1 ring-black/5">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {lead.project_name ? <span><strong>Dự án:</strong> {lead.project_name}</span> : null}
                    {lead.project_type ? <span><strong>Loại:</strong> {lead.project_type}</span> : null}
                    {lead.project_stage ? <span><strong>Giai đoạn:</strong> {lead.project_stage}</span> : null}
                    {lead.area ? <span><strong>Diện tích:</strong> {lead.area}</span> : null}
                    {lead.attachment_names ? <span className="text-amber-700"><strong>File:</strong> {lead.attachment_names}</span> : null}
                  </div>
                </div>
              ) : null}

              {/* Shortlist gạch kèm ngữ cảnh Không gian */}
              {lead.shortlist_details || lead.shortlist_codes ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Mã đã lưu:</span>
                  {(() => {
                    let items: { code: string; space_title?: string; application_position?: string }[] = [];
                    if (lead.shortlist_details) {
                      try {
                        items = JSON.parse(lead.shortlist_details);
                      } catch {
                        // fallback
                      }
                    }
                    if (!items.length && lead.shortlist_codes) {
                      items = lead.shortlist_codes.split(",").filter(Boolean).map((c) => ({ code: c.trim() }));
                    }
                    return items.map((item, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded bg-surface-strong px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-black/5"
                      >
                        <span className="font-semibold text-terracotta">{item.code}</span>
                        {item.space_title ? (
                          <span className="text-[10px] text-muted-foreground">
                            ({item.space_title}{item.application_position ? `: ${item.application_position}` : ""})
                          </span>
                        ) : null}
                      </span>
                    ));
                  })()}
                </div>
              ) : null}

              <p className="mt-2 text-xs text-muted-foreground">
                {[
                  lead.need && `Nhu cầu: ${lead.need}`,
                  lead.email,
                  lead.lp_slug && `LP: ${lead.lp_slug}`,
                  lead.utm_source && `Nguồn: ${lead.utm_source}`,
                  lead.utm_campaign && `Campaign: ${lead.utm_campaign}`,
                  lead.consent_marketing ? "Đồng ý nhận tin" : null,
                  lead.handled_by_name && `Xử lý: ${lead.handled_by_name}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {lead.note ? <p className="mt-1.5 text-sm text-foreground">{lead.note}</p> : null}

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                {lead.status !== "contacted" ? (
                  <button
                    type="button"
                    disabled={busyId === lead.id}
                    onClick={() => void onStatus(lead, "contacted")}
                    className="rounded border border-border px-2 py-1 hover:bg-surface-strong disabled:opacity-50"
                  >
                    Đã liên hệ
                  </button>
                ) : null}

                {!lead.customer_id ? (
                  <button
                    type="button"
                    disabled={busyId === lead.id}
                    onClick={() => void onConvert(lead)}
                    className="rounded bg-terracotta px-2 py-1 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    Chuyển thành KH
                  </button>
                ) : (
                  <a
                    href={`/khach-hang/${lead.customer_id}`}
                    className="rounded border border-border px-2 py-1 hover:bg-surface-strong"
                  >
                    Xem khách hàng #{lead.customer_id}
                  </a>
                )}

                {lead.status !== "spam" ? (
                  <button
                    type="button"
                    disabled={busyId === lead.id}
                    onClick={() => void onStatus(lead, "spam")}
                    className="rounded border border-border px-2 py-1 text-muted-foreground hover:bg-surface-strong disabled:opacity-50"
                  >
                    Đánh dấu spam
                  </button>
                ) : null}

                {/* Xác nhận hai bước inline — không dùng window.confirm */}
                {pendingDelete === lead.id ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-red-700">Xóa lead này khỏi hệ thống?</span>
                    <button
                      type="button"
                      disabled={busyId === lead.id}
                      onClick={() => void onDelete(lead)}
                      className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Xóa vĩnh viễn
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(null)}
                      className="rounded border border-border px-2 py-1 hover:bg-surface-strong"
                    >
                      Không xóa
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingDelete(lead.id)}
                    className="ml-auto rounded px-2 py-1 text-muted-foreground hover:bg-red-50 hover:text-red-700"
                  >
                    Xóa
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
