/**
 * Nút gạt kiểu hiển thị (lưới/board ↔ danh sách) dùng chung.
 *
 * Trước đây khối này bị chép ở `/co-hoi`, `/khach-hang` và `/san-pham` — container và
 * class của nút giống hệt nhau, chỉ khác icon/nhãn/tooltip, và đã bắt đầu trôi
 * (`cn()` ở hai chỗ, ternary inline ở chỗ thứ ba).
 *
 * Generic theo union của chế độ để giữ type-safety: `/co-hoi` dùng `"board" | "list"`,
 * hai trang kia dùng `"grid" | "list"`.
 */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewModeOption<T extends string> = {
  value: T;
  icon: LucideIcon;
  /** Nhãn hiển thị (ẩn ở màn hình hẹp). */
  label: string;
  /** Tooltip — nội dung khác nhau theo từng trang. */
  title: string;
};

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<ViewModeOption<T>>;
};

export function ViewModeToggle<T extends string>({ value, onChange, options }: Props<T>) {
  return (
    <div
      className="inline-flex p-0.5 rounded-lg ring-1 ring-black/5 bg-surface-strong/50"
      role="group"
      aria-label="Kiểu hiển thị"
    >
      {options.map(({ value: optionValue, icon: Icon, label, title }) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          className={cn(
            "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5",
            value === optionValue
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={value === optionValue}
          title={title}
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
