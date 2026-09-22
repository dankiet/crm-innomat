/**
 * Delayed Garbage Collection cho physical image files (Task 2, trên Task 1 registry).
 *
 * Lifecycle:
 *   last reference removed → orphaned_at set (xem markImageAssetOrphanedForPath)
 *   → chờ retention (IMAGE_GC_RETENTION_HOURS, mặc định 24h)
 *   → GC claim (gc_claimed_at) → RE-CHECK references → vẫn orphan →
 *     deleteImageObject (storage) → gc_completed_at.
 *   Nếu được reference lại trước/trong lúc chờ → orphaned_at được clear
 *   (touch/upsert) → GC bỏ qua (revived).
 *
 * Bảo đảm race-safety không cần lock bảng reference:
 *  - claim qua UPDATE … WHERE id IN (subquery LIMIT batch) RETURNING — atomi:
 *    2 worker chạy cùng lúc nhận các id KHÁC nhau (statement-level).
 *  - re-check reference NGAY TRƯỚC khi xoá storage (5 cột, LIKE tail = storage_key).
 *  - storage delete thất bại → unclaim (gc_claimed_at = NULL) → retry lần sau.
 *  - crash giữa chừng → claim quá hạn (GC_CLAIM_GRACE_MINUTES) được nhận lại.
 *  - gc_completed_at chỉ set SAU khi storage delete thành công (idempotent:
 *    deleteImageObject không throw khi object đã mất).
 *
 * Chạy độc lập, không nằm trong request user. Gọi qua:
 *   npm run images:gc            → scripts/image-gc.ts (dry-run: --dry-run)
 *   hoặc import runImageGc(...) từ scheduler khác.
 */
import { getDb, type AsyncDb } from "@/db/driver";
import { nowUtc } from "@/lib/format";
import { deleteImageObject } from "@/lib/storage.server";

import { gcCutoffUtc, gcRetentionHours, orphanAgeHours } from "@/lib/image-asset-refs";

export const GC_CLAIM_GRACE_MINUTES = 10;
export const GC_BATCH_MAX = 1000;

function logGc(event: string, fields: Record<string, string | number>): void {
  const kv = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.error(`[image-gc] ${event} ${kv}`);
}

export interface ImageGcCandidate {
  id: number;
  sha256: string;
  storage_key: string;
  orphaned_at: string;
  orphan_age_hours: number;
  reason: string;
}

export interface ImageGcOptions {
  batchSize?: number;
  retentionHours?: number;
  dryRun?: boolean;
  now?: Date;
  db?: AsyncDb;
  /** Seam cho test: mặc định deleteImageObject (storage.server). */
  deleteObject?: (storageKey: string) => Promise<void>;
}

export interface ImageGcReport {
  dryRun: boolean;
  retentionHours: number;
  batchSize: number;
  orphanedNotReady: number;
  candidates: number;
  claimed: number;
  revived: number;
  deleted: number;
  completed: number;
  storageFailures: number;
  dbFailures: number;
  skippedRecords: number;
  sample: ImageGcCandidate[];
  startedAt: string;
  finishedAt: string;
}

type ReferenceCountRow = { n: number };

