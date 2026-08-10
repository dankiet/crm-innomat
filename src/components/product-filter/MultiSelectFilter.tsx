import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = {
  value: string;
  count: number;
  /** Hiển thị; mặc định = value (dùng khi value là key, label là tiếng Việt) */
  label?: string;
};

type Props = {
  title: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  emptyLabel?: string;
};

export function MultiSelectFilter({
  title,
  options,
  selected,
  onChange,
  searchable = false,
  emptyLabel = "Không có lựa chọn",
}: Props) {
  const [q, setQ] = useState("");
  const set = useMemo(() => new Set(selected), [selected]);

  const visible = useMemo(() => {
    if (!q.trim()) return options;
    const lc = q.toLowerCase();
    return options.filter((o) => {
      const text = (o.label ?? o.value).toLowerCase();
      return text.includes(lc) || o.value.toLowerCase().includes(lc);
    });
  }, [options, q]);

  const toggle = (v: string) => {
    if (set.has(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">{title}</p>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-muted-foreground hover:text-terracotta"
          >
            Bỏ chọn ({selected.length})
          </button>
        )}
      </div>

      {searchable && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm..."
            className="h-8 w-full text-sm pl-8 pr-2 rounded-md bg-transparent border border-border/80 outline-none focus:border-terracotta/50"
          />
        </div>
      )}

      <div className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-0.5">
        {visible.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            {emptyLabel}
          </p>
        ) : (
          visible.map((o) => {
            const on = set.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                  on
                    ? "bg-terracotta-soft text-foreground"
                    : "hover:bg-surface-strong/70 text-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-4 rounded border grid place-items-center flex-shrink-0",
                    on
                      ? "bg-terracotta border-terracotta text-primary-foreground"
                      : "border-border",
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="flex-1 truncate">{o.label ?? o.value}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {o.count}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
