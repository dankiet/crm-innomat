/**
 * Fill product_internal_codes (mã nội bộ / mã NCC) cho nhóm gạch ốp lát
 * bằng cách parse cột `products.note` theo mẫu:
 *   Mã NCC: <value>; Xuất xứ: <...>; Ghi chú: <...>
 *
 * - Idempotent: ON CONFLICT (internal_code) DO NOTHING
 * - Bỏ qua nếu SP đã có mã trong product_internal_codes
 * - Backup bảng product_internal_codes ra JSON trước khi sửa
 * - Chạy trong transaction
 *
 * Chạy: node --env-file=.env scripts/fill-internal-codes-from-notes.mjs [--apply]
 *   mặc định: dry-run (in preview, KHÔNG ghi DB)
 *   --apply  : chạy UPDATE thật
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const url = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "").trim();
if (!url) {
  console.error("DATABASE_URL (hoặc DATABASE_URL_UNPOOLED) chưa được set.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

const TILE_CATEGORY = "Gạch Ốp Lát";
const NCC_RE = /Mã\s*NCC\s*:\s*([^;]+?)\s*(?:;|$)/gi;

function parseNccCodes(note) {
  if (!note) return [];
  const out = [];
  const seen = new Set();
  for (const m of note.matchAll(NCC_RE)) {
    const raw = (m[1] ?? "").trim();
    if (!raw) continue;
    const key = raw.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const tiles = await client.query(
    `SELECT id, code, name, note
       FROM products
      WHERE LOWER(TRIM(category)) = LOWER($1)`,
    [TILE_CATEGORY],
  );

  const existing = await client.query(
    `SELECT product_id, UPPER(internal_code) AS code
       FROM product_internal_codes`,
  );
  const existingByProduct = new Map();
  for (const row of existing.rows) {
    const arr = existingByProduct.get(row.product_id) ?? [];
    arr.push(row.code);
    existingByProduct.set(row.product_id, arr);
  }

  const allCodes = await client.query(
    `SELECT UPPER(internal_code) AS code, product_id FROM product_internal_codes`,
  );
  const codeOwner = new Map();
  for (const row of allCodes.rows) codeOwner.set(row.code, row.product_id);

  const plan = [];
  const skipped = { alreadyHas: 0, noNccInNote: 0, emptyNote: 0, multiOwner: 0 };
  const conflicts = [];

  for (const p of tiles.rows) {
    const productId = Number(p.id);
    const note = p.note ?? "";
    if (!note.trim()) {
      skipped.emptyNote += 1;
      continue;
    }
    const codes = parseNccCodes(note);
    if (codes.length === 0) {
      skipped.noNccInNote += 1;
      continue;
    }
    const owned = existingByProduct.get(productId) ?? [];
    const newCodes = codes.filter(
      (c) => !owned.includes(c.toUpperCase()),
    );
    if (newCodes.length === 0) {
      skipped.alreadyHas += 1;
      continue;
    }
    for (const nc of newCodes) {
      const owner = codeOwner.get(nc.toUpperCase());
      if (owner != null && owner !== productId) {
        conflicts.push({
          productId,
          productCode: p.code,
          productName: p.name,
          newCode: nc,
          existingOwnerId: owner,
        });
        skipped.multiOwner += 1;
        continue;
      }
      plan.push({ productId, productCode: p.code, code: nc });
      codeOwner.set(nc.toUpperCase(), productId);
    }
  }

  console.log("─── PREVIEW ───");
  console.log(`Tổng gạch ốp lát:        ${tiles.rows.length}`);
  console.log(`Đã có mã trong DB:       ${skipped.alreadyHas}`);
  console.log(`Note rỗng:               ${skipped.emptyNote}`);
  console.log(`Note không có 'Mã NCC':  ${skipped.noNccInNote}`);
  console.log(`Mã bị conflict SP khác: ${skipped.multiOwner}`);
  console.log(`Sẽ INSERT mới:           ${plan.length}`);
  console.log(`Conflict chi tiết:       ${conflicts.length}`);
  if (conflicts.length) {
    console.log("─── CONFLICTS (bị bỏ qua) ───");
    for (const c of conflicts.slice(0, 20)) {
      console.log(
        `  SP ${c.productCode} (id=${c.productId}) muốn thêm '${c.newCode}' nhưng đã thuộc product_id=${c.existingOwnerId}`,
      );
    }
    if (conflicts.length > 20) console.log(`  ... và ${conflicts.length - 20} cái nữa`);
  }
  if (plan.length) {
    console.log("─── SAMPLE PLAN (10 dòng đầu) ───");
    for (const x of plan.slice(0, 10)) {
      console.log(`  + ${x.productCode} (id=${x.productId}) ← ${x.code}`);
    }
    if (plan.length > 10) console.log(`  ... và ${plan.length - 10} dòng nữa`);
  }

  if (!APPLY) {
    console.log("\n[DRY-RUN] Không ghi DB. Chạy với --apply để thực thi.");
    process.exit(0);
  }

  console.log("\n─── BACKUP ───");
  const backupPath = path.resolve(
    `scripts/.backup-product_internal_codes-${Date.now()}.json`,
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      { takenAt: new Date().toISOString(), rows: existing.rows },
      null,
      2,
    ),
  );
  console.log(`Đã backup ${existing.rows.length} dòng → ${backupPath}`);

  console.log("\n─── APPLY (transaction) ───");
  await client.query("BEGIN");
  try {
    const insertText =
      `INSERT INTO product_internal_codes (product_id, internal_code, created_at)
       VALUES ($1, $2, '')
       ON CONFLICT (internal_code) DO NOTHING`;
    let inserted = 0;
    for (const { productId, code } of plan) {
      const res = await client.query(insertText, [productId, code]);
      inserted += res.rowCount ?? 0;
    }
    await client.query("COMMIT");
    console.log(`INSERT thành công: ${inserted} dòng`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
} finally {
  await client.end();
}
