/**
 * Audit Gạch Ốp Lát: đối chiếu products.code với tên file trong
 * Y:\HÌNH GẠCH\GẠCH ỐP LÁT
 *
 * Run: node scripts/audit-gach-op-lat-images.mjs
 * Output: docs/audit-gach-op-lat/
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const OUT_DIR = path.join(root, "docs", "audit-gach-op-lat");
const Y_ROOT = process.env.GACH_OP_LAT_IMAGE_ROOT?.trim() || "Y:\\HÌNH GẠCH\\GẠCH ỐP LÁT";

const IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".jfif",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
]);

/**
 * Không crawl vào các folder phụ (bất kỳ cấp nào trong path).
 * Khớp không dấu, không phân biệt hoa thường.
 */
const SKIP_DIR_PATTERNS = [
  /(?:^|[\s_-])(?:ko|khong|no)[\s_-]*logo(?:$|[\s_-])/i,
  /logo\s*off/i,
  /hinh\s*(?:chup\s*)?thuc\s*te/i,
  /thuc\s*te\s*chup/i,
  /chup\s*thuc\s*te/i,
  /hinh\s*ma\s*cu/i,
  /(?:^|[\s_-])ma\s*cu(?:$|[\s_-])/i,
  // Folder tên "crawl" (không dùng nguồn crawl)
  /^crawl$/,
  /(?:^|[\s_-])crawl(?:$|[\s_-])/,
];

function foldDirName(name) {
  return String(name ?? "")
    .normalize("NFC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();
}

function shouldSkipDirectory(dirName) {
  const folded = foldDirName(dirName);
  if (!folded) return false;
  return SKIP_DIR_PATTERNS.some((re) => re.test(folded));
}

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
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
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

loadDotEnvFile(path.join(root, ".env"));
loadDotEnvFile(path.join(root, ".env.local"));

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  fs.writeFileSync(filePath, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
}

function normalizeCode(raw) {
  return String(raw ?? "")
    .normalize("NFC")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Bỏ hậu tố thường gặp trên tên file trước khi trích mã */
function stripFileNoise(baseName) {
  let s = baseName.normalize("NFC");
  // bỏ extension đã tách; xử lý (1) (2) (copy) v.v.
  s = s.replace(/\s*\(\d+\)\s*$/i, "");
  s = s.replace(/\s*-\s*copy$/i, "");
  s = s.replace(/\s+copy$/i, "");
  s = s.replace(/\s*_\s*ko\s*logo$/i, "");
  s = s.replace(/\s*-\s*ko\s*logo$/i, "");
  s = s.replace(/\s+ko\s*logo$/i, "");
  s = s.replace(/\s*-\s*nghiêng$/i, "");
  s = s.replace(/\s+nghiêng$/i, "");
  s = s.replace(/\s*-\s*khác$/i, "");
  s = s.replace(/\s+khác$/i, "");
  // Hậu tố kích thước: _300x600, -400X800, 300x600mm, …
  s = s.replace(/[_\s-]*\d{2,4}\s*[xX×]\s*\d{2,4}(?:\s*mm)?$/i, "");
  // Số thứ tự kiểu "6. IZA6618" / "01-MF..."
  s = s.replace(/^\d{1,3}[\s._-]+/, "");
  return s.trim();
}

function isPlausibleCode(c) {
  if (!c || c.length < 3 || c.length > 40) return false;
  if (!/[A-Z]/.test(c) || !/\d/.test(c)) return false;
  if (/^\d+$/.test(c)) return false;
  if (/^Z\d{10,}/.test(c)) return false; // zalo-ish
  if (/^[A-F0-9]{20,}$/i.test(c)) return false; // hash
  // Chỉ kích thước 300X600 không phải mã SP
  if (/^\d{2,4}X\d{2,4}(MM)?$/i.test(c)) return false;
  return true;
}

/**
 * Trích các ứng viên mã từ stem tên file.
 * Tách theo _ - khoảng trắng; bỏ hậu tố kích thước (MF36Y05F_300x600 → MF36Y05F).
 */
function extractCodesFromFileName(fileName) {
  const ext = path.extname(fileName);
  const stem = stripFileNoise(path.basename(fileName, ext));
  const codes = new Set();

  const consider = (raw) => {
    const c = normalizeCode(raw);
    if (isPlausibleCode(c)) codes.add(c);
  };

  consider(stem);

  // Tách segment: MF36Y05F_300x600 → MF36Y05F | 300x600
  for (const part of stem.split(/[_\s-]+/)) {
    if (!part) continue;
    const cleaned = part.replace(/\d{2,4}\s*[xX×]\s*\d{2,4}(?:\s*mm)?$/i, "");
    consider(cleaned || part);
    consider(part);
  }

  // Token chữ+số trong stem (không nuốt cả _size thành 1 mã)
  const tokenRe =
    /[A-Za-z][A-Za-z0-9]*\d[A-Za-z0-9]*|\d{2,6}[A-Za-z][A-Za-z0-9]*/g;
  for (const m of stem.match(tokenRe) || []) {
    consider(m);
  }

  return [...codes];
}

function walkImages(dir) {
  /** @type {Array<{relative_path:string, brand_folder:string, file_name:string, extracted_codes:string[]}>} */
  const out = [];
  /** @type {string[]} */
  const skippedDirs = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (err) {
      console.warn("Skip unreadable:", cur, err.message);
      continue;
    }
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        if (shouldSkipDirectory(ent.name)) {
          skippedDirs.push(path.relative(dir, full) || ent.name);
          continue; // không crawl vào folder này
        }
        stack.push(full);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!IMAGE_EXT.has(ext)) continue;
      const relative_path = path.relative(dir, full);
      const parts = relative_path.split(path.sep);
      // an toàn: nếu path vẫn chứa folder skip (không xảy ra nếu skip lúc walk)
      if (parts.some((p) => shouldSkipDirectory(p))) continue;
      const brand_folder = parts.length > 1 ? parts[0] : "(root)";
      const extracted_codes = extractCodesFromFileName(ent.name);
      out.push({
        relative_path,
        brand_folder,
        file_name: ent.name,
        extracted_codes,
      });
    }
  }
  return { images: out, skippedDirs };
}

