import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Menu, FilePlus2, UserPlus, Map } from "lucide-react";
import { NewCustomerDialog } from "@/components/NewCustomerDialog";
import { NewQuoteDialog } from "@/components/NewQuoteDialog";
import { CustomerMappingDialog } from "@/components/CustomerMappingDialog";

type Props = {
  onMenuClick?: () => void;
};

export function TopBar({ onMenuClick }: Props) {
  const router = useRouter();
  const [customerOpen, setCustomerOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);

  return (
    <>
      <header className="h-14 min-h-14 border-b border-border bg-surface/80 backdrop-blur-sm flex items-center gap-2 px-3 sm:px-5 lg:px-8 flex-shrink-0 safe-pt sticky top-0 z-30">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden size-10 grid place-items-center rounded-xl text-foreground hover:bg-surface-strong active:bg-surface-strong/80 -ml-1"
          aria-label="Mở menu"
        >
          <Menu className="size-5" />
        </button>

        <div className="lg:hidden flex items-center gap-2 min-w-0 flex-1">
          <img
            src="/logo.png"
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-md object-contain bg-white ring-1 ring-black/5 p-0.5 flex-shrink-0"
          />
          <span className="text-sm font-medium tracking-tight truncate">
            Innomat CRM
          </span>
        </div>

        <div className="hidden lg:block flex-1" />

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setQuoteOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground h-9 px-2.5 sm:px-3 bg-card ring-1 ring-black/5 rounded-lg shadow-sm hover:bg-surface-strong transition-colors active:scale-[0.98]"
          >
            <FilePlus2 className="size-3.5 sm:hidden" />
            <span className="hidden sm:inline">Tạo báo giá</span>
            <span className="sm:hidden">Báo giá</span>
          </button>
          <button
            type="button"
            onClick={() => setMappingOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground h-9 px-2.5 sm:px-3 bg-card ring-1 ring-black/5 rounded-lg shadow-sm hover:bg-surface-strong transition-colors active:scale-[0.98]"
          >
            <Map className="size-3.5 sm:hidden" />
            <span className="hidden sm:inline">Đề xuất vật liệu</span>
            <span className="sm:hidden">Vật liệu</span>
          </button>
          <button
            type="button"
            onClick={() => setCustomerOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-foreground h-9 px-2.5 sm:px-3 bg-terracotta rounded-lg shadow-sm hover:opacity-90 transition-opacity active:scale-[0.98]"
          >
            <UserPlus className="size-3.5 sm:hidden" />
            <span className="hidden sm:inline">+ Khách hàng mới</span>
            <span className="sm:hidden">+ KH</span>
          </button>
        </div>
      </header>

      <NewCustomerDialog open={customerOpen} onOpenChange={setCustomerOpen} />
      <NewQuoteDialog open={quoteOpen} onOpenChange={setQuoteOpen} />
      <CustomerMappingDialog
        open={mappingOpen}
        onOpenChange={setMappingOpen}
        onSaved={() => void router.invalidate()}
      />
    </>
  );
}
