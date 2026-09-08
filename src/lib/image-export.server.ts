import { readImageBytes } from "@/lib/storage";
import { stampDataUrl } from "@/lib/brand-assets.server";

/**
 * Nén ảnh cho file xuất (báo giá / đề xuất vật liệu).
 *
 * Ảnh trong storage được lưu ở cạnh dài tối đa 1600px (xem
 * `image-upload.server.ts`) nhưng tài liệu xuất chỉ render ảnh khu vực ở
 * ~470px và ảnh vật liệu ở ~108px. Nhúng nguyên bản làm file phình lên
 * nhiều MB, nên ở đây resize riêng cho từng mục đích.
 *
 * KHÔNG dùng `normalizeUploadImageBuffer` cho việc này: hàm đó trả nguyên
 * input nếu ảnh đã là WebP ≤1600px, tức là không nén gì với ảnh đã upload
 * qua CRM.
 */
export const EXPORT_AREA_MAX_SIDE = 1000;
export const EXPORT_THUMB_MAX_SIDE = 260;
export const EXPORT_JPEG_QUALITY = 78;
/** Con dấu render ở 135px, giữ 2× cho màn hình retina và bản in. */
export const EXPORT_STAMP_MAX_SIDE = 270;

/** Chạy fn trên từng phần tử với giới hạn concurrency. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

function mimeFromRef(ref: string): string {
  if (/\.png(\?|$)/i.test(ref)) return "image/png";
  if (/\.webp(\?|$)/i.test(ref)) return "image/webp";
  return "image/jpeg";
}

/**
 * Resize + nén về JPEG. Trả `null` khi sharp không xử lý được để caller
 * fallback về buffer gốc — một ảnh lỗi không được làm hỏng cả file xuất.
 */
export async function resizeForExport(
  input: Buffer,
  maxSide: number,
): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(input, { failOn: "none" })
      .rotate()
      .resize({
        width: maxSide,
        height: maxSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: EXPORT_JPEG_QUALITY,
        mozjpeg: true,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer();
  } catch {
    return null;
  }
}

export type ExportImagePool = {
  /** Data URI đã nén cho `ref`; "" nếu thiếu ref hoặc đọc không được. */
  load: (ref: string, maxSide: number) => Promise<string>;
};

/**
 * Pool cho MỘT lần xuất: dedupe theo `ref|maxSide` nên cùng một ảnh dùng ở
 * nhiều khu vực chỉ đọc + resize + base64 đúng một lần.
 */
export function createExportImagePool(): ExportImagePool {
  const cache = new Map<string, Promise<string>>();
  return {
    load(ref, maxSide) {
      if (!ref) return Promise.resolve("");
      const cacheKey = `${ref}|${maxSide}`;
      const hit = cache.get(cacheKey);
      if (hit) return hit;
      const task = (async () => {
        const buf = await readImageBytes(ref);
        if (!buf) return "";
        const resized = await resizeForExport(buf, maxSide);
        return resized
          ? `data:image/jpeg;base64,${resized.toString("base64")}`
          : `data:${mimeFromRef(ref)};base64,${buf.toString("base64")}`;
      })();
      cache.set(cacheKey, task);
      return task;
    },
  };
}

let shrunkStamp: Promise<string> | null = null;

/**
 * Con dấu đỏ gốc là PNG 90KB nhưng chỉ render 135px và có mặt trong mọi file
 * xuất. Giữ PNG vì cần alpha cho `mix-blend-mode:multiply`.
 */
export function exportStampDataUrl(): Promise<string> {
  if (!shrunkStamp) {
    shrunkStamp = (async () => {
      const match = stampDataUrl.match(/^data:[^;]+;base64,(.+)$/);
      if (!match) return stampDataUrl;
      try {
        const sharp = (await import("sharp")).default;
        const out = await sharp(Buffer.from(match[1]!, "base64"), { failOn: "none" })
          .resize({
            width: EXPORT_STAMP_MAX_SIDE,
            height: EXPORT_STAMP_MAX_SIDE,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png({ compressionLevel: 9, palette: true })
          .toBuffer();
        return `data:image/png;base64,${out.toString("base64")}`;
      } catch {
        return stampDataUrl;
      }
    })();
  }
  return shrunkStamp;
}
