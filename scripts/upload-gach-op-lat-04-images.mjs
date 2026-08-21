/**
 * 04-crm-no-image-on-tab:
 *  - has_y_source=yes → upload ảnh (normalize webp max side 1600 q82) vào CRM
 *  - has_y_source=no  → gộp vào 03 (thiếu nguồn folder)
 *
 * Run: node scripts/upload-gach-op-lat-04-images.mjs --execute
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { StorageClient } from "@supabase/storage-js";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const OUT_DIR = path.join(root, "docs", "audit-gach-op-lat");
const CSV_04 = path.join(OUT_DIR, "04-crm-no-image-on-tab.csv");
const CSV_03 = path.join(OUT_DIR, "03-crm-no-y-image.csv");
const Y_ROOT =
  process.env.GACH_OP_LAT_IMAGE_ROOT?.trim() ||
  "C:\\Users\\dankiet\\Pictures\\HÌNH GẠCH\\GẠCH ỐP LÁT";
const EXECUTE = process.argv.includes("--execute");
const IMAGE_MAX_SIDE = 1600;
const IMAGE_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;

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
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
}
loadDotEnvFile(path.join(root, ".env"));
loadDotEnvFile(path.join(root, ".env.local"));

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  fs.writeFileSync(filePath, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
}

async function normalizeUploadImageBuffer(input) {
  let pipeline = sharp(input, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (meta.format === "webp" && width <= IMAGE_MAX_SIDE && height <= IMAGE_MAX_SIDE) {
    return input;
  }
  if (width > IMAGE_MAX_SIDE || height > IMAGE_MAX_SIDE) {
    pipeline = pipeline.resize({
      width: IMAGE_MAX_SIDE,
      height: IMAGE_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  return await pipeline.webp({ quality: 82, effort: 4 }).toBuffer();
}

function storageConfig() {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return {
    url: url.replace(/\/+$/, ""),
    key,
    bucket: (process.env.SUPABASE_STORAGE_BUCKET ?? "crm-images")
      .replace(/^\//, "")
      .replace(/\/+$/, ""),
    prefix: (process.env.SUPABASE_STORAGE_PREFIX ?? "crm").replace(/\/+$/, ""),
  };
}

async function putImageBuffer(buffer, ext = ".webp") {
  const hash = createHash("sha256").update(buffer).digest("hex");
  const safeExt = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  const filename = `${hash}${safeExt}`;
  const cfg = storageConfig();
  if (!cfg) {
    const dir = path.join(root, "public", "images");
    fs.mkdirSync(dir, { recursive: true });
    const abs = path.join(dir, filename);
    if (!fs.existsSync(abs)) fs.writeFileSync(abs, buffer);
    return `/images/${filename}`;
  }
  const objectPath = `${cfg.prefix}/${filename}`;
  const client = new StorageClient(`${cfg.url}/storage/v1`, {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
  });
  const { error } = await client.from(cfg.bucket).upload(objectPath, buffer, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${objectPath}`;
}

/** Ưu tiên file: brand folder chính > số nhỏ hơn trong (n) > path ngắn */
function rankPath(rel) {
  const lower = rel.toLowerCase();
  let score = 0;
  if (lower.includes("tháng 10") || lower.includes("thang 10")) score += 100;
  if (lower.includes("ko logo") || lower.includes("không logo")) score += 1000;
  if (lower.includes("thực tế") || lower.includes("thuc te")) score += 1000;
  const m = rel.match(/\((\d+)\)\s*\.[^.]+$/i);
  const n = m ? Number(m[1]) : 0;
  return score * 1000 + n * 10 + rel.length / 1000;
}

function pickFilesForProduct(yPathsField) {
  const rels = String(yPathsField || "")
    .split("||")
    .map((s) => s.trim())
    .filter(Boolean);
  // unique by basename (keep best rank)
  const byBase = new Map();
  for (const rel of rels) {
    const base = path.basename(rel).toLowerCase();
    const prev = byBase.get(base);
    if (!prev || rankPath(rel) < rankPath(prev)) byBase.set(base, rel);
  }
  const uniq = [...byBase.values()].sort((a, b) => rankPath(a) - rankPath(b));
  return uniq;
}

