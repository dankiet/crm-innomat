/**
 * Lớp lưu trữ ảnh dùng chung.
 *
 *  - Production: Supabase Storage, token `SUPABASE_SERVICE_ROLE_KEY` + URL `SUPABASE_URL`,
 *    bucket public `SUPABASE_STORAGE_BUCKET` (mặc định `crm-images`).
 *    Ref trả về là URL công khai.
 *  - Local mode (dev, thiếu key): ghi vào public/images, ref trả về
 *    `/images/<hash>.<ext>`.
 *
 * Tên file content-addressed theo SHA-256 → tự chống trùng.
 */
import fs from "node:fs";
import path from "node:path";

import { contentHashOf } from "@/lib/image-asset-refs";
import { StorageClient } from "@supabase/storage-js";

let storageClient: StorageClient | null = null;
let supabaseUrl: string | null = null;

function config(): { url: string; key: string; bucket: string } | null {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return {
    url: url.replace(/\/+$/, ""),
    key,
    bucket: (process.env.SUPABASE_STORAGE_BUCKET ?? "crm-images")
      .replace(/^\//, "")
      .replace(/\/+$/, ""),
  };
}

async function loadStorage(): Promise<StorageClient | null> {
  const cfg = config();
  if (!cfg) return null;
  if (!storageClient || supabaseUrl !== cfg.url) {
    storageClient = new StorageClient(`${cfg.url}/storage/v1`, {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
    });
    supabaseUrl = cfg.url;
  }
  return storageClient;
}

const STORAGE_PREFIX = (process.env.SUPABASE_STORAGE_PREFIX ?? "crm").replace(/\/+$/, "");

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function filenameFor(buffer: Buffer, ext: string): Promise<string> {
  const hash = await contentHashOf(buffer);
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
  return `${hash}${safeExt.toLowerCase()}`;
}

function publicUrl(cfg: { url: string; bucket: string }, objectPath: string): string {
  return `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${objectPath}`;
}

/** Lưu buffer ảnh → trả về ref (Supabase URL hoặc đường dẫn /images/...). */
export async function putImageBuffer(buffer: Buffer, ext: string): Promise<string> {
  const filename = await filenameFor(buffer, ext);
  const objectPath = `${STORAGE_PREFIX}/${filename}`;

  const storage = await loadStorage();
  if (storage) {
    const cfg = config()!;
    const { error } = await storage.from(cfg.bucket).upload(objectPath, buffer, {
      contentType:
        MIME_BY_EXT[filename.slice(filename.lastIndexOf("."))] ?? "application/octet-stream",
      cacheControl: "31536000",
      upsert: true,
    });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
    return publicUrl(cfg, objectPath);
  }

  // Local mode
  const dir = path.join(process.cwd(), "public", "images");
  fs.mkdirSync(dir, { recursive: true });
  const absolute = path.join(dir, filename);
  if (!fs.existsSync(absolute)) fs.writeFileSync(absolute, buffer);
  return `/images/${filename}`;
}

/** Đọc bytes ảnh từ ref (Supabase URL hoặc đường dẫn cục bộ). null nếu không tồn tại. */
export async function readImageBytes(ref: string): Promise<Buffer | null> {
  if (!ref) return null;
  if (/^https?:\/\//.test(ref)) {
    try {
      const res = await fetch(ref, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf;
    } catch {
      return null;
    }
  }
  try {
    const file = path.join(process.cwd(), "public", ref.replace(/^\//, ""));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return fs.readFileSync(file);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Xoá 1 file ảnh theo `storage_key` (tên file content-addressed).
 *
 * Chỉ dùng cho đường **XOÁ VĨNH VIỄN** (`deleteMediaAssetFn` trên `/luu-tru`).
 * Nhận thẳng key từ row `media_assets` thay vì parse lại URL hiển thị — không
 * phụ thuộc `path` có phải URL hợp lệ hay không.
 *
 * Trả `true` khi file đã KHÔNG còn (xoá xong, hoặc vốn không tồn tại), `false`
 * khi Storage/local từ chối xoá. Caller PHẢI dùng giá trị trả về: nuốt lỗi ở
 * đây chính là cách file mồ côi sinh ra trong khi UI vẫn báo "đã xoá vĩnh viễn".
 */
export async function deleteImageKey(key: string): Promise<boolean> {
  if (!key) return true;
  const objectPath = STORAGE_PREFIX ? `${STORAGE_PREFIX}/${key}` : key;
  const storage = await loadStorage();
  if (storage) {
    const cfg = config()!;
    try {
      const { error } = await storage.from(cfg.bucket).remove([objectPath]);
      if (error) {
        console.error(`[storage] xoá ${objectPath} thất bại: ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error(
        `[storage] xoá ${objectPath} lỗi: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
  // Chế độ local (thiếu cấu hình Supabase): file nằm ở public/images.
  try {
    const file = path.join(process.cwd(), "public", "images", key);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return true;
  } catch (err) {
    console.error(
      `[storage] xoá file local ${key} thất bại: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
