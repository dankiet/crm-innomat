/**
 * Image Asset Registry — một record cho MỘT physical image (content-addressed SHA-256).
 *
 * Bảng `image_assets` là source of truth cho metadata/lifecycle của physical image.
 * Các bảng reference cũ (product_images.path, products.image_path,
 * customer_mapping_items.image_path / custom_product_image_path,
 * gallery_collection_items.path, gallery_collections.cover_path) VẪN giữ path
 * trong giai đoạn đầu — registry không thay ref/URL (incremental, không breaking).
 *
 * Quy tắc:
 *  - Dedup bằng UNIQUE(sha256) + INSERT … ON CONFLICT (không SELECT-rồi-INSERT →
 *    tránh race khi 2 request upload cùng ảnh đồng thời).
 *  - Metadata lấy từ bước upload (sharp) — KHÔNG đọc lại file từ storage.
 *  - Mọi lỗi registry đều được log có cấu trúc; KHÔNG rollback storage (physical
 *    image vẫn sống, registry là lớp bổ sung) — bù lại bằng reconcile/backfill.
 *  - Không log raw image bytes.
 */
import { getDb, type AsyncDb } from "@/db/driver";
import { nowUtc } from "@/lib/format";
import {
  assetMetadataFromBuffer,
  sha256FromRef,
  storageKeyForRef,
  storageSafeRef,
} from "@/lib/image-asset-refs";

export interface ImageAssetRow {
  id: number;
  sha256: string;
  storage_key: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
  last_referenced_at: string;
  orphaned_at: string | null;
  gc_claimed_at: string | null;
  gc_completed_at: string | null;
}

export interface ImageAssetInput {
  sha256: string;
  storageKey: string;
  mimeType?: string;
  byteSize?: number;
  width?: number;
  height?: number;
}

function logImageAssets(event: string, fields: Record<string, string | number>): void {
  const kv = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  // console.error → lọt vào server log chuẩn của h3/Vercel; không chứa bytes ảnh.
  console.error(`[image-assets] ${event} ${kv}`);
}

export async function findImageAssetBySha256(
  db: AsyncDb,
  sha256: string,
): Promise<ImageAssetRow | null> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return null;
  try {
    const row = await db
      .prepare("SELECT * FROM image_assets WHERE sha256 = ?")
      .get<ImageAssetRow>(sha256);
    return row ?? null;
  } catch (error) {
    logImageAssets("lookup_failed", {
      sha256: sha256.slice(0, 12),
      error: error instanceof Error ? error.message.slice(0, 120) : String(error),
    });
    return null;
  }
}

async function touchImageAssetReference(db: AsyncDb, id: number): Promise<void> {
  const ts = nowUtc();
  try {
    await db
      .prepare(
        "UPDATE image_assets SET last_referenced_at = ?, updated_at = ?, orphaned_at = NULL WHERE id = ?",
      )
      .run(ts, ts, id);
  } catch (error) {
    // Không fail flow chính khi chỉ là touch metadata.
    logImageAssets("touch_failed", {
      id,
      error: error instanceof Error ? error.message.slice(0, 120) : String(error),
    });
  }
}

/**
 * Get-or-create theo SHA-256 — race-safe nhờ UNIQUE(sha256) + ON CONFLICT.
 * Bump last_referenced_at mỗi lần được trỏ tới (dedup = touch luôn).
 */
