/**
 * Dọn dẹp ảnh sản phẩm: audit, dedupe SHA-256 chính xác, resize ảnh >1600px, quarantine file orphan.
 *
 * Mặc định là DRY RUN (chỉ in kế hoạch). Thêm --apply để thực thi.
 *
 * Usage:
 *   node scripts/image-cleanup.mjs audit
 *   node scripts/image-cleanup.mjs dedupe            # kế hoạch
 *   node scripts/image-cleanup.mjs dedupe --apply    # thực thi (tự backup DB trước)
 *   node scripts/image-cleanup.mjs optimize --apply
 *   node scripts/image-cleanup.mjs quarantine --apply
 *   node scripts/image-cleanup.mjs near-duplicates
 *   node scripts/image-cleanup.mjs apply-review --report=data/reports/near-duplicates-review.json --apply
 *   node scripts/image-cleanup.mjs clean-review --report=data/reports/near-duplicates-review.json --apply
 *   node scripts/image-cleanup.mjs backup [--images]
 *   node scripts/image-cleanup.mjs all --apply
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
const publicRoot = path.join(root, "public");
const backupRoot = path.join(root, "data", "backups");
const quarantineRoot = path.join(root, "data", "image-quarantine");
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_SIDE = 1600;

/** Các thư mục web trong public mà ta quét (web path gốc → thư mục tuyệt đối). */
const SCAN_ROOTS = [
  { web: "/images/", abs: path.join(publicRoot, "images") },
];

// ─── Đọc tham số ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const cmd = argv.find((a) => !a.startsWith("--")) || "audit";
  const apply = argv.includes("--apply");
  const images = argv.includes("--images");
  const reportArg = argv.find((a) => a.startsWith("--report="));
  const report = reportArg ? reportArg.slice("--report=".length) : null;
  const unknown = argv.filter(
    (a) =>
      a.startsWith("--") &&
      a !== "--apply" &&
      a !== "--images" &&
      !a.startsWith("--report="),
  );
  if (unknown.length) throw new Error(`Tùy chọn không hợp lệ: ${unknown.join(", ")}`);
  return { cmd, apply, images, report };
}

function timestamp() {
  return new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
}

// ─── Tiện ích chung ──────────────────────────────────────────────────────────

function bytes(value) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = value;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}

function walkFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, out);
    else if (entry.isFile()) out.push(fullPath);
  }
  return out;
}

/** Quét toàn bộ file trong các thư mục web ảnh, trả về { abs, web, size }. */
function collectImageFiles() {
  const files = [];
  for (const { web, abs } of SCAN_ROOTS) {
    if (!fs.existsSync(abs)) continue;
    for (const absPath of walkFiles(abs)) {
      if (!IMAGE_EXT.has(path.extname(absPath).toLowerCase())) continue;
      const rel = path.relative(abs, absPath).split(path.sep).join("/");
      files.push({ abs: absPath, web: `${web}${rel}`, size: fs.statSync(absPath).size });
    }
  }
  return files;
}

