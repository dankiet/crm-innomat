import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Columns3, FilePlus2, GripVertical, List, Pencil, Phone } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { PageFilterBar, PageSearchInput } from "@/components/PageFilterBar";
import { NewCustomerDialog } from "@/components/NewCustomerDialog";
import { NewQuoteDialog } from "@/components/NewQuoteDialog";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { fetchCustomers, setCustomerStatus } from "@/api/functions";
import { pipelineStages, statusMeta, type Customer, type CustomerStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type CoHoiSearch = { q?: string };

export const Route = createFileRoute("/_app/co-hoi")({
  head: () => ({
    meta: [{ title: "Cơ hội — Innomat CRM" }],
  }),
  validateSearch: (search: Record<string, unknown>): CoHoiSearch => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
  }),
  loaderDeps: ({ search }: { search: CoHoiSearch }) => ({
    q: search.q?.trim() || "",
  }),
  loader: async ({ deps }): Promise<{ customers: Customer[]; q: string }> => {
    const customers = await fetchCustomers({
      data: { status: "all", search: deps.q || undefined },
    });
    return { customers, q: deps.q };
  },
  component: PipelinePage,
});

type ViewMode = "board" | "list";
type PipelineStage = (typeof pipelineStages)[number];

/** Grid cols tĩnh cho Tailwind (class phải là literal để JIT nhận diện) — map theo số cột đang hiện. */
const BOARD_COLS_XL: Record<number, string> = {
  0: "xl:grid-cols-1",
  1: "xl:grid-cols-1",
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
};

type DragHandleProps = {
  attributes?: Record<string, unknown> | object;
  listeners?: Record<string, unknown> | object;
};

function DealCard({
  customer,
  onQuote,
  onEdit,
  onOpen,
  isDragging,
  dragHandleProps,
}: {
  customer: Customer;
  onQuote: () => void;
  onEdit: () => void;
  onOpen: () => void;
  isDragging?: boolean;
  dragHandleProps?: DragHandleProps;
}) {
  const initial = customer.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={cn(
        "w-full text-left bg-card ring-1 ring-black/5 rounded-xl p-3 shadow-sm hover:ring-black/10 hover:shadow transition-all",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-1 mb-2">
        {dragHandleProps ? (
          <button
            type="button"
            title="Kéo để chuyển giai đoạn"
            aria-label="Kéo để chuyển giai đoạn"
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 -ml-1 size-5 grid place-items-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-surface-strong cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
            {...(dragHandleProps.attributes ?? {})}
            {...(dragHandleProps.listeners ?? {})}
          >
            <GripVertical className="size-3.5" />
          </button>
        ) : null}
        <button type="button" onClick={onOpen} className="flex-1 text-left min-w-0">
          <div className="flex items-start gap-2.5">
            <div className="size-9 rounded-lg bg-surface-strong grid place-items-center text-xs font-semibold ring-1 ring-black/5 flex-shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate">{customer.name}</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {customer.company ? `${customer.company} · ` : ""}
                {customer.source ? `Nguồn: ${customer.source}` : "Chưa có nguồn"}
                {customer.phone ? ` · ${customer.phone}` : ""}
              </p>
            </div>
          </div>
        </button>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border/80 gap-1">
        <span className="text-[10px] text-muted-foreground truncate">{customer.region || "—"}</span>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <MiniBtn title="Báo giá" onClick={onQuote}>
            <FilePlus2 className="size-3" />
          </MiniBtn>
          <MiniBtn title="Sửa" onClick={onEdit}>
            <Pencil className="size-3" />
          </MiniBtn>
        </div>
      </div>
    </div>
  );
}

function MiniBtn({
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
      onClick={onClick}
      className="size-7 grid place-items-center rounded-md text-muted-foreground hover:bg-surface-strong hover:text-foreground"
    >
      {children}
    </button>
  );
}

function DraggableDealCard({
  customer,
  onQuote,
  onEdit,
  onOpen,
}: {
  customer: Customer;
  onQuote: () => void;
  onEdit: () => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `card-${customer.id}`,
    data: { customerId: customer.id, from: customer.status },
  });
  const style: React.CSSProperties | undefined = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 30,
      }
    : undefined;
  return (
    <div ref={setNodeRef} style={style}>
      <DealCard
        customer={customer}
        onQuote={onQuote}
        onEdit={onEdit}
        onOpen={onOpen}
        isDragging={isDragging}
        dragHandleProps={{ attributes, listeners }}
      />
    </div>
  );
}

