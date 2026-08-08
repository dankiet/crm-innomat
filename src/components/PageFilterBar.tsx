import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Hàng filter dưới PageHeader: search (trái) + controls (phải). */
export function PageFilterBar({
  search,
  children,
  className,
}: {
  search?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3",
        className,
      )}
    >
      {search ? <div className="relative flex-1 min-w-0">{search}</div> : null}
      {children ? (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Ô search thống nhất (style gần trang Sản phẩm). */
export function PageSearchInput({
  value,
  onChange,
  placeholder = "Tìm…",
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full text-sm pl-10 pr-9 rounded-full bg-transparent border border-border/80 outline-none focus:border-terracotta/50 focus:ring-2 focus:ring-terracotta/15 text-foreground placeholder:text-muted-foreground/60"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Xoá tìm kiếm"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