async function loadCrmProducts(client) {
  const { rows } = await client.query(`
    SELECT
      p.id,
      p.code,
      p.name,
      p.supplier,
      p.category,
      p.image_path,
      COALESCE(img.image_count, 0)::int AS image_count
    FROM products p
    LEFT JOIN (
      SELECT product_id, COUNT(*)::int AS image_count
      FROM product_images
      GROUP BY product_id
    ) img ON img.product_id = p.id
    WHERE LOWER(TRIM(p.category)) = LOWER(TRIM('Gạch Ốp Lát'))
    ORDER BY p.code
  `);
  return rows;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const url =
    process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  if (!fs.existsSync(Y_ROOT)) {
    console.error("Y folder not found:", Y_ROOT);
    process.exit(1);
  }

  console.log("Y root:", Y_ROOT);
  console.log("Out:", OUT_DIR);

  const client = new pg.Client({
    connectionString: url,
    ssl: process.env.PG_SSL_DISABLE === "1" ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  let products;
  try {
    products = await loadCrmProducts(client);
  } finally {
    await client.end();
  }

  console.log("CRM Gạch Ốp Lát products:", products.length);

  const codeMap = new Map(); // normalized code -> product
  const dupCodes = [];
  for (const p of products) {
    const key = normalizeCode(p.code);
    if (!key) continue;
    if (codeMap.has(key)) {
      dupCodes.push(key);
      continue;
    }
    codeMap.set(key, p);
  }
  if (dupCodes.length) {
    console.warn("Duplicate normalized codes ignored (keep first):", dupCodes.slice(0, 20));
  }

  console.log("Indexing Y images…");
  const { images, skippedDirs } = walkImages(Y_ROOT);
  console.log("Y image files (after skip dirs):", images.length);
  console.log("Skipped directories:", skippedDirs.length);
  if (skippedDirs.length) {
    for (const d of skippedDirs.slice(0, 40)) console.log("  skip:", d);
    if (skippedDirs.length > 40) console.log(`  … +${skippedDirs.length - 40} more`);
  }

  // code -> list of image rows
  const yByCode = new Map();
  let yNoCode = 0;
  for (const img of images) {
    if (!img.extracted_codes.length) {
      yNoCode += 1;
      continue;
    }
    for (const c of img.extracted_codes) {
      if (!yByCode.has(c)) yByCode.set(c, []);
      yByCode.get(c).push(img);
    }
  }

  const matchedCrmIds = new Set();
  const matchedYPaths = new Set();
  const matchedRows = [];

  for (const [codeKey, p] of codeMap) {
    const hits = yByCode.get(codeKey);
    if (!hits?.length) continue;
    matchedCrmIds.add(p.id);
    const paths = [...new Set(hits.map((h) => h.relative_path))];
    for (const hp of paths) matchedYPaths.add(hp);
    const brands = [...new Set(hits.map((h) => h.brand_folder))].join(" | ");
    const hasCrmImage =
      (p.image_path && String(p.image_path).trim() !== "") || Number(p.image_count) > 0;
    matchedRows.push({
      id: p.id,
      code: p.code,
      name: p.name,
      supplier: p.supplier,
      image_path: p.image_path || "",
      image_count: p.image_count,
      crm_has_image: hasCrmImage ? "yes" : "no",
      y_file_count: paths.length,
      y_brand_folders: brands,
      y_paths: paths.join(" || "),
    });
  }
  matchedRows.sort((a, b) => String(a.code).localeCompare(String(b.code), "vi"));

  // 02: Y codes not in CRM, + files with no extractable code
  const yOnlyRows = [];
  const seenYOnlyCode = new Set();
  for (const [codeKey, hits] of yByCode) {
    if (codeMap.has(codeKey)) continue;
    if (seenYOnlyCode.has(codeKey)) continue;
    seenYOnlyCode.add(codeKey);
    const paths = [...new Set(hits.map((h) => h.relative_path))];
    const brands = [...new Set(hits.map((h) => h.brand_folder))].join(" | ");
    yOnlyRows.push({
      extracted_code: codeKey,
      y_file_count: paths.length,
      y_brand_folders: brands,
      y_paths: paths.join(" || "),
      note: "Mã trích từ tên file — không có products.code Gạch Ốp Lát khớp",
    });
  }
  yOnlyRows.sort((a, b) => a.extracted_code.localeCompare(b.extracted_code, "en"));

  const yUnparsedRows = images
    .filter((img) => img.extracted_codes.length === 0)
    .map((img) => ({
      extracted_code: "",
      y_file_count: 1,
      y_brand_folders: img.brand_folder,
      y_paths: img.relative_path,
      note: "Không trích được mã từ tên file",
      file_name: img.file_name,
    }));

  // 03 CRM no Y
  const crmNoY = [];
  for (const p of products) {
    if (matchedCrmIds.has(p.id)) continue;
    const hasCrmImage =
      (p.image_path && String(p.image_path).trim() !== "") || Number(p.image_count) > 0;
    crmNoY.push({
      id: p.id,
      code: p.code,
      name: p.name,
      supplier: p.supplier,
      image_path: p.image_path || "",
      image_count: p.image_count,
      crm_has_image: hasCrmImage ? "yes" : "no",
      note: "Không tìm thấy file Y có tên khớp products.code",
    });
  }
  crmNoY.sort((a, b) => String(a.code).localeCompare(String(b.code), "vi"));

  // 04 CRM no image on tab
  const crmNoImage = products
    .filter((p) => {
      const emptyPath = !p.image_path || String(p.image_path).trim() === "";
      return emptyPath && Number(p.image_count) === 0;
    })
    .map((p) => {
      const key = normalizeCode(p.code);
      const yHits = yByCode.get(key) || [];
      const paths = [...new Set(yHits.map((h) => h.relative_path))];
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        supplier: p.supplier,
        image_path: "",
        image_count: 0,
        has_y_source: paths.length ? "yes" : "no",
        y_file_count: paths.length,
        y_paths: paths.join(" || "),
      };
    })
    .sort((a, b) => String(a.code).localeCompare(String(b.code), "vi"));

  // 05 CRM has image — review
  const crmHasImage = products
    .filter((p) => {
      const has =
        (p.image_path && String(p.image_path).trim() !== "") || Number(p.image_count) > 0;
      return has;
    })
    .map((p) => {
      const key = normalizeCode(p.code);
      const yHits = yByCode.get(key) || [];
      const paths = [...new Set(yHits.map((h) => h.relative_path))];
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        supplier: p.supplier,
        image_path: p.image_path || "",
        image_count: p.image_count,
        has_y_source: paths.length ? "yes" : "no",
        y_file_count: paths.length,
        y_paths: paths.join(" || "),
        review_status: "",
      };
    })
    .sort((a, b) => String(a.code).localeCompare(String(b.code), "vi"));

  // index dumps
  writeCsv(
    path.join(OUT_DIR, "crm-gach-op-lat.csv"),
    ["id", "code", "name", "supplier", "category", "image_path", "image_count"],
    products.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      supplier: p.supplier,
      category: p.category,
      image_path: p.image_path || "",
      image_count: p.image_count,
    })),
  );

  writeCsv(
    path.join(OUT_DIR, "y-folder-images-index.csv"),
    ["relative_path", "brand_folder", "file_name", "extracted_codes"],
    images.map((img) => ({
      relative_path: img.relative_path,
      brand_folder: img.brand_folder,
      file_name: img.file_name,
      extracted_codes: img.extracted_codes.join("|"),
    })),
  );

  writeCsv(
    path.join(OUT_DIR, "01-matched.csv"),
    [
      "id",
      "code",
      "name",
      "supplier",
      "image_path",
      "image_count",
      "crm_has_image",
      "y_file_count",
      "y_brand_folders",
      "y_paths",
    ],
    matchedRows,
  );

  writeCsv(
    path.join(OUT_DIR, "02-y-only-or-unmapped.csv"),
    ["extracted_code", "y_file_count", "y_brand_folders", "y_paths", "note", "file_name"],
    [
      ...yOnlyRows.map((r) => ({ ...r, file_name: "" })),
      ...yUnparsedRows,
    ],
  );

  writeCsv(
    path.join(OUT_DIR, "03-crm-no-y-image.csv"),
    ["id", "code", "name", "supplier", "image_path", "image_count", "crm_has_image", "note"],
    crmNoY,
  );

  writeCsv(
    path.join(OUT_DIR, "04-crm-no-image-on-tab.csv"),
    [
      "id",
      "code",
      "name",
      "supplier",
      "image_path",
      "image_count",
      "has_y_source",
      "y_file_count",
      "y_paths",
    ],
    crmNoImage,
  );

  writeCsv(
    path.join(OUT_DIR, "05-crm-has-image-review.csv"),
    [
      "id",
      "code",
      "name",
      "supplier",
      "image_path",
      "image_count",
      "has_y_source",
      "y_file_count",
      "y_paths",
      "review_status",
    ],
    crmHasImage,
  );

  const summary = {
    generated_at: new Date().toISOString(),
    y_root: Y_ROOT,
    match_key: "products.code only (normalized uppercase, no spaces)",
    skip_dir_rules: [
      "không/ko/no logo",
      "hình chụp thực tế / thực tế chụp",
      "hình mã cũ / mã cũ",
      'folder tên "crawl"',
    ],
    skipped_directories: skippedDirs,
    skipped_directory_count: skippedDirs.length,
    crm_products: products.length,
    y_image_files: images.length,
    y_files_with_extracted_code: images.length - yNoCode,
    y_files_no_extracted_code: yNoCode,
    matched_codes: matchedRows.length,
    matched_with_crm_image: matchedRows.filter((r) => r.crm_has_image === "yes").length,
    matched_without_crm_image: matchedRows.filter((r) => r.crm_has_image === "no").length,
    y_extracted_codes_not_in_crm: yOnlyRows.length,
    y_files_unparsed: yUnparsedRows.length,
    crm_no_y_image: crmNoY.length,
    crm_no_image_on_tab: crmNoImage.length,
    crm_no_image_but_has_y: crmNoImage.filter((r) => r.has_y_source === "yes").length,
    crm_has_image_review: crmHasImage.length,
    crm_has_image_and_y: crmHasImage.filter((r) => r.has_y_source === "yes").length,
    crm_has_image_no_y: crmHasImage.filter((r) => r.has_y_source === "no").length,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "00-summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );

  const md = [
    `# Audit Gạch Ốp Lát — hình folder Y`,
    ``,
    `- Thời điểm: ${summary.generated_at}`,
    `- Folder Y: \`${summary.y_root}\``,
    `- Khớp theo: **${summary.match_key}**`,
    `- **Không crawl** folder: ${summary.skip_dir_rules.join("; ")}`,
    `- Số folder bị skip: **${summary.skipped_directory_count}**`,
    ``,
    `## Folder đã skip`,
    ``,
    ...(skippedDirs.length
      ? skippedDirs.map((d) => `- \`${d}\``)
      : ["- (không có)"]),
    ``,
    `## Số liệu`,
    ``,
    `| Chỉ số | Số |`,
    `|---|---:|`,
    `| SP CRM Gạch Ốp Lát | ${summary.crm_products} |`,
    `| File ảnh sau khi skip folder | ${summary.y_image_files} |`,
    `| File trích được mã | ${summary.y_files_with_extracted_code} |`,
    `| File không trích được mã | ${summary.y_files_no_extracted_code} |`,
    `| **01 matched** (có mã + có file) | **${summary.matched_codes}** |`,
    `| ↳ matched đã có ảnh CRM | ${summary.matched_with_crm_image} |`,
    `| ↳ matched chưa có ảnh CRM | ${summary.matched_without_crm_image} |`,
    `| **02** mã/file không map CRM | codes: ${summary.y_extracted_codes_not_in_crm} + unparsed files: ${summary.y_files_unparsed} |`,
    `| **03** có mã CRM, không có hình folder | **${summary.crm_no_y_image}** |`,
    `| **04** tab SP chưa có ảnh | **${summary.crm_no_image_on_tab}** (trong đó có nguồn folder: ${summary.crm_no_image_but_has_y}) |`,
    `| **05** tab SP đã có ảnh (cần soi) | **${summary.crm_has_image_review}** (có folder: ${summary.crm_has_image_and_y}, không folder: ${summary.crm_has_image_no_y}) |`,
    ``,
    `## File`,
    ``,
    `- \`01-matched.csv\``,
    `- \`02-y-only-or-unmapped.csv\``,
    `- \`03-crm-no-y-image.csv\``,
    `- \`04-crm-no-image-on-tab.csv\``,
    `- \`05-crm-has-image-review.csv\``,
    `- \`crm-gach-op-lat.csv\`, \`y-folder-images-index.csv\`, \`00-summary.json\``,
    ``,
    `## Gợi ý xử lý`,
    ``,
    `1. Làm \`04\` có \`has_y_source=yes\` trước — upload ảnh từ \`y_paths\`.`,
    `2. Xem \`03\` — thiếu nguồn folder (đã loại ko logo / thực tế / mã cũ), tìm thêm hoặc bỏ qua.`,
    `3. Review \`05\` trên tab sản phẩm; sai thì xóa ảnh cũ và thêm lại.`,
    `4. \`02\` — kiểm tra mã file có cần tạo SP / đổi tên file không.`,
    ``,
  ].join("\n");

  fs.writeFileSync(path.join(OUT_DIR, "README.md"), md, "utf8");

  console.log(JSON.stringify(summary, null, 2));
  console.log("Done →", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
