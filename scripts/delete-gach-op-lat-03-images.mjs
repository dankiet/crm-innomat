/**
 * Xóa toàn bộ ảnh CRM của các mã trong
 * docs/audit-gach-op-lat/06-plan-delete-images-from-03.csv
 *
 * Run:
 *   node scripts/delete-gach-op-lat-03-images.mjs           # dry-run
 *   node scripts/delete-gach-op-lat-03-images.mjs --execute # xóa thật
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StorageClient } from "@supabase/storage-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PLAN_CSV = path.join(
  root,
  "docs",
  "audit-gach-op-lat",
  "06-plan-delete-images-from-03.csv",
);
const OUT_DIR = path.join(root, "docs", "audit-gach-op-lat");
const EXECUTE = process.argv.includes("--execute");

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

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

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

function nowLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isManagedImageRef(ref) {
  if (!ref) return false;
  if (ref.startsWith("/images/")) return true;
  try {
    const u = new URL(ref);
    return u.hostname.endsWith("supabase.co");
  } catch {
    return false;
  }
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
  };
}

function objectPathFromRef(ref, cfg) {
  // https://xxx.supabase.co/storage/v1/object/public/<bucket>/<objectPath>
  const marker = `/storage/v1/object/public/${cfg.bucket}/`;
  const idx = ref.indexOf(marker);
  if (idx >= 0) return ref.slice(idx + marker.length);
  // legacy signed?
  const marker2 = `/storage/v1/object/public/`;
  const i2 = ref.indexOf(marker2);
  if (i2 >= 0) {
    const rest = ref.slice(i2 + marker2.length);
    if (rest.startsWith(cfg.bucket + "/")) return rest.slice(cfg.bucket.length + 1);
  }
  return null;
}

async function deleteImageRef(ref) {
  if (!ref) return { ok: true, mode: "empty" };
  if (ref.startsWith("/images/")) {
    const abs = path.join(root, "public", ref.replace(/^\//, ""));
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    return { ok: true, mode: "local", path: abs };
  }
  const cfg = storageConfig();
  if (!cfg) return { ok: false, mode: "no-storage-config" };
  const objectPath = objectPathFromRef(ref, cfg);
  if (!objectPath) return { ok: false, mode: "unparsed-url", ref };
  const client = new StorageClient(`${cfg.url}/storage/v1`, {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
  });
  const { error } = await client.from(cfg.bucket).remove([objectPath]);
  if (error) return { ok: false, mode: "supabase", error: error.message, objectPath };
  return { ok: true, mode: "supabase", objectPath };
}

async function isPathReferenced(client, publicPath) {
  const { rows } = await client.query(
    `SELECT 1 AS x FROM product_images WHERE path = $1
     UNION ALL SELECT 1 FROM products WHERE image_path = $1
     UNION ALL SELECT 1 FROM customer_mapping_items WHERE image_path = $1
     UNION ALL SELECT 1 FROM customer_mapping_items WHERE custom_product_image_path = $1
     UNION ALL SELECT 1 FROM gallery_collection_items WHERE path = $1
     LIMIT 1`,
    [publicPath],
  );
  return rows.length > 0;
}

async function deleteOneImage(client, imageRow) {
  const imageId = imageRow.id;
  const productId = imageRow.product_id;
  const imgPath = imageRow.path;

  const { rows: galleryRows } = await client.query(
    `SELECT id, collection_id, path FROM gallery_collection_items
     WHERE product_image_id = $1 OR path = $2`,
    [imageId, imgPath],
  );
  const touchedCollectionIds = [...new Set(galleryRows.map((g) => g.collection_id))];

  await client.query("BEGIN");
  try {
    if (galleryRows.length) {
      const ids = galleryRows.map((g) => g.id);
      await client.query(
        `DELETE FROM gallery_collection_items WHERE id = ANY($1::bigint[])`,
        [ids],
      );
      for (const collectionId of touchedCollectionIds) {
        const next = await client.query(
          `SELECT path FROM gallery_collection_items
           WHERE collection_id = $1 ORDER BY sort_order, id LIMIT 1`,
          [collectionId],
        );
        const nextPath = next.rows[0]?.path ?? "";
        await client.query(
          `UPDATE gallery_collections
           SET cover_path = CASE WHEN cover_path = $1 THEN $2 ELSE cover_path END,
               updated_at = $3
           WHERE id = $4`,
          [imgPath, nextPath, nowLocal(), collectionId],
        );
      }
    }

    await client.query(`DELETE FROM product_images WHERE id = $1`, [imageId]);

    if (Number(imageRow.is_primary) === 1) {
      const next = await client.query(
        `SELECT id FROM product_images
         WHERE product_id = $1
         ORDER BY sort_order ASC, id ASC LIMIT 1`,
        [productId],
      );
      if (next.rows[0]) {
        await client.query(`UPDATE product_images SET is_primary = 1 WHERE id = $1`, [
          next.rows[0].id,
        ]);
      }
    }

    // sync primary path
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

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }

  let storageResult = { ok: true, mode: "skipped-still-referenced" };
  if (isManagedImageRef(imgPath) && !(await isPathReferenced(client, imgPath))) {
    storageResult = await deleteImageRef(imgPath);
  }

  return {
    gallery_removed: galleryRows.length,
    storage: storageResult,
  };
}

async function main() {
  if (!fs.existsSync(PLAN_CSV)) {
    console.error("Missing plan CSV:", PLAN_CSV);
    process.exit(1);
  }

  const plan = parseCsv(fs.readFileSync(PLAN_CSV, "utf8")).filter((r) => r.id && r.code);
  const productIds = plan.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));

  const url =
    process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  console.log(EXECUTE ? "MODE: EXECUTE (xóa thật)" : "MODE: DRY-RUN (không xóa)");
  console.log("Plan products:", productIds.length);

  const client = new pg.Client({
    connectionString: url,
    ssl: process.env.PG_SSL_DISABLE === "1" ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const { rows: images } = await client.query(
      `SELECT pi.id, pi.product_id, pi.path, pi.is_primary, pi.sort_order, pi.caption,
              p.code, p.name, p.supplier, p.image_path AS product_image_path
       FROM product_images pi
       JOIN products p ON p.id = pi.product_id
       WHERE pi.product_id = ANY($1::bigint[])
       ORDER BY p.code, pi.is_primary DESC, pi.sort_order, pi.id`,
      [productIds],
    );

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = "";
    console.log("Images found:", images.length);

    // products in plan with 0 images
    const withImg = new Set(images.map((i) => Number(i.product_id)));
    const empty = plan.filter((p) => !withImg.has(Number(p.id)));
    if (empty.length) {
      console.log(
        "Plan rows already without product_images:",
        empty.length,
        empty.map((e) => e.code).join(", "),
      );
    }

    if (!EXECUTE) {
      const byCode = new Map();
      for (const img of images) {
        if (!byCode.has(img.code)) byCode.set(img.code, []);
        byCode.get(img.code).push(img);
      }
      console.log("Would delete images for", byCode.size, "products");
      for (const [code, list] of [...byCode.entries()].slice(0, 15)) {
        console.log(`  ${code}: ${list.length} image(s)`);
      }
      if (byCode.size > 15) console.log(`  … +${byCode.size - 15} more`);
      console.log("Re-run with --execute to delete.");
      return;
    }

    const logRows = [];
    let okImages = 0;
    let failImages = 0;

    // group by product for clearer progress
    const byProduct = new Map();
    for (const img of images) {
      const pid = Number(img.product_id);
      if (!byProduct.has(pid)) byProduct.set(pid, []);
      byProduct.get(pid).push(img);
    }

    let doneProducts = 0;
    for (const [pid, list] of byProduct) {
      doneProducts += 1;
      const code = list[0].code;
      process.stdout.write(`[${doneProducts}/${byProduct.size}] ${code} (${list.length} img)… `);
      try {
        for (const img of list) {
          try {
            const res = await deleteOneImage(client, img);
            okImages += 1;
            logRows.push({
              status: "ok",
              product_id: pid,
              code,
              image_id: img.id,
              path: img.path,
              gallery_removed: res.gallery_removed,
              storage_mode: res.storage?.mode ?? "",
              storage_ok: res.storage?.ok === false ? "no" : "yes",
              error: res.storage?.error || "",
            });
          } catch (err) {
            failImages += 1;
            logRows.push({
              status: "fail",
              product_id: pid,
              code,
              image_id: img.id,
              path: img.path,
              gallery_removed: "",
              storage_mode: "",
              storage_ok: "",
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        // clear legacy image_path if still set with no images
        await client.query(
          `UPDATE products p
           SET image_path = ''
           WHERE p.id = $1
             AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)
             AND COALESCE(p.image_path, '') <> ''`,
          [pid],
        );
        console.log("ok");
      } catch (err) {
        console.log("FAIL", err.message);
      }
    }

    // verify
    const { rows: verify } = await client.query(
      `SELECT p.id, p.code,
              COALESCE(p.image_path, '') AS image_path,
              COALESCE(c.n, 0)::int AS image_count
       FROM products p
       LEFT JOIN (
         SELECT product_id, COUNT(*)::int AS n FROM product_images GROUP BY product_id
       ) c ON c.product_id = p.id
       WHERE p.id = ANY($1::bigint[])
       ORDER BY p.code`,
      [productIds],
    );

    const stillHas = verify.filter(
      (v) => Number(v.image_count) > 0 || String(v.image_path || "").trim() !== "",
    );
    const cleared = verify.filter(
      (v) => Number(v.image_count) === 0 && String(v.image_path || "").trim() === "",
    );

    const logPath = path.join(OUT_DIR, `06-delete-log-${stamp}.csv`);
    writeCsv(
      logPath,
      [
        "status",
        "product_id",
        "code",
        "image_id",
        "path",
        "gallery_removed",
        "storage_mode",
        "storage_ok",
        "error",
      ],
      logRows,
    );

    const summary = {
      executed_at: new Date().toISOString(),
      mode: "execute",
      plan_products: productIds.length,
      images_found: images.length,
      images_deleted_ok: okImages,
      images_failed: failImages,
      products_cleared: cleared.length,
      products_still_have_image: stillHas.length,
      still_have: stillHas.map((s) => ({
        id: s.id,
        code: s.code,
        image_count: s.image_count,
        image_path: s.image_path,
      })),
      backup: backupPath,
      log: logPath,
    };
    const summaryPath = path.join(OUT_DIR, `06-delete-summary-${stamp}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

    console.log(JSON.stringify(summary, null, 2));
    console.log("Log:", logPath);
    console.log("Summary:", summaryPath);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
