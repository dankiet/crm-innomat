/**
 * Hàm thuần cho ref ảnh managed — KHÔNG import alias `@/` (node --test không
 * resolve tsconfig paths; các lib thuần trong repo đều alias-free như file này).
 *
 *  - content-addressing: sha256 = identity của physical image.
 *  - parse ref → sha256 / storage_key (managed refs: /images/* hoặc supabase.co/*).
 *  - chuẩn hoá ảnh upload qua sharp.
 */
// `node:crypto` chỉ được nạp lazy (dynamic) — module này là isomorphic, client
// bundle phải nạp được (chip usage ở /luu-tru import `storageKeyForRef`); static
// import `node:crypto` bị Vite externalize → crash browser. `import type` bị
// erase nên an toàn.
import type { createHash } from "node:crypto";

const MANAGED_FILE = /^([0-9a-f]{64})(\.[a-z0-9]+)?$/i;

let createHashFn: typeof createHash | null = null;

/**
 * SHA-256 hex của buffer — async vì lazy-load crypto; chỉ dùng phía server
 * (upload), client không bao giờ gọi tới.
 */
export async function contentHashOf(buffer: Buffer): Promise<string> {
  if (!createHashFn) {
    const mod = await import("node:crypto");
    createHashFn = mod.createHash;
  }
  return createHashFn!("sha256").update(buffer).digest("hex");
}

/** Tên file (tail) từ ref — "<sha>.<ext>" với managed ref hợp lệ, "" nếu không. */
export function registryFileName(ref: string): string {
  if (!ref) return "";
  const base = ref.startsWith("/images/")
    ? ref.slice("/images/".length)
    : (() => {
        try {
          return (new URL(ref).pathname.split("/").pop() ?? "").trim();
        } catch {
          return "";
        }
      })();
  return MANAGED_FILE.test(base) ? base : "";
}

/** storage_key content-address: "<sha256>.<ext>" — ổn định mọi môi trường. */
export function storageKeyForRef(ref: string): string {
  return registryFileName(ref);
}

export const ASSET_MAX_SIDE = 1600;

/**
 * Chuẩn buffer ảnh (rotate → resize ≤1600 → webp 82%) + metadata kết quả.
 * Giữ nguyên buffer nếu đã là webp ≤1600. Không re-encode khi chỉ cần metadata.
 */
export async function normalizeWebpBuffer(input: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
}> {
  const sharp = (await import("sharp")).default;
  let pipeline = sharp(input, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  if (meta.format === "webp" && width <= ASSET_MAX_SIDE && height <= ASSET_MAX_SIDE) {
    const outMeta = await sharp(input).metadata();
    return {
      buffer: input,
      width: outMeta.width ?? width,
      height: outMeta.height ?? height,
      mimeType: "image/webp",
    };
  }

  if (width > ASSET_MAX_SIDE || height > ASSET_MAX_SIDE) {
    pipeline = pipeline.resize({
      width: ASSET_MAX_SIDE,
      height: ASSET_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const buffer = await pipeline.webp({ quality: 82, effort: 4 }).toBuffer();
  const outMeta = await sharp(buffer).metadata();
  return {
    buffer,
    width: outMeta.width ?? width,
    height: outMeta.height ?? height,
    mimeType: "image/webp",
  };
}
