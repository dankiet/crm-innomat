export type Role = "admin" | "user";

export type AppUser = {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  is_active: number;
  phone?: string;
  created_at: string;
  updated_at: string;
};

/** Safe user payload for client (no password_hash). */
export type SessionUser = {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  is_active: number;
  phone?: string;
};

export type AuditLog = {
  id: number;
  user_id: number | null;
  username: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  summary: string;
  meta_json: string;
  created_at: string;
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Quản trị",
  user: "Sales",
};

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
