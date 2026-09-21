/**
 * Empty state dạng bare — được dùng 4+ nơi phiên bản không có icon/CTA.
 *
 * Chỉ dành cho tầng text thuần (`p-12 text-center text-sm text-muted-foreground`).
 * Biến thể có icon/dashed-border (luu-tru, thu-vien) và có action button
 * (bao-gia `Empty`) là component khác — KHÔNG gộp.
 */
import type { ReactNode } from "react";

export function EmptyState({ text, children }: { text?: string; children?: ReactNode }) {
  return (
    <p className="p-12 text-center text-sm text-muted-foreground">
      {text}
      {children}
    </p>
  );
}