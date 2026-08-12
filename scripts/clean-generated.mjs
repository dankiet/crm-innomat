import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  ".output",
  path.join(".vercel", "output"),
  path.join("node_modules", ".vite"),
  ".wrangler",
];

for (const relative of targets) {
  const target = path.resolve(root, relative);
  const insideRoot = target.startsWith(`${root}${path.sep}`);
  if (!insideRoot || target === root) {
    throw new Error(`Từ chối xóa đường dẫn ngoài workspace: ${target}`);
  }
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`[clean] ${relative}`);
}
