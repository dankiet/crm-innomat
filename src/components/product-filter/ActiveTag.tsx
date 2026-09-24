import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Chip hiển thị một filter đang áp dụng, kèm nút X để bỏ riêng filter đó.
 * Dùng chung cho tab Sản phẩm và tab Media (/luu-tru) để hai nơi hành xử giống nhau.
 */
export function ActiveTag({
  children,
  onClear,
  label,
}: {
  children: ReactNode;
  onClear: () => void;
  /** Mô tả cho screen reader, vd "Xoá lọc màu" */
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full text-xs bg-terracotta-soft text-terracotta ring-1 ring-terracotta/25">
      {children}
      <button
        type="button"
        onClick={onClear}
        aria-label={label ?? "Xoá filter"}
        className="size-4 grid place-items-center rounded-full hover:bg-terracotta/15 cursor-pointer"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
