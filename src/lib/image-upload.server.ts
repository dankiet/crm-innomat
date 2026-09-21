import { putImageBuffer } from "@/lib/storage.server";
import { getDb } from "@/db/driver";
import { getOrCreateImageAsset } from "@/lib/image-assets.server";
import { normalizeWebpBuffer, sha256FromRef, storageKeyForRef } from "@/lib/image-asset-refs";

const IMAGE_MAX_SIDE = 1600;
const IMAGE_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;

/**
 * Giữ API cũ (chỉ trả buffer); metadata đi theo `normalizeUploadImageBufferMeta`.
 * Không re-encode: sharp chỉ đọc header khi gọi .metadata().
 */
export async function normalizeUploadImageBuffer(input: Buffer): Promise<Buffer> {
  const { buffer } = await normalizeUploadImageBufferMeta(input);
  return buffer;
}

/** Chuẩn ảnh upload + metadata (width/height/mime) lấy ngay tại bước xử lý. */
export async function normalizeUploadImageBufferMeta(input: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
}> {
  return await normalizeWebpBuffer(input);
}

/** Đăng ký asset sau khi upload storage thành công — best-effort, không fail flow. */
async function registerUploadedAsset(
  ref: string,
  buffer: Buffer,
  meta: { width: number; height: number; mimeType: string },
): Promise<void> {
  try {
    const sha256 = sha256FromRef(ref);
    if (!sha256) return;
    await getOrCreateImageAsset(getDb(), {
      sha256,
      storageKey: storageKeyForRef(ref),
      mimeType: meta.mimeType,
      byteSize: Buffer.byteLength(buffer),
      width: meta.width,
      height: meta.height,
    });
  } catch (error) {
    console.error(
      `[image-assets] register_failed ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`,
    );
  }
}

export async function saveBase64Image(dataBase64: string): Promise<string> {
  const match = dataBase64.match(/^data:([^;]+);base64,(.+)$/);
  const rawBuffer = Buffer.from(match ? match[2]! : dataBase64, "base64");
  if (rawBuffer.length > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error("Ảnh quá lớn (tối đa 12MB sau khi xử lý ở trình duyệt)");
  }
  const { buffer, width, height, mimeType } = await normalizeUploadImageBufferMeta(rawBuffer);
  const ref = await putImageBuffer(buffer, ".webp");
  await registerUploadedAsset(ref, buffer, { width, height, mimeType });
  return ref;
}
