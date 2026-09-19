/**
 * Khối form dùng chung cho hai dialog sản phẩm (`NewProductDialog`, `EditProductDialog`).
 *
 * Hai dialog này khác nghiệp vụ (tạo vs sửa, có/không luồng xoá, có/không nút ảnh)
 * nên không gộp, nhưng phần khung form thì giống hệt nhau.
 */
import type { ReactNode } from "react";

/** Các field sản phẩm có gợi ý giá trị lấy từ DB (`fetchProductFieldValues`). */
export const SUGGEST_FIELDS = [
  "color",
  "supplier",
  "category",
  "surface",
  "shape",
  "texture",
  "collections",
] as const;

export type SuggestField = (typeof SUGGEST_FIELDS)[number];

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border/70 bg-surface-strong/25 px-3.5 py-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
