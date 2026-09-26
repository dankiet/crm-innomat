/**
 * Media Sync — đối chiếu Supabase Storage ↔ DB, sửa 2 chiều. CHẠY ĐƯỢC 2 CHẾ ĐỘ.
 *
 *   npm run media:sync              # chỉ ĐỌC, in báo cáo (mặc định)
 *   npm run media:sync -- --apply   # ghi: reconcile asset/usage + xoá file rác
 *   npm run media:sync -- --apply --no-prune   # ghi reconcile, KHÔNG xoá file
 *   npm run media:sync -- --prune    # xoá file rác mà không reconcile
 *
 * Vì sao cần: xoá ảnh thời kỳ đầu (trước commit `86cf51e`) chỉ gỡ liên kết DB
 * mà không xoá file → file mồ côi nằm lại Storage. Chiều ngược lại, ref trong
 * DB có thể thiếu row `media_assets` (write path cũ ghi thẳng cột) → ảnh có
 * trong DB nhưng vô hình trên /luu-tru.
 *
 * AN TOÀN (đọc kỹ trước khi sửa):
 *  - "Giữ" = HỢP của `media_assets.storage_key` **và** mọi key trích từ 5 nguồn
 *    ref trong DB. Chỉ file không nằm trong hợp đó mới bị coi là rác — nên row
 *    thiếu asset (lỗ write path) không bao giờ bị xoá oan.
 *  - Chỉ đụng file có tên đúng dạng storage_key (`<sha256>[.<ext>]`); tên lạ bị
 *    bỏ qua và báo cáo, không bao giờ xoá.
 *  - Xoá theo từng file, log rõ, có `--limit` để chạy thử một phần.
 */
import fs from "node:fs";
import path from "node:path";
import { StorageClient } from "@supabase/storage-js";
import pg from "pg";

import { loadEnv } from "./lib/env.mjs";
import {
  findDerivedDrift,
  readMediaRefs,
  reconcileMediaKeys,
  repairDerivedProductImagePaths,
  STORAGE_KEY_RE,
} from "./lib/media-reconcile.mjs";

loadEnv();

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

const APPLY = has("--apply");
/** `--apply` mặc định xoá rác; `--no-prune` để reconcile mà không xoá. */
const PRUNE = APPLY ? !has("--no-prune") : has("--prune");
const LIMIT = Number(valueOf("--limit") ?? 0) || 0;
/**
 * Tuổi tối thiểu (giờ) trước khi một file được coi là rác. `uploadProductImageFile`
 * ghi file lên Storage TRƯỚC rồi mới tạo row DB — trong khoảng giữa hai bước, file
 * vừa tải lên không nằm trong bất kỳ keep-set nào. Cửa sổ này cũng là cách 79 file
 * rác hiện có ra đời (upload lỗi giữa chừng).
 */
const MIN_AGE_HOURS = Number(valueOf("--min-age-hours") ?? 24) || 0;

const mode = APPLY
  ? PRUNE
    ? "GHI — reconcile + xoá rác"
    : "GHI — reconcile, không xoá rác"
  : PRUNE
    ? "GHI — chỉ xoá rác, không reconcile"
    : "chỉ đọc";
const READ_ONLY = !APPLY && !PRUNE;

