import * as React from "react";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  /** Số item đang chọn — hiện badge & đổi style active */
  count?: number;
  /** Tóm tắt hiển thị khi có 1 giá trị (vd "300–500k") */
  summary?: string | null;
  children: React.ReactNode;
  className?: string;
};

/** Chip filter dạng pill, mở popover khi click */
export function FilterChip({
  label,
  count = 0,
  summary,
  children,
  className,
}: Props) {
  const active = count > 0 || Boolean(summary);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-9 shrink-0 px-3 rounded-full text-sm font-medium inline-flex items-center gap-1.5 transition-colors",
            active
              ? "bg-terracotta-soft text-terracotta ring-1 ring-terracotta/30"
              : "border border-border text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
            className,
          )}
        >
          <span>{label}</span>
          {summary ? (
            <span className="text-foreground/90">· {summary}</span>
          ) : count > 0 ? (
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-semibold tabular-nums",
                "bg-terracotta text-primary-foreground",
              )}
            >
              {count}
            </span>
          ) : null}
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">{children}</PopoverContent>
    </Popover>
  );
}
