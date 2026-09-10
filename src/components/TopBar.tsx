import { useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { Menu, FilePlus2, Map, Plus, Globe, ExternalLink } from "lucide-react";
import { NewCustomerDialog } from "@/components/NewCustomerDialog";
import { NewQuoteDialog } from "@/components/NewQuoteDialog";
import { CustomerMappingDialog } from "@/components/CustomerMappingDialog";
import { PUBLIC_LANDING_PATH } from "@/lib/lp-content";

type Props = {
  onMenuClick?: () => void;
};

const pageTitles: Record<string, { eyebrow: string; title: string }> = {
  "/tong-quan": { eyebrow: "Workspace", title: "Tổng quan" },
  "/khach-hang": { eyebrow: "Bán hàng", title: "Khách hàng" },
  "/co-hoi": { eyebrow: "Bán hàng", title: "Cơ hội" },
  "/bao-gia": { eyebrow: "Bán hàng", title: "Báo giá & đơn hàng" },
  "/cong-no": { eyebrow: "Tài chính", title: "Công nợ" },
  "/ghi-chu": { eyebrow: "Vận hành", title: "Ghi chú" },
  "/thu-vien": { eyebrow: "Catalog", title: "Thư viện" },
  "/san-pham": { eyebrow: "Catalog", title: "Sản phẩm" },
  "/leads": { eyebrow: "Landing Page", title: "Hộp thư Lead" },
  "/mau-trang-chu": { eyebrow: "Landing Page", title: "Tuyển chọn Trang chủ" },
  "/khong-gian": { eyebrow: "Landing Page", title: "Lookbook Không gian" },
  "/nguoi-dung": { eyebrow: "Quản trị", title: "Người dùng" },
  "/nhat-ky": { eyebrow: "Vận hành", title: "Nhật ký" },
};

export function TopBar({ onMenuClick }: Props) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [customerOpen, setCustomerOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const page = pageTitles[pathname] ?? { eyebrow: "Workspace", title: "Innomat CRM" };

  return (
    <>
      <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-border/70 bg-surface/85 px-4 backdrop-blur-xl sm:px-6">
        <button type="button" onClick={onMenuClick} className="grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden" aria-label="Mở menu">
          <Menu className="size-5" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground sm:block">{page.eyebrow}</p>
          <h1 className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">{page.title}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Nút mở Landing Page nổi bật ở Header */}
          <a
            href={PUBLIC_LANDING_PATH}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-xl border border-terracotta/30 bg-terracotta/10 px-3 text-xs font-semibold text-terracotta hover:bg-terracotta/20 transition-all shadow-2xs"
            title="Mở Landing Page Em Bán Gạch (tab mới)"
          >
            <Globe className="size-3.5" />
            <span className="hidden sm:inline">Xem Landing Page</span>
            <ExternalLink className="size-3 opacity-70" />
          </a>

          <button type="button" onClick={() => setCustomerOpen(true)} className="inline-flex h-9 sm:h-10 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:px-4" aria-label="Tạo khách hàng mới">
            <Plus className="size-4" />
            <span className="hidden sm:inline">Khách hàng mới</span>
          </button>
          <div className="hidden items-center gap-1.5 md:flex">
            <button type="button" onClick={() => setQuoteOpen(true)} className="inline-flex h-9 sm:h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Tạo báo giá">
              <FilePlus2 className="size-3.5" />
              Báo giá
            </button>
            <button type="button" onClick={() => setMappingOpen(true)} className="inline-flex h-9 sm:h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Mở mapping khách hàng">
              <Map className="size-3.5" />
              Mapping
            </button>
          </div>
        </div>
      </header>

      <NewCustomerDialog open={customerOpen} onOpenChange={setCustomerOpen} />
      <NewQuoteDialog open={quoteOpen} onOpenChange={setQuoteOpen} />
      <CustomerMappingDialog open={mappingOpen} onOpenChange={setMappingOpen} onSaved={() => void router.invalidate()} />
    </>
  );
}


