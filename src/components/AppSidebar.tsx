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
  Images,
  ChevronRight,
  Inbox,
  Layers3,
  Sparkles,
} from "lucide-react";
import { ALL_PRODUCTS_SLUG, PRODUCT_GROUPS } from "@/lib/product-categories";
import { Fragment, useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth-types";
import { ROLE_LABEL, initialsFromName } from "@/lib/auth-types";
import { logoutFn, fetchProductFieldValues } from "@/api/functions";
import { useHistoryLayer } from "@/hooks/useHistoryLayer";

const navGroups = [
  {
    label: "Workspace",
    items: [{ to: "/tong-quan", label: "Tổng quan", icon: LayoutDashboard }],
  },
  {
    label: "Bán hàng",
    items: [
      { to: "/khach-hang", label: "Khách hàng", icon: Users },
      { to: "/co-hoi", label: "Cơ hội", icon: Target },
      { to: "/bao-gia", label: "Báo giá", icon: FileText },
      { to: "/ghi-chu", label: "Ghi chú", icon: StickyNote },
    ],
  },
  {
    label: "Tài chính",
    items: [{ to: "/cong-no", label: "Công nợ", icon: Wallet }],
  },
  {
    label: "Landing Page",
    items: [
      { to: "/leads", label: "Hộp thư Lead", icon: Inbox },
      { to: "/khong-gian", label: "Lookbook", icon: Layers3 },
      { to: "/luu-tru", label: "Kho ảnh", icon: Images },
    ],
  },
] as const;

const adminNav = [
  { to: "/nguoi-dung", label: "Người dùng", icon: UserCog },
  { to: "/nhat-ky", label: "Nhật ký", icon: ScrollText },
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
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  search?: { nhom: string };
};

/**
 * True when activating this item cannot change pathname/search (already on the
 * exact target). Those taps must close the drawer themselves — the
 * [pathname, search] close-effect will not fire. Taps that DO navigate must
 * NOT close here: closing in the same click races the router commit and can
 * cancel the navigation (mobile "Sản phẩm" did nothing).
 */
function closesWithoutNavigation(
  item: { to: string; search?: { nhom?: string } },
  pathname: string,
  nhom?: string,
): boolean {
  if (pathname !== item.to) return false;
  return (item.search?.nhom ?? undefined) === (nhom ?? undefined);
}

function NavLink({
  item,
  active,
  onClick,
  expandable = false,
  expanded = false,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
  expandable?: boolean;
  expanded?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      {...(item.search ? { search: item.search } : {})}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm transition-all duration-150 ${
        active
          ? "border-primary bg-accent font-semibold text-accent-foreground shadow-sm"
          : "border-transparent text-muted-foreground hover:bg-accent/70 hover:text-foreground"
      }`}
    >
      <Icon className={`size-[17px] shrink-0 ${active ? "text-primary" : "text-muted-foreground/75 group-hover:text-primary"}`} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {expandable ? (
        <ChevronRight className={`size-3.5 text-primary/70 transition-transform ${expanded ? "rotate-90" : ""}`} />
      ) : active ? (
        <ChevronRight className="size-3.5 text-primary/70" />
      ) : null}
    </Link>
  );
}

export function AppSidebar({ user, mobileOpen = false, onMobileClose }: Props) {
  const router = useRouter();
  const { pathname, search } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      search: state.location.search as { nhom?: string },
    }),
  });

  useHistoryLayer(Boolean(mobileOpen && onMobileClose), () => {
    onMobileClose?.();
  });

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    // The closer for taps that navigate: fires after the router has committed
    // (pathname/search changed), never in the same tick as the click.
    onMobileClose?.();
  }, [pathname, search?.nhom]);

  async function onLogout() {
    try {
      await logoutFn();
    } catch {
      // Still leave the protected area if the server session is already gone.
    }
    await router.navigate({ to: "/login" });
  }

  const displayName = user.display_name || user.username;
  const isCatalogActive = pathname === "/san-pham";
  const isLibraryActive = pathname === "/thu-vien";
  const currentNhom = search?.nhom;
  const [catalogExpanded, setCatalogExpanded] = useState(isCatalogActive);
  useEffect(() => {
    setCatalogExpanded(isCatalogActive);
    if (!isCatalogActive) setExpandedSizeGroup(null);
  }, [isCatalogActive]);
  const [expandedSizeGroup, setExpandedSizeGroup] = useState<string | null>(null);
  const [sizeOptions, setSizeOptions] = useState<string[]>([]);
  useEffect(() => {
    const group = PRODUCT_GROUPS.find((item) => item.slug === expandedSizeGroup);
    if (!group || (group.slug !== "gach-bong" && group.slug !== "gach-op-lat")) {
      setSizeOptions([]);
      return;
    }
    let cancelled = false;
    void fetchProductFieldValues({ data: { field: "size", category: group.category } })
      .then((values) => {
        if (!cancelled) setSizeOptions(values);
      })
      .catch(() => {
        if (!cancelled) setSizeOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [expandedSizeGroup]);
  /** Close drawer on tap only when the tap cannot navigate (already there). */
  const linkCloseHandler = (item: { to: string; search?: { nhom?: string } }) =>
    closesWithoutNavigation(item, pathname, currentNhom) ? onMobileClose : undefined;

  const nav = (
    <>
      <div className="flex items-center gap-3 border-b border-border/70 px-5 py-5">
        <img
          src="/logo.png"
          alt="Innomat"
          width={38}
          height={38}
          className="size-9 rounded-xl object-contain bg-white p-1 ring-1 ring-black/5"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold tracking-tight text-foreground">Innomat CRM</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Showroom workspace</p>
        </div>
        {onMobileClose ? (
          <button type="button" onClick={onMobileClose} className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden" aria-label="Đóng menu">
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-5 pb-6">
        {navGroups.map((group) => {
          return (
            <section key={group.label}>
              <div className="mb-2 px-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/75">
                  {group.label}
                </p>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    item={item}
                    active={pathname === item.to}
                    onClick={linkCloseHandler(item)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <section>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/75">Catalog</p>
          <div className="space-y-1">
            <NavLink
              item={{
                to: "/san-pham",
                label: "Sản phẩm",
                icon: LayoutGrid,
                search: { nhom: ALL_PRODUCTS_SLUG },
              }}
              active={isCatalogActive}
              expandable
              expanded={catalogExpanded}
              onClick={() => {
                setCatalogExpanded(true);
                linkCloseHandler({ to: "/san-pham", search: { nhom: ALL_PRODUCTS_SLUG } })?.();
              }}
            />
            {catalogExpanded ? (
              <div className={`ml-4 border-l pl-3 ${isCatalogActive ? "border-primary/30" : "border-border/70"}`}>
              {PRODUCT_GROUPS.map((group) => {
                const Icon = productIcons[group.slug] ?? LayoutGrid;
                const active = isCatalogActive && search?.nhom === group.slug;
                return (
                  <Fragment key={group.slug}>
                    <Link
                      to="/san-pham"
                      search={{ nhom: group.slug }}
                      onClick={() => {
                        if (group.slug === "gach-bong" || group.slug === "gach-op-lat") {
                          setExpandedSizeGroup((current) => current === group.slug ? null : group.slug);
                        }
                        if (active) onMobileClose?.();
                      }}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                        active ? "font-semibold text-primary" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{group.label}</span>
                      {group.slug === "gach-bong" || group.slug === "gach-op-lat" ? (
                        <ChevronRight className={`size-3 transition-transform ${expandedSizeGroup === group.slug ? "rotate-90" : ""}`} />
                      ) : null}
                    </Link>
                    {expandedSizeGroup === group.slug ? (
                      <div className="ml-5 border-l border-border/70 pl-2">
                        {sizeOptions.map((size) => (
                          <Link
                            key={size}
                            to="/san-pham"
                            search={{ nhom: group.slug, sizes: [size] }}
                            onClick={active ? onMobileClose : undefined}
                            className="block truncate rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                          >
                            {size}
                          </Link>
                        ))}
                        {!sizeOptions.length ? (
                          <span className="block px-2 py-1.5 text-[11px] text-muted-foreground/70">Đang tải kích thước…</span>
                        ) : null}
                      </div>
                    ) : null}
                  </Fragment>
                );
              })}
              </div>
            ) : null}
            <NavLink
              item={{ to: "/thu-vien", label: "Thư viện", icon: Images }}
              active={isLibraryActive}
              onClick={linkCloseHandler({ to: "/thu-vien" })}
            />
          </div>
        </section>

        {user.role === "admin" ? (
          <section>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/75">Quản trị</p>
            <div className="space-y-1">
              {adminNav.map((item) => (
                <NavLink
                  key={item.to}
                  item={item}
                  active={pathname === item.to}
                  onClick={linkCloseHandler(item)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </nav>

      <div className="space-y-2 border-t border-border/70 p-4 safe-pb">
        <div className="flex items-center gap-3 rounded-xl bg-accent/55 p-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{initialsFromName(displayName)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{ROLE_LABEL[user.role]}</p>
          </div>
        </div>
        <button type="button" onClick={() => void onLogout()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label="Đăng xuất">
          <LogOut className="size-4" />
          Đăng xuất
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className="relative z-40 hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">{nav}</aside>
      <div className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden={!mobileOpen}>
        <button type="button" className={`absolute inset-0 bg-black/30 backdrop-blur-[1px] transition-opacity ${mobileOpen ? "opacity-100" : "opacity-0"}`} onClick={onMobileClose} aria-label="Đóng menu" tabIndex={mobileOpen ? 0 : -1} />
        <aside className={`absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col border-r border-border bg-card shadow-2xl transition-transform duration-200 ease-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>{nav}</aside>
      </div>
    </>
  );
}