function DroppableStageColumn({
  stage,
  count,
  children,
}: {
  stage: PipelineStage;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage.key}`,
    data: { status: stage.key },
  });
  return (
    <section
      className={cn(
        "flex flex-col min-h-[280px] rounded-2xl ring-1 transition-shadow",
        stage.columnClass,
        isOver && "ring-2 ring-primary/60 shadow-md",
      )}
    >
      <header
        className={cn(
          "p-3 sm:p-3.5 flex items-start justify-between gap-2 border-b rounded-t-2xl",
          stage.headerClass,
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full flex-shrink-0", stage.dotClass)} aria-hidden />
            <h2 className="text-xs font-semibold tracking-tight text-foreground">{stage.label}</h2>
            <span className="size-5 flex items-center justify-center bg-card/90 text-[10px] font-bold rounded-full ring-1 ring-black/5 tabular-nums">
              {count}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 pl-4">{stage.hint}</p>
        </div>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2.5 sm:p-3 space-y-2 min-h-[220px] rounded-b-2xl transition-colors",
          isOver && "bg-primary/5",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function PipelinePage() {
  const router = useRouter();
  const navigate = useNavigate({ from: "/co-hoi" });
  const { customers: loaderCustomers, q: qParam } = Route.useLoaderData() as {
    customers: Customer[];
    q: string;
  };
  const [customers, setCustomers] = useState<Customer[]>(loaderCustomers);
  useEffect(() => {
    setCustomers(loaderCustomers);
  }, [loaderCustomers]);

  const [searchDraft, setSearchDraft] = useState(qParam || "");
  const committedSearchRef = useRef(qParam || "");
  useEffect(() => {
    const next = qParam || "";
    if (next === committedSearchRef.current) return;
    committedSearchRef.current = next;
    setSearchDraft(next);
  }, [qParam]);
  useEffect(() => {
    if (searchDraft === (qParam || "")) return;
    const t = setTimeout(() => {
      const committed = searchDraft.trim();
      committedSearchRef.current = committed;
      void navigate({
        search: (prev) => ({
          ...prev,
          q: committed || undefined,
        }),
        replace: true,
      });
    }, 220);
    return () => clearTimeout(t);
  }, [searchDraft, qParam, navigate]);

  const [viewMode, setViewMode] = useLocalStorageState<ViewMode>("pipeline.viewMode", "board");
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [quoteCustomerId, setQuoteCustomerId] = useState<number | null>(null);
  const [hiddenStagesList, setHiddenStagesList] = useLocalStorageState<CustomerStatus[]>(
    "pipeline.hiddenStages",
    [],
  );
  const hiddenStages = useMemo(() => new Set(hiddenStagesList), [hiddenStagesList]);

  const visibleStages = useMemo(
    () => pipelineStages.filter((s) => !hiddenStages.has(s.key)),
    [hiddenStages],
  );

  const [activeCard, setActiveCard] = useState<Customer | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function toggleStage(key: CustomerStatus) {
    setHiddenStagesList((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  /** List view: group by pipeline stage (cùng logic board) */
  const listByStage = useMemo(() => {
    return visibleStages.map((stage) => {
      const deals = customers
        .filter((c) => c.status === stage.key)
        .slice()
        .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
      return { stage, deals };
    });
  }, [customers, visibleStages]);

  const pipelineTotal = useMemo(
    () => listByStage.reduce((n, g) => n + g.deals.length, 0),
    [listByStage],
  );

  async function refresh() {
    await router.invalidate();
  }

  function openCustomer(id: number) {
    navigate({
      to: "/khach-hang/$customerId",
      params: { customerId: String(id) },
    });
  }

  function handleDragStart(e: DragStartEvent) {
    const id = e.active.data.current?.customerId as number | undefined;
    if (id != null) {
      setActiveCard(customers.find((c) => c.id === id) ?? null);
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = e;
    if (!over) return;
    const customerId = active.data.current?.customerId as number | undefined;
    const from = active.data.current?.from as CustomerStatus | undefined;
    const to = over.data.current?.status as CustomerStatus | undefined;
    if (customerId == null || !to || !from || from === to) return;

    // Optimistic update
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, status: to } : c)));
    try {
      await setCustomerStatus({ data: { id: customerId, status: to } });
      toast.success(`Đã chuyển sang "${statusMeta[to].label}"`);
      await router.invalidate();
    } catch (err) {
      // Revert
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, status: from } : c)));
      const msg = err instanceof Error ? err.message : "Không đổi trạng thái được";
      toast.error(msg);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Bán hàng"
        title="Pipeline cơ hội"
        description="Tư vấn → Báo giá → Đã chốt · Bỏ lỡ. Kéo thẻ (biểu tượng ⋮⋮) để đổi giai đoạn."
        actions={
          <div
            className="inline-flex p-0.5 rounded-lg ring-1 ring-black/5 bg-surface-strong/50"
            role="group"
            aria-label="Kiểu hiển thị"
          >
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={cn(
                "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5",
                viewMode === "board"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={viewMode === "board"}
              title="Kanban"
            >
              <Columns3 className="size-3.5" />
              <span className="hidden sm:inline">Board</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5",
                viewMode === "list"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={viewMode === "list"}
              title="Danh sách"
            >
              <List className="size-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        }
      />

      <PageFilterBar
        search={
          <PageSearchInput
            value={searchDraft}
            onChange={setSearchDraft}
            placeholder="Tìm tên, SĐT, khu vực, sales…"
          />
        }
      />

      <div className="flex items-center gap-2 flex-wrap mb-4 p-2.5 rounded-xl bg-surface-strong/40 ring-1 ring-black/5">
        <span className="text-[11px] text-muted-foreground">Hiển thị cột:</span>
        <div className="flex items-center gap-1.5 flex-wrap flex-1">
          {pipelineStages.map((stage) => {
            const hidden = hiddenStages.has(stage.key);
            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => toggleStage(stage.key)}
                aria-pressed={!hidden}
                className={cn(
                  "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium ring-1 transition-colors",
                  hidden
                    ? "ring-black/5 bg-surface-strong/40 text-muted-foreground/60"
                    : "ring-black/5 bg-card text-foreground shadow-sm",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full flex-shrink-0",
                    hidden ? "bg-muted-foreground/40" : stage.dotClass,
                  )}
                  aria-hidden
                />
                {stage.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 border-l border-border/80 pl-2">
          <button
            type="button"
            onClick={() => setHiddenStagesList([])}
            disabled={hiddenStages.size === 0}
            className="h-7 px-2 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-surface-strong disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Hiện tất cả
          </button>
          <button
            type="button"
            onClick={() => setHiddenStagesList(pipelineStages.map((s) => s.key))}
            disabled={hiddenStages.size === pipelineStages.length}
            className="h-7 px-2 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-surface-strong disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Ẩn tất cả
          </button>
        </div>
      </div>

      {viewMode === "board" ? (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveCard(null)}
        >
          <div
            className={cn(
              "grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4",
              BOARD_COLS_XL[Math.min(visibleStages.length, 5) as 1 | 2 | 3 | 4 | 5] ??
                BOARD_COLS_XL[5],
            )}
          >
            {visibleStages.map((stage) => {
              const deals = customers.filter((c) => c.status === stage.key);
              return (
                <DroppableStageColumn key={stage.key} stage={stage} count={deals.length}>
                  {deals.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/80 text-center py-10 px-2">
                      Trống — kéo thẻ vào đây
                    </p>
                  ) : (
                    deals.map((c) => (
                      <DraggableDealCard
                        key={c.id}
                        customer={c}
                        onOpen={() => openCustomer(c.id)}
                        onQuote={() => setQuoteCustomerId(c.id)}
                        onEdit={() => setEditCustomer(c)}
                      />
                    ))
                  )}
                </DroppableStageColumn>
              );
            })}
          </div>
          <DragOverlay>
            {activeCard ? (
              <div className="rotate-1 opacity-95 shadow-xl">
                <DealCard
                  customer={activeCard}
                  onOpen={() => {}}
                  onQuote={() => {}}
                  onEdit={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="space-y-4">
          {pipelineTotal === 0 ? (
            <div className="bg-card ring-1 ring-black/5 rounded-xl p-12 text-center text-sm text-muted-foreground">
              {(qParam || "").trim()
                ? "Không tìm thấy cơ hội phù hợp."
                : "Chưa có lead trong pipeline."}
            </div>
          ) : (
            listByStage.map(({ stage, deals }) => (
              <section
                key={stage.key}
                className={cn("rounded-xl ring-1 overflow-hidden", stage.columnClass)}
              >
                <header
                  className={cn("px-4 py-2.5 flex items-center gap-2 border-b", stage.headerClass)}
                >
                  <span
                    className={cn("size-2 rounded-full flex-shrink-0", stage.dotClass)}
                    aria-hidden
                  />
                  <h2 className="text-xs font-semibold text-foreground">{stage.label}</h2>
                  <span className="size-5 flex items-center justify-center bg-card/90 text-[10px] font-bold rounded-full ring-1 ring-black/5 tabular-nums">
                    {deals.length}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-1 hidden sm:inline">
                    {stage.hint}
                  </span>
                </header>

                {deals.length === 0 ? (
                  <p className="px-4 py-6 text-[11px] text-muted-foreground/80 text-center bg-card/40">
                    Trống
                  </p>
                ) : (
                  <div className="overflow-x-auto bg-card/80">
                    <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                      <colgroup>
                        <col />
                        <col className="w-[10rem]" />
                        <col className="w-[8rem]" />
                        <col className="w-[9rem]" />
                        <col className="w-[10rem]" />
                        <col className="w-[7rem]" />
                      </colgroup>
                      <thead className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/80">
                        <tr>
                          <th className="px-4 py-2 font-medium">Khách hàng</th>
                          <th className="px-3 py-2 font-medium">Liên hệ</th>
                          <th className="px-3 py-2 font-medium">Khu vực</th>
                          <th className="px-3 py-2 font-medium">Sales</th>
                          <th className="px-3 py-2 font-medium">Cập nhật</th>
                          <th className="px-3 py-2 font-medium text-right w-[7rem]">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/70">
                        {deals.map((c) => (
                          <tr
                            key={c.id}
                            className="hover:bg-surface-strong/50 cursor-pointer transition-colors bg-card"
                            onClick={() => openCustomer(c.id)}
                          >
                            <td className="px-4 py-2.5 min-w-0">
                              <p className="font-medium text-foreground truncate">{c.name}</p>
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {[c.company, c.source].filter(Boolean).join(" · ") || "—"}
                              </p>
                            </td>
                            <td className="min-w-0 px-3 py-2.5 text-xs text-muted-foreground">
                              {c.phone ? (
                                <span className="flex min-w-0 items-center gap-1" title={c.phone}>
                                  <Phone className="size-3 shrink-0 opacity-60" />
                                  <span className="truncate">{c.phone}</span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td
                              className="truncate px-3 py-2.5 text-xs text-muted-foreground"
                              title={c.region || undefined}
                            >
                              {c.region || "—"}
                            </td>
                            <td
                              className="truncate px-3 py-2.5 text-xs text-muted-foreground"
                              title={c.owner_name || undefined}
                            >
                              {c.owner_name || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-muted-foreground whitespace-nowrap">
                              {c.updated_at || "—"}
                            </td>
                            <td
                              className="px-3 py-2.5 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-0.5">
                                <MiniBtn title="Báo giá" onClick={() => setQuoteCustomerId(c.id)}>
                                  <FilePlus2 className="size-3.5" />
                                </MiniBtn>
                                <MiniBtn title="Sửa" onClick={() => setEditCustomer(c)}>
                                  <Pencil className="size-3.5" />
                                </MiniBtn>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))
          )}
          {pipelineTotal > 0 ? (
            <p className="text-[11px] text-muted-foreground px-1">
              {pipelineTotal} cơ hội · nhóm theo {visibleStages.length} giai đoạn pipeline
            </p>
          ) : null}
        </div>
      )}

      {/* Lead ngoài pipeline chính (đang giao / hoàn tất) — gọn */}
      {(() => {
        const other = customers.filter((c) => c.status === "delivering" || c.status === "done");
        if (!other.length) return null;
        return (
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Sau chốt · giao hàng
            </h3>
            <div className="flex flex-wrap gap-2">
              {other.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCustomer(c.id)}
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-full bg-card ring-1 ring-black/5 text-xs hover:ring-black/10"
                >
                  <span className="font-medium">{c.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${statusMeta[c.status].className}`}
                  >
                    {statusMeta[c.status].label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      <NewCustomerDialog
        open={Boolean(editCustomer)}
        onOpenChange={(o) => {
          if (!o) setEditCustomer(null);
        }}
        customer={editCustomer}
        onCreated={refresh}
      />

      <NewQuoteDialog
        open={quoteCustomerId != null}
        onOpenChange={(o) => {
          if (!o) {
            setQuoteCustomerId(null);
            void router.invalidate();
          }
        }}
        defaultCustomerId={quoteCustomerId ?? undefined}
      />
    </>
  );
}
