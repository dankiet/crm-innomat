import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Copy, ExternalLink, Link2, Pencil, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ShortLinkDialog } from "@/components/ShortLinkDialog";
import { listShortLinksFn } from "@/api/lp";
import type { ShortLink } from "@/db/short-links.server";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/shortlink")({
  head: () => ({ meta: [{ title: "Shortlink — Innomat CRM" }] }),
  loader: async () => {
    const links = await listShortLinksFn();
    return { links };
  },
  component: ShortLinkPage,
});

/** Đích hiển thị gọn: chỉ path + query, bỏ domain cho dễ đọc. */
function targetLabel(link: ShortLink): string {
  const params = new URLSearchParams();
  const utm: [string, string][] = [
    ["utm_source", link.utm_source],
    ["utm_medium", link.utm_medium],
    ["utm_campaign", link.utm_campaign],
    ["utm_content", link.utm_content],
    ["utm_term", link.utm_term],
  ];
  for (const [k, v] of utm) if (v) params.set(k, v);
  const qs = params.toString();
  return `${link.target_path}${qs ? `?${qs}` : ""}`;
}

function ShortLinkPage() {
  const { links } = Route.useLoaderData() as { links: ShortLink[] };
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ShortLink | null>(null);

  const refresh = () => router.invalidate();

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (link: ShortLink) => {
    setEditing(link);
    setDialogOpen(true);
  };

  const copy = async (slug: string) => {
    const url = `${window.location.origin}/s/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Đã copy link");
    } catch {
      toast.error("Không copy được — link: " + url);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Landing Page"
        title="Shortlink"
        description="Link ngắn để dán vào caption/comment. UTM lưu sẵn theo từng link nên không quên, không gõ sai — và sửa được về sau."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded bg-terracotta px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm"
          >
            <Plus className="size-3.5" />
            Shortlink mới
          </button>
        }
      />

      {links.length === 0 ? (
        <div className="max-w-4xl rounded-xl bg-card ring-1 ring-black/5">
          <EmptyState>
            Chưa có shortlink nào. Tạo link đầu tiên để dùng cho caption/comment quảng cáo.
          </EmptyState>
        </div>
      ) : (
        <div className="max-w-5xl overflow-hidden rounded-xl bg-card ring-1 ring-black/5">
          {links.map((link, idx) => (
            <div
              key={link.id}
              className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center", idx > 0 && "border-t border-border")}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-mono text-sm font-medium text-foreground">/s/{link.slug}</span>
                  {link.is_active === 1 ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      BẬT
                    </span>
                  ) : (
                    <span className="rounded bg-surface-strong px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                      TẮT
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {link.click_count} click
                  </span>
                </div>
                {link.label ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{link.label}</p>
                ) : null}
                <p className="mt-1 break-all text-[11px] text-muted-foreground/80">
                  → {targetLabel(link)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void copy(link.slug)}
                  title="Copy link"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ring-1 ring-black/5 hover:bg-surface-strong"
                >
                  <Copy className="size-3" />
                  Copy
                </button>
                <a
                  href={`/s/${link.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Mở link"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ring-1 ring-black/5 hover:bg-surface-strong"
                >
                  <ExternalLink className="size-3" />
                  Mở
                </a>
                <button
                  type="button"
                  onClick={() => openEdit(link)}
                  title="Sửa"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ring-1 ring-black/5 hover:bg-surface-strong"
                >
                  <Pencil className="size-3" />
                  Sửa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ShortLinkDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={refresh}
      />
    </>
  );
}
