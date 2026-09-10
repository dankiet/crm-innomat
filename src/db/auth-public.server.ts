/**
 * Public Authentication & Session Management (Supabase Google OAuth) — Server logic.
 *
 * Phân lập hoàn toàn khỏi hệ thống CRM session (crm_session).
 * Quản lý quyền xem nội dung mở rộng (Lookbook Không gian, Thư viện mã gạch)
 * của khách truy cập Landing Page khi đăng nhập bằng Google.
 */
import { randomBytes } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getDb } from "./index.server";

export const PUBLIC_SESSION_COOKIE = "public_session";
const PUBLIC_SESSION_DAYS = 30;

export type PublicUser = {
  id: number;
  supabase_id: string;
  email: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type PublicSession = {
  token: string;
  user_id: number;
  expires_at: string;
  created_at: string;
  user_agent: string;
};

function nowLocal(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function expiresAt(days = PUBLIC_SESSION_DAYS): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function getPublicSessionToken(): string | undefined {
  try {
    return getCookie(PUBLIC_SESSION_COOKIE);
  } catch {
    return undefined;
  }
}

export function setPublicSessionCookie(token: string) {
  try {
    setCookie(PUBLIC_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: PUBLIC_SESSION_DAYS * 24 * 60 * 60,
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    // Bỏ qua khi gọi từ script/test ngoài ngữ cảnh HTTP request
  }
}

export function clearPublicSessionCookie() {
  try {
    deleteCookie(PUBLIC_SESSION_COOKIE, { path: "/" });
  } catch {
    // Bỏ qua khi gọi ngoài ngữ cảnh request
  }
}

/**
 * Chặn open redirect: chỉ cho phép đường dẫn tương đối (bắt đầu bằng / nhưng không phải //)
 * hoặc cùng domain/origin với app. Mọi URL độc hại chuyển hướng về '/'.
 */
export function sanitizeReturnTo(raw: string | null | undefined, allowedOrigin?: string): string {
  if (!raw || typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed) return "/";

  // Đường dẫn tương đối hợp lệ: bắt đầu bằng / nhưng không phải // hoặc /\\
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) {
    return trimmed;
  }

  // Nếu là URL tuyệt đối
  try {
    const parsed = new URL(trimmed);
    if (allowedOrigin) {
      const allowed = new URL(allowedOrigin);
      if (parsed.origin !== allowed.origin) {
        return "/";
      }
    }
    const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (relative.startsWith("/") && !relative.startsWith("//") && !relative.startsWith("/\\")) {
      return relative;
    }
  } catch {
    // Không parse được URL -> không an toàn
  }

  return "/";
}

/**
 * Upsert người dùng public vào bảng public_users.
 */
export async function upsertPublicUser(
  supabaseId: string,
  email: string,
  rawMeta?: unknown,
): Promise<PublicUser> {
  const db = getDb();
  const now = nowLocal();
  const metaJson = rawMeta ? JSON.stringify(rawMeta) : null;

  const row = await db
    .prepare(
      `INSERT INTO public_users (supabase_id, email, raw_user_meta_data, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (supabase_id) DO UPDATE
       SET email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE public_users.email END,
           raw_user_meta_data = COALESCE(EXCLUDED.raw_user_meta_data, public_users.raw_user_meta_data),
           last_seen_at = EXCLUDED.last_seen_at
       RETURNING id, supabase_id, email, first_seen_at, last_seen_at`,
    )
    .get<PublicUser>(supabaseId, email, metaJson, now, now);

  if (!row) {
    throw new Error("Failed to upsert public user");
  }
  return {
    id: Number(row.id),
    supabase_id: row.supabase_id,
    email: row.email,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
  };
}

/**
 * Tạo phiên đăng nhập công khai (public_session).
 */
export async function createPublicSession(
  userId: number,
  userAgent = "",
): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("hex");
  const exp = expiresAt();
  const now = nowLocal();

  await getDb()
    .prepare(
      `INSERT INTO public_sessions (token, user_id, expires_at, created_at, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(token, userId, exp, now, (userAgent || "").slice(0, 300));

  setPublicSessionCookie(token);
  return { token, expiresAt: exp };
}

/**
 * Lấy thông tin user công khai hiện tại từ cookie public_session.
 */
export async function getCurrentPublicUser(): Promise<PublicUser | null> {
  const token = getPublicSessionToken();
  if (!token) return null;
  const now = nowLocal();

  const user = await getDb()
    .prepare(
      `SELECT u.id, u.supabase_id, u.email, u.first_seen_at, u.last_seen_at
       FROM public_sessions s
       JOIN public_users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at >= ?`,
    )
    .get<PublicUser>(token, now);

  if (!user) return null;
  return {
    id: Number(user.id),
    supabase_id: user.supabase_id,
    email: user.email,
    first_seen_at: user.first_seen_at,
    last_seen_at: user.last_seen_at,
  };
}

/**
 * Đăng xuất phiên public.
 */
export async function logoutPublicSession(): Promise<void> {
  const token = getPublicSessionToken();
  if (token) {
    await getDb()
      .prepare(`DELETE FROM public_sessions WHERE token = ?`)
      .run(token);
  }
  clearPublicSessionCookie();
}

/**
 * Sinh URL chuyển hướng đến Supabase GoTrue để xác thực tài khoản Google.
 */
export async function getGoogleOAuthUrl(
  returnTo: string = "/",
  clientOrigin?: string,
): Promise<{ url: string }> {
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL in server environment");
  }

  const baseOrigin = (clientOrigin || "").trim().replace(/\/+$/, "");
  const safeReturnTo = sanitizeReturnTo(returnTo, baseOrigin);
  const callbackUrl = baseOrigin
    ? `${baseOrigin}/auth/callback?returnTo=${encodeURIComponent(safeReturnTo)}`
    : `/auth/callback?returnTo=${encodeURIComponent(safeReturnTo)}`;

  const oauthUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(callbackUrl)}`;
  return { url: oauthUrl };
}

/**
 * Xử lý callback sau khi xác thực thành công từ Supabase Google OAuth.
 */
export async function handleSupabaseCallback(params: {
  code?: string;
  accessToken?: string;
  userAgent?: string;
  returnTo?: string;
}): Promise<{ ok: boolean; user?: PublicUser; error?: string; returnTo: string }> {
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const returnTo = sanitizeReturnTo(params.returnTo);

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Server missing Supabase configuration", returnTo };
  }

  let token = params.accessToken?.trim();

  // Trao đổi mã code lấy access_token nếu redirect dạng authorization_code
  if (!token && params.code?.trim()) {
    try {
      const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=authorization_code`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: params.code.trim() }),
      });

      if (tokenRes.ok) {
        const tokenData = (await tokenRes.json()) as { access_token?: string };
        token = tokenData.access_token;
      }
    } catch (err) {
      console.error("[auth-public] Error exchanging code for token:", err);
    }
  }

  if (!token) {
    return { ok: false, error: "Không tìm thấy token hoặc mã xác thực hợp lệ", returnTo };
  }

  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!userRes.ok) {
      const errText = await userRes.text();
      console.error("[auth-public] Error validating Supabase user token:", userRes.status, errText);
      return { ok: false, error: "Xác thực token Supabase không thành công", returnTo };
    }

    const sbUser = (await userRes.json()) as {
      id: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    };

    if (!sbUser || !sbUser.id) {
      return { ok: false, error: "Thông tin người dùng Supabase không hợp lệ", returnTo };
    }

    const email = sbUser.email || (sbUser.user_metadata?.email as string) || "";
    const publicUser = await upsertPublicUser(sbUser.id, email, sbUser.user_metadata);
    await createPublicSession(publicUser.id, params.userAgent);

    // Tự động ghi nhận Lead vào CRM khi đăng nhập Google thành công
    if (email) {
      try {
        const dedupe = await getDb()
          .prepare(
            `SELECT id FROM lp_leads
             WHERE email = ? AND form_kind = 'google-unlock'
               AND created_at > ?
             LIMIT 1`,
          )
          .get<{ id: number }>(
            email,
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " "),
          );

        if (!dedupe) {
          const fullName =
            (sbUser.user_metadata?.full_name as string) ||
            (sbUser.user_metadata?.name as string) ||
            email.split("@")[0] ||
            "KTS Google User";

          let lpSlug = "em-ban-gach";
          const matchSlug = /\/lp\/([a-zA-Z0-9_-]+)/.exec(returnTo);
          if (matchSlug && matchSlug[1]) {
            lpSlug = matchSlug[1];
          }

          const now = nowLocal();
          await getDb()
            .prepare(
              `INSERT INTO lp_leads
                 (full_name, phone, phone_norm, email, need, note, lp_slug,
                  form_kind, status, landing_path, user_agent, created_at)
               VALUES
                 (?, '', '', ?, ?, ?, ?, 'google-unlock', 'new', ?, ?, ?)`,
            )
            .run(
              fullName.slice(0, 120),
              email.slice(0, 120),
              "Mở khóa Thư viện & Lookbook Không gian (Google OAuth)",
              `Đăng nhập Google thành công. Tài khoản: ${email}`,
              lpSlug.slice(0, 64),
              returnTo.slice(0, 200),
              (params.userAgent || "").slice(0, 300),
              now,
            );
        }
      } catch (leadErr) {
        console.error("[auth-public] Error recording lead from Google OAuth:", leadErr);
      }
    }

    return { ok: true, user: publicUser, returnTo };
  } catch (err) {
    console.error("[auth-public] Unexpected error in handleSupabaseCallback:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Lỗi xác thực không xác định",
      returnTo,
    };
  }
}
