import { getDb } from "./index.server";
import type { AuditLog, SessionUser } from "@/lib/auth-types";

export async function writeAudit(input: {
  user?: SessionUser | null;
  user_id?: number | null;
  username?: string;
  action: string;
  entity_type?: string;
  entity_id?: number | null;
  summary?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const userId = input.user?.id ?? input.user_id ?? null;
  const username =
    input.user?.username ?? input.username ?? (userId ? "" : "system");

  try {
    await getDb()
      .prepare(
        `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, summary, meta_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        username,
        input.action,
        input.entity_type ?? "",
        input.entity_id ?? null,
        input.summary ?? "",
        JSON.stringify(input.meta ?? {}),
      );
  } catch {
    // Never break business flow because of audit failure
  }
}

export async function listAuditLogs(opts?: {
  limit?: number;
  userId?: number;
  action?: string;
}): Promise<AuditLog[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (opts?.userId) {
    where.push("user_id = ?");
    params.push(opts.userId);
  }
  if (opts?.action?.trim()) {
    where.push("action LIKE ?");
    params.push(`%${opts.action.trim()}%`);
  }

  params.push(limit);
  return await getDb()
    .prepare(
      `SELECT * FROM audit_logs
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all<AuditLog>(...params);
}