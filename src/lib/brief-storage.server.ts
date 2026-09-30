/**
 * Lưu trữ file đính kèm brief trên bucket RIÊNG TƯ.
 *
 * Tách hẳn khỏi `storage.server.ts` (bucket ảnh public) vì hai lý do khác nhau:
 *
 *  1. **Bảo mật** — mặt bằng / phối cảnh là dữ liệu dự án của khách. Bucket ảnh
 *     là `public: true`, URL vĩnh viễn, ai có link là xem được. Ở đây object
 *     không đọc được nếu không có signed URL TTL ngắn do server ký.
 *  2. **Toàn vẹn định dạng** — luồng ảnh re-encode mọi thứ sang `.webp`; PDF
 *     (mặt bằng, CAD export) sẽ bị phá. Ở đây bytes được giữ NGUYÊN VẸN.
 *
 * Chế độ local (dev, thiếu cấu hình Supabase): ghi dưới `.local-brief-files/`
 * — cố ý KHÔNG nằm trong `public/`, để môi trường dev cũng không phục vụ file
 * brief như tài nguyên tĩnh.
 */
import fs from "node:fs";
import path from "node:path";

import {
  BRIEF_BUCKET,
  supabaseCredentials,
  supabaseStorageClient,
} from "@/lib/storage.server";

/** Tiền tố object trên bucket — tách khỏi mọi thứ khác trong cùng bucket. */
const OBJECT_PREFIX = "brief";

/** Thư mục local mode. Không nằm trong `public/` — xem ghi chú đầu file. */
function localRoot(): string {
  return path.join(process.cwd(), ".local-brief-files");
}

/**
 * Token do server sinh, cũng chính là tên object.
 *
 * `crypto.randomUUID()` là CSPRNG; token đoán được sẽ cho phép người ngoài ghi
 * đè / dò object của khách khác.
 */
export function newAttachmentToken(): string {
  return `${OBJECT_PREFIX}/${crypto.randomUUID()}`;
}

/** Signed URL để browser PUT thẳng file lên bucket, không qua server app. */
export async function createBriefUploadUrl(
  token: string,
): Promise<{ uploadUrl: string } | { error: string }> {
  const storage = await supabaseStorageClient();
  if (!storage) {
    // Local mode: trả về route nội bộ do `src/routes/api.brief-upload.ts` phục vụ.
    return { uploadUrl: `/api/brief-upload?token=${encodeURIComponent(token)}` };
  }
  const { data, error } = await storage.from(BRIEF_BUCKET).createSignedUploadUrl(token);
  if (error || !data?.signedUrl) {
    return { error: error?.message ?? "Không tạo được URL tải lên" };
  }
  return { uploadUrl: data.signedUrl };
}

/**
 * Ghi bytes vào object (chỉ dùng ở local mode).
 *
 * Production đi đường signed URL: browser PUT thẳng lên Supabase nên file 10MB
 * không đụng trần body request của Vercel.
 */
export async function writeBriefObjectLocal(
  token: string,
  bytes: Uint8Array,
): Promise<boolean> {
  try {
    const file = path.join(localRoot(), token);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return true;
  } catch (err) {
    console.error(`[brief-storage] ghi local ${token} lỗi:`, err);
    return false;
  }
}

/** Object đã tồn tại chưa — dùng để chặn token không có file thật. */
export async function briefObjectExists(token: string): Promise<boolean> {
  const storage = await supabaseStorageClient();
  if (!storage) {
    try {
      return fs.existsSync(path.join(localRoot(), token));
    } catch {
      return false;
    }
  }
  const { data, error } = await storage.from(BRIEF_BUCKET).info(token);
  if (error || !data) return false;
  return true;
}

/** Đọc `length` byte đầu của object — đầu vào cho `detectBriefFileKind`. */
export async function readBriefObjectHead(
  token: string,
  length: number,
): Promise<Uint8Array | null> {
  const storage = await supabaseStorageClient();
  if (!storage) {
    try {
      const fd = fs.openSync(path.join(localRoot(), token), "r");
      try {
        const buf = Buffer.alloc(length);
        const read = fs.readSync(fd, buf, 0, length, 0);
        return read > 0 ? new Uint8Array(buf.subarray(0, read)) : null;
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return null;
    }
  }

  // Đọc thẳng bằng service key kèm `Range`: rẻ hơn hẳn tải cả file về chỉ để
  // xem 12 byte đầu, và không cần ký URL chỉ để kiểm tra nội bộ.
  const creds = supabaseCredentials();
  if (!creds) return null;
  try {
    const res = await fetch(
      `${creds.url}/storage/v1/object/${BRIEF_BUCKET}/${encodeURI(token)}`,
      {
        headers: {
          apikey: creds.key,
          Authorization: `Bearer ${creds.key}`,
          Range: `bytes=0-${length - 1}`,
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Kích thước object (byte). `null` nếu không đọc được. */
export async function briefObjectSize(token: string): Promise<number | null> {
  const storage = await supabaseStorageClient();
  if (!storage) {
    try {
      return fs.statSync(path.join(localRoot(), token)).size;
    } catch {
      return null;
    }
  }
  const { data, error } = await storage.from(BRIEF_BUCKET).info(token);
  if (error || !data) return null;
  // `info()` trả union có/không có `size`; narrow bằng `in` thay vì cast.
  if ("size" in data && typeof data.size === "number") return data.size;
  return null;
}

/**
 * Signed URL tải xuống, TTL ngắn, kèm `Content-Disposition: attachment`.
 *
 * `download` buộc trình duyệt tải file thay vì render — đây là lá chắn cuối
 * chống stored XSS: kể cả định dạng có lọt qua magic bytes, nó cũng không được
 * thực thi trong ngữ cảnh trang.
 */
export async function createBriefDownloadUrl(
  token: string,
  fileName: string,
  ttlSeconds: number,
): Promise<string | null> {
  const storage = await supabaseStorageClient();
  if (!storage) {
    // Local mode: route nội bộ tự phục vụ, cũng kèm attachment.
    return `/api/brief-file?token=${encodeURIComponent(token)}`;
  }
  const { data, error } = await storage
    .from(BRIEF_BUCKET)
    .createSignedUrl(token, ttlSeconds, { download: fileName });
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Đọc toàn bộ bytes của object (chỉ dùng ở local mode). */
export async function readBriefObjectBytes(token: string): Promise<Uint8Array | null> {
  try {
    const buf = fs.readFileSync(path.join(localRoot(), token));
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/**
 * Xoá object. Trả `true` khi object đã KHÔNG còn (xoá xong hoặc vốn không có).
 *
 * Caller phải dùng giá trị trả về: nuốt lỗi ở đây chính là cách file mồ côi
 * sinh ra trong khi DB đã xoá row.
 */
export async function deleteBriefObject(token: string): Promise<boolean> {
  const storage = await supabaseStorageClient();
  if (!storage) {
    try {
      const file = path.join(localRoot(), token);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return true;
    } catch (err) {
      console.error(`[brief-storage] xoá local ${token} lỗi:`, err);
      return false;
    }
  }
  const { error } = await storage.from(BRIEF_BUCKET).remove([token]);
  if (error) {
    console.error(`[brief-storage] xoá ${token} thất bại: ${error.message}`);
    return false;
  }
  return true;
}