async function addProductImage(client, productId, publicPath, isPrimary) {
  if (isPrimary) {
    await client.query(`UPDATE product_images SET is_primary = 0 WHERE product_id = $1`, [
      productId,
    ]);
  }
  const maxSort = await client.query(
    `SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM product_images WHERE product_id = $1`,
    [productId],
  );
  const sortOrder = Number(maxSort.rows[0]?.m ?? -1) + 1;
  const ins = await client.query(
    `INSERT INTO product_images (product_id, path, sort_order, is_primary, caption)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [productId, publicPath, sortOrder, isPrimary ? 1 : 0, ""],
  );
  if (isPrimary) {
    await client.query(`UPDATE products SET image_path = $1 WHERE id = $2`, [
      publicPath,
      productId,
    ]);
  } else {
    // nếu chưa có image_path thì set
    await client.query(
      `UPDATE products SET image_path = $1
       WHERE id = $2 AND COALESCE(image_path, '') = ''`,
      [publicPath, productId],
    );
  }
  return Number(ins.rows[0].id);
}

async function syncPrimary(client, productId) {
  const primary = await client.query(
    `SELECT path FROM product_images
     WHERE product_id = $1
     ORDER BY is_primary DESC, sort_order ASC, id ASC
     LIMIT 1`,
    [productId],
  );
  await client.query(`UPDATE products SET image_path = $1 WHERE id = $2`, [
    primary.rows[0]?.path ?? "",
    productId,
  ]);
}

async function main() {
  if (!fs.existsSync(CSV_04)) {
    console.error("Missing", CSV_04);
    process.exit(1);
  }
  const rows04 = parseCsv(fs.readFileSync(CSV_04, "utf8"));
  const yesRows = rows04.filter((r) => String(r.has_y_source).toLowerCase() === "yes");
  const noRows = rows04.filter((r) => String(r.has_y_source).toLowerCase() !== "yes");

  console.log(EXECUTE ? "MODE: EXECUTE" : "MODE: DRY-RUN");
  console.log("04 total:", rows04.length);
  console.log("upload candidates (yes):", yesRows.length);
  console.log("merge to 03 (no):", noRows.length, noRows.map((r) => r.code).join(", "));

  // --- merge no → 03 ---
  const existing03 = fs.existsSync(CSV_03)
    ? parseCsv(fs.readFileSync(CSV_03, "utf8"))
    : [];
  const byCode03 = new Map(existing03.map((r) => [String(r.code).toUpperCase(), r]));

  // After previous delete, many 03 rows still list old image_path; refresh from DB later.
  for (const r of noRows) {
    const key = String(r.code).toUpperCase();
    if (byCode03.has(key)) {
      const cur = byCode03.get(key);
      cur.note = (cur.note || "") + " | gộp từ 04 (has_y_source=no)";
      continue;
    }
    byCode03.set(key, {
      id: r.id,
      code: r.code,
      name: r.name,
      supplier: r.supplier,
      image_path: r.image_path || "",
      image_count: r.image_count || "0",
      crm_has_image: "no",
      note: "Gộp từ 04 — không có file folder khớp code (sau skip crawl/ko logo/…)",
    });
  }

  // --- prepare upload plan ---
  const uploadPlan = [];
  for (const r of yesRows) {
    const rels = pickFilesForProduct(r.y_paths);
    const absList = [];
    for (const rel of rels) {
      const abs = path.join(Y_ROOT, rel);
      if (fs.existsSync(abs)) absList.push({ rel, abs });
      else console.warn("Missing file:", abs);
    }
    uploadPlan.push({
      id: Number(r.id),
      code: r.code,
      name: r.name,
      supplier: r.supplier,
      files: absList,
    });
  }

  for (const p of uploadPlan) {
    console.log(
      `  ${p.code}: ${p.files.length} file(s)`,
      p.files.map((f) => f.rel).join(" || "),
    );
  }

  if (!EXECUTE) {
    console.log("Re-run with --execute to upload + rewrite 03/04.");
    return;
  }

  const url =
    process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }
  if (!storageConfig()) {
    console.warn("WARN: no Supabase storage config — will write local /images/");
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: process.env.PG_SSL_DISABLE === "1" ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  const logRows = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  try {
    let i = 0;
    for (const p of uploadPlan) {
      i += 1;
      process.stdout.write(`[${i}/${uploadPlan.length}] ${p.code}… `);
      if (!p.files.length) {
        console.log("SKIP no files");
        logRows.push({
          status: "skip-no-files",
          product_id: p.id,
          code: p.code,
          file: "",
          image_id: "",
          path: "",
          error: "no local files",
        });
        continue;
      }

      // skip if already has images (idempotent)
      const existing = await client.query(
        `SELECT COUNT(*)::int AS n FROM product_images WHERE product_id = $1`,
        [p.id],
      );
      if (Number(existing.rows[0].n) > 0) {
        console.log("SKIP already has images");
        logRows.push({
          status: "skip-already-has",
          product_id: p.id,
          code: p.code,
          file: "",
          image_id: "",
          path: "",
          error: "",
        });
        continue;
      }

      try {
        let first = true;
        for (const f of p.files) {
          const raw = fs.readFileSync(f.abs);
          if (raw.length > IMAGE_UPLOAD_MAX_BYTES) {
            throw new Error(`File quá lớn: ${f.rel} (${raw.length} bytes)`);
          }
          const normalized = await normalizeUploadImageBuffer(raw);
          const publicPath = await putImageBuffer(normalized, ".webp");
          const imageId = await addProductImage(client, p.id, publicPath, first);
          first = false;
          logRows.push({
            status: "ok",
            product_id: p.id,
            code: p.code,
            file: f.rel,
            image_id: imageId,
            path: publicPath,
            error: "",
          });
        }
        await syncPrimary(client, p.id);
        console.log(`ok (${p.files.length})`);
      } catch (err) {
        console.log("FAIL", err.message);
        logRows.push({
          status: "fail",
          product_id: p.id,
          code: p.code,
          file: "",
          image_id: "",
          path: "",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Refresh 03 image state from DB for all codes currently in 03 map + noRows
    const ids03 = [...byCode03.values()].map((r) => Number(r.id)).filter(Number.isFinite);
    if (ids03.length) {
      const { rows: live } = await client.query(
        `SELECT p.id, p.code, p.name, p.supplier,
                COALESCE(p.image_path,'') AS image_path,
                COALESCE(c.n,0)::int AS image_count
         FROM products p
         LEFT JOIN (
           SELECT product_id, COUNT(*)::int AS n FROM product_images GROUP BY product_id
         ) c ON c.product_id = p.id
         WHERE p.id = ANY($1::bigint[])`,
        [ids03],
      );
      for (const L of live) {
        const key = String(L.code).toUpperCase();
        const row = byCode03.get(key) || {
          id: L.id,
          code: L.code,
          name: L.name,
          supplier: L.supplier,
          note: "",
        };
        row.id = L.id;
        row.code = L.code;
        row.name = L.name;
        row.supplier = L.supplier;
        row.image_path = L.image_path;
        row.image_count = L.image_count;
        row.crm_has_image = L.image_count > 0 || L.image_path ? "yes" : "no";
        if (!row.note) {
          row.note = "Không tìm thấy file folder có tên khớp products.code";
        }
        byCode03.set(key, row);
      }
    }

    const merged03 = [...byCode03.values()].sort((a, b) =>
      String(a.code).localeCompare(String(b.code), "en"),
    );
    writeCsv(
      CSV_03,
      ["id", "code", "name", "supplier", "image_path", "image_count", "crm_has_image", "note"],
      merged03,
    );

    // Rewrite 04: only remaining empty with y source unresolved, or failed uploads
    const uploadedOkCodes = new Set(
      logRows.filter((r) => r.status === "ok").map((r) => String(r.code).toUpperCase()),
    );
    const remaining04 = [];
    for (const r of yesRows) {
      if (uploadedOkCodes.has(String(r.code).toUpperCase())) continue;
      // check live
      remaining04.push(r);
    }
    // no-source moved to 03 — remove from 04
    writeCsv(
      CSV_04,
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
      remaining04,
    );

    const logPath = path.join(OUT_DIR, `04-upload-log-${stamp}.csv`);
    writeCsv(
      logPath,
      ["status", "product_id", "code", "file", "image_id", "path", "error"],
      logRows,
    );

    const okCount = logRows.filter((r) => r.status === "ok").length;
    const failCount = logRows.filter((r) => r.status === "fail").length;
    const summary = {
      executed_at: new Date().toISOString(),
      y_root: Y_ROOT,
      normalize: "sharp rotate + max side 1600 + webp q82",
      upload_products: uploadPlan.length,
      images_uploaded_ok: okCount,
      images_failed: failCount,
      merged_to_03_codes: noRows.map((r) => r.code),
      "03_rows_after": merged03.length,
      "04_rows_after": remaining04.length,
      log: logPath,
    };
    fs.writeFileSync(
      path.join(OUT_DIR, `04-upload-summary-${stamp}.json`),
      JSON.stringify(summary, null, 2),
      "utf8",
    );
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
