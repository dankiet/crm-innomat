import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export type SortFieldOption<F extends string> = {
  field: F;
  label: string;
  shortLabel?: string;
  /** false = one-shot field, no ↑↓ toggle */
  bidirectional?: boolean;
  /** dir when selecting this field */
  defaultDir?: SortDir;
  ascHint?: string;
  descHint?: string;
};

export type SortDecoded<F extends string> = {
  field: F;
  dir?: SortDir;
};

export type SortMenuProps<T extends string, F extends string> = {
  value: T;
  defaultValue: T;
  fields: SortFieldOption<F>[];
  decode: (value: T) => SortDecoded<F>;
  encode: (field: F, dir: SortDir) => T;
  onChange: (value: T) => void;
  triggerLabel?: string;
  align?: "start" | "end";
  className?: string;
};

export function SortMenu<T extends string, F extends string>({
  value,
  defaultValue,
  fields,
  decode,
  encode,
  onChange,
  triggerLabel = "Sắp xếp",
  align = "end",
  className,
}: SortMenuProps<T, F>) {
  const [open, setOpen] = useState(false);
  const decoded = decode(value);
  const currentField =
    fields.find((f) => f.field === decoded.field) ?? fields[0];
  // Show ↑↓ whenever the current field supports two directions — including when
  // the wire value is still the page default (e.g. gallery created_desc), so the
  // user can flip to the other dir without picking another field first.
  const showDirToggle =
    currentField != null && currentField.bidirectional !== false;
  const dir: SortDir = decoded.dir ?? currentField?.defaultDir ?? "asc";
  const isDefaultWire = value === defaultValue;
  // Emphasize whenever we show a concrete field (incl. bidirectional defaults).
  const emphasized = !isDefaultWire || showDirToggle;

  const display = emphasized
    ? (currentField?.shortLabel ?? currentField?.label ?? triggerLabel)
    : triggerLabel;

  function selectField(field: SortFieldOption<F>) {
    onChange(encode(field.field, field.defaultDir ?? "asc"));
    setOpen(false);
  }

  function setDir(next: SortDir) {
    if (!currentField || currentField.bidirectional === false) return;
    onChange(encode(currentField.field, next));
  }

  return (
    <div
      className={cn(
        "inline-flex h-8 shrink-0 items-stretch rounded-lg text-xs font-medium ring-1 ring-black/5 overflow-hidden",
        emphasized
          ? "bg-surface-strong text-foreground"
          : "bg-card text-muted-foreground",
        className,
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 transition-colors hover:text-foreground",
              showDirToggle ? "pr-1.5" : "",
            )}
          >
            <ArrowUpDown className="size-3.5 opacity-70 shrink-0" />
            <span className="max-w-[9rem] truncate">{display}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-52 p-2">
          <p className="text-xs font-medium text-foreground px-2 pb-1.5">
            Sắp xếp theo
          </p>
          <div className="space-y-0.5">
            {fields.map((field) => {
              const selected = decoded.field === field.field;
              return (
                <button
                  key={field.field}
                  type="button"
                  onClick={() => selectField(field)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                    selected
                      ? "bg-terracotta-soft text-foreground"
                      : "hover:bg-surface-strong/70 text-foreground",
                  )}
                >
                  <span className="flex-1 truncate">{field.label}</span>
                  {selected ? (
                    <Check
                      className="size-3.5 shrink-0 text-terracotta"
                      strokeWidth={2.5}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {showDirToggle ? (
        <div className="flex items-center border-l border-border/70 p-0.5 gap-0.5">
          <button
            type="button"
            title={currentField?.ascHint ?? "Tăng dần"}
            aria-label={currentField?.ascHint ?? "Tăng dần"}
            aria-pressed={dir === "asc"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDir("asc");
            }}
            className={cn(
              "size-7 grid place-items-center rounded-md transition-colors",
              dir === "asc"
                ? "bg-card text-foreground shadow-sm ring-1 ring-black/5"
                : "text-muted-foreground hover:text-foreground hover:bg-card/60",
            )}
          >
            <ArrowUp className="size-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            title={currentField?.descHint ?? "Giảm dần"}
            aria-label={currentField?.descHint ?? "Giảm dần"}
            aria-pressed={dir === "desc"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDir("desc");
            }}
            className={cn(
              "size-7 grid place-items-center rounded-md transition-colors",
              dir === "desc"
                ? "bg-card text-foreground shadow-sm ring-1 ring-black/5"
                : "text-muted-foreground hover:text-foreground hover:bg-card/60",
            )}
          >
            <ArrowDown className="size-3.5" strokeWidth={2.5} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
