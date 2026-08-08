import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getDb } from "./index.server";
import type { AppUser, Role, SessionUser } from "@/lib/auth-types";

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE = "crm_session";
const SESSION_DAYS = 14;

function nowLocal() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function expiresAt(days = SESSION_DAYS): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const keyBuf = Buffer.from(keyHex, "hex");
  if (keyBuf.length !== derived.length) return false;
  return timingSafeEqual(keyBuf, derived);
}

export function toSessionUser(u: AppUser): SessionUser {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role as Role,
    is_active: u.is_active,
  };
}

export async function getUserById(id: number): Promise<AppUser | null> {
  return (
    (await getDb()
      .prepare(
        `SELECT id, username, display_name, role, is_active, created_at, updated_at
         FROM users WHERE id = ?`,
      )
      .get<AppUser>(id)) ?? null
  );
}

export async function getUserByUsername(username: string): Promise<
  (AppUser & { password_hash: string }) | null
> {
  return (
    (await getDb()
      .prepare(
        `SELECT id, username, password_hash, display_name, role, is_active, created_at, updated_at
         FROM users WHERE username = ?`,
      )
      .get<AppUser & { password_hash: string }>(username.toLowerCase().trim())) ??
    null
  );
}

export async function createSession(
  userId: number,
  userAgent = "",
): Promise<{ sessionId: string; expiresAt: string }> {
  const sessionId = randomBytes(32).toString("hex");
  const exp = expiresAt();
  await getDb()
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(sessionId, userId, exp, nowLocal(), nowLocal(), userAgent.slice(0, 300));
  return { sessionId, expiresAt: exp };
}

export async function deleteSession(sessionId: string) {
  await getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export async function deleteSessionsForUser(userId: number) {
  await getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

async function getSessionUserId(sessionId: string): Promise<number | null> {
  const row = await getDb()
    .prepare(
      `SELECT user_id, expires_at FROM sessions WHERE id = ?`,
    )
    .get<{ user_id: number; expires_at: string }>(sessionId);
  if (!row) return null;
  if (row.expires_at < nowLocal()) {
    await deleteSession(sessionId);
    return null;
  }
  await getDb()
    .prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
    .run(nowLocal(), sessionId);
  return row.user_id;
}

export function setSessionCookie(sessionId: string) {
  setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie() {
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionIdFromCookie(): string | undefined {
  return getCookie(SESSION_COOKIE);
}

/** Current logged-in user or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const sid = getSessionIdFromCookie();
  if (!sid) return null;
  const userId = await getSessionUserId(sid);
  if (!userId) return null;
  const user = await getUserById(userId);
  if (!user || !user.is_active) {
    await deleteSession(sid);
    return null;
  }
  return toSessionUser(user);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Ki?m tra dang nh?p tru?c", 401);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new AuthError("Ch? qu?n tr? vi�n du?c th?c hi?n thao t�c n�y", 403);
  }
  return user;
}

export async function assertCanAccessCustomer(
  user: SessionUser,
  customerId: number,
): Promise<void> {
  if (user.role === "admin") return;
  const row = await getDb()
    .prepare("SELECT owner_id FROM customers WHERE id = ?")
    .get<{ owner_id: number | null }>(customerId);
  if (!row) throw new AuthError("Kh�ng t�m th?y kh�ch h�ng", 404);
  if (row.owner_id !== user.id) {
    throw new AuthError("B?n kh�ng c� quy?n truy c?p kh�ch h�ng n�y", 403);
  }
}

export function ownerFilter(user: SessionUser): number | null {
  return user.role === "admin" ? null : user.id;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(username: string): string {
  const u = normalizeUsername(username);
  if (!/^[a-z0-9._-]{3,32}$/.test(u)) {
    throw new Error(
      "Username 3�32 k� t?: ch? thu?ng, s?, d?u ch?m, g?ch du?i, g?ch ngang",
    );
  }
  return u;
}

export function validatePassword(password: string) {
  if (!password || password.length < 8) {
    throw new Error("M?t kh?u t?i thi?u 8 k� t?");
  }
  if (password.length > 128) {
    throw new Error("M?t kh?u qu� d�i");
  }
}

export function validateRole(role: string): Role {
  if (role !== "admin" && role !== "user") {
    throw new Error("Role kh�ng h?p l?");
  }
  return role;
}

export async function loginWithPassword(
  username: string,
  password: string,
  userAgent = "",
): Promise<{ user: SessionUser } | { error: string }> {
  const u = await getUserByUsername(username);
  if (!u) return { error: "Sai t�n dang nh?p ho?c m?t kh?u" };
  if (!u.is_active) return { error: "T�i kho?n d� b? kh�a" };
  const ok = await verifyPassword(password, u.password_hash);
  if (!ok) return { error: "Sai t�n dang nh?p ho?c m?t kh?u" };

  const { sessionId } = await createSession(u.id, userAgent);
  setSessionCookie(sessionId);
  return { user: toSessionUser(u) };
}

export async function logoutCurrentSession() {
  const sid = getSessionIdFromCookie();
  if (sid) await deleteSession(sid);
  clearSessionCookie();
}