function hashFile(absPath) {
  const hash = crypto.createHash("sha256");
  const input = fs.createReadStream(absPath);
  return new Promise((resolve, reject) => {
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

/** Tất cả path ảnh đang được DB tham chiếu. */
function collectReferencedPaths(db) {
  const rows = db
    .prepare(
      `SELECT path FROM product_images WHERE path != ''
       UNION ALL
       SELECT image_path FROM products WHERE image_path != ''
       UNION ALL
       SELECT image_path FROM customer_mapping_items WHERE image_path != ''
       UNION ALL
       SELECT custom_product_image_path AS path FROM customer_mapping_items
       WHERE custom_product_image_path != ''`,
    )
    .all();
  return new Set(rows.map((r) => r.path));
}

/** Danh sách tham chiếu theo path (để repoint/xoá an toàn). */
function collectRefsByPath(db) {
  const refs = [];
  for (const r of db.prepare("SELECT id, path FROM product_images WHERE path != ''").all()) {
    refs.push({ table: "product_images", id: r.id, column: "path", path: r.path });
  }
  for (const r of db.prepare("SELECT id, image_path AS path FROM products WHERE image_path != ''").all()) {
    refs.push({ table: "products", id: r.id, column: "image_path", path: r.path });
  }
  for (const r of db.prepare("SELECT id, image_path AS path FROM customer_mapping_items WHERE image_path != ''").all()) {
    refs.push({ table: "customer_mapping_items", id: r.id, column: "image_path", path: r.path });
  }
  for (const r of db.prepare("SELECT id, custom_product_image_path AS path FROM customer_mapping_items WHERE custom_product_image_path != ''").all()) {
    refs.push({ table: "customer_mapping_items", id: r.id, column: "custom_product_image_path", path: r.path });
  }
  return refs;
}

function openDb() {
  if (!fs.existsSync(dbPath)) throw new Error(`Không thấy DB: ${dbPath}`);
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
}

async function backupDb() {
  fs.mkdirSync(backupRoot, { recursive: true });
  const stamp = timestamp();
  const dir = path.join(backupRoot, stamp);
  fs.mkdirSync(dir, { recursive: true });
  const destination = path.join(dir, "crm.db");
  const db = openDb();
  try {
    await db.backup(destination);
  } finally {
    db.close();
  }
  console.log(`Đã backup DB → ${destination}`);
  return dir;
}

function resolveReportPath(report) {
  if (!report) throw new Error("Thiếu --report=<đường-dẫn-report.json>");
  const absolute = path.resolve(root, report);
  const dataRoot = path.resolve(root, "data");
  if (!absolute.startsWith(`${dataRoot}${path.sep}`)) {
    throw new Error("Report phải nằm trong data/");
  }
  return absolute;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

function groupKey(web) {
  const parts = web.split("/").filter(Boolean);
  return `/${parts[0]}`;
}

function audit() {
  const db = openDb();
  const referenced = collectReferencedPaths(db);
  db.close();
  const files = collectImageFiles();
  const byRoot = new Map();
  let total = 0;
  let refSize = 0;
  let orphanCount = 0;
  let orphanSize = 0;
  let refOver1600Count = 0;

  for (const f of files) {
    total += f.size;
    const key = groupKey(f.web);
    const entry = byRoot.get(key) || { count: 0, refs: 0 };
    entry.count += 1;
    if (referenced.has(f.web)) {
      entry.refs += 1;
      refSize += f.size;
      if (f.web.startsWith("/images/")) refOver1600Count += 1;
    } else {
      orphanCount += 1;
      orphanSize += f.size;
    }
    byRoot.set(key, entry);
  }

  console.log("\n=== AUDIT ẢNH ===");
  console.log(`Tổng file ảnh runtime: ${files.length} (${bytes(total)})`);
  for (const [key, e] of [...byRoot.entries()].sort()) {
    console.log(`  ${key}: ${e.count} file (${e.refs} được tham chiếu)`);
  }
  console.log(`Được DB tham chiếu: ${files.length - orphanCount} file (${bytes(refSize)})`);
  console.log(`Orphan (chưa tham chiếu, chờ quarantine): ${orphanCount} file (${bytes(orphanSize)})`);
  console.log(`Đang tham chiếu trong /images/: ${refOver1600Count} file (kiểm tra >1600px ở 'optimize')`);
  console.log("Chạy 'dedupe', 'optimize', 'quarantine' để xem kế hoạch chi tiết.\n");
  return { files, referenced };
}

// ─── Dedupe (SHA-256 chính xác) ──────────────────────────────────────────────

async function dedupe(apply) {
  const db = openDb();
  const refs = collectRefsByPath(db);
  const piRows = new Map(
    db
      .prepare("SELECT id, product_id, path, is_primary, sort_order FROM product_images")
      .all()
      .map((r) => [r.id, r]),
  );
  const primaryPaths = new Set(
    [...piRows.values()].filter((r) => r.is_primary).map((r) => r.path),
  );

  const files = collectImageFiles();
  console.log(`Đang băm ${files.length} file…`);
  const groups = new Map();
  for (let i = 0; i < files.length; i += 1) {
    const f = files[i];
    const hash = await hashFile(f.abs);
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push(f);
    if ((i + 1) % 1000 === 0) console.log(`  ${i + 1}/${files.length}`);
  }

  const duplicateGroups = [...groups.entries()].filter(([, g]) => g.length >= 2);
  console.log(`\nNhóm trùng nội dung (>=2 file): ${duplicateGroups.length}`);

  const plan = [];
  let planRows = 0;
  let planFiles = 0;
  let planSize = 0;

  for (const [, group] of duplicateGroups) {
    const webPaths = new Set(group.map((f) => f.web));
    const groupRefs = refs.filter((r) => webPaths.has(r.path));
    if (!groupRefs.length) continue; // toàn bộ orphan → quarantine lo
    const referencedWeb = new Set(groupRefs.map((r) => r.path));

    // 1) Trong product_images, cùng product chỉ giữ 1 bản tốt nhất
    const piByProduct = new Map();
    for (const r of groupRefs.filter((r) => r.table === "product_images")) {
      const row = piRows.get(r.id);
      if (!row) continue;
      if (!piByProduct.has(row.product_id)) piByProduct.set(row.product_id, []);
      piByProduct.get(row.product_id).push({ ...r, row });
    }
    const toDeleteRows = [];
    for (const [, rows] of piByProduct) {
      if (rows.length < 2) continue;
      rows.sort(
        (a, b) =>
          b.row.is_primary - a.row.is_primary ||
          a.row.sort_order - b.row.sort_order ||
          a.id - b.id,
      );
      for (const dup of rows.slice(1)) toDeleteRows.push(dup);
    }

    // 2) Chọn file chuẩn: ưu đang được tham chiếu, ưu primary, ưu root mới /images/.
    const deletedRowIds = new Set(toDeleteRows.map((r) => r.id));
    const liveRefs = groupRefs.filter(
      (r) => !(r.table === "product_images" && deletedRowIds.has(r.id)),
    );
    const livePaths = [...new Set(liveRefs.map((r) => r.path))];
    const candidates = group.filter((f) => referencedWeb.has(f.web));
    let canonical = candidates[0];
    let canonicalScore = -1;
    for (const f of candidates) {
      let score = livePaths.includes(f.web) ? 2 : 0;
      if (primaryPaths.has(f.web)) score += 10;
      if (/^\/images\//.test(f.web)) score += 1;
      if (score > canonicalScore || (score === canonicalScore && f.web < canonical.web)) {
        canonical = f;
        canonicalScore = score;
      }
    }
    if (!canonical) continue;

    // 3) Repoint các tham chiếu còn sống sang file chuẩn
    const repoint = liveRefs.filter((r) => r.path !== canonical.web);

    // 4) File cần xoá: file đang được tham chiếu nhưng không phải canonical
    const deleteFiles = group.filter(
      (f) => referencedWeb.has(f.web) && f.web !== canonical.web,
    );

    if (!toDeleteRows.length && !repoint.length && !deleteFiles.length) continue;

    plan.push({ canonical, toDeleteRows, repoint, deleteFiles });
    planRows += toDeleteRows.length;
    planFiles += deleteFiles.length;
    planSize += deleteFiles.reduce((s, f) => s + f.size, 0);
  }

  console.log(`\nKế hoạch xoá bản trùng (chỉ tính file đang được tham chiếu):`);
  console.log(`  Xoá ${planRows} row product_images trùng trong cùng SP`);
  console.log(`  Repoint ${plan.reduce((s, p) => s + p.repoint.length, 0)} tham chiếu sang file chuẩn`);
  console.log(`  Xoá ${planFiles} file trùng (${bytes(planSize)})`);
  if (!apply) {
    console.log("\n(DRY RUN — thêm --apply để thực thi. File orphan không bị đụng tới, quarantine lo.)");
    db.close();
    return;
  }

  const backupDir = await backupDb();
  const tx = db.transaction(() => {
    for (const p of plan) {
      for (const dup of p.toDeleteRows) {
        db.prepare("DELETE FROM product_images WHERE id = ?").run(dup.id);
      }
      for (const r of p.repoint) {
        db.prepare(`UPDATE ${r.table} SET ${r.column} = ? WHERE id = ?`).run(p.canonical.web, r.id);
      }
    }
  });
  tx();

  const liveRefsAfter = collectRefsByPath(db);
  let deletedBytes = 0;
  for (const p of plan) {
    for (const f of p.deleteFiles) {
      const refCount = liveRefsAfter.filter((r) => r.path === f.web).length;
      if (refCount > 0) {
        console.warn(`  ! Bỏ qua ${f.web}: vẫn còn ${refCount} tham chiếu`);
        continue;
      }
      try {
        fs.unlinkSync(f.abs);
        deletedBytes += f.size;
      } catch (err) {
        console.warn(`  ! Không xoá được ${f.abs}: ${err.message}`);
      }
    }
  }
  console.log(`Đã xoá file trùng, tiết kiệm ${bytes(deletedBytes)} (backup: ${backupDir})`);
  db.close();
}

// ─── Optimize (resize >1600px, đè lên cùng path) ────────────────────────────

async function optimize(apply) {
  const db = openDb();
  const referenced = collectReferencedPaths(db);
  db.close();
  const files = collectImageFiles().filter(
    (f) => referenced.has(f.web) && IMAGE_EXT.has(path.extname(f.web).toLowerCase()),
  );

  const toOptimize = [];
  for (let i = 0; i < files.length; i += 1) {
    const f = files[i];
    let meta;
    try {
      meta = await sharp(f.abs, { failOn: "none" }).metadata();
    } catch {
      continue;
    }
    if ((meta.width ?? 0) > MAX_SIDE || (meta.height ?? 0) > MAX_SIDE) {
      toOptimize.push(f);
    }
    if ((i + 1) % 1000 === 0) console.log(`  ${i + 1}/${files.length}`);
  }

  let saveBytes = 0;
  for (const f of toOptimize) saveBytes += f.size;

  console.log(`\nẢnh >${MAX_SIDE}px đang được tham chiếu: ${toOptimize.length} file (${bytes(saveBytes)} hiện tại)`);
  if (!toOptimize.length) return;

  if (!apply) {
    console.log("(DRY RUN — thêm --apply để resize. Bản gốc sẽ được backup trước.)");
    return;
  }

  const backupDir = path.join(await backupDb(), "optimize-originals");
  let successful = 0;
  let originalTotal = 0;
  let newTotal = 0;
  for (const f of toOptimize) {
    const ext = path.extname(f.abs).toLowerCase();
    const backupPath = path.join(backupDir, f.web.replace(/^\/+/, "").split("/").join(path.sep));
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(f.abs, backupPath);

    const tmp = `${f.abs}.tmp${ext}`;
    try {
      // Đọc vào Buffer để sharp không giữ handle file gốc (tránh Windows lock khi ghi đè).
      const inputBuf = fs.readFileSync(f.abs);
      const pipeline = sharp(inputBuf, { failOn: "none" }).rotate().resize({
        width: MAX_SIDE,
        height: MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      });
      if (ext === ".png") await pipeline.png({ compressionLevel: 8, effort: 6 }).toFile(tmp);
      else if (ext === ".webp") await pipeline.webp({ quality: 85 }).toFile(tmp);
      else await pipeline.jpeg({ quality: 85, mozjpeg: true }).toFile(tmp);
      const newSize = fs.statSync(tmp).size;
      fs.copyFileSync(tmp, f.abs);
      successful += 1;
      originalTotal += f.size;
      newTotal += newSize;
    } catch (err) {
      console.warn(`  ! Lỗi resize ${f.web}: ${err.message}`);
    } finally {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }
  console.log(
    `Đã resize ${successful}/${toOptimize.length} ảnh: ${bytes(originalTotal)} → ${bytes(newTotal)} (tiết kiệm ${bytes(originalTotal - newTotal)})`,
  );
  console.log(`Bản gốc backup tại: ${backupDir}`);
}

// ─── Quarantine (di chuyển file orphan, không xoá) ──────────────────────────

function quarantine(apply) {
  const db = openDb();
  const referenced = collectReferencedPaths(db);
  db.close();
  const files = collectImageFiles().filter((f) => !referenced.has(f.web));
  const size = files.reduce((s, f) => s + f.size, 0);

  console.log(`\nFile orphan (không còn DB tham chiếu): ${files.length} file (${bytes(size)})`);
  if (!files.length) return;

  if (!apply) {
    console.log("(DRY RUN — thêm --apply để DI CHUYỂN sang data/image-quarantine. Không xoá gì.)");
    const byRoot = new Map();
    for (const f of files) {
      const key = groupKey(f.web);
      byRoot.set(key, (byRoot.get(key) || 0) + 1);
    }
    for (const [key, n] of [...byRoot.entries()].sort()) console.log(`  ${key}: ${n} file`);
    return;
  }

  const stamp = timestamp();
  const destRoot = path.join(quarantineRoot, stamp);
  let moved = 0;
  let movedBytes = 0;
  for (const f of files) {
    const dest = path.join(destRoot, f.web.replace(/^\/+/, "").split("/").join(path.sep));
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(f.abs, dest);
      moved += 1;
      movedBytes += f.size;
    } catch (err) {
      console.warn(`  ! Không di chuyển được ${f.web}: ${err.message}`);
    }
  }
  console.log(`Đã chuyển ${moved} file (${bytes(movedBytes)}) → ${destRoot}`);
  console.log("Xem lại trước khi xoá thủ công.");
}

// ─── Near-duplicate report (không xóa) ──────────────────────────────────────

async function nearDuplicateReport() {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT pi.product_id, p.code, p.name, pi.id, pi.path,
              pi.is_primary, pi.sort_order, pi.caption
       FROM product_images pi JOIN products p ON p.id = pi.product_id
       ORDER BY pi.product_id, pi.sort_order, pi.id`,
    )
    .all();
  db.close();

  const signatures = [];
  for (const row of rows) {
    if (!row.path.startsWith("/images/")) continue;
    const abs = path.join(publicRoot, row.path.replace(/^\/+/, "").split("/").join(path.sep));
    if (!fs.existsSync(abs)) continue;
    try {
      const pixels = await sharp(abs, { failOn: "none" })
        .rotate()
        .resize(16, 16, { fit: "fill" })
        .grayscale()
        .raw()
        .toBuffer();
      const metadata = await sharp(abs, { failOn: "none" }).metadata();
      signatures.push({
        ...row,
        pixels: [...pixels],
        absolutePath: abs,
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
        bytes: fs.statSync(abs).size,
      });
    } catch {
      /* bỏ qua file không đọc được */
    }
  }

  const byProduct = new Map();
  for (const item of signatures) {
    if (!byProduct.has(item.product_id)) byProduct.set(item.product_id, []);
    byProduct.get(item.product_id).push(item);
  }
  const pairs = [];
  for (const items of byProduct.values()) {
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        let delta = 0;
        for (let k = 0; k < 256; k += 1) {
          delta += Math.abs(items[i].pixels[k] - items[j].pixels[k]);
        }
        const mae = delta / 256;
        if (mae <= 3) {
          pairs.push({
            productId: items[i].product_id,
            code: items[i].code,
            imageA: { id: items[i].id, path: items[i].path },
            imageB: { id: items[j].id, path: items[j].path },
            mae: Number(mae.toFixed(3)),
          });
        }
      }
    }
  }
  const reportDir = path.join(root, "data", "reports");
  const sheetDir = path.join(reportDir, "contact-sheets");
  const overviewDir = path.join(reportDir, "overview-pages");
  fs.mkdirSync(reportDir, { recursive: true });
  fs.mkdirSync(sheetDir, { recursive: true });
  fs.mkdirSync(overviewDir, { recursive: true });

  const clusters = buildNearDuplicateClusters(signatures, pairs);
  for (const cluster of clusters) {
    const sheetName = `cluster-${String(cluster.id).padStart(4, "0")}.jpg`;
    cluster.contactSheet = `contact-sheets/${sheetName}`;
    await createContactSheet(cluster, path.join(sheetDir, sheetName));
  }
  await createOverviewPages(clusters, overviewDir);

  const report = {
    generatedAt: new Date().toISOString(),
    thresholdMae: 3,
    instructions: {
      status: "Set status to approved only after reviewing the contact sheet.",
      removeImageIds: "IDs to remove. Keep at least one image in every cluster.",
    },
    summary: { pairs: pairs.length, clusters: clusters.length },
    clusters,
  };
  const reportPath = path.join(reportDir, "near-duplicates-review.json");
  const htmlPath = path.join(reportDir, "near-duplicates-review.html");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(htmlPath, renderNearDuplicateHtml(report));
  console.log(
    `Near-duplicate: ${pairs.length} cặp / ${clusters.length} cụm (chỉ báo cáo)\n` +
      `  JSON: ${reportPath}\n  HTML: ${htmlPath}`,
  );
}

async function createOverviewPages(clusters, destinationDir) {
  const perPage = 12;
  const width = 1800;
  const rowHeight = 240;
  const pageCount = Math.ceil(clusters.length / perPage);
  for (let page = 0; page < pageCount; page += 1) {
    const batch = clusters.slice(page * perPage, (page + 1) * perPage);
    const composites = [];
    for (let row = 0; row < batch.length; row += 1) {
      const cluster = batch[row];
      const top = row * rowHeight;
      composites.push({
        input: Buffer.from(
          `<svg width="280" height="${rowHeight}">
            <rect width="100%" height="100%" fill="${row % 2 ? "#ece6dc" : "#f8f4ed"}"/>
            <text x="12" y="35" font-size="22" font-family="Arial" font-weight="bold">#${cluster.id} ${escapeXml(cluster.code)}</text>
            <text x="12" y="64" font-size="14" font-family="Arial">${cluster.images.length} images</text>
            <text x="12" y="90" font-size="12" font-family="Arial">${escapeXml(cluster.productName.slice(0, 34))}</text>
          </svg>`,
        ),
        left: 0,
        top,
      });
      const thumbWidth = Math.floor((width - 300) / Math.min(5, cluster.images.length));
      for (let index = 0; index < Math.min(5, cluster.images.length); index += 1) {
        const image = cluster.images[index];
        const absolute = path.join(
          publicRoot,
          image.path.replace(/^\/+/, "").split("/").join(path.sep),
        );
        const thumb = await sharp(absolute, { failOn: "none" })
          .rotate()
          .resize(thumbWidth - 10, 190, {
            fit: "contain",
            background: { r: 255, g: 255, b: 255 },
          })
          .extend({ bottom: 38, background: "#ffffff" })
          .composite([
            {
              input: Buffer.from(
                `<svg width="${thumbWidth - 10}" height="38"><text x="8" y="25" font-size="18" font-family="Arial" font-weight="bold">#${image.id}${image.is_primary ? " P" : ""}</text></svg>`,
              ),
              left: 0,
              top: 190,
            },
          ])
          .jpeg({ quality: 84 })
          .toBuffer();
        composites.push({ input: thumb, left: 290 + index * thumbWidth, top: top + 6 });
      }
    }
    await sharp({
      create: {
        width,
        height: perPage * rowHeight,
        channels: 3,
        background: "#ded7ce",
      },
    })
      .composite(composites)
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(path.join(destinationDir, `overview-${String(page + 1).padStart(3, "0")}.jpg`));
  }
}

