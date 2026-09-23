/**
 * Hàm thuần cho Image Asset Registry — KHÔNG import alias `@/` (node --test không
 * resolve tsconfig paths; các lib thuần trong repo đều alias-free như file này).
 *
 *  - content-addressing: sha256 = identity của physical image.
 *  - parse ref → sha256 / storage_key (managed refs: /images/* hoặc supabase.co/*).
 *  - metadata qua sharp (header-only, không re-encode).
 */
// `node:crypto` chỉ được nạp lazy (dynamic) — module này là isomorphic, client
// bundle phải nạp được vì `gcEstimatedDeleteText` dùng ở /luu-tru; static import
// `node:crypto` bị Vite externalize → crash browser. Static import không thể dùng
// vì đây là builtin không tồn tại ở môi trường browser. `import type` bị erase nên
// an toàn.
import type { createHash } from "node:crypto";

const SHA256_HEX = /^[0-9a-f]{64}$/;
const MANAGED_FILE = /^([0-9a-f]{64})(\.[a-z0-9]+)?$/i;

let createHashFn: typeof createHash | null = null;

/**
 * SHA-256 hex của buffer — async vì lazy-load crypto; chỉ dùng phía server
 * (upload/registry), client không bao giờ gọi tới.
 */
export async function contentHashOf(buffer: Buffer): Promise<string> {
  if (!createHashFn) {
    const mod = await import("node:crypto");
    createHashFn = mod.createHash;
  }
  return createHashFn!("sha256").update(buffer).digest("hex");
}

/** Ref hình ảnh do CRM quản lý: /images/<sha>.<ext> hoặc supabase.co/<prefix>/<sha>.<ext>. */
export function isRegistryRef(ref: string): boolean {
  if (!ref) return false;
  if (ref.startsWith("/images/")) return true;
  try {
    return new URL(ref).hostname.endsWith("supabase.co");
  } catch {
    return false;
  }
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

/** sha256 (64 hex) từ managed ref; null nếu ref không phải managed/hợp lệ. */
export function sha256FromRef(ref: string): string | null {
  const file = registryFileName(ref);
  if (!file) return null;
  const m = MANAGED_FILE.exec(file);
  return m ? m[1]!.toLowerCase() : null;
}

/** storage_key content-address: "<sha256>.<ext>" — ổn định mọi môi trường. */
export function storageKeyForRef(ref: string): string {
  return registryFileName(ref);
}

/** Không log toàn bộ ref (chứa URL) — chỉ phần storage key. */
export function storageSafeRef(ref: string): string {
  return registryFileName(ref) || ref.slice(0, 80);
}

/** Metadata ảnh (width/height/format) qua sharp — đọc header, không re-encode. */
export async function assetMetadataFromBuffer(buffer: Buffer): Promise<{
  width: number;
  height: number;
  format: string;
}> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(buffer).metadata();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    format: meta.format ?? "",
  };
}

export const ASSET_MAX_SIDE = 1600;

/** Retention mặc định của Delayed GC (giờ) — IMAGE_GC_RETENTION_HOURS nếu có. */
export const GC_RETENTION_HOURS_DEFAULT = 24;

export function gcRetentionHours(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.IMAGE_GC_RETENTION_HOURS);
  return Number.isFinite(raw) && raw >= 0 ? raw : GC_RETENTION_HOURS_DEFAULT;
}

/** now - retention, cùng định dạng nowUtc() ('YYYY-MM-DD HH:MM:SS') để so chuỗi. */
export function gcCutoffUtc(retentionHours: number, now: Date = new Date()): string {
  return new Date(now.getTime() - Math.max(0, retentionHours) * 3_600_000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

/** Countdown human-readable: "Xóa sau ~18 giờ" (hoặc phút), rỗng nếu không parse được. */
export function gcEstimatedDeleteText(
  orphanedAt: string,
  retentionHours: number,
  now: Date = new Date(),
): string {
  const t = Date.parse(orphanedAt.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return "";
  const deleteAt = t + Math.max(0, retentionHours) * 3_600_000;
  const remainingMs = deleteAt - now.getTime();
  if (remainingMs <= 0) return "Đã hết hạn, chờ GC xử lý";
  const hours = Math.floor(remainingMs / 3_600_000);
  if (hours >= 1) return `Xóa sau ~${hours} giờ`;
  return `Xóa sau ~${Math.max(1, Math.ceil(remainingMs / 60_000))} phút`;
}

/** Độ tuổi orphan (giờ) — cho báo cáo dry-run. */
export function orphanAgeHours(orphanedAt: string, now: Date = new Date()): number {
  const t = Date.parse(orphanedAt.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (now.getTime() - t) / 3_600_000);
}

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
