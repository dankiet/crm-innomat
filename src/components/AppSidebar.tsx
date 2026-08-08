import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Target,
  FileText,
  Wallet,
  StickyNote,
  Table2,
  Hexagon,
  BrickWall,
  LayoutGrid,
  LayoutPanelTop,
  X,
  UserCog,
  ScrollText,
  LogOut,
} from "lucide-react";
import { PRODUCT_GROUPS } from "@/lib/product-categories";
import { useEffect } from "react";
import type { SessionUser } from "@/lib/auth-types";
import { ROLE_LABEL, initialsFromName } from "@/lib/auth-types";
import { logoutFn } from "@/api/functions";

const mainNav = [
  { to: "/tong-quan", label: "Tổng Quan", icon: LayoutDashboard },
  { to: "/khach-hang", label: "Khách Hàng", icon: Users },
  { to: "/co-hoi", label: "Cơ Hội", icon: Target },
  { to: "/bao-gia", label: "Báo Giá & Đơn Hàng", icon: FileText },
  { to: "/cong-no", label: "Công Nợ", icon: Wallet },
  { to: "/ghi-chu", label: "Ghi Chú", icon: StickyNote },
] as const;

const adminNav = [
  { to: "/nguoi-dung", label: "Người Dùng", icon: UserCog },
  { to: "/nhat-ky", label: "Nhật Ký", icon: ScrollText },
] as const;

const productIcons: Record<string, typeof LayoutGrid> = {
  "tat-ca": LayoutGrid,
  "gach-the": BrickWall,
  "gach-mosaic": Table2,
  "gach-bong": Hexagon,
  "gach-op-lat": LayoutPanelTop,
};

type Props = {
  user: SessionUser;
  /** Mobile drawer open */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export function AppSidebar({
  user,
  mobileOpen = false,
  onMobileClose,
}: Props) {
  const router = useRouter();
  const { pathname, search } = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      search: s.location.search as { nhom?: string },
    }),
  });

  // Close drawer on route change (mobile)
  useEffect(() => {
    onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search?.nhom]);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  async function onLogout() {
    try {
      await logoutFn();
    } catch {
      /* still leave */
    }
    await router.navigate({ to: "/login" });
  }

  const nav = (
    <>
      <div className="p-5 flex items-center gap-3">
        <img
          src="/logo.png"
          alt="Innomat"
          width={36}
          height={36}
          className="size-9 rounded-lg object-contain bg-white ring-1 ring-black/5 flex-shrink-0 p-0.5"
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium tracking-tight text-foreground text-sm">
            Innomat CRM
          </p>
          <p className="text-[10px] text-muted-foreground">Showroom Manager</p>
        </div>
        {onMobileClose ? (
          <button
            type="button"
            onClick={onMobileClose}
            className="lg:hidden size-9 grid place-items-center rounded-lg text-muted-foreground hover:bg-surface-strong hover:text-foreground"
            aria-label="Đóng menu"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto overscroll-contain pb-4">
        <div className="pt-2 pb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Quản lý
        </div>
        {mainNav.map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => onMobileClose?.()}
              className={
                active
                  ? "flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-foreground bg-surface-strong rounded-lg shadow-sm ring-1 ring-black/5"
                  : "flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:bg-surface-strong/50 rounded-lg transition-colors active:bg-surface-strong"
              }
            >
              <Icon
                className={
                  active
                    ? "size-4 flex-shrink-0 text-terracotta"
                    : "size-4 flex-shrink-0 text-muted-foreground/70"
                }
              />
              {item.label}
            </Link>
          );
        })}

        <div className="pt-4 pb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Sản phẩm
        </div>
        {PRODUCT_GROUPS.map((g) => {
          const active = pathname === "/san-pham" && search?.nhom === g.slug;
          const Icon = productIcons[g.slug] ?? LayoutGrid;
          return (
            <Link
              key={g.slug}
              to="/san-pham"
              search={{ nhom: g.slug }}
              onClick={() => onMobileClose?.()}
              className={
                active
                  ? "flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-foreground bg-surface-strong rounded-lg shadow-sm ring-1 ring-black/5"
                  : "flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:bg-surface-strong/50 rounded-lg transition-colors active:bg-surface-strong"
              }
            >
              <Icon
                className={
                  active
                    ? "size-4 flex-shrink-0 text-terracotta"
                    : "size-4 flex-shrink-0 text-muted-foreground/70"
                }
              />
              {g.label}
            </Link>
          );
        })}

        {user.role === "admin" ? (
          <>
            <div className="pt-4 pb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Hệ thống
            </div>
            {adminNav.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => onMobileClose?.()}
                  className={
                    active
                      ? "flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-foreground bg-surface-strong rounded-lg shadow-sm ring-1 ring-black/5"
                      : "flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:bg-surface-strong/50 rounded-lg transition-colors active:bg-surface-strong"
                  }
                >
                  <Icon
                    className={
                      active
                        ? "size-4 flex-shrink-0 text-terracotta"
                        : "size-4 flex-shrink-0 text-muted-foreground/70"
                    }
                  />
                  {item.label}
                </Link>
              );
            })}
          </>
        ) : null}
      </nav>

      <div className="p-4 border-t border-border safe-pb space-y-2">
        <div className="flex items-center gap-2 px-1">
          <div className="size-8 bg-surface-strong ring-1 ring-black/5 rounded-full grid place-items-center flex-shrink-0 text-xs font-medium text-foreground">
            {initialsFromName(user.display_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground truncate">
              {user.display_name}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {ROLE_LABEL[user.role]}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="size-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-surface-strong hover:text-foreground"
            title="Đăng xuất"
            aria-label="Đăng xuất"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 flex-shrink-0 flex-col border-r border-border bg-surface">
        {nav}
      </aside>

      {/* Mobile drawer */}
      <div
        className={
          mobileOpen
            ? "lg:hidden fixed inset-0 z-50"
            : "lg:hidden fixed inset-0 z-50 pointer-events-none"
        }
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          className={
            mobileOpen
              ? "absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity"
              : "absolute inset-0 bg-black/0 transition-opacity"
          }
          onClick={onMobileClose}
          aria-label="Đóng menu"
          tabIndex={mobileOpen ? 0 : -1}
        />
        <aside
          className={
            mobileOpen
              ? "absolute inset-y-0 left-0 w-[min(18rem,88vw)] flex flex-col bg-surface border-r border-border shadow-xl transition-transform duration-200 ease-out translate-x-0 safe-pt"
              : "absolute inset-y-0 left-0 w-[min(18rem,88vw)] flex flex-col bg-surface border-r border-border shadow-xl transition-transform duration-200 ease-out -translate-x-full"
          }
        >
          {nav}
        </aside>
      </div>
    </>
  );
}
