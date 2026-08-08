/**
 * Lớp lưu trữ ảnh dùng chung.
 *
 *  - Blob mode (production): Vercel Blob, token `BLOB_READ_WRITE_TOKEN`.
 *    Ref trả về là URL công khai.
 *  - Local mode (dev, thiếu token): ghi vào public/images, ref trả về
 *    `/images/<hash>.<ext>`.
 *
 * Tên file content-addressed theo SHA-256 → tự chống trùng.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

type BlobPut = (
  pathname: string,
  body: Buffer,
  options: { access: "public"; contentType?: string; token?: string },
) => Promise<{ url: string }>;

let blobModule: typeof import("@vercel/blob") | null = null;

async function loadBlob(): Promise<typeof import("@vercel/blob") | null> {
  if (!(process.env.BLOB_READ_WRITE_TOKEN ?? "").trim()) return null;
  if (!blobModule) {
    blobModule = await import("@vercel/blob");
  }
  return blobModule;
}

export function isBlobMode(): boolean {
  return !!(process.env.BLOB_READ_WRITE_TOKEN ?? "").trim();
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

/** Ref hình ảnh do CRM quản lý (Blob URL hoặc /images/...). */
export function isManagedImageRef(ref: string): boolean {
  if (!ref) return false;
  if (ref.startsWith("/images/")) return true;
  try {
    const u = new URL(ref);
    return u.hostname.endsWith("blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Lưu buffer ảnh → trả về ref (Blob URL hoặc đường dẫn /images/...). */
export async function putImageBuffer(
  buffer: Buffer,
  ext: string,
): Promise<string> {
  const filename = filenameFor(buffer, ext);

  const blob = await loadBlob();
  if (blob) {
    const pathname = `${BLOB_PREFIX}/${filename}`;
    try {
      const existing = await blob.head(pathname);
      if (existing?.url) return existing.url;
    } catch {
      /* chưa tồn tại → tạo mới */
    }
    const { url } = await blob.put(pathname, buffer, {
      access: "public",
      contentType: MIME_BY_EXT[filename.slice(filename.lastIndexOf("."))] ?? "application/octet-stream",
    });
    return url;
  }

  // Local mode
  const dir = path.join(process.cwd(), "public", "images");
  fs.mkdirSync(dir, { recursive: true });
  const absolute = path.join(dir, filename);
  if (!fs.existsSync(absolute)) fs.writeFileSync(absolute, buffer);
  return `/images/${filename}`;
}

/** Đọc bytes ảnh từ ref (Blob URL hoặc đường dẫn cục bộ). null nếu không tồn tại. */
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
  if (/^https?:\/\//.test(ref)) {
    const blobMod = await loadBlob();
    if (!blobMod) return;
    try {
      await blobMod.del([ref]);
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

/** Kiểm tra xem ref có đang trỏ tới file thật không (dùng để bỏ ảnh chết khi render). */
export async function imageExists(ref: string): Promise<boolean> {
  if (!ref) return false;
  if (/^https?:\/\//.test(ref)) {
    try {
      const res = await fetch(ref, { method: "HEAD", signal: AbortSignal.timeout(6000) });
      return res.ok;
    } catch {
      return false;
    }
  }
  try {
    const file = path.join(process.cwd(), "public", ref.replace(/^\//, ""));
    return fs.existsSync(file) && fs.statSync(file).isFile();
  } catch {
    return false;
  }
}