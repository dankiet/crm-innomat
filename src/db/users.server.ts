import { getDb } from "./index.server";
import {
  deleteSessionsForUser,
  hashPassword,
  normalizeUsername,
  validatePassword,
  validateRole,
  validateUsername,
} from "./auth.server";
import type { AppUser, Role, SessionUser } from "@/lib/auth-types";

function nowLocal() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export async function listUsers(): Promise<AppUser[]> {
  return await getDb()
    .prepare(
      `SELECT id, username, display_name, role, is_active, phone, created_at, updated_at
       FROM users ORDER BY role ASC, display_name ASC`,
    )
    .all<AppUser>();
}

export async function createUserAsync(input: {
  username: string;
  password: string;
  display_name: string;
  role: Role;
  phone?: string;
}): Promise<AppUser> {
  const username = validateUsername(input.username);
  validatePassword(input.password);
  const role = validateRole(input.role);
  const displayName = input.display_name.trim();
  if (!displayName) throw new Error("Tên hiển thị bắt buộc");

  const existing = await getDb()
    .prepare("SELECT id FROM users WHERE username = ?")
    .get<{ id: number }>(username);
  if (existing) throw new Error(`Username "${username}" đã tồn tại`);

  const password_hash = await hashPassword(input.password);
  const ts = nowLocal();
  await getDb()
    .prepare(
      `INSERT INTO users (username, password_hash, display_name, role, phone, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(username, password_hash, displayName, role, (input.phone ?? "").trim(), ts, ts);

  const row = await getDb()
    .prepare(
      `SELECT id, username, display_name, role, is_active, phone, created_at, updated_at
       FROM users WHERE username = ?`,
    )
    .get<AppUser>(username);
  if (!row) throw new Error("Không tìm thấy user vừa tạo");
  return row;
}

export async function updateUser(
  id: number,
  input: {
    display_name?: string;
    role?: Role;
    is_active?: boolean;
    phone?: string;
  },
  actor: SessionUser,
): Promise<AppUser> {
  const existing = await getDb()
    .prepare(
      `SELECT id, username, display_name, role, is_active, phone, created_at, updated_at
       FROM users WHERE id = ?`,
    )
    .get<AppUser>(id);
  if (!existing) throw new Error("Không tìm thấy người dùng");

  const displayName =
    input.display_name !== undefined
      ? input.display_name.trim()
      : existing.display_name;
  if (!displayName) throw new Error("Tên hiển thị bắt buộc");

  const role =
    input.role !== undefined ? validateRole(input.role) : existing.role;

  let isActive = existing.is_active;
  if (input.is_active !== undefined) {
    isActive = input.is_active ? 1 : 0;
  }

  // Safety: cannot deactivate or demote self
  if (actor.id === id) {
    if (!isActive) throw new Error("Không thể khóa tài khoản của chính bạn");
    if (existing.role === "admin" && role !== "admin") {
      throw new Error("Không thể tự hạ quyền quản trị của chính bạn");
    }
  }

  // Keep at least one active admin
  if (existing.role === "admin" && (role !== "admin" || !isActive)) {
    const adminRow = await getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?`,
      )
      .get<{ n: number }>(id);
    const adminCount = Number(adminRow?.n ?? 0);
    if (adminCount < 1) {
      throw new Error("Phải còn ít nhất một quản trị viên đang hoạt động");
    }
  }

  await getDb()
    .prepare(
      `UPDATE users SET display_name = ?, role = ?, is_active = ?, phone = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(displayName, role, isActive, (input.phone !== undefined ? input.phone.trim() : (existing.phone ?? "")), nowLocal(), id);

  if (!isActive) {
    await deleteSessionsForUser(id);
  }

  const updated = await getDb()
    .prepare(
      `SELECT id, username, display_name, role, is_active, phone, created_at, updated_at
       FROM users WHERE id = ?`,
    )
    .get<AppUser>(id);
  if (!updated) throw new Error("Không tìm thấy người dùng");
  return updated;
}

export async function resetUserPassword(
  id: number,
  newPassword: string,
  actor: SessionUser,
): Promise<void> {
  validatePassword(newPassword);
  const existing = await getDb()
    .prepare("SELECT id FROM users WHERE id = ?")
    .get<{ id: number }>(id);
  if (!existing) throw new Error("Không tìm thấy người dùng");

  const password_hash = await hashPassword(newPassword);
  await getDb()
    .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(password_hash, nowLocal(), id);

  // Kick other sessions except allow actor to keep theirs if self-reset
  if (actor.id !== id) {
    await deleteSessionsForUser(id);
  }
}

export async function assignCustomerOwner(
  customerId: number,
  ownerId: number,
): Promise<{
  customer_id: number;
  owner_id: number;
  owner_name: string;
  previous_owner_id: number | null;
}> {
  const owner = await getDb()
    .prepare(
      `SELECT id, display_name, is_active FROM users WHERE id = ?`,
    )
    .get<{ id: number; display_name: string; is_active: number }>(ownerId);
  if (!owner || !owner.is_active) {
    throw new Error("Người sở hữu không hợp lệ hoặc đã bị khóa");
  }
  const customer = await getDb()
    .prepare("SELECT id, owner_id, name FROM customers WHERE id = ?")
    .get<{ id: number; owner_id: number | null; name: string }>(customerId);
  if (!customer) throw new Error("Không tìm thấy khách hàng");

  const prev = (customer.owner_id as number | null) ?? null;
  await getDb()
    .prepare(
      "UPDATE customers SET owner_id = ?, updated_at = ? WHERE id = ?",
    )
    .run(ownerId, nowLocal(), customerId);

  return {
    customer_id: customerId,
    owner_id: ownerId,
    owner_name: owner.display_name,
    previous_owner_id: prev,
  };
}

export { normalizeUsername };