/** Đếm reference đang trỏ tới storage_key này (LIKE tail trên 5 cột path). */
export async function countImageReferencesForKey(db: AsyncDb, storageKey: string): Promise<number> {
  if (!storageKey) return 0;
  const pattern = `%/${storageKey}`;
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM product_images WHERE path LIKE ?) +
         (SELECT COUNT(*) FROM products WHERE image_path LIKE ?) +
         (SELECT COUNT(*) FROM customer_mapping_items WHERE image_path LIKE ?) +
         (SELECT COUNT(*) FROM customer_mapping_items WHERE custom_product_image_path LIKE ?) +
         (SELECT COUNT(*) FROM gallery_collection_items WHERE path LIKE ?)
       AS n`,
    )
    .get<ReferenceCountRow>(pattern, pattern, pattern, pattern, pattern);
  return row?.n ?? 0;
}

/**
 * Liệt kê candidate hợp lệ (orphaned ≥ retention, chưa completed) — dùng cho
 * dry-run và làm subquery batch cho claim. Không mutate.
 */
export async function collectImageGcCandidates(options: ImageGcOptions = {}): Promise<{
  candidates: ImageGcCandidate[];
  orphanedNotReady: number;
}> {
  const db = options.db ?? getDb();
  const retentionHours = options.retentionHours ?? gcRetentionHours();
  const batchSize = Math.min(Math.max(1, Math.floor(options.batchSize ?? 100)), GC_BATCH_MAX);
  const now = options.now ?? new Date();
  const cutoff = gcCutoffUtc(retentionHours, now);

  const ready = await db
    .prepare(
      `SELECT id, sha256, storage_key, orphaned_at FROM image_assets
       WHERE orphaned_at IS NOT NULL AND orphaned_at <= ? AND gc_completed_at IS NULL
       ORDER BY orphaned_at ASC LIMIT ?`,
    )
    .all<{ id: number; sha256: string; storage_key: string; orphaned_at: string }>(
      cutoff,
      batchSize,
    );
  const notReady = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM image_assets
       WHERE orphaned_at IS NOT NULL AND orphaned_at > ? AND gc_completed_at IS NULL`,
    )
    .get<{ n: number }>(cutoff);

  return {
    orphanedNotReady: notReady?.n ?? 0,
    candidates: ready.map((r) => ({
      id: r.id,
      sha256: r.sha256,
      storage_key: r.storage_key,
      orphaned_at: r.orphaned_at,
      orphan_age_hours: Math.round(orphanAgeHours(r.orphaned_at, now) * 10) / 10,
      reason: "orphaned_past_retention",
    })),
  };
}

/**
 * Pipeline GC đầy đủ: claim → re-check → delete → complete.
 * dryRun: chỉ báo cáo candidate, không claim/delete/mutate.
 * Idempotent + retry-safe (xem header file).
 */