export async function getOrCreateImageAsset(
  db: AsyncDb,
  input: ImageAssetInput,
): Promise<ImageAssetRow | null> {
  const sha256 = input.sha256.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) return null;

  const existing = await findImageAssetBySha256(db, sha256);
  if (existing) {
    await touchImageAssetReference(db, existing.id);
    return existing;
  }

  const ts = nowUtc();
  try {
    await db
      .prepare(
        `INSERT INTO image_assets
           (sha256, storage_key, mime_type, byte_size, width, height,
            created_at, updated_at, last_referenced_at, orphaned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT (sha256) DO UPDATE SET
           last_referenced_at = excluded.last_referenced_at,
           updated_at = excluded.updated_at,
           orphaned_at = NULL`,
      )
      .run(
        sha256,
        input.storageKey,
        input.mimeType ?? "",
        input.byteSize ?? 0,
        input.width ?? 0,
        input.height ?? 0,
        ts,
        ts,
        ts,
      );
  } catch (error) {
    logImageAssets("create_failed", {
      sha256: sha256.slice(0, 12),
      error: error instanceof Error ? error.message.slice(0, 120) : String(error),
    });
    return null;
  }

  const row = await findImageAssetBySha256(db, sha256);
  if (!row) {
    // INSERT thành công nhưng SELECT lại không thấy — bất thường, log + trả null.
    logImageAssets("create_failed", {
      sha256: sha256.slice(0, 12),
      error: "row missing after upsert",
    });
    return null;
  }
  logImageAssets(row.created_at === ts ? "asset_created" : "asset_deduplicated", {
    id: row.id,
    sha256: sha256.slice(0, 12),
    storage_key: row.storage_key,
  });
  return row;
}

/**
 * Đăng ký ảnh theo ref có sẵn (flow add-by-path / legacy), best-effort:
 * chỉ ghi sha256/storage_key nếu ref là managed — KHÔNG đọc file (metadata
 * để backfill/ensure đầy đủ). Lỗi không làm fail flow gọi.
 */
export async function ensureImageAssetForRef(db: AsyncDb, ref: string): Promise<void> {
  const sha256 = sha256FromRef(ref);
  if (!sha256) return;
  try {
    await getOrCreateImageAsset(db, {
      sha256,
      storageKey: storageKeyForRef(ref),
    });
  } catch (error) {
    logImageAssets("create_failed", {
      sha256: sha256.slice(0, 12),
      error: error instanceof Error ? error.message.slice(0, 120) : String(error),
    });
  }
}

/**
 * Đánh dấu orphan cho physical image theo ref (khi ref không còn được trỏ tới
 * bởi bất kỳ bảng nào). Không xoá record — để lịch sử/reconcile.
 */
export async function markImageAssetOrphanedForPath(db: AsyncDb, ref: string): Promise<void> {
  const sha256 = sha256FromRef(ref);
  if (!sha256) return;
  try {
    await db
      .prepare(
        "UPDATE image_assets SET orphaned_at = ?, updated_at = ? WHERE sha256 = ? AND orphaned_at IS NULL",
      )
      .run(nowUtc(), nowUtc(), sha256);
  } catch (error) {
    logImageAssets("update_failed", {
      sha256: sha256.slice(0, 12),
      error: error instanceof Error ? error.message.slice(0, 120) : String(error),
    });
  }
}

/**
 * Backfill: tạo registry cho một path có sẵn, kèm metadata (đọc 1 lần).
 * Dùng cho script backfill khối lượng lớn — không chạy trong hot path.
 */
export async function registerImageAssetWithMetadata(
  db: AsyncDb,
  input: {
    ref: string;
    buffer: Buffer;
    width: number;
    height: number;
    mimeType: string;
  },
): Promise<ImageAssetRow | null> {
  const sha256 = sha256FromRef(input.ref);
  if (!sha256) return null;
  try {
    const meta = await assetMetadataFromBuffer(input.buffer);
    return await getOrCreateImageAsset(db, {
      sha256,
      storageKey: storageKeyForRef(input.ref),
      mimeType: input.mimeType || (meta.format ? `image/${meta.format}` : ""),
      byteSize: Buffer.byteLength(input.buffer),
      width: input.width || meta.width || 0,
      height: input.height || meta.height || 0,
    });
  } catch (error) {
    logImageAssets("metadata_failed", {
      sha256: sha256.slice(0, 12),
      ref: storageSafeRef(input.ref),
      error: error instanceof Error ? error.message.slice(0, 120) : String(error),
    });
    return null;
  }
}
