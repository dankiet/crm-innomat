import { putImageBuffer } from "@/lib/storage.server";
import { normalizeWebpBuffer } from "@/lib/image-asset-refs";

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

export async function saveBase64Image(dataBase64: string): Promise<string> {
  const match = dataBase64.match(/^data:([^;]+);base64,(.+)$/);
  const rawBuffer = Buffer.from(match ? match[2]! : dataBase64, "base64");
  if (rawBuffer.length > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error("Ảnh quá lớn (tối đa 12MB sau khi xử lý ở trình duyệt)");
  }
  const { buffer } = await normalizeUploadImageBufferMeta(rawBuffer);
  return await putImageBuffer(buffer, ".webp");
}
