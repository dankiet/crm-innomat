/**
 * Nạp `.env` + `.env.local` cho script CLI.
 *
 * Ngữ nghĩa giữ nguyên như loader cũ nằm rải trong `media-verify.mjs` /
 * `media-backfill.mjs`: đọc `.env` trước `.env.local`, và **chỉ set khi biến
 * còn trống** — biến đã có trong môi trường luôn thắng (override được khi
 * chạy CI hoặc trỏ sang DB/storage khác).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Gốc repo — `scripts/lib/env.mjs` → lên 2 cấp. */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadEnv(root = repoRoot) {
  for (const file of [".env", ".env.local"]) {
    const filePath = path.join(root, file);
    if (!fs.existsSync(filePath)) continue;
    for (const rawLine of fs.readFileSync(filePath, "utf-8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
    }
  }
}
