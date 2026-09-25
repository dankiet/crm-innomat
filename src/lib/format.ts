export function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
}

export function formatVNDShort(amount: number): string {
  if (amount >= 1_000_000_000) {
    return (amount / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "") + " tỷ";
  }
  if (amount >= 1_000_000) {
    return Math.round(amount / 1_000_000) + "tr";
  }
  return formatVND(amount);
}

/**
 * Timestamp `YYYY-MM-DD HH:mm:ss` — luôn là GIỜ UTC (từng bị đặt tên `nowLocal`
 * gây hiểu nhầm; đã đổi tên 2026-09-19, không đổi giá trị).
 * Định dạng dùng thống nhất cho mọi cột `created_at` / `updated_at` / `last_seen_at`.
 */
export function nowUtc(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/** Timestamp sau `days` ngày, cùng định dạng với `nowUtc` (dùng cho `expires_at`). */
export function expiresAt(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** Escape ký tự HTML — dùng cho mọi chỗ nội suy dữ liệu người dùng vào chuỗi HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Dung lượng file → chuỗi gọn (B/KB/MB/GB). `null`/âm → `""` để caller tự quyết
 * ẩn hay hiện placeholder (metadata asset backfill từ legacy có thể chưa đo).
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}
