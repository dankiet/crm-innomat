/**
 * Lớp lưu trữ ảnh dùng chung.
 *
 *  - Production: Supabase Storage, token `SUPABASE_SERVICE_ROLE_KEY` + URL `SUPABASE_URL`,
 *    bucket public `BLOB_BUCKET` (mặc định `crm-images`).
 *    Ref trả về là URL công khai.
 *  - Local mode (dev, thiếu key): ghi vào public/images, ref trả về
 *    `/images/<hash>.<ext>`.
 *
 * Tên file content-addressed theo SHA-256 → tự chống trùng.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

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
    bucket: (process.env.BLOB_BUCKET ?? "crm-images").replace(/^\//, "").replace(/\/+$/, ""),
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

const BLOB_PREFIX = (process.env.BLOB_STORE_PREFIX ?? "crm").replace(/\/+$/, "");

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function filenameFor(buffer: Buffer, ext: string): string {
  const hash = createHash("sha256").update(buffer).digest("hex");
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
  return `${hash}${safeExt.toLowerCase()}`;
}

/** Ref hình ảnh do CRM quản lý (Supabase URL hoặc /images/...). */
export function isManagedImageRef(ref: string): boolean {
  if (!ref) return false;
  if (ref.startsWith("/images/")) return true;
  try {
    const u = new URL(ref);
    return u.hostname.endsWith("supabase.co");
  } catch {
    return false;
  }
}

function publicUrl(cfg: { url: string; bucket: string }, objectPath: string): string {
  return `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${objectPath}`;
}

/** Lưu buffer ảnh → trả về ref (Supabase URL hoặc đường dẫn /images/...). */
export async function putImageBuffer(
  buffer: Buffer,
  ext: string,
): Promise<string> {
  const filename = filenameFor(buffer, ext);
  const objectPath = `${BLOB_PREFIX}/${filename}`;

  const storage = await loadStorage();
  if (storage) {
    const cfg = config()!;
    try {
      const { data, error } = await storage.from(cfg.bucket).info(objectPath);
      if (!error && data) return publicUrl(cfg, objectPath);
    } catch {
      /* chưa tồn tại → upload mới */
    }
    const { error } = await storage.from(cfg.bucket).upload(objectPath, buffer, {
      contentType: MIME_BY_EXT[filename.slice(filename.lastIndexOf("."))] ?? "application/octet-stream",
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
export async function readImageBytes(
  ref: string,
): Promise<Buffer | null> {
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

/** Xoá 1 file ảnh theo ref (chỉ xoá khi không còn bản ghi tham chiếu — caller tự kiểm tra). */
export async function deleteImageRef(ref: string): Promise<void> {
  if (!ref) return;
  const storage = await loadStorage();
  if (/^https?:\/\//.test(ref) && storage) {
    const cfg = config()!;
    try {
      const url = new URL(ref);
      const objectPath = decodeURIComponent(url.pathname.replace(`/storage/v1/object/public/${cfg.bucket}/`, ""));
      if (objectPath && objectPath !== url.pathname) {
        await storage.from(cfg.bucket).remove([objectPath]);
      }
    } catch {
      /* ignore */
    }
    return;
  }
  if (ref.startsWith("/images/")) {
    try {
      const file = path.join(process.cwd(), "public", ref.replace(/^\//, ""));
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}