export async function runImageGc(options: ImageGcOptions = {}): Promise<ImageGcReport> {
  const db = options.db ?? getDb();
  const retentionHours = options.retentionHours ?? gcRetentionHours();
  const batchSize = Math.min(Math.max(1, Math.floor(options.batchSize ?? 100)), GC_BATCH_MAX);
  const dryRun = options.dryRun === true;
  const now = options.now ?? new Date();
  const deleteObject = options.deleteObject ?? deleteImageObject;
  const startedAt = nowUtc();

  logGc("gc_started", {
    dry_run: dryRun ? 1 : 0,
    batch_size: batchSize,
    retention_hours: retentionHours,
  });

  const report: ImageGcReport = {
    dryRun,
    retentionHours,
    batchSize,
    orphanedNotReady: 0,
    candidates: 0,
    claimed: 0,
    revived: 0,
    deleted: 0,
    completed: 0,
    storageFailures: 0,
    dbFailures: 0,
    skippedRecords: 0,
    sample: [],
    startedAt,
    finishedAt: "",
  };

  const { candidates, orphanedNotReady } = await collectImageGcCandidates({
    db,
    retentionHours,
    batchSize,
    now,
  });
  report.orphanedNotReady = orphanedNotReady;
  report.candidates = candidates.length;
  report.sample = candidates.map((c) => ({ ...c }));

  if (dryRun) {
    for (const c of candidates) {
      logGc("gc_candidate", {
        id: c.id,
        sha256: c.sha256.slice(0, 12),
        storage_key: c.storage_key,
        orphaned_at: c.orphaned_at,
        age_hours: c.orphan_age_hours,
        reason: "dry_run",
      });
    }
    report.finishedAt = nowUtc();
    logGc("gc_completed", {
      dry_run: 1,
      candidates: candidates.length,
      orphaned_not_ready: orphanedNotReady,
    });
    return report;
  }

  // Claim atomically
  const cutoff = gcCutoffUtc(retentionHours, now);
  const claimTs = nowUtc();
  // Claim quá hạn = gc_claimed_at ≤ now - 10p (worker crash) → được nhận lại.
  const graceCutoff = gcCutoffUtc(GC_CLAIM_GRACE_MINUTES / 60, now);
  const claimedRows = await db
    .prepare(
      `UPDATE image_assets SET gc_claimed_at = ?, updated_at = ?
       WHERE id IN (
         SELECT id FROM image_assets
         WHERE orphaned_at IS NOT NULL AND orphaned_at <= ?
           AND gc_completed_at IS NULL
         ORDER BY orphaned_at ASC LIMIT ?
       )
         AND gc_completed_at IS NULL
         AND (gc_claimed_at IS NULL OR gc_claimed_at <= ?)
       RETURNING id, sha256, storage_key, orphaned_at`,
    )
    .all<{ id: number; sha256: string; storage_key: string; orphaned_at: string }>(
      claimTs,
      claimTs,
      cutoff,
      batchSize,
      graceCutoff,
    );
  report.claimed = claimedRows.length;
  for (const row of claimedRows) {
    logGc("gc_claimed", {
      id: row.id,
      sha256: row.sha256.slice(0, 12),
      storage_key: row.storage_key,
    });
  }

  for (const row of claimedRows) {
    // Phòng thủ: chỉ xoá key content-address hợp lệ (registry invariant).
    // Row hỏng/legacy với key lạ sẽ không bao giờ chạm storage.
    if (!/^[0-9a-f]{64}\.[a-z0-9]+$/i.test(row.storage_key)) {
      report.skippedRecords += 1;
      // Unclaim để lần chạy sau thấy lại (không kẹt claimed vĩnh viễn).
      await db
        .prepare("UPDATE image_assets SET gc_claimed_at = NULL, updated_at = ? WHERE id = ?")
        .run(nowUtc(), row.id);
      logGc("gc_skipped", {
        id: row.id,
        storage_key: String(row.storage_key).slice(0, 40),
        reason: "non_content_addressed_key",
      });
      continue;
    }

    // ── CRITICAL: re-check references ngay trước khi xoá ──
    const references = await countImageReferencesForKey(db, row.storage_key);
    if (references > 0) {
      // Revived: có reference mới trong lúc chờ GC → bỏ qua, clear orphan.
      await db
        .prepare(
          "UPDATE image_assets SET orphaned_at = NULL, gc_claimed_at = NULL, last_referenced_at = ?, updated_at = ? WHERE id = ?",
        )
        .run(nowUtc(), nowUtc(), row.id);
      report.revived += 1;
      logGc("gc_revived", {
        id: row.id,
        sha256: row.sha256.slice(0, 12),
        storage_key: row.storage_key,
      });
      continue;
    }

    // ── Xoá physical storage (idempotent) ──
    try {
      await deleteObject(row.storage_key);
    } catch (error) {
      // Giữ orphan; unclaim để lần chạy sau retry.
      report.storageFailures += 1;
      await db
        .prepare("UPDATE image_assets SET gc_claimed_at = NULL, updated_at = ? WHERE id = ?")
        .run(nowUtc(), row.id);
      logGc("gc_storage_delete_failed", {
        id: row.id,
        sha256: row.sha256.slice(0, 12),
        storage_key: row.storage_key,
        error: error instanceof Error ? error.message.slice(0, 120) : String(error),
      });
      continue;
    }
    report.deleted += 1;
    logGc("gc_storage_delete_success", {
      id: row.id,
      storage_key: row.storage_key,
    });

    // ── Complete lifecycle (chỉ sau khi storage đã xoá) ──
    try {
      await db
        .prepare("UPDATE image_assets SET gc_completed_at = ?, updated_at = ? WHERE id = ?")
        .run(nowUtc(), nowUtc(), row.id);
      report.completed += 1;
      logGc("gc_db_cleanup_complete", { id: row.id, storage_key: row.storage_key });
    } catch (error) {
      // storage đã xoá nhưng DB update fail → row còn claimed; lần sau re-claim
      // (grace) + deleteImageObject idempotent + complete — không crash.
      report.dbFailures += 1;
      logGc("gc_db_cleanup_failed", {
        id: row.id,
        error: error instanceof Error ? error.message.slice(0, 120) : String(error),
      });
    }
  }

  report.finishedAt = nowUtc();
  logGc("gc_completed", {
    dry_run: 0,
    candidates: report.candidates,
    claimed: report.claimed,
    deleted: report.deleted,
    completed: report.completed,
    revived: report.revived,
    storage_failures: report.storageFailures,
    db_failures: report.dbFailures,
  });
  return report;
}
