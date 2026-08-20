import { useMemo, useState } from "react";
import {
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import {
  createUserFn,
  fetchUsers,
  resetUserPasswordFn,
  updateUserFn,
} from "@/api/functions";
import type { AppUser, Role } from "@/lib/auth-types";
import { ROLE_LABEL } from "@/lib/auth-types";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/nguoi-dung")({
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { role: string } }).user;
    if (user?.role !== "admin") {
      throw redirect({ to: "/tong-quan" });
    }
  },
  component: UsersPage,
});

function UsersPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user: me } = Route.useRouteContext() as {
    user: { id: number; role: string };
  };

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => fetchUsers(),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    username: "",
    display_name: "",
    password: "",
    role: "user" as Role,
    phone: "",
  });
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [editPhoneId, setEditPhoneId] = useState<number | null>(null);
  const [editPhoneValue, setEditPhoneValue] = useState("");

  const sorted = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        return a.display_name.localeCompare(b.display_name, "vi");
      }),
    [users],
  );

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["users"] });
    await router.invalidate();
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createUserFn({ data: form });
      toast.success("Đã tạo người dùng");
      setCreateOpen(false);
      setForm({
        username: "",
        display_name: "",
        password: "",
        role: "user",
        phone: "",
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tạo user thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: AppUser) {
    if (u.id === me.id) {
      toast.error("Không thể khóa chính bạn");
      return;
    }
    setBusy(true);
    try {
      await updateUserFn({
        data: { id: u.id, is_active: !u.is_active },
      });
      toast.success(u.is_active ? "Đã khóa tài khoản" : "Đã mở khóa");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cập nhật thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(u: AppUser, role: Role) {
    if (u.id === me.id && role !== "admin") {
      toast.error("Không thể tự hạ quyền");
      return;
    }
    setBusy(true);
    try {
      await updateUserFn({ data: { id: u.id, role } });
      toast.success("Đã đổi role");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cập nhật thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function savePhone(u: AppUser) {
    setBusy(true);
    try {
      await updateUserFn({ data: { id: u.id, phone: editPhoneValue.trim() } });
      toast.success("Đã cập nhật SĐT");
      setEditPhoneId(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cập nhật thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function onResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (resetId == null) return;
    setBusy(true);
    try {
      await resetUserPasswordFn({
        data: { id: resetId, password: resetPassword },
      });
      toast.success("Đã đặt lại mật khẩu");
      setResetId(null);
      setResetPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        eyebrow="Quản trị"
        title="Người dùng"
        description="Tạo tài khoản sales, gán role admin/user, khóa hoặc reset mật khẩu."
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-9 px-3 rounded-lg bg-terracotta text-primary-foreground text-xs font-medium hover:opacity-90"
          >
            + Tạo user
          </button>
        }
      />

      {createOpen ? (
        <form
          onSubmit={onCreate}
          className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm"
        >
          <p className="text-sm font-medium">Tạo người dùng mới</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field
              label="Username"
              value={form.username}
              onChange={(v) => setForm((f) => ({ ...f, username: v }))}
              required
            />
            <Field
              label="Tên hiển thị"
              value={form.display_name}
              onChange={(v) => setForm((f) => ({ ...f, display_name: v }))}
              required
            />
            <Field
              label="Mật khẩu (≥ 8 ký tự)"
              type="password"
              value={form.password}
              onChange={(v) => setForm((f) => ({ ...f, password: v }))}
              required
            />
            <Field
              label="Số điện thoại"
              type="tel"
              value={form.phone}
              onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            />
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Role</label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value as Role }))
                }
                className="w-full h-9 px-2 rounded-lg border border-border bg-background text-sm"
              >
                <option value="user">Sales</option>
                <option value="admin">Quản trị</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="h-9 px-3 rounded-lg bg-terracotta text-primary-foreground text-xs font-medium disabled:opacity-60"
            >
              Lưu
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="h-9 px-3 rounded-lg border border-border text-xs"
            >
              Hủy
            </button>
          </div>
        </form>
      ) : null}

      {resetId != null ? (
        <form
          onSubmit={onResetPassword}
          className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3"
        >
          <p className="text-sm font-medium">
            Đặt lại mật khẩu user #{resetId}
          </p>
          <Field
            label="Mật khẩu mới (≥ 8 ký tự)"
            type="password"
            value={resetPassword}
            onChange={setResetPassword}
            required
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="h-9 px-3 rounded-lg bg-terracotta text-primary-foreground text-xs font-medium"
            >
              Đặt lại
            </button>
            <button
              type="button"
              onClick={() => {
                setResetId(null);
                setResetPassword("");
              }}
              className="h-9 px-3 rounded-lg border border-border text-xs"
            >
              Hủy
            </button>
          </div>
        </form>
      ) : null}

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Người dùng</th>
                <th className="px-4 py-2.5 font-medium hidden sm:table-cell">SĐT</th>
                <th className="px-4 py-2.5 font-medium hidden sm:table-cell">
                  Role
                </th>
                <th className="px-4 py-2.5 font-medium">Trạng thái</th>
                <th className="px-4 py-2.5 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {u.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{u.username}
                    </p>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {editPhoneId === u.id ? (
                      <form
                        onSubmit={(e) => { e.preventDefault(); savePhone(u); }}
                        className="flex items-center gap-1"
                      >
                        <input
                          autoFocus
                          type="tel"
                          value={editPhoneValue}
                          onChange={(e) => setEditPhoneValue(e.target.value)}
                          className="h-7 w-32 px-2 rounded-md border border-border text-xs bg-background"
                        />
                        <button type="submit" disabled={busy} className="text-xs text-terracotta hover:underline">Lưu</button>
                        <button type="button" onClick={() => setEditPhoneId(null)} className="text-xs text-muted-foreground hover:underline">Huỷ</button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        onClick={() => { setEditPhoneId(u.id); setEditPhoneValue(u.phone ?? ""); }}
                      >
                        {u.phone || <span className="italic text-muted-foreground/50">Thêm SĐT</span>}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <select
                      value={u.role}
                      disabled={busy || u.id === me.id}
                      onChange={(e) =>
                        changeRole(u, e.target.value as Role)
                      }
                      className="h-8 px-2 rounded-md border border-border bg-background text-xs"
                    >
                      <option value="admin">{ROLE_LABEL.admin}</option>
                      <option value="user">{ROLE_LABEL.user}</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.is_active
                          ? "inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"
                          : "inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-500"
                      }
                    >
                      {u.is_active ? "Hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setResetId(u.id)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Reset MK
                    </button>
                    <button
                      type="button"
                      disabled={busy || u.id === me.id}
                      onClick={() => toggleActive(u)}
                      className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      {u.is_active ? "Khóa" : "Mở"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-2 rounded-lg border border-border bg-background text-sm"
      />
    </div>
  );
}