function buildNearDuplicateClusters(signatures, pairs) {
  const byId = new Map(signatures.map((item) => [item.id, item]));
  const adjacency = new Map();
  for (const pair of pairs) {
    const a = pair.imageA.id;
    const b = pair.imageB.id;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  }

  const clusters = [];
  const visited = new Set();
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const queue = [start];
    const ids = [];
    visited.add(start);
    while (queue.length) {
      const id = queue.shift();
      ids.push(id);
      for (const next of adjacency.get(id) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    const images = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => b.is_primary - a.is_primary || a.sort_order - b.sort_order || a.id - b.id)
      .map(({ pixels, absolutePath, ...image }) => image);
    const idSet = new Set(ids);
    clusters.push({
      id: clusters.length + 1,
      productId: images[0].product_id,
      code: images[0].code,
      productName: images[0].name,
      status: "pending",
      classification: "unreviewed",
      confidence: null,
      keepImageId: images.find((image) => image.is_primary)?.id ?? images[0].id,
      removeImageIds: [],
      reviewerNote: "",
      images,
      pairs: pairs.filter(
        (pair) => idSet.has(pair.imageA.id) && idSet.has(pair.imageB.id),
      ),
    });
  }
  return clusters;
}

async function createContactSheet(cluster, destination) {
  const cellWidth = 360;
  const imageHeight = 300;
  const labelHeight = 105;
  const gap = 16;
  const columns = Math.min(3, cluster.images.length);
  const rows = Math.ceil(cluster.images.length / columns);
  const width = columns * cellWidth + (columns + 1) * gap;
  const height = 76 + rows * (imageHeight + labelHeight + gap) + gap;
  const composites = [];

  for (let index = 0; index < cluster.images.length; index += 1) {
    const image = cluster.images[index];
    const absolute = path.join(publicRoot, image.path.replace(/^\/+/, "").split("/").join(path.sep));
    const thumb = await sharp(absolute, { failOn: "none" })
      .rotate()
      .resize(cellWidth, imageHeight, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255 },
      })
      .jpeg({ quality: 88 })
      .toBuffer();
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = gap + column * (cellWidth + gap);
    const top = 76 + gap + row * (imageHeight + labelHeight + gap);
    composites.push({ input: thumb, left, top });
    composites.push({
      input: Buffer.from(
        `<svg width="${cellWidth}" height="${labelHeight}">
          <rect width="100%" height="100%" fill="#f7f3ed"/>
          <text x="12" y="25" font-size="18" font-family="Arial" font-weight="bold">#${image.id}${image.is_primary ? " PRIMARY" : ""}</text>
          <text x="12" y="50" font-size="14" font-family="Arial">${image.width}x${image.height} · ${bytes(image.bytes)} · order ${image.sort_order}</text>
          <text x="12" y="76" font-size="12" font-family="Arial">${escapeXml(path.basename(image.path))}</text>
        </svg>`,
      ),
      left,
      top: top + imageHeight,
    });
  }

  const title = Buffer.from(
    `<svg width="${width}" height="76">
      <rect width="100%" height="100%" fill="#352f2a"/>
      <text x="16" y="31" font-size="22" font-family="Arial" fill="white" font-weight="bold">Cluster ${cluster.id} · ${escapeXml(cluster.code)}</text>
      <text x="16" y="57" font-size="15" font-family="Arial" fill="#e8ddd0">${escapeXml(cluster.productName)} · ${cluster.images.length} images</text>
    </svg>`,
  );
  composites.unshift({ input: title, left: 0, top: 0 });

  await sharp({
    create: { width, height, channels: 3, background: "#ded7ce" },
  })
    .composite(composites)
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(destination);
}

