import type { ReactNode } from "react";
import { FilePlus2, MapPin, Pencil, StickyNote } from "lucide-react";
import { statusMeta, type Customer } from "@/lib/types";
import { formatVND } from "@/lib/format";

export function CustomerCard({
  customer,
  debt = 0,
  onClick,
  onEdit,
  onNote,
  onQuote,
}: {
  customer: Customer;
  debt?: number;
  /** Default: mở ghi chú (nếu có onNote) */
  onClick?: () => void;
  onEdit?: () => void;
  onNote?: () => void;
  onQuote?: () => void;
}) {
  const status = statusMeta[customer.status];
  const hasDebt = debt > 0;
  const initial = customer.name.trim().charAt(0).toUpperCase() || "?";
  const primaryAction = onClick ?? onNote;

  return (
    <div
      role={primaryAction ? "button" : undefined}
      tabIndex={primaryAction ? 0 : undefined}
      onClick={primaryAction}
      onKeyDown={
        primaryAction
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") primaryAction();
            }
          : undefined
      }
      className={
        primaryAction
          ? "group bg-card ring-1 ring-black/5 rounded-xl p-5 flex flex-col gap-4 hover:ring-stone-300 hover:shadow-sm transition-all cursor-pointer"
          : "group bg-card ring-1 ring-black/5 rounded-xl p-5 flex flex-col gap-4"
      }
    >
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {customer.name}
            {customer.source ? ` · ${customer.source}` : ""}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${status.className}`}
            >
              {status.label}
            </span>
            {customer.region ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <MapPin className="size-3" />
                {customer.region}
              </span>
            ) : null}
          </div>
        </div>
        <div className="size-9 rounded-full ring-1 ring-black/5 flex-shrink-0 bg-surface-strong grid place-items-center text-xs font-medium text-foreground">
          {initial}
        </div>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {customer.phone ? <p>ĐT: {customer.phone}</p> : null}
        {customer.email ? (
          <p className="truncate" title={customer.email}>
            Email: {customer.email}
          </p>
        ) : null}
        {customer.company ? (
          <p className="truncate" title={customer.company}>
            CT: {customer.company}
          </p>
        ) : null}
        {customer.owner_name ? (
          <p className="text-[11px]">
            Sales:{" "}
            <span className="font-medium text-foreground/80">
              {customer.owner_name}
            </span>
          </p>
        ) : null}
        {customer.note ? (
          <p className="line-clamp-2 text-foreground/80">{customer.note}</p>
        ) : (
          <p className="text-muted-foreground/70 italic">Chưa có ghi chú lead</p>
        )}
        <p className="text-[10px]">Cập nhật: {customer.updated_at}</p>
      </div>

      <div className="pt-4 mt-auto border-t border-border flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            {hasDebt ? "Công nợ" : "Trạng thái"}
          </p>
          <p
            className={
              hasDebt
                ? "text-sm font-medium text-terracotta truncate"
                : "text-sm font-medium text-foreground truncate"
            }
          >
            {hasDebt ? formatVND(debt) : status.label}
          </p>
        </div>
        <div
          className="flex items-center gap-0.5 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {onNote ? (
            <ActionBtn title="Ghi chú" onClick={onNote}>
              <StickyNote className="size-3.5" />
            </ActionBtn>
          ) : null}
          {onQuote ? (
            <ActionBtn title="Tạo báo giá" onClick={onQuote}>
              <FilePlus2 className="size-3.5" />
            </ActionBtn>
          ) : null}
          {onEdit ? (
            <ActionBtn title="Sửa khách hàng" onClick={onEdit}>
              <Pencil className="size-3.5" />
            </ActionBtn>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="size-8 flex items-center justify-center rounded-full hover:bg-surface-strong transition-colors text-muted-foreground hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
