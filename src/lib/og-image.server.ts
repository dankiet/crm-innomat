/**
 * Ảnh xem trước khi chia sẻ link (Open Graph) cho landing "Em bán gạch".
 *
 * Vì sao phải SINH ảnh chứ không trỏ thẳng vào hero: hero trong `lp_settings` là
 * `.webp` (đường ảnh do CRM upload), mà bộ thu thập OG của Facebook **không nhận
 * WebP** — chỉ JPEG/PNG/GIF. Trỏ thẳng vào hero thì không có ảnh xem trước nào.
 *
 * Nên ảnh được dựng lại: tải hero về, cắt về 1200×630 (tỉ lệ vàng OG), xuất JPEG.
 * Nếu hero lỗi hoặc chưa cấu hình thì rơi về logo dạng raster trên nền thương
 * hiệu — link chia sẻ vẫn có ảnh, không bao giờ trắng.
 *
 * Kết quả cache trong RAM theo `url|version`, vì Facebook gọi lại nhiều lần và
 * mỗi lần convert tốn ~100ms CPU.
 */
import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

/** Kích thước chuẩn OG: 1200×630 (1.91:1). */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Nền thương hiệu khi phải dùng ảnh dự phòng (khớp `BrandMark`). */
const BRAND_BG = { r: 31, g: 43, b: 51 }; // #1F2B33

/** Ảnh đã dựng, cache theo khoá `url|version`. */
const cache = new Map<string, Buffer>();

/** Cache có trần: hero đổi URL hiếm, nhưng đừng để Map phình vô hạn. */
const MAX_CACHE_ENTRIES = 8;

function remember(key: string, buffer: Buffer): Buffer {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, buffer);
  return buffer;
}

/** Tải bytes từ URL; `null` nếu lỗi/timeout/không phải ảnh. */
async function fetchBytes(url: string): Promise<Buffer | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Ảnh dự phòng: logo em bán gạch trên nền thương hiệu.
 *
 * SVG được rasterize bằng sharp với `density` cao để nét ở 1200×630. Logo đặt
 * giữa khung, chừa viền — đúng kiểu ảnh OG của thương hiệu. Kích thước chọn để
 * khớp chính xác khung: 400 + 400 + 400 = 1200, 400 + 115 + 115 = 630.
 */
async function buildFallback(): Promise<Buffer> {
  // Đọc qua `process.cwd()` giống `src/server.ts` — đường dẫn tương đối theo
  // `import.meta.url` không còn đúng sau khi nitro bundle.
  const svg = await fs.readFile(path.join(process.cwd(), "public", "favicon-ebg.svg"));
  return await sharp(svg, { density: 600 })
    .resize(400, 400, { fit: "contain", background: { ...BRAND_BG, alpha: 0 } })
    .extend({
      top: 115,
      bottom: 115,
      left: 400,
      right: 400,
      background: BRAND_BG,
    })
    .flatten({ background: BRAND_BG })
    .jpeg({ quality: 88, progressive: true })
    .toBuffer();
}

/**
 * Dựng ảnh OG từ hero. Trả JPEG 1200×630.
 *
 * `heroUrl` rỗng hoặc tải lỗi → ảnh dự phòng. Không bao giờ throw: đây là ảnh
 * xem trước, hỏng ảnh không được làm hỏng trang.
 */
export async function buildOgImage(heroUrl: string | null | undefined): Promise<Buffer> {
  const url = (heroUrl ?? "").trim();
  const key = url || "__fallback__";

  const cached = cache.get(key);
  if (cached) return cached;

  if (!url) return remember(key, await buildFallback());

  const bytes = await fetchBytes(url);
  if (!bytes) return remember(key, await buildFallback());

  try {
    const jpeg = await sharp(bytes)
      // `cover` để lấp đầy khung; ảnh hero thường cao hơn 1.91:1 nên sẽ cắt bớt
      // trên/dưới — giữ đúng chủ thể ở giữa.
      .resize(OG_WIDTH, OG_HEIGHT, { fit: "cover", position: "centre" })
      .flatten({ background: BRAND_BG })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
    return remember(key, jpeg);
  } catch {
    return remember(key, await buildFallback());
  }
}

/** Xoá cache (dùng trong test). */
export function clearOgImageCache(): void {
  cache.clear();
}
