import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared filter row for list/workspace pages. */
export function PageFilterBar({
  search,
  children,
  className,
}: {
  search?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return <div className={cn("mb-5 flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/75 p-3 shadow-sm sm:flex-row sm:items-center sm:gap-3", className)}>{search ? <div className="min-w-0 flex-1">{search}</div> : null}{children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}</div>;
}

/** Search field used across CRM list pages. */
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
  return <div className={cn("relative", className)}><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-ring focus:ring-4 focus:ring-ring/10" />{value ? <button type="button" onClick={() => onChange("")} aria-label="Xóa tìm kiếm" className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button> : null}</div>;
}
