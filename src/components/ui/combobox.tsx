"use client";

import * as React from "react";
import { ChevronsUpDown, Plus, Check, X, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

type ComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  /** Cho phép gõ giá trị mới chưa có trong options (mặc định: true) */
  allowCreate?: boolean;
  /** Xóa hẳn 1 option sai/dư khỏi danh sách gợi ý (áp dụng cho mọi sản phẩm đang dùng) */
  onDeleteOption?: (value: string) => void;
  /** Các option không cho xóa (vd. giá trị chuẩn/cố định) — ẩn nút xóa với các option này */
  nonDeletableOptions?: readonly string[];
};

/**
 * Dropdown có gợi ý (autocomplete) — chọn 1 giá trị có sẵn trong `options`
 * hoặc gõ tự do để tạo giá trị mới (nếu allowCreate).
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Chọn hoặc gõ để tìm…",
  emptyText = "Không có gợi ý phù hợp",
  className,
  disabled,
  allowCreate = true,
  onDeleteOption,
  nonDeletableOptions,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  const trimmedQuery = query.trim();
  const exactMatch = options.some(
    (o) => o.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const showCreate = allowCreate && trimmedQuery.length > 0 && !exactMatch;

  function selectValue(v: string) {
    onChange(v);
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setPendingDelete(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "w-full flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-md bg-background ring-1 ring-black/10 outline-none focus:ring-terracotta/40 text-foreground disabled:opacity-50 disabled:cursor-not-allowed",
            className,
          )}
        >
          <span className={cn("truncate text-left", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {value && !disabled ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Xóa lựa chọn"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                  setQuery("");
                  setOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    onChange("");
                    setQuery("");
                    setOpen(false);
                  }
                }}
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-surface-strong"
              >
                <X className="size-3.5" />
              </span>
            ) : null}
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        portalled={false}
      >
        <Command shouldFilter>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Gõ để tìm hoặc tạo mới…"
          />
          <CommandList className="overscroll-contain touch-pan-y">
            {showCreate ? (
              <CommandGroup>
                <CommandItem value={`__create__${trimmedQuery}`} onSelect={() => selectValue(trimmedQuery)}>
                  <Plus className="size-3.5 text-terracotta" />
                  Tạo mới “{trimmedQuery}”
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o}
                  value={o}
                  onSelect={() => selectValue(o)}
                  className="group"
                >
                  <Check
                    className={cn(
                      "size-3.5 shrink-0",
                      value === o ? "opacity-100 text-terracotta" : "opacity-0",
                    )}
                  />
                  <span className="flex-1 truncate">{o}</span>
                  {onDeleteOption && !nonDeletableOptions?.includes(o) ? (
                    pendingDelete === o ? (
                      <span className="flex items-center gap-1 shrink-0">
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Xác nhận xóa "${o}"`}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setPendingDelete(null);
                            onDeleteOption(o);
                          }}
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-red-600 text-white hover:bg-red-700"
                        >
                          Xóa
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="Hủy"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setPendingDelete(null);
                          }}
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-black/10 hover:bg-surface-strong"
                        >
                          Hủy
                        </span>
                      </span>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Xóa "${o}" khỏi danh sách gợi ý`}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setPendingDelete(o);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            e.preventDefault();
                            setPendingDelete(o);
                          }
                        }}
                        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="size-3.5" />
                      </span>
                    )
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
