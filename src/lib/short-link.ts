/**
 * Shortlink — logic thuần (không chạm DB, không chạm DOM) để test được.
 *
 * Vì sao cần: link dài kèm UTM dán vào caption/comment bị coi là "quảng cáo"
 * và làm giảm reach; đồng thời người đăng hay quên/gõ sai UTM khiến lead về
 * `lp_leads` với cột UTM rỗng. Shortlink đóng băng UTM theo shortcode.
 *
 * Bất biến quan trọng: UTM nằm trong CHÍNH đích redirect (Location tuyệt đối),
 * KHÔNG forward query của khách — xem `docs/` §shortlink và bẫy 301-strip-query
 * đã ghi ở `marketing/06`.
 */

/** Các cột UTM được phép gắn vào đích. */
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type UtmFields = Partial<Record<UtmKey, string>>;

/**
 * Slug hợp lệ: chữ thường/số/gạch ngang, 2–64 ký tự, không bắt đầu/kết thúc
 * bằng gạch ngang. Khớp cả mã gạch (`m75300h`) lẫn tên chiến dịch ngắn.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** Chuẩn hoá slug người dùng gõ: hạ chữ, bỏ dấu, gạch ngang hoá. */
export function normalizeSlug(raw: string): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Path đích phải là path nội bộ: bắt đầu bằng `/`, không phải `//` (protocol-relative),
 * không chứa scheme. Chặn open-redirect nếu ai đó nhập `https://evil.com`.
 */
export function isSafeTargetPath(path: string): boolean {
  const p = (path ?? "").trim();
  if (!p.startsWith("/")) return false;
  if (p.startsWith("//")) return false;
  if (p.includes("\\") || p.includes("\n") || p.includes("\r")) return false;
  if (p.includes("://")) return false;
  return true;
}

/** Chuẩn hoá path đích; rỗng → `/`. */
export function normalizeTargetPath(raw: string): string {
  const p = (raw ?? "").trim();
  if (!p) return "/";
  return p.startsWith("/") ? p : `/${p}`;
}

/**
 * Ghép đích tuyệt đối: `origin + path + ?utm...`.
 *
 * Query dựng TỪ CỘT UTM đã lưu (nguồn sự thật, chống sửa tay trên URL), rồi
 * MERGE thêm query khách mang vào cho các key KHÁC. Lý do: Meta tự gắn `fbclid`
 * khi khách bấm quảng cáo — bỏ nó là mất attribution của Meta. Nhưng UTM lưu sẵn
 * luôn THẮNG nếu trùng key, để không ai đổi được `utm_campaign` bằng cách sửa URL.
 *
 * Trả về `null` nếu path không an toàn (caller tự quyết định fallback).
 */
export function buildRedirectUrl(
  origin: string,
  targetPath: string,
  utm: UtmFields,
  incoming?: URLSearchParams | null,
): string | null {
  if (!isSafeTargetPath(targetPath)) return null;

  const base = origin.replace(/\/+$/, "");
  const params = new URLSearchParams();

  // Query khách mang vào trước (vd `fbclid` của Meta)...
  if (incoming) {
    for (const [key, value] of incoming) {
      if (!value) continue;
      params.append(key, value);
    }
  }
  // ...rồi UTM đã lưu ghi đè — nguồn sự thật, không cho sửa qua URL.
  for (const key of UTM_KEYS) {
    const value = (utm[key] ?? "").trim();
    if (value) params.set(key, value);
  }

  const qs = params.toString();
  return `${base}${targetPath}${qs ? `?${qs}` : ""}`;
}
