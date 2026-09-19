import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Class nền cho ô nhập liệu trong các dialog nghiệp vụ (input/select/textarea). */
export const inputCls =
  "w-full text-sm px-3 py-2 rounded-md bg-background ring-1 ring-black/10 outline-none focus:ring-terracotta/40 text-foreground";

/** Biến thể thêm màu placeholder mờ — dùng cho form nhập liệu dài. */
export const inputClsPlaceholder = `${inputCls} placeholder:text-muted-foreground/70`;
