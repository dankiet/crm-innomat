import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new Database(path.join(root, "data", "crm.db"), { readonly: true });
const rows = db
  .prepare(
    `SELECT path FROM product_images
     UNION ALL SELECT image_path AS path FROM products WHERE image_path != ''
     UNION ALL SELECT image_path AS path FROM customer_mapping_items WHERE image_path != ''
     UNION ALL SELECT custom_product_image_path AS path FROM customer_mapping_items
       WHERE custom_product_image_path != ''`,
  )
  .all();

const unique = new Set(rows.map((row) => row.path).filter(Boolean));
let missing = 0;
let legacy = 0;
let urls = 0;
for (const publicPath of unique) {
  if (/^https?:\/\//i.test(publicPath)) {
    urls += 1;
    continue;
  }
  if (!publicPath.startsWith("/images/")) {
    legacy += 1;
  }
  const absolute = path.join(root, "public", publicPath.replace(/^\/+/, ""));
  if (!fs.existsSync(absolute)) {
    missing += 1;
    if (missing <= 10) console.log(`MISSING ${publicPath}`);
  }
}

const integrity = db.pragma("integrity_check", { simple: true });
const foreignKeys = db.pragma("foreign_key_check").length;
db.close();

console.log({ uniqueRefs: unique.size, missing, legacy, urls, integrity, foreignKeys });
if (missing || legacy || integrity !== "ok" || foreignKeys) process.exitCode = 1;
