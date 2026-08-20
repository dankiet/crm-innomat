import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { NewNoteDialog } from "@/components/NewNoteDialog";
import { fetchNotes } from "@/api/functions";
import type { Note } from "@/lib/types";

export const Route = createFileRoute("/_app/ghi-chu")({
  head: () => ({
    meta: [{ title: "Ghi chú — Innomat CRM" }],
  }),
  loader: async () => {
    const notes = await fetchNotes({ data: { limit: 100 } });
    return { notes };
  },
  component: NotesPage,
});

function NotesPage() {
  const { notes } = Route.useLoaderData() as { notes: Note[] };
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Vận hành"
        title="Ghi chú & Hoạt động"
        description="Nhật ký trao đổi, phản hồi và điều chỉnh yêu cầu từ khách hàng."
        actions={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-primary-foreground px-3 py-1.5 bg-terracotta rounded shadow-sm"
          >
            + Ghi chú mới
          </button>
        }
      />

      <div className="bg-card ring-1 ring-black/5 rounded-xl overflow-hidden max-w-4xl">
        {notes.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted-foreground">
            Chưa có ghi chú. Thêm ghi chú để theo dõi hoạt động bán hàng.
          </p>
        ) : (
          notes.map((n, idx) => (
            <div
              key={n.id}
              className={
                idx === 0
                  ? "flex gap-5 p-5"
                  : "flex gap-5 p-5 border-t border-border"
              }
            >
              <div className="size-9 rounded-full bg-surface-strong grid place-items-center text-xs font-medium text-foreground flex-shrink-0 ring-1 ring-black/5">
                {(n.author || "S")
                  .split(" ")
                  .map((w) => w[0])
                  .slice(-2)
                  .join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-medium text-foreground">
                    {n.author}
                  </span>
                  {n.customer_name ? (
                    <span className="text-xs text-muted-foreground">
                      → {n.customer_name}
                      {n.customer_source ? ` · ${n.customer_source}` : ""}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-foreground leading-relaxed">
                  {n.content}
                </p>
                <p className="text-[11px] text-muted-foreground mt-2">
                  {n.created_at}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <NewNoteDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
