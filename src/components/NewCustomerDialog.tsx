import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  assignCustomerOwnerFn,
  checkCustomerPhoneFn,
  deleteCustomerFn,
  fetchMe,
  fetchUsers,
  saveCustomer,
  updateCustomerFn,
} from "@/api/functions";
import type { Customer, CustomerStatus, LeadSource } from "@/lib/types";
import { LEAD_SOURCES, statusMeta } from "@/lib/types";
import type { AppUser, SessionUser } from "@/lib/auth-types";
import { isPhoneMatchable } from "@/lib/phone";
import { toast } from "sonner";
import { AlertTriangle, Trash2, UserRoundCog } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  /** When set → edit mode */
  customer?: Customer | null;
};

type PhoneConflict = {
  id: number;
  name: string;
  phone: string;
  status: CustomerStatus;
  status_label: string;
  owner_id: number | null;
  owner_name: string;
  updated_at: string;
};

const emptyForm = {
  name: "",
  source: "" as LeadSource | string,
  phone: "",
  email: "",
  company: "",
  short_name: "",
  region: "",
  status: "consulting" as CustomerStatus,
  note: "",
};

export function NewCustomerDialog({
  open,
  onOpenChange,
  onCreated,
  customer = null,
}: Props) {
  const router = useRouter();
  const isEdit = Boolean(customer?.id);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [conflict, setConflict] = useState<PhoneConflict | null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [transferOwnerId, setTransferOwnerId] = useState<number | "">("");
  const [transferring, setTransferring] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (customer) {
      setForm({
        name: customer.name,
        source: customer.source || "",
        phone: customer.phone,
        email: customer.email || "",
        company: customer.company || "",
        short_name: customer.short_name || "",
        region: customer.region,
        status: customer.status,
        note: customer.note,
      });
      setTransferOwnerId(customer.owner_id ?? "");
    } else {
      setForm(emptyForm);
      setTransferOwnerId("");
    }
    setConflict(null);
    setConfirmDelete(false);
  }, [open, customer]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const user = await fetchMe();
        if (cancelled) return;
        setMe(user);
        if (user?.role === "admin") {
          const list = await fetchUsers();
          if (!cancelled) {
            setUsers(list.filter((u) => u.is_active));
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function runPhoneCheck(phone: string) {
    if (!isPhoneMatchable(phone)) {
      setConflict(null);
      return;
    }
    setCheckingPhone(true);
    try {
      const res = await checkCustomerPhoneFn({
        data: {
          phone,
          excludeId: customer?.id,
        },
      });
      setConflict(res.conflict);
    } catch {
      setConflict(null);
    } finally {
      setCheckingPhone(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Vui lòng nhập tên khách hàng");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Vui lòng nhập số điện thoại để tránh trùng khách");
      return;
    }
    if (conflict) {
      toast.error(
        `SĐT đã do ${conflict.owner_name} phụ trách — không tạo/sửa trùng`,
      );
      return;
    }
    setSaving(true);
    try {
      if (isEdit && customer) {
        await updateCustomerFn({
          data: { id: customer.id, ...form },
        });
        toast.success("Đã cập nhật khách hàng");
      } else {
        await saveCustomer({ data: form });
        toast.success("Đã thêm khách hàng mới");
      }
      onOpenChange(false);
      onCreated?.();
      await router.invalidate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi lưu khách hàng";
      toast.error(msg, { duration: 8000 });
      // Re-check phone so banner stays in sync with server
      await runPhoneCheck(form.phone);
    } finally {
      setSaving(false);
    }
  }

  async function handleTransfer() {
    if (!customer?.id || transferOwnerId === "") return;
    if (transferOwnerId === customer.owner_id) {
      toast.message("Sales phụ trách không đổi");
      return;
    }
    setTransferring(true);
    try {
      const res = await assignCustomerOwnerFn({
        data: {
          customerId: customer.id,
          ownerId: Number(transferOwnerId),
        },
      });
      toast.success(`Đã chuyển khách cho ${res.owner_name}`);
      onCreated?.();
      await router.invalidate();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chuyển thất bại");
    } finally {
      setTransferring(false);
    }
  }

  const isAdmin = me?.role === "admin";
  const blockSave = Boolean(conflict) || checkingPhone;

  async function handleDelete() {
    if (!customer?.id || !isAdmin) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await deleteCustomerFn({ data: { id: customer.id } });
      toast.success(
        `Đã xóa ${res.name}` +
          (res.quotes || res.orders
            ? ` (kèm ${res.quotes} BG, ${res.orders} ĐH, ${res.payments} TT)`
            : ""),
      );
      setConfirmDelete(false);
      onOpenChange(false);
      onCreated?.();
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa khách thất bại");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa khách hàng / lead" : "Khách hàng mới"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Tên khách hàng *">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Anh/Chị hoặc tên công ty"
              autoFocus
            />
          </Field>
          <Field label="Nguồn khách hàng">
            <select
              className={inputCls}
              value={form.source}
              onChange={(e) =>
                setForm((f) => ({ ...f, source: e.target.value }))
              }
            >
              <option value="">— Chọn nguồn —</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Điện thoại *">
              <input
                className={inputCls}
                value={form.phone}
                onChange={(e) => {
                  setForm((f) => ({ ...f, phone: e.target.value }));
                  setConflict(null);
                }}
                onBlur={() => runPhoneCheck(form.phone)}
                placeholder="09xx..."
                inputMode="tel"
              />
            </Field>
            <Field label="Khu vực">
              <input
                className={inputCls}
                value={form.region}
                onChange={(e) =>
                  setForm((f) => ({ ...f, region: e.target.value }))
                }
                placeholder="TP.HCM, Hà Nội..."
              />
            </Field>
          </div>
          <Field label="Email">
            <input
              className={inputCls}
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="vd. a@email.com (không bắt buộc)"
              autoComplete="email"
            />
          </Field>
          <Field label="Công ty">
            <input
              className={inputCls}
              value={form.company}
              onChange={(e) =>
                setForm((f) => ({ ...f, company: e.target.value }))
              }
              placeholder="Tên công ty (nếu khách là DN — không bắt buộc)"
              autoComplete="organization"
            />
          </Field>
          <Field label="Tên viết tắt">
            <input
              className={inputCls}
              value={form.short_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, short_name: e.target.value }))
              }
              placeholder="vd. INM, ABC (để xuất file báo giá)"
            />
          </Field>

          {checkingPhone ? (
            <p className="text-[11px] text-muted-foreground">
              Đang kiểm tra SĐT…
            </p>
          ) : null}

          {conflict ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 space-y-1">
              <p className="font-medium flex items-start gap-1.5">
                <AlertTriangle className="size-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
                <span>
                  SĐT này đã liên hệ / có trên hệ thống — không tạo trùng.
                </span>
              </p>
              <p>
                <span className="text-amber-800/80">Khách:</span>{" "}
                <strong>{conflict.name}</strong>
                {" · "}
                {conflict.status_label}
              </p>
              <p>
                <span className="text-amber-800/80">Sales phụ trách:</span>{" "}
                <strong>{conflict.owner_name}</strong>
              </p>
              <p className="text-amber-800/80">
                Cập nhật: {conflict.updated_at}
                {isAdmin
                  ? " — Admin có thể mở KH đó và dùng «Chuyển sales»."
                  : " — Liên hệ admin nếu cần chuyển lead sang bạn."}
              </p>
            </div>
          ) : null}

          <Field label="Trạng thái (lead)">
            <select
              className={inputCls}
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  status: e.target.value as CustomerStatus,
                }))
              }
            >
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
              ).map((key) => (
                <option key={key} value={key}>
                  {statusMeta[key].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ghi chú">
            <textarea
              className={`${inputCls} min-h-[72px] resize-y`}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Nhu cầu, ghi chú thêm..."
            />
          </Field>

          {isEdit && isAdmin && customer ? (
            <div className="rounded-lg border border-border bg-surface/60 p-3 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <UserRoundCog className="size-3.5" />
                Chuyển sales phụ trách
              </p>
              <p className="text-[11px] text-muted-foreground">
                Hiện tại:{" "}
                <strong className="text-foreground">
                  {customer.owner_name || "—"}
                </strong>
              </p>
              <div className="flex gap-2">
                <select
                  className={`${inputCls} flex-1`}
                  value={transferOwnerId === "" ? "" : String(transferOwnerId)}
                  onChange={(e) =>
                    setTransferOwnerId(
                      e.target.value ? Number(e.target.value) : "",
                    )
                  }
                >
                  <option value="">— Chọn sales —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name} (@{u.username})
                      {u.role === "admin" ? " · Admin" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={
                    transferring ||
                    transferOwnerId === "" ||
                    transferOwnerId === customer.owner_id
                  }
                  onClick={handleTransfer}
                  className="text-xs font-medium px-3 py-1.5 rounded bg-foreground text-background hover:opacity-90 disabled:opacity-40 flex-shrink-0"
                >
                  {transferring ? "…" : "Chuyển"}
                </button>
              </div>
            </div>
          ) : null}

          {isEdit && !isAdmin && customer?.owner_name ? (
            <p className="text-[11px] text-muted-foreground">
              Sales phụ trách:{" "}
              <span className="font-medium text-foreground">
                {customer.owner_name}
              </span>
            </p>
          ) : null}

          {isEdit && isAdmin && confirmDelete ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-900 space-y-1">
              <p className="font-medium flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-red-600" />
                Xác nhận xóa vĩnh viễn?
              </p>
              <p>
                Sẽ xóa luôn báo giá, đơn hàng, thanh toán/công nợ và ghi chú gắn
                với <strong>{customer?.name}</strong>. Không hoàn tác.
              </p>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2 w-full sm:w-auto">
              {isEdit && isAdmin ? (
                <button
                  type="button"
                  disabled={saving || deleting}
                  onClick={handleDelete}
                  className={
                    confirmDelete
                      ? "text-xs font-medium px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-1"
                      : "text-xs font-medium px-3 py-1.5 rounded text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"
                  }
                >
                  <Trash2 className="size-3.5" />
                  {deleting
                    ? "Đang xóa…"
                    : confirmDelete
                      ? "Xóa vĩnh viễn"
                      : "Xóa khách"}
                </button>
              ) : null}
              {confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs font-medium px-3 py-1.5 rounded ring-1 ring-black/5 bg-card hover:bg-surface-strong"
                >
                  Không xóa
                </button>
              ) : null}
            </div>
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onOpenChange(false);
                }}
                className="text-xs font-medium px-3 py-1.5 rounded ring-1 ring-black/5 bg-card hover:bg-surface-strong"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={saving || blockSave || deleting || confirmDelete}
                className="text-xs font-medium text-primary-foreground px-3 py-1.5 bg-terracotta rounded shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {saving
                  ? "Đang lưu..."
                  : isEdit
                    ? "Lưu thay đổi"
                    : "Lưu khách hàng"}
              </button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full text-sm px-3 py-2 rounded-md bg-background ring-1 ring-black/10 outline-none focus:ring-terracotta/40 text-foreground placeholder:text-muted-foreground/70";
