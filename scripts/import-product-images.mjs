/**
 * Import bổ sung ảnh sản phẩm theo docs/PRODUCT_IMAGES.md.
 *
 * Quét GẠCH BÔNG, GẠCH MOSAIC, GẠCH THẺ và GẠCH ỐP LÁT; giữ gallery/primary
 * hiện có, chỉ thêm ảnh mới bằng path ổn định theo hash nội dung.
 *
 * Usage:
 *   node scripts/import-product-images.mjs --dry-run
 *   node scripts/import-product-images.mjs --codes=IN20JM4,IN20JM5
 *   node scripts/import-product-images.mjs --sources="GẠCH ỐP LÁT"
 *   node scripts/import-product-images.mjs --max-images=8
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "crm.db");
const publicImages = path.join(root, "public", "images");
const SOURCE_PARENT = "Y:\\HÌNH GẠCH";
const SOURCE_FOLDERS = ["GẠCH BÔNG", "GẠCH MOSAIC", "GẠCH THẺ", "GẠCH ỐP LÁT"];
const MAX_SIDE = 1600;
const DEFAULT_MAX_IMAGES = 8;
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function parseArgs(argv) {
  const options = {
    codes: null,
    dryRun: false,
    maxImages: DEFAULT_MAX_IMAGES,
    sources: null,
    sourceParent: SOURCE_PARENT,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith("--codes=")) {
      const codes = arg
        .slice("--codes=".length)
        .split(",")
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
      options.codes = new Set(codes);
      continue;
    }
    if (arg.startsWith("--sources=")) {
      const sources = arg
        .slice("--sources=".length)
        .split(",")
        .map((source) => normalizedName(source.trim()))
        .filter(Boolean);
      options.sources = new Set(sources);
      continue;
    }
    if (arg.startsWith("--max-images=")) {
      const value = Number(arg.slice("--max-images=".length));
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--max-images phải là số nguyên dương.");
      }
      options.maxImages = value;
      continue;
    }
    if (arg.startsWith("--source-parent=")) {
      options.sourceParent = arg.slice("--source-parent=".length);
      continue;
    }
    throw new Error(`Tùy chọn không hợp lệ: ${arg}`);
  }

  return options;
}

function normalizedName(value) {
  return value.normalize("NFC").toLocaleLowerCase("vi-VN");
}

function resolveSourceFolders(sourceFilter, sourceParent) {
  if (!fs.existsSync(sourceParent)) {
    throw new Error(`Không thấy thư mục gốc: ${sourceParent}`);
  }

  const expectedFolders = sourceFilter
    ? SOURCE_FOLDERS.filter((folder) => sourceFilter.has(normalizedName(folder)))
    : SOURCE_FOLDERS;
  if (sourceFilter && expectedFolders.length !== sourceFilter.size) {
    const known = new Set(SOURCE_FOLDERS.map(normalizedName));
    const unknown = [...sourceFilter].filter((source) => !known.has(source));
    throw new Error(`Nguồn không hợp lệ: ${unknown.join(", ")}`);
  }

  const entries = fs.readdirSync(sourceParent, { withFileTypes: true });
  const sourceDirectories = [];
  const missing = [];

  for (const expectedName of expectedFolders) {
    const entry = entries.find(
      (candidate) =>
        candidate.isDirectory() && normalizedName(candidate.name) === normalizedName(expectedName),
    );
    if (!entry) {
      missing.push(expectedName);
      continue;
    }
    sourceDirectories.push({
      name: entry.name,
      path: path.join(sourceParent, entry.name),
    });
  }

  return { sourceDirectories, missing };
}

function walkFiles(dir, sourceName, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    console.warn(`  ! Không đọc được ${dir}: ${error.message}`);
    return out;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, sourceName, out);
    else if (entry.isFile()) out.push({ path: fullPath, sourceName });
  }
  return out;
}

function matchesCode(filePath, code) {
  const normalizedCode = code.toUpperCase();
  const haystack = filePath.toUpperCase();
  const escapedCode = normalizedCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bounded = new RegExp(`(?:^|[^A-Z0-9])${escapedCode}(?:[^A-Z0-9]|$)`, "i");
  return bounded.test(haystack);
}

function dedupeKey(filePath) {
  return path
    .basename(filePath)
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function qualityBonus(filePath) {
  const base = path.basename(filePath);
  const lower = filePath.toLowerCase();
  let score = 0;
  if (/[\\/]web[\\/]/i.test(lower) || /sp up web/i.test(lower) || /pc web/i.test(lower)) {
    score += 15;
  }
  if (/\.jpe?g$/i.test(base)) score += 5;
  const numberedCopy = base.match(/\((\d+)\)/);
  if (numberedCopy) score += Math.max(0, 12 - Number(numberedCopy[1]));
  return score;
}

function sortByQuality(items) {
  return [...items].sort(
    (a, b) =>
      b.quality - a.quality || a.path.normalize("NFC").localeCompare(b.path.normalize("NFC"), "vi"),
  );
}

const contentHashCache = new Map();

async function contentHash(filePath) {
  let promise = contentHashCache.get(filePath);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const input = fs.createReadStream(filePath);
      input.on("error", reject);
      input.on("data", (chunk) => hash.update(chunk));
      input.on("end", () => resolve(hash.digest("hex")));
    });
    contentHashCache.set(filePath, promise);
  }
  return promise;
}

async function rankImages(allFiles, code) {
  const candidates = allFiles
    .filter(
      (file) =>
        IMAGE_EXT.has(path.extname(file.path).toLowerCase()) && matchesCode(file.path, code),
    )
    .map((file) => ({
      ...file,
      quality: qualityBonus(file.path),
    }));

  const ranked = [];
  const seenNames = new Set();
  const seenContent = new Set();

  for (const item of sortByQuality(candidates)) {
    if (seenNames.has(dedupeKey(item.path))) continue;
    const hash = await contentHash(item.path);
    if (seenContent.has(hash)) continue;
    seenNames.add(dedupeKey(item.path));
    seenContent.add(hash);
    ranked.push({ ...item, hash });
  }

  return { candidates, ranked };
}

async function outputExtension(sourcePath) {
  const metadata = await sharp(sourcePath, { failOn: "none" }).metadata();
  return metadata.hasAlpha ? ".png" : ".jpg";
}

async function processImage(sourcePath, extension) {
  let pipeline = sharp(sourcePath, { failOn: "none" }).rotate();
  const metadata = await pipeline.metadata();
  if ((metadata.width ?? 0) > MAX_SIDE || (metadata.height ?? 0) > MAX_SIDE) {
    pipeline = pipeline.resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  return extension === ".png"
    ? pipeline.png({ compressionLevel: 8 }).toBuffer()
    : pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
}

function outputPath(buffer, extension) {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const fileName = `${hash}${extension}`;
  return {
    absolute: path.join(publicImages, fileName),
    web: `/images/${fileName}`,
  };
}

function printSummary(summary) {
  console.log("\n=== KẾT QUẢ ===");
  for (const entry of summary) {
    console.log(`${entry.code}: ${entry.status}${entry.detail ? ` · ${entry.detail}` : ""}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { sourceDirectories, missing } = resolveSourceFolders(options.sources, options.sourceParent);
  if (missing.length) {
    console.warn(`Không thấy thư mục nguồn: ${missing.join(", ")}`);
  }
  if (!sourceDirectories.length) {
    throw new Error("Không có thư mục nguồn nào để quét.");
  }

  console.log(
    `Theo docs/PRODUCT_IMAGES.md — tối đa ${options.maxImages} ảnh / mã${options.dryRun ? " (DRY RUN)" : ""}`,
  );
  const allFiles = sourceDirectories.flatMap(({ path: sourcePath, name }) => {
    console.log(`Quét ${sourcePath} …`);
    return walkFiles(sourcePath, name);
  });
  console.log(`Tổng file nguồn: ${allFiles.length}`);

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  const imageColumns = new Set(
    db.prepare("PRAGMA table_info(product_images)").all().map((column) => column.name),
  );
  if (imageColumns.has("kind")) {
    db.exec("ALTER TABLE product_images DROP COLUMN kind");
  }
  if (!options.dryRun) {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_unique_path
      ON product_images (product_id, path)
    `);
  }

  try {
    const products = db
      .prepare(
        "SELECT id, code, image_path FROM products WHERE TRIM(code) != '' ORDER BY code COLLATE NOCASE",
      )
      .all()
      .filter((product) => !options.codes || options.codes.has(product.code.toUpperCase()));
    const requestedCodes = options.codes?.size ?? 0;
    if (requestedCodes && products.length !== requestedCodes) {
      const foundCodes = new Set(products.map((product) => product.code.toUpperCase()));
      const unknown = [...options.codes].filter((code) => !foundCodes.has(code));
      if (unknown.length) console.warn(`Không có mã trong DB: ${unknown.join(", ")}`);
    }

    const listImages = db.prepare(
      `SELECT id, path, sort_order, is_primary
       FROM product_images WHERE product_id = ?
       ORDER BY is_primary DESC, sort_order ASC, id ASC`,
    );
    const insertImage = db.prepare(
      `INSERT INTO product_images (product_id, path, sort_order, is_primary, caption)
       VALUES (?, ?, ?, ?, '')`,
    );
    const updatePrimaryPath = db.prepare("UPDATE products SET image_path = ? WHERE id = ?");
    const summary = [];

    for (const product of products) {
      const existingImages = listImages.all(product.id);
      const seedLegacy = existingImages.length === 0 && Boolean(product.image_path);
      const initialCount = existingImages.length + Number(seedLegacy);
      const slots = Math.max(0, options.maxImages - initialCount);
      if (!slots) {
        summary.push({
          code: product.code,
          status: "SKIP — gallery đã đủ",
          detail: `${initialCount}/${options.maxImages} ảnh hiện có`,
        });
        continue;
      }

      const { candidates, ranked } = await rankImages(allFiles, product.code);
      if (!ranked.length) {
        summary.push({
          code: product.code,
          status: "SKIP — không tìm thấy ảnh",
          detail: candidates.length ? `${candidates.length} candidate bị trùng` : "",
        });
        continue;
      }

      const existingPaths = new Set(existingImages.map((image) => image.path));
      const additions = [];
      let errors = 0;
      let existingMatches = 0;

      for (const source of ranked) {
        if (additions.length >= slots) break;
        try {
          const extension = await outputExtension(source.path);
          const buffer = await processImage(source.path, extension);
          const destination = outputPath(buffer, extension);
          if (existingPaths.has(destination.web)) {
            existingMatches += 1;
            continue;
          }

          if (!options.dryRun && !fs.existsSync(destination.absolute)) {
            fs.mkdirSync(path.dirname(destination.absolute), { recursive: true });
            fs.writeFileSync(destination.absolute, buffer);
          }

          additions.push({
            ...source,
            ...destination,
          });
          existingPaths.add(destination.web);
        } catch (error) {
          errors += 1;
          console.warn(`  ! ${product.code}: lỗi ${source.path}: ${error.message}`);
        }
      }

      if (!additions.length) {
        summary.push({
          code: product.code,
          status: "SKIP — không có ảnh mới",
          detail: existingMatches ? `${existingMatches} path đã có` : `${errors} lỗi xử lý`,
        });
        continue;
      }

      if (options.dryRun) {
        for (const image of additions) {
          console.log(`  · ${product.code}: ${image.sourceName} → ${image.web}`);
        }
        summary.push({
          code: product.code,
          status: "DRY RUN",
          detail: `${additions.length} sẽ thêm; gallery ${initialCount} → ${initialCount + additions.length}`,
        });
        continue;
      }

      const firstImportedIsPrimary = initialCount === 0;
      const maxSort = existingImages.reduce(
        (maximum, image) => Math.max(maximum, image.sort_order),
        seedLegacy ? 0 : -1,
      );
      const writeChanges = db.transaction(() => {
        if (seedLegacy) {
          insertImage.run(product.id, product.image_path, 0, 1);
        }
        for (let index = 0; index < additions.length; index += 1) {
          const image = additions[index];
          insertImage.run(
            product.id,
            image.web,
            maxSort + 1 + index + Number(seedLegacy),
            firstImportedIsPrimary && index === 0 ? 1 : 0,
          );
        }
        if (firstImportedIsPrimary) {
          updatePrimaryPath.run(additions[0].web, product.id);
        }
      });
      writeChanges();

      for (const image of additions) {
        console.log(`  + ${product.code}: ${image.sourceName} → ${image.web}`);
      }
      summary.push({
        code: product.code,
        status: "OK",
        detail: `${additions.length} ảnh mới; gallery ${initialCount} → ${initialCount + additions.length}${errors ? `; ${errors} lỗi` : ""}`,
      });
    }

    printSummary(summary);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
