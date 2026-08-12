import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.resolve(root, ".vercel", "output", "static", "images");

if (!target.startsWith(`${root}${path.sep}`) || target === root) {
  throw new Error(`Từ chối xóa đường dẫn ngoài workspace: ${target}`);
}

if (fs.existsSync(target)) {
  fs.rmSync(target, { recursive: true, force: true });
  console.log("[postbuild] Đã loại public/images khỏi Vercel output");
}
