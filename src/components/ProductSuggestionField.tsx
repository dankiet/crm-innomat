import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function ProductSuggestionField({
  value,
  options,
  onChange,
  placeholder = "Chọn hoặc thêm giá trị…",
  label = "giá trị",
  disabled = false,
  loading = false,
  error,
  onRetry,
  canManageOptions = false,
  onDeleteOption,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  canManageOptions?: boolean;
  onDeleteOption?: (option: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => { if (!open) setQuery(""); }, [open]);
  const uniqueOptions = useMemo(() => Array.from(new Map(options.filter(Boolean).map((option) => [normalize(option), option])).values()), [options]);
  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return uniqueOptions;
    return uniqueOptions.filter((option) => normalize(option).includes(q));
  }, [query, uniqueOptions]);
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  const hasExact = uniqueOptions.some((option) => normalize(option) === normalize(normalizedQuery));
  const canCreate = Boolean(normalizedQuery) && !hasExact;

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button type="button" disabled={disabled} aria-expanded={open} className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 text-left text-sm text-foreground outline-none transition-colors hover:border-primary/35 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/10 disabled:cursor-not-allowed disabled:opacity-60"><span className={value ? "truncate" : "truncate text-muted-foreground/70"}>{value || placeholder}</span><ChevronDown className={`size-4 shrink-0 text-muted-foreground/70 transition-transform ${open ? "rotate-180" : ""}`} /></button></PopoverTrigger><PopoverContent align="start" sideOffset={6} className="w-[var(--radix-popover-trigger-width)] min-w-[280px] overflow-hidden rounded-xl border-border bg-card p-0 shadow-xl"><div className="border-b border-border/70 p-2"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/65" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Tìm hoặc thêm ${label}…`} className="h-9 w-full rounded-lg border border-border bg-background px-9 pr-3 text-sm outline-none focus:border-ring focus:ring-4 focus:ring-ring/10" /></div></div><div className="max-h-64 overflow-y-auto p-1.5">{loading ? <div className="flex items-center gap-2 px-3 py-6 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" />Đang tải dữ liệu gợi ý…</div> : error ? <div className="space-y-2 px-3 py-5 text-xs text-destructive"><p>{error}</p>{onRetry ? <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 font-semibold hover:underline"><RotateCcw className="size-3.5" />Thử lại</button> : null}</div> : <>{filtered.map((option) => <div key={option} className="group flex items-center gap-1 rounded-lg hover:bg-accent"><button type="button" onClick={() => choose(option)} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-sm text-foreground"><Check className={`size-4 shrink-0 ${normalize(value) === normalize(option) ? "text-primary" : "text-transparent"}`} /><span className="truncate">{option}</span></button>{canManageOptions && onDeleteOption ? <button type="button" onClick={() => onDeleteOption(option)} aria-label={`Xóa ${option} khỏi dữ liệu sản phẩm`} className="mr-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"><Trash2 className="size-3.5" /></button> : null}</div>)}{filtered.length === 0 && !canCreate ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">Không tìm thấy {label} phù hợp.</p> : null}{canCreate ? <button type="button" onClick={() => choose(normalizedQuery)} className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-lg border-t border-border/70 px-2.5 text-left text-sm font-semibold text-primary hover:bg-primary/5"><Plus className="size-4 shrink-0" /><span className="truncate">Thêm giá trị mới: {normalizedQuery}</span></button> : null}</>}</div>{value ? <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/20 px-3 py-2"><span className="truncate text-[11px] text-muted-foreground">Đang chọn: <b className="text-foreground">{value}</b></span><button type="button" onClick={() => choose("")} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"><X className="size-3.5" />Bỏ chọn</button></div> : null}</PopoverContent></Popover>;
}
