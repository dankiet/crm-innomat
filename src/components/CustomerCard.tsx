import type { ReactNode } from "react";
import { FilePlus2, MapPin, Pencil, StickyNote, ArrowUpRight } from "lucide-react";
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
  onClick: () => void;
  onEdit?: () => void;
  onNote?: () => void;
  onQuote?: () => void;
}) {
  const status = statusMeta[customer.status];
  const hasDebt = debt > 0;
  return <article className="group flex min-h-[230px] cursor-pointer flex-col rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg" onClick={onClick} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } }}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="crm-eyebrow">Khách hàng</p>
        <h3 className="mt-1 truncate text-base font-bold tracking-tight text-foreground">{customer.name}</h3>
        {customer.company ? <p className="mt-1 truncate text-xs text-muted-foreground">{customer.company}</p> : null}
      </div>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
    </div>

    <div className="mt-5 space-y-2.5 text-xs text-muted-foreground">
      {customer.phone ? <p className="flex items-center gap-2"><span className="w-14 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">SĐT</span><span className="font-medium text-foreground">{customer.phone}</span></p> : null}
      {customer.email ? <p className="flex min-w-0 items-center gap-2"><span className="w-14 shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Email</span><span className="truncate text-foreground" title={customer.email}>{customer.email}</span></p> : null}
      {customer.region ? <p className="flex items-center gap-2"><MapPin className="size-3.5 text-muted-foreground/70" /><span>{customer.region}</span></p> : null}
    </div>

    <div className="mt-4 min-h-9 flex-1 border-t border-border/60 pt-3">{customer.note ? <p className="line-clamp-2 text-xs leading-5 text-foreground/75">{customer.note}</p> : <p className="text-xs italic text-muted-foreground/65">Chưa có ghi chú lead</p>}</div>

    <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{hasDebt ? "Công nợ" : "Trạng thái"}</p><p className={`mt-1 truncate text-sm font-bold ${hasDebt ? "text-destructive" : "text-foreground"}`}>{hasDebt ? formatVND(debt) : status.label}</p></div><div className="flex shrink-0 items-center gap-1">{onNote ? <ActionBtn title="Ghi chú" onClick={onNote}><StickyNote className="size-3.5" /></ActionBtn> : null}{onQuote ? <ActionBtn title="Tạo báo giá" onClick={onQuote}><FilePlus2 className="size-3.5" /></ActionBtn> : null}{onEdit ? <ActionBtn title="Sửa khách hàng" onClick={onEdit}><Pencil className="size-3.5" /></ActionBtn> : null}</div></div>
  </article>;
}

function ActionBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" title={title} aria-label={title} onClick={(event) => { event.stopPropagation(); onClick(); }} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-primary">{children}</button>;
}
