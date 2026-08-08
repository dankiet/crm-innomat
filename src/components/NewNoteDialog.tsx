import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { fetchCustomers, fetchNotes, saveNote } from "@/api/functions";
import type { Customer, Note } from "@/lib/types";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  /** Pre-select customer (from card click / quick action) */
  defaultCustomerId?: number | null;
  /** Optional label when customer already known */
  defaultCustomerName?: string;
};

export function NewNoteDialog({
  open,
  onOpenChange,
  onCreated,
  defaultCustomerId = null,
  defaultCustomerName,
}: Props) {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [content, setContent] = useState("");
  const [customerId, setCustomerId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<Note[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContent("");
    setCustomerId(defaultCustomerId ?? "");
    setRecent([]);

    void (async () => {
      try {
        const cs = await fetchCustomers({ data: { status: "all" } });
        setCustomers(cs);
      } catch {
        /* ignore */
      }
    })();
  }, [open, defaultCustomerId]);

  // Load recent notes for selected customer
  useEffect(() => {
    if (!open || customerId === "") {
      setRecent([]);
      return;
    }
    let cancelled = false;
    setLoadingRecent(true);
    void (async () => {
      try {
        const notes = await fetchNotes({ data: { limit: 50 } });
        if (cancelled) return;
        setRecent(
          notes
            .filter((n) => n.customer_id === Number(customerId))
            .slice(0, 5),
        );
      } catch {
        if (!cancelled) setRecent([]);
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, customerId]);

  const selectedCustomer =
    customerId === ""
      ? null
      : customers.find((c) => c.id === Number(customerId));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("Nhập nội dung ghi chú");
      return;
    }
    setSaving(true);
    try {
      await saveNote({
        data: {
          content: content.trim(),
          customer_id: customerId === "" ? null : Number(customerId),
        },
      });
      toast.success("Đã thêm ghi chú");
      setContent("");
      onOpenChange(false);
      onCreated?.();
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi lưu ghi chú");
    } finally {
      setSaving(false);
    }
  }

  const titleName =
    defaultCustomerName ||
    selectedCustomer?.name ||
    (customerId !== "" ? "khách hàng" : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {titleName ? `Ghi chú · ${titleName}` : "Ghi chú mới"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Khách hàng
            </span>
            <select
              className={inputCls}
              value={customerId}
              onChange={(e) =>
                setCustomerId(e.target.value ? Number(e.target.value) : "")
              }
            >
              <option value="">— Không gắn KH —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.source ? ` · ${c.source}` : ""}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Nội dung *
            </span>
            <textarea
              className={`${inputCls} min-h-[110px] resize-y mt-1`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Gọi điện, hẹn xem showroom, phản hồi báo giá..."
              autoFocus
            />
          </label>

          {customerId !== "" ? (
            <div className="rounded-lg border border-border bg-surface/50 p-2.5 space-y-2 max-h-40 overflow-y-auto">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Ghi chú gần đây
              </p>
              {loadingRecent ? (
                <p className="text-[11px] text-muted-foreground">Đang tải…</p>
              ) : recent.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Chưa có ghi chú cho khách này.
                </p>
              ) : (
                recent.map((n) => (
                  <div
                    key={n.id}
                    className="text-[11px] border-t border-border/60 pt-1.5 first:border-0 first:pt-0"
                  >
                    <p className="text-foreground/90 line-clamp-2">
                      {n.content}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      {n.created_at} · {n.author}
                    </p>
                  </div>
                ))
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-xs font-medium px-3 py-1.5 rounded ring-1 ring-black/5 bg-card hover:bg-surface-strong"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-xs font-medium text-primary-foreground px-3 py-1.5 bg-terracotta rounded shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Lưu ghi chú"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const inputCls =
  "w-full text-sm px-3 py-2 rounded-md bg-background ring-1 ring-black/10 outline-none focus:ring-terracotta/40 text-foreground placeholder:text-muted-foreground/70";