const dbUrl = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.error("Thiếu DATABASE_URL (hoặc DATABASE_URL_UNPOOLED).");
  process.exit(1);
}
const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!supabaseUrl || !serviceKey) {
  console.error("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const bucket = (process.env.SUPABASE_STORAGE_BUCKET ?? "crm-images").trim();
const prefix = (process.env.SUPABASE_STORAGE_PREFIX ?? "crm").replace(/^\/+|\/+$/g, "");
const storage = new StorageClient(`${supabaseUrl}/storage/v1`, {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
});

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);

/** Liệt kê đệ quy mọi object trong `prefix/` (bỏ qua thư mục con lồng nhau). */
async function listObjects(folder) {
  const files = [];
  const subfolders = [];
  for (let offset = 0; ; offset += 1_000) {
    const { data, error } = await storage.from(bucket).list(folder, {
      limit: 1_000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Không liệt kê được Storage (${folder}): ${error.message}`);
    for (const item of data ?? []) {
      if (item.id) {
        files.push({
          path: `${folder}/${item.name}`,
          name: item.name,
          size: item.metadata?.size ?? 0,
          updatedAt: item.updated_at ?? item.created_at ?? null,
        });
      } else subfolders.push(`${folder}/${item.name}`);
    }
    if (!data || data.length < 1_000) break;
  }
  for (const sub of subfolders) files.push(...(await listObjects(sub)));
  return files;
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  console.log(`[media-sync] bucket=${bucket} prefix=${prefix || "(root)"} · ${mode}`);

  // ── 1. Storage ────────────────────────────────────────────────────────────
  const objects = prefix ? await listObjects(prefix) : await listObjects("");
  const named = [];
  const foreignNames = [];
  for (const o of objects) {
    if (STORAGE_KEY_RE.test(o.name)) named.push(o);
    else foreignNames.push(o.path);
  }
  console.log(
    `\n[storage] ${objects.length} object (${mb(objects.reduce((a, o) => a + o.size, 0))} MB)`,
  );
  if (foreignNames.length) {
    console.log(
      `[storage] ${foreignNames.length} object tên KHÔNG phải storage_key — bỏ qua, không bao giờ xoá:`,
    );
    for (const n of foreignNames.slice(0, 10)) console.log(`   · ${n}`);
  }

  // ── 2. DB: ref + asset ────────────────────────────────────────────────────
  const refs = await readMediaRefs(client);
  const { rows: assetRows } = await client.query("SELECT storage_key FROM media_assets");
  const assetKeys = new Set(assetRows.map((r) => r.storage_key));
  const refKeys = new Set(refs.map((r) => r.key));
  console.log(
    `[db] ${assetKeys.size} media_assets · ${refs.length} ref (${refKeys.size} key) từ 5 nguồn`,
  );

  // ── 3. Báo cáo lệch ───────────────────────────────────────────────────────
  const storageKeys = new Set(named.map((o) => o.name));
  const sizeOf = new Map(named.map((o) => [o.name, o.size]));

  const missingAssets = [...refKeys].filter((k) => !assetKeys.has(k)); // ref DB thiếu row
  const missingFiles = [...assetKeys].filter((k) => !storageKeys.has(k)); // row DB thiếu file
  const orphanAll = [...storageKeys].filter((k) => !assetKeys.has(k) && !refKeys.has(k));

  // File mồ côi NHƯNG còn quá mới → có thể là upload đang dở (file lên Storage
  // trước, row DB tạo sau). Không đụng tới.
  const cutoff = Date.now() - MIN_AGE_HOURS * 3_600_000;
  const updatedAtOf = new Map(named.map((o) => [o.name, o.updatedAt]));
  const isYoung = (k) => {
    const t = updatedAtOf.get(k);
    return t ? Date.parse(t) > cutoff : true; // không rõ tuổi → coi như mới, giữ lại
  };
  const youngOrphans = orphanAll.filter(isYoung);
  const orphanFiles = orphanAll.filter((k) => !isYoung(k));
  const orphanBytes = orphanFiles.reduce((a, k) => a + (sizeOf.get(k) ?? 0), 0);

  console.log(
    "\n[reconcile] ref trong DB nhưng THIẾU row media_assets (ảnh vô hình trên /luu-tru):",
  );
  console.log(
    `   ${missingAssets.length}${missingAssets.length ? " → tạo asset cho ref CÒN hiệu lực (sau khi sửa snapshot dẫn xuất bên dưới)" : " (không có)"}`,
  );
  console.log("\n[reconcile] row media_assets nhưng THIẾU file trong Storage (ảnh vỡ):");
  console.log(
    `   ${missingFiles.length}${missingFiles.length ? " → CHỈ báo cáo, cần xử lý tay" : " (không có)"}`,
  );
  for (const k of missingFiles.slice(0, 10)) console.log(`   · ${k}`);

  // `products.image_path` là snapshot dẫn xuất; lệch nghĩa là sản phẩm đang trỏ
  // tới ảnh không còn gắn với nó (hoặc rỗng dù còn ảnh).
  const derivedDrift = await findDerivedDrift(client);
  console.log("\n[reconcile] products.image_path LỆCH với ảnh primary thật (snapshot cũ):");
  console.log(
    `   ${derivedDrift.length}${derivedDrift.length ? " → sẽ suy lại từ product_images" : " (không có)"}`,
  );
  for (const d of derivedDrift.slice(0, 10)) {
    console.log(
      `   · #${d.id} ${d.code} → ${d.image_path || "(rỗng)"}  ⇒  ${d.derived || "(rỗng)"}`,
    );
  }

  console.log("\n[prune] file trong Storage KHÔNG có asset và KHÔNG được ref (rác):");
  console.log(`   ${orphanFiles.length} file · ${mb(orphanBytes)} MB`);
  for (const k of orphanFiles.slice(0, 10))
    console.log(`   · ${k} (${((sizeOf.get(k) ?? 0) / 1024).toFixed(0)} KB)`);
  if (orphanFiles.length > 10) console.log(`   … và ${orphanFiles.length - 10} file nữa`);
  if (youngOrphans.length) {
    console.log(
      `   ⏳ ${youngOrphans.length} file mồ côi còn MỚI hơn ${MIN_AGE_HOURS}h — GIỮ LẠI (có thể là upload đang dở):`,
    );
    for (const k of youngOrphans.slice(0, 10))
      console.log(`      · ${k} (${updatedAtOf.get(k) ?? "?"})`);
  }

  if (READ_ONLY) {
    console.log(
      "\n[media-sync] chỉ đọc — không thay đổi gì. Thêm `--apply` để reconcile (và xoá rác), hoặc `--prune` để chỉ xoá rác.",
    );
    process.exitCode = 0;
  } else {
    // ── 4. Reconcile: tạo asset còn thiếu + gắn usage ───────────────────────
    if (APPLY) {
      // Sửa snapshot dẫn xuất và reconcile phải cùng một transaction: nếu reconcile
      // lỗi giữa chừng, snapshot đã sửa cũng phải quay lui để DB không ở trạng thái nửa vời.
      await client.query("BEGIN");
      let stats;
      try {
        // Sửa snapshot dẫn xuất TRƯỚC: sản phẩm có image_path cũ trỏ tới ảnh không
        // còn gắn sẽ không sinh asset "ma" ở bước dưới.
        const repaired = await repairDerivedProductImagePaths(client);
        if (repaired)
          console.log(`\n[reconcile] sửa products.image_path lệch: ${repaired} sản phẩm`);

        // Đọc LẠI ref sau khi sửa: refs đọc ở bước báo cáo đã cũ, còn chứa snapshot
        // vừa gỡ — dùng lại sẽ tạo đúng cái asset "ma" mà bước sửa vừa dẹp.
        const freshRefs = repaired ? await readMediaRefs(client) : refs;

        // keyToPath: ưu tiên ref thật từ DB; file mồ côi có asset sẵn thì dùng asset.path.
        const { rows: paths } = await client.query(
          "SELECT storage_key, path FROM media_assets WHERE path <> ''",
        );
        const keyToPath = new Map(paths.map((r) => [r.storage_key, r.path]));
        for (const r of freshRefs) if (!keyToPath.has(r.key)) keyToPath.set(r.key, r.path);

        // Chỉ reconcile key có thật trong DB (ref) hoặc đã có asset; KHÔNG tạo asset
        // cho file rác — rác thì xoá, không phải dựng card ma.
        const liveRefKeys = new Set(freshRefs.map((r) => r.key));
        const targets = new Map(
          [...keyToPath].filter(([k]) => liveRefKeys.has(k) || assetKeys.has(k)),
        );
        stats = await reconcileMediaKeys(client, targets);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
      console.log(
        `\n[reconcile] xong: +${stats.assetKeys} asset · product ${stats.productUsages} · mapping ${stats.mappingUsages}/${stats.customMappingUsages} · hero ${stats.heroUsages}`,
      );
    }

    // ── 5. Prune: xoá file rác ──────────────────────────────────────────────
    if (PRUNE && orphanFiles.length) {
      // Kiểm tra lại NGAY TRƯỚC KHI XOÁ (tránh TOCTOU với request đang ghi):
      // upload ghi file lên Storage TRƯỚC rồi mới tạo row, nên phải soát lại cả
      // ref lẫn media_assets. Key nào vừa xuất hiện thì bỏ ra khỏi danh sách.
      const freshRefs = await readMediaRefs(client);
      const freshKeys = new Set(freshRefs.map((r) => r.key));
      const { rows: freshAssets } = await client.query("SELECT storage_key FROM media_assets");
      for (const r of freshAssets) freshKeys.add(r.storage_key);

      const doomed = orphanFiles.filter((k) => !freshKeys.has(k));
      const spared = orphanFiles.length - doomed.length;
      if (spared)
        console.log(`\n[prune] ${spared} file vừa được ref/đăng ký trong lúc chạy — GIỮ LẠI.`);

      const batch = LIMIT ? doomed.slice(0, LIMIT) : doomed;
      console.log(`\n[prune] xoá ${batch.length} file…`);
      let deleted = 0;
      for (let i = 0; i < batch.length; i += 100) {
        const chunk = batch.slice(i, i + 100);
        const { error } = await storage.from(bucket).remove(chunk.map((k) => `${prefix}/${k}`));
        if (error) throw new Error(`Xoá thất bại: ${error.message}`);
        deleted += chunk.length;
        if (deleted % 500 < 100) console.log(`[prune] đã xoá ${deleted}/${batch.length}`);
      }
      const freed = batch.reduce((a, k) => a + (sizeOf.get(k) ?? 0), 0);
      console.log(`[prune] xong: ${deleted} file, giải phóng ${mb(freed)} MB`);
    } else if (PRUNE) {
      console.log("\n[prune] không có file rác để xoá.");
    }

    console.log("\n[media-sync] DONE. Chạy `npm run db:media-verify` để đối chiếu lại.");
  }
} catch (err) {
  console.error("[media-sync] FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