function renderNearDuplicateHtml(report) {
  const cards = report.clusters
    .map(
      (cluster) => `<article class="cluster">
        <header><h2>#${cluster.id} · ${escapeHtml(cluster.code)}</h2><span>${cluster.images.length} ảnh</span></header>
        <p>${escapeHtml(cluster.productName)}</p>
        <img src="${escapeHtml(cluster.contactSheet)}" alt="Cluster ${cluster.id}" loading="lazy">
        <details><summary>Dữ liệu review</summary><pre>${escapeHtml(
          JSON.stringify(
            {
              status: cluster.status,
              classification: cluster.classification,
              keepImageId: cluster.keepImageId,
              removeImageIds: cluster.removeImageIds,
              reviewerNote: cluster.reviewerNote,
            },
            null,
            2,
          ),
        )}</pre></details>
      </article>`,
    )
    .join("\n");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Near duplicate review</title><style>
    body{margin:0;background:#eee8df;color:#2f2924;font:15px Arial,sans-serif}.wrap{max-width:1280px;margin:auto;padding:32px}h1{margin:0 0 8px}.lead{color:#6c6259;margin-bottom:28px}.cluster{background:white;border:1px solid #d7cdc2;border-radius:14px;margin:0 0 26px;padding:18px;box-shadow:0 5px 18px #4a3d3212}.cluster header{display:flex;justify-content:space-between;align-items:center}.cluster h2{margin:0}.cluster img{width:100%;height:auto;border-radius:8px;border:1px solid #ddd}.cluster pre{white-space:pre-wrap;background:#282421;color:#f7efe7;padding:14px;border-radius:8px}summary{cursor:pointer;margin:12px 0;font-weight:bold}
  </style></head><body><main class="wrap"><h1>Near-duplicate review</h1><p class="lead">${report.summary.clusters} cụm / ${report.summary.pairs} cặp. Chỉnh file JSON để approve; HTML này chỉ dùng xem ảnh.</p>${cards}</main></body></html>`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeHtml(value) {
  return escapeXml(value);
}

// ─── Apply approved vision review ────────────────────────────────────────────

async function applyApprovedReview(reportArg, apply) {
  const reportPath = resolveReportPath(reportArg);
  if (!fs.existsSync(reportPath)) throw new Error(`Không thấy report: ${reportPath}`);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const approved = (report.clusters ?? []).filter(
    (cluster) => cluster.status === "approved" && cluster.removeImageIds?.length,
  );
  const db = openDb();
  const plans = [];

  for (const cluster of approved) {
    const ids = [...new Set(cluster.removeImageIds.map(Number))];
    if (!Number.isInteger(Number(cluster.keepImageId))) {
      throw new Error(`Cluster ${cluster.id}: keepImageId không hợp lệ`);
    }
    if (ids.includes(Number(cluster.keepImageId))) {
      throw new Error(`Cluster ${cluster.id}: keepImageId nằm trong removeImageIds`);
    }
    const keep = db
      .prepare("SELECT * FROM product_images WHERE id = ?")
      .get(Number(cluster.keepImageId));
    if (!keep || keep.product_id !== Number(cluster.productId)) {
      throw new Error(`Cluster ${cluster.id}: không tìm thấy ảnh keep trong đúng sản phẩm`);
    }
    const remove = ids.map((id) => {
      const row = db.prepare("SELECT * FROM product_images WHERE id = ?").get(id);
      if (!row || row.product_id !== keep.product_id) {
        throw new Error(`Cluster ${cluster.id}: ảnh remove #${id} không thuộc sản phẩm`);
      }
      return row;
    });
    const remaining = db
      .prepare(
        `SELECT COUNT(*) AS count FROM product_images
         WHERE product_id = ? AND id NOT IN (${ids.map(() => "?").join(",")})`,
      )
      .get(keep.product_id, ...ids).count;
    if (remaining < 1) throw new Error(`Cluster ${cluster.id}: không thể xóa toàn bộ gallery`);
    plans.push({ cluster, keep, remove });
  }

  console.log(`Approved cleanup: ${approved.length} cụm, ${plans.reduce((sum, p) => sum + p.remove.length, 0)} row`);
  if (!apply || !plans.length) {
    if (!apply) console.log("(DRY RUN — thêm --apply để thực thi)");
    db.close();
    return;
  }

  const backupDir = await backupDb();
  const removedFilesDir = path.join(backupDir, "review-removed-images");
  fs.mkdirSync(removedFilesDir, { recursive: true });
  const candidatePaths = new Set(plans.flatMap((plan) => plan.remove.map((row) => row.path)));
  for (const publicPath of candidatePaths) {
    const absolute = path.join(publicRoot, publicPath.replace(/^\/+/, "").split("/").join(path.sep));
    if (!fs.existsSync(absolute)) continue;
    fs.copyFileSync(absolute, path.join(removedFilesDir, path.basename(absolute)));
  }

  const tx = db.transaction(() => {
    for (const plan of plans) {
      const removingPrimary = plan.remove.some((row) => row.is_primary);
      for (const row of plan.remove) {
        db.prepare("DELETE FROM product_images WHERE id = ?").run(row.id);
      }
      if (removingPrimary || plan.keep.is_primary) {
        db.prepare("UPDATE product_images SET is_primary = 0 WHERE product_id = ?").run(
          plan.keep.product_id,
        );
        db.prepare("UPDATE product_images SET is_primary = 1 WHERE id = ?").run(plan.keep.id);
      }
      const primary = db
        .prepare(
          `SELECT path FROM product_images WHERE product_id = ?
           ORDER BY is_primary DESC, sort_order, id LIMIT 1`,
        )
        .get(plan.keep.product_id);
      db.prepare("UPDATE products SET image_path = ? WHERE id = ?").run(
        primary?.path ?? "",
        plan.keep.product_id,
      );
    }
  });
  tx();

  let filesDeleted = 0;
  for (const publicPath of candidatePaths) {
    const stillUsed = collectRefsByPath(db).some((ref) => ref.path === publicPath);
    if (stillUsed) continue;
    const absolute = path.join(publicRoot, publicPath.replace(/^\/+/, "").split("/").join(path.sep));
    if (!fs.existsSync(absolute)) continue;
    fs.unlinkSync(absolute);
    filesDeleted += 1;
  }
  db.close();
  report.appliedAt = new Date().toISOString();
  report.appliedSummary = {
    clusters: plans.length,
    rowsDeleted: plans.reduce((sum, plan) => sum + plan.remove.length, 0),
    filesDeleted,
    backupDir,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Đã áp dụng review: ${filesDeleted} file xóa; backup tại ${backupDir}`);
}

function cleanReviewArtifacts(reportArg, apply) {
  const reportPath = resolveReportPath(reportArg);
  const reportDir = path.dirname(reportPath);
  const targets = [
    reportPath,
    reportPath.replace(/\.json$/i, ".html"),
    path.join(reportDir, "contact-sheets"),
    path.join(reportDir, "overview-pages"),
  ];
  const existing = targets.filter((target) => fs.existsSync(target));
  console.log(`Review artifacts sẽ xóa: ${existing.length}`);
  for (const target of existing) console.log(`  ${target}`);
  if (!apply) {
    console.log("(DRY RUN — thêm --apply để xóa sau khi đã nghiệm thu)");
    return;
  }
  for (const target of existing) fs.rmSync(target, { recursive: true, force: true });
  try {
    if (fs.existsSync(reportDir) && fs.readdirSync(reportDir).length === 0) fs.rmdirSync(reportDir);
  } catch {
    /* ignore */
  }
  console.log("Đã xóa report và contact sheets.");
}

// ─── Backup ──────────────────────────────────────────────────────────────────

async function backup(images) {
  const dir = await backupDb();
  if (!images) {
    console.log("(thêm --images để backup public/images)");
    return;
  }
  const dest = path.join(dir, "images");
  for (const { web, abs } of SCAN_ROOTS) {
    if (!fs.existsSync(abs)) continue;
    const rel = web.replace(/^\/+/, "").split("/").join(path.sep);
    const outDir = path.join(dest, rel);
    for (const absPath of walkFiles(abs)) {
      const relPath = path.relative(abs, absPath);
      const out = path.join(outDir, relPath);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(absPath, out);
    }
  }
  console.log(`Đã backup ảnh → ${dest}`);
}

// ─── Chạy ────────────────────────────────────────────────────────────────────

async function main() {
  const { cmd, apply, images, report } = parseArgs(process.argv.slice(2));
  switch (cmd) {
    case "audit":
      audit();
      break;
    case "dedupe":
      await dedupe(apply);
      break;
    case "optimize":
      await optimize(apply);
      break;
    case "quarantine":
      quarantine(apply);
      break;
    case "near-duplicates":
      await nearDuplicateReport();
      break;
    case "apply-review":
      await applyApprovedReview(report, apply);
      break;
    case "clean-review":
      cleanReviewArtifacts(report, apply);
      break;
    case "backup":
      await backup(images);
      break;
    case "all":
      audit();
      await dedupe(apply);
      await optimize(apply);
      quarantine(apply);
      break;
    default:
      throw new Error(`Lệnh không hợp lệ: ${cmd} (audit | dedupe | optimize | quarantine | near-duplicates | apply-review | clean-review | backup | all)`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
