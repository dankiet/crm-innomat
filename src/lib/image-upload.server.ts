import { putImageBuffer } from "@/lib/storage";

const IMAGE_MAX_SIDE = 1600;
const IMAGE_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;

export async function normalizeUploadImageBuffer(input: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  let pipeline = sharp(input, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  if (meta.format === "webp" && width <= IMAGE_MAX_SIDE && height <= IMAGE_MAX_SIDE) {
    return input;
  }

  if (width > IMAGE_MAX_SIDE || height > IMAGE_MAX_SIDE) {
    pipeline = pipeline.resize({
      width: IMAGE_MAX_SIDE,
      height: IMAGE_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  return await pipeline.webp({ quality: 82, effort: 4 }).toBuffer();
}

export async function saveBase64Image(dataBase64: string): Promise<string> {
  const match = dataBase64.match(/^data:([^;]+);base64,(.+)$/);
  const rawBuffer = Buffer.from(match ? match[2]! : dataBase64, "base64");
  if (rawBuffer.length > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error("Ảnh quá lớn (tối đa 12MB sau khi xử lý ở trình duyệt)");
  }
  const normalized = await normalizeUploadImageBuffer(rawBuffer);
  return await putImageBuffer(normalized, ".webp");
}
