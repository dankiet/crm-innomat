import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createShortLinkFn, updateShortLinkFn, deleteShortLinkFn } from "@/api/lp";
import { inputClsPlaceholder as inputCls } from "@/lib/utils";
import { normalizeSlug } from "@/lib/short-link";
import type { ShortLink } from "@/db/short-links.server";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Truyền khi sửa; bỏ trống khi tạo mới. */
  editing?: ShortLink | null;
  /** Điền sẵn slug khi tạo từ ngữ cảnh khác (vd từ mã gạch). */
  defaultSlug?: string;
  onSaved?: () => void;
};

const UTM_FIELDS = [
  { key: "utm_source", label: "utm_source", placeholder: "facebook" },
  { key: "utm_medium", label: "utm_medium", placeholder: "paid" },
  { key: "utm_campaign", label: "utm_campaign", placeholder: "ebg_gachthe_traffic_202610" },
  { key: "utm_content", label: "utm_content", placeholder: "m75300h_post" },
  { key: "utm_term", label: "utm_term (tuỳ chọn)", placeholder: "lal-lead-1p" },
] as const;

const EMPTY = {
  slug: "",
  label: "",
  targetPath: "/",
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  utm_content: "",
  utm_term: "",
};

export function ShortLinkDialog({ open, onOpenChange, editing = null, defaultSlug, onSaved }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Reset mỗi lần mở — tránh dữ liệu lần trước còn sót.
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setFieldError(null);
    if (editing) {
      setForm({
        slug: editing.slug,
        label: editing.label,
        targetPath: editing.target_path,
        utm_source: editing.utm_source,
        utm_medium: editing.utm_medium,
        utm_campaign: editing.utm_campaign,
        utm_content: editing.utm_content,
        utm_term: editing.utm_term,
      });
      setIsActive(editing.is_active === 1);
    } else {
      setForm({ ...EMPTY, slug: defaultSlug ? normalizeSlug(defaultSlug) : "" });
      setIsActive(true);
    }
  }, [open, editing, defaultSlug]);

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const preview = (() => {
    const params = new URLSearchParams();
    for (const f of UTM_FIELDS) {
      const v = form[f.key].trim();
      if (v) params.set(f.key, v);
    }
    const qs = params.toString();
    const path = form.targetPath.trim() || "/";
    return `embangach.com${path.startsWith("/") ? path : `/${path}`}${qs ? `?${qs}` : ""}`;
  })();

  const handleSave = async () => {
    setFieldError(null);
    const slug = normalizeSlug(form.slug);
    if (!slug) {
      setFieldError("Chưa nhập slug.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, slug, isActive };
      const res = editing
        ? await updateShortLinkFn({ data: { id: editing.id, ...payload } })
        : await createShortLinkFn({ data: payload });

      if (!res.ok) {
        setFieldError(
          res.error.field === "slug" && res.error.reason === "duplicate"
            ? `Slug "${slug}" đã được dùng cho link khác.`
            : res.error.field === "slug"
              ? "Slug chỉ gồm chữ thường, số và gạch ngang (2–64 ký tự)."
              : "Đường dẫn đích phải là path nội bộ, ví dụ /lp/gach-the.",
        );
        return;
      }
      toast.success(editing ? "Đã cập nhật shortlink" : "Đã tạo shortlink");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error("Lỗi lưu shortlink: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteShortLinkFn({ data: { id: editing.id } });
      toast.success("Đã xoá shortlink");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error("Lỗi xoá: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Sửa shortlink" : "Shortlink mới"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">Slug</span>
              <div className="flex items-center gap-1">
                <span className="shrink-0 text-xs text-muted-foreground">/s/</span>
                <input
                  className={inputCls}
                  value={form.slug}
                  onChange={(e) => set("slug", e.target.value)}
                  placeholder="m75300h"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">Đích (path)</span>
              <input
                className={inputCls}
                value={form.targetPath}
                onChange={(e) => set("targetPath", e.target.value)}
                placeholder="/"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">
              Nhãn nội bộ <span className="font-normal text-muted-foreground">(để nhận biết)</span>
            </span>
            <input
              className={inputCls}
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="Post M75300H — gạch thẻ bóng gợn"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            {UTM_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">{f.label}</span>
                <input
                  className={inputCls}
                  value={form[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
              </label>
            ))}
          </div>

          <div className="rounded-lg bg-surface-strong/60 px-3 py-2.5 ring-1 ring-black/5">
            <p className="text-[11px] font-medium text-muted-foreground">Link sẽ redirect tới</p>
            <p className="mt-1 break-all text-xs text-foreground">{preview}</p>
          </div>

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-3.5 accent-[var(--terracotta,#B94A2E)]"
            />
            Đang bật <span className="text-muted-foreground">(tắt = link trả 404)</span>
          </label>

          {fieldError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-900">
              {fieldError}
            </div>
          ) : null}

          {confirmDelete ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-900 space-y-1">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="size-3.5 text-red-600" />
                Xác nhận xoá vĩnh viễn?
              </p>
              <p>
                Link <strong>/s/{editing?.slug}</strong> sẽ ngừng hoạt động và số click bị mất.
                Không hoàn tác.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex w-full gap-2 sm:w-auto">
            {editing ? (
              <button
                type="button"
                disabled={saving || deleting}
                onClick={handleDelete}
                className={
                  confirmDelete
                    ? "inline-flex items-center gap-1 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    : "inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
                }
              >
                <Trash2 className="size-3.5" />
                {deleting ? "Đang xoá…" : confirmDelete ? "Xóa vĩnh viễn" : "Xoá link"}
              </button>
            ) : null}
            {confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded bg-card px-3 py-1.5 text-xs font-medium ring-1 ring-black/5 hover:bg-surface-strong"
              >
                Không xóa
              </button>
            ) : null}
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded bg-card px-3 py-1.5 text-xs font-medium ring-1 ring-black/5 hover:bg-surface-strong"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || confirmDelete}
              className="rounded bg-terracotta px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Tạo link"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
