/**
 * Thanh phân trang dùng chung cho các trang danh sách dài.
 *
 * Trước đây khối này bị chép nguyên văn ở `/luu-tru` và `/khong-gian` (đã bắt đầu trôi:
 * một bên có bộ chọn số dòng/trang, một bên không). Component này giữ đúng markup và
 * hành vi cũ, đồng thời tự quản `jumpPageInput` — state này vốn chỉ phục vụ ô "Đến: … Đi"
 * nên không cần nằm ở trang gọi.
 *
 * Tự ẩn khi chỉ có 1 trang (`totalPages <= 1`).
 */
import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPageNumbers } from "@/lib/pagination";

type Props = {
  page: number;
  total: number;
  pageSize: number;
  totalPages: number;
  /** Khoá nút trong lúc đang tải dữ liệu. */
  loading?: boolean;
  /** Danh từ đếm được, hiển thị sau "trên tổng số N …" (VD "ảnh", "bối cảnh"). */
  itemNoun: string;
  onPageChange: (page: number) => void;
  /** Slot chèn trước nút "Trước" — VD bộ chọn số dòng mỗi trang. */
  extra?: ReactNode;
};

export function PaginationBar({
  page,
  total,
  pageSize,
  totalPages,
  loading = false,
  itemNoun,
  onPageChange,
  extra,
}: Props) {
  const [jumpPageInput, setJumpPageInput] = useState("");

  if (totalPages <= 1) return null;

  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border/70 pt-5 text-xs text-muted-foreground">
      <p>
        Hiển thị{" "}
        <span className="font-semibold text-foreground">
          {total === 0 ? 0 : ((page - 1) * pageSize + 1).toLocaleString("vi-VN")}
        </span>{" "}
        –{" "}
        <span className="font-semibold text-foreground">
          {Math.min(page * pageSize, total).toLocaleString("vi-VN")}
        </span>{" "}
        trên tổng số{" "}
        <span className="font-semibold text-foreground">{total.toLocaleString("vi-VN")}</span>{" "}
        {itemNoun}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {extra}

        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-1 rounded-xl border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-strong transition-colors disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          <ChevronLeft className="size-3.5" />
          <span>Trước</span>
        </button>

        <div className="flex items-center gap-1">
          {pageNumbers.map((p, idx) => {
            if (p === "...") {
              return (
                <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground">
                  …
                </span>
              );
            }
            const num = Number(p);
            const active = num === page;
            return (
              <button
                key={num}
                type="button"
                disabled={loading}
                onClick={() => onPageChange(num)}
                className={cn(
                  "size-8 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                  active
                    ? "bg-foreground text-background font-bold shadow-xs"
                    : "border border-border/70 bg-card text-muted-foreground hover:bg-surface-strong hover:text-foreground",
                )}
              >
                {num}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-1 rounded-xl border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-strong transition-colors disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          <span>Sau</span>
          <ChevronRight className="size-3.5" />
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const target = parseInt(jumpPageInput, 10);
            if (!isNaN(target) && target >= 1 && target <= totalPages) {
              onPageChange(target);
              setJumpPageInput("");
            }
          }}
          className="ml-2 flex items-center gap-1"
        >
          <span className="text-[11px] text-muted-foreground">Đến:</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpPageInput}
            onChange={(e) => setJumpPageInput(e.target.value)}
            placeholder={`${page}`}
            className="h-8 w-14 rounded-lg border border-border/80 bg-card px-1.5 text-center text-xs text-foreground outline-none focus:border-terracotta"
          />
          <button
            type="submit"
            className="h-8 rounded-lg border border-border/80 bg-card px-2 text-xs font-medium text-foreground hover:bg-surface-strong cursor-pointer"
          >
            Đi
          </button>
        </form>
      </div>
    </div>
  );
}
