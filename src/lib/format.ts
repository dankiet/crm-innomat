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
 * Timestamp `YYYY-MM-DD HH:mm:ss` (UTC) — định dạng dùng thống nhất cho mọi cột
 * `created_at` / `updated_at` / `last_seen_at` trong schema.
 */
export function nowLocal(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/** Timestamp sau `days` ngày, cùng định dạng với `nowLocal` (dùng cho `expires_at`). */
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
