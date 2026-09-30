/**
 * Shortlink — server logic (DB + resolve).
 *
 * Bảng `short_links`: mỗi dòng là một link ngắn chia sẻ được (ads / caption /
 * comment / bio), kèm UTM đóng băng theo shortcode.
 *
 * Ba nguyên tắc:
 *  1. Resolve là endpoint CÔNG KHAI (khách vãng lai bấm link) — không auth,
 *     nhưng chỉ trả 301, không lộ dữ liệu nội bộ.
 *  2. Đích redirect dựng từ cột UTM đã lưu + origin của request. KHÔNG forward
 *     query khách gửi (tránh lỗi 301-strip-query đã ghi ở `marketing/06`).
 *  3. Ghi là endpoint CRM — `requireUser` + audit như mọi mutation khác.
 */
import { getDb } from "./index.server";
import { nowUtc } from "@/lib/format";
import { buildRedirectUrl, normalizeSlug, normalizeTargetPath, isValidSlug, isSafeTargetPath, type UtmFields } from "@/lib/short-link";

export type ShortLink = {
  id: number;
  slug: string;
  label: string;
  target_path: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  is_active: number;
  click_count: number;
  created_at: string;
  updated_at: string;
};

export type ShortLinkInput = {
  slug: string;
  label?: string;
  targetPath?: string;
  isActive?: boolean;
} & UtmFields;

export type ShortLinkValidationError =
  | { field: "slug"; reason: "empty" | "invalid" | "duplicate" }
  | { field: "targetPath"; reason: "unsafe" };

export type ShortLinkResult<T> = { ok: true; data: T } | { ok: false; error: ShortLinkValidationError };

const SELECT_COLS = `id, slug, label, target_path, utm_source, utm_medium, utm_campaign,
                     utm_content, utm_term, is_active, click_count, created_at, updated_at`;

export async function listShortLinks(): Promise<ShortLink[]> {
  return (await getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM short_links ORDER BY created_at DESC, id DESC`)
    .all<ShortLink>()) as ShortLink[];
}

export async function getShortLinkBySlug(slug: string): Promise<ShortLink | undefined> {
  return (await getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM short_links WHERE slug = ?`)
    .get<ShortLink>(slug)) as ShortLink | undefined;
}

/**
 * Resolve shortcode → URL tuyệt đối, và tăng `click_count`.
 *
 * Trả `null` khi: không tìm thấy, đang tắt, hoặc path đích không an toàn.
 * `incoming` là query khách mang vào (vd `fbclid`) — được merge, nhưng UTM đã
 * lưu luôn thắng nếu trùng key.
 *
 * Đếm click là best-effort: lỗi đếm KHÔNG được làm hỏng redirect.
 */
export async function resolveShortLink(
  slug: string,
  origin: string,
  incoming?: URLSearchParams | null,
): Promise<string | null> {
  const row = await getShortLinkBySlug(slug);
  if (!row || row.is_active !== 1) return null;

  const url = buildRedirectUrl(
    origin,
    row.target_path,
    {
      utm_source: row.utm_source,
      utm_medium: row.utm_medium,
      utm_campaign: row.utm_campaign,
      utm_content: row.utm_content,
      utm_term: row.utm_term,
    },
    incoming,
  );
  if (!url) return null;

  try {
    await getDb()
      .prepare("UPDATE short_links SET click_count = click_count + 1 WHERE id = ?")
      .run(row.id);
  } catch {
    // Đếm click không quan trọng bằng việc khách phải được chuyển trang.
  }
  return url;
}

export async function createShortLink(input: ShortLinkInput): Promise<ShortLinkResult<ShortLink>> {
  const slug = normalizeSlug(input.slug);
  if (!slug) return { ok: false, error: { field: "slug", reason: "empty" } };
  if (!isValidSlug(slug)) return { ok: false, error: { field: "slug", reason: "invalid" } };

  const targetPath = normalizeTargetPath(input.targetPath ?? "/");
  if (!isSafeTargetPath(targetPath)) return { ok: false, error: { field: "targetPath", reason: "unsafe" } };

  const existing = await getShortLinkBySlug(slug);
  if (existing) return { ok: false, error: { field: "slug", reason: "duplicate" } };

  const now = nowUtc();
  const db = getDb();
  const res = await db
    .prepare(
      `INSERT INTO short_links
         (slug, label, target_path, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          is_active, click_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      slug,
      (input.label ?? "").trim().slice(0, 200),
      targetPath,
      (input.utm_source ?? "").trim().slice(0, 200),
      (input.utm_medium ?? "").trim().slice(0, 200),
      (input.utm_campaign ?? "").trim().slice(0, 200),
      (input.utm_content ?? "").trim().slice(0, 200),
      (input.utm_term ?? "").trim().slice(0, 200),
      input.isActive === false ? 0 : 1,
      now,
      now,
    );

  const created = await getShortLinkBySlug(slug);
  if (!created) {
    throw new Error(`Tạo shortlink thất bại (id=${res.lastInsertRowid ?? "?"})`);
  }
  return { ok: true, data: created };
}

export async function updateShortLink(
  id: number,
  input: ShortLinkInput,
): Promise<ShortLinkResult<ShortLink>> {
  const current = (await getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM short_links WHERE id = ?`)
    .get<ShortLink>(id)) as ShortLink | undefined;
  if (!current) return { ok: false, error: { field: "slug", reason: "empty" } };

  const slug = normalizeSlug(input.slug);
  if (!slug) return { ok: false, error: { field: "slug", reason: "empty" } };
  if (!isValidSlug(slug)) return { ok: false, error: { field: "slug", reason: "invalid" } };

  const targetPath = normalizeTargetPath(input.targetPath ?? "/");
  if (!isSafeTargetPath(targetPath)) return { ok: false, error: { field: "targetPath", reason: "unsafe" } };

  if (slug !== current.slug) {
    const clash = await getShortLinkBySlug(slug);
    if (clash) return { ok: false, error: { field: "slug", reason: "duplicate" } };
  }

  await getDb()
    .prepare(
      `UPDATE short_links
          SET slug = ?, label = ?, target_path = ?, utm_source = ?, utm_medium = ?,
              utm_campaign = ?, utm_content = ?, utm_term = ?, is_active = ?, updated_at = ?
        WHERE id = ?`,
    )
    .run(
      slug,
      (input.label ?? "").trim().slice(0, 200),
      targetPath,
      (input.utm_source ?? "").trim().slice(0, 200),
      (input.utm_medium ?? "").trim().slice(0, 200),
      (input.utm_campaign ?? "").trim().slice(0, 200),
      (input.utm_content ?? "").trim().slice(0, 200),
      (input.utm_term ?? "").trim().slice(0, 200),
      input.isActive === false ? 0 : 1,
      nowUtc(),
      id,
    );

  const updated = await getShortLinkBySlug(slug);
  if (!updated) throw new Error(`Cập nhật shortlink thất bại (id=${id})`);
  return { ok: true, data: updated };
}

export async function deleteShortLink(id: number): Promise<void> {
  await getDb().prepare("DELETE FROM short_links WHERE id = ?").run(id);
}
