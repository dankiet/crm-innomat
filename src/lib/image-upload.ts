const CLIENT_IMAGE_MAX_SIDE = 1600;
const CLIENT_IMAGE_MAX_BYTES = 30 * 1024 * 1024;

export async function readImageFileAsWebpDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} không phải file ảnh`);
  }
  if (file.size > CLIENT_IMAGE_MAX_BYTES) {
    throw new Error(`${file.name} vượt quá 30MB`);
  }
  if (typeof createImageBitmap !== "function") {
    return readOriginalFileAsDataUrl(file);
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, CLIENT_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      throw new Error("Trình duyệt không thể xử lý ảnh");
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    return await new Promise<string>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Không thể chuyển ảnh sang WebP"));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Không đọc được ảnh WebP"));
          reader.readAsDataURL(blob);
        },
        "image/webp",
        0.82,
      );
    });
  } catch {
    return await readOriginalFileAsDataUrl(file);
  }
}

function readOriginalFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được file ảnh"));
    reader.readAsDataURL(file);
  });
}
