/**
 * Tests cho Media Asset Registry (Option 2: 1 file = 1 MediaAsset).
 *
 *  - Phần PURE: lib/media-assets.ts — classifier, summary, backfill plan, dedupe.
 *  - Phần SQLite fake: mem-db (node:sqlite) — ensure/link/sync/delete/list/backfill.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeUsages,
  classifyAssetStatus,
  assertLookbookNeverOrphan,
  usageGroups,
  countRoles,
  dedupeByFile,
  storageKeyOf,
  planBackfill,
  type ProductUsageInput,
} from "../lib/media-assets.ts";
import {
  ensureMediaAsset,
  linkProductImageAsset,
  syncMappingItemUsage,
  syncHeroUsage,
  getAssetUsageSummary,
  countAssetUsages,
  batchesUsageSummaries,
  applyMediaBackfill,
  listMediaAssets,
  deleteMediaAsset,
} from "./media-assets.server.ts";
import { openMemoryDb, applyTestSchema, type AsyncDb } from "../test-utils/mem-db.ts";

const H = "a".repeat(64);
// storageKeyOf trả tail gồm cả đuôi mở rộng: `<sha>.<ext>`
const KEY = `${H}.webp`;

function product(partial: Partial<ProductUsageInput> = {}): ProductUsageInput {
  return {
    product_public: 0,
    featured_rank: null,
    kind: "normal",
    image_public: 0,
    ...partial,
  };
}

test("pure: classify — unused khi zero usage", () => {
  assert.equal(classifyAssetStatus(summarizeUsages([])), "unused");
});

test("pure: classify — used khi ảnh gắn sản phẩm (kể cả chưa public)", () => {
  // Ảnh thường của sản phẩm ẩn: đã gắn vào sản phẩm → used.
  const s = summarizeUsages([product({ kind: "normal" })], 0, 0);
  assert.equal(s.product, 1);
  assert.equal(classifyAssetStatus(s), "used");
});

test("pure: classify — used khi có MAP", () => {
  assert.equal(classifyAssetStatus(summarizeUsages([product({ kind: "map" })])), "used");
});

test("pure: classify — used khi có mapping usage", () => {
  assert.equal(classifyAssetStatus(summarizeUsages([], 1, 0)), "used");
});

test("pure: classify — used khi có hero usage", () => {
  assert.equal(classifyAssetStatus(summarizeUsages([], 0, 1)), "used");
});

test("pure: lookbook public không bao giờ unused (invariant)", () => {
  assert.doesNotThrow(() =>
    assertLookbookNeverOrphan(product({ kind: "concept", image_public: 1 })),
  );
});

test("pure: summarizeUsages gom đủ 5 nhóm", () => {
  const s = summarizeUsages(
    [
      product({ kind: "map" }),
      product({ kind: "concept", image_public: 1 }),
      product({ featured_rank: 4 }),
    ],
    2,
    1,
  );
  assert.equal(s.product, 3);
  assert.equal(s.lookbook, 1);
  assert.equal(s.featured, 1);
  assert.equal(s.mapping, 2);
  assert.equal(s.hero, 1);
  assert.deepEqual(usageGroups(s), {
    product: 3,
    lookbook: 1,
    featured: 1,
    hero: 1,
    mapping: 2,
  });
});

test("pure: storageKeyOf phân giải /images/ và URL", () => {
  const key = `${H}.webp`;
  assert.equal(storageKeyOf(`/images/${key}`), key);
  assert.equal(storageKeyOf(`https://x.supabase.co/storage/v1/object/public/crm-images/crm/${key}?x=1`), key);
  assert.equal(storageKeyOf(""), "");
  assert.equal(storageKeyOf("/images/hello.webp"), ""); // không phải hash
  assert.equal(storageKeyOf("not-a-url"), "");
});

test("pure: dedupeByFile — 1 physical file thành 1 item", () => {
  const k1 = `${H}.webp`;
  const k2 = `${H.replace(/^a/, "b")}.webp`;
  const items = [
    { path: `/images/${k1}`, label: "1st" },
    { path: `/images/${k1}`, label: "dup" },
    { path: `https://x.supabase.co/.../${k2}`, label: "2nd" },
    { path: "", label: "empty" },
  ];
  const out = dedupeByFile(items);
  assert.deepEqual(out.map((x) => x.label), ["1st", "2nd"]);
});

test("pure: countRoles đếm nil-safe theo role", () => {
  const refs = [
    { role: "mapping", id: 1 },
    { role: "mapping", id: 2 },
    { role: "lp_hero", id: 9 },
  ];
  assert.deepEqual(countRoles(refs), { mapping: 2, lp_hero: 1 });
});

test("pure: planBackfill idempotent — cùng input cho output y hệt", () => {
  const k1 = `${H}.webp`;
  const k2 = `${H.replace(/^a/, "b")}.webp`;
  const srcs = [
    { src: "product_images", path: `/images/${k1}` },
    { src: "mapping", path: `/images/${k1}` },
    { src: "custom_mapping_product", path: `/images/${k2}` },
    { src: "lp_hero", path: `https://x.supabase.co/.../${k2}` },
  ] as const;
  const a = planBackfill(srcs as never);
  const b = planBackfill(srcs as never);
  assert.deepEqual(a, b);
  assert.deepEqual(new Set(a.assetKeys), new Set([k1, k2]));
  assert.deepEqual(a.productUsageKeys, [k1]);
  assert.deepEqual(a.mappingUsageKeys, [k1]);
  assert.deepEqual(a.mappingCustomUsageKeys, [k2]);
  assert.deepEqual(a.heroUsageKeys, [k2]);
});

// ───────────────────────────  DB (SQLite fake)  ───────────────────────────

async function seedProduct(db: AsyncDb, code: string, extra: Record<string, string | number | null | undefined> = {}): Promise<number> {
  const info = await db
    .prepare(
      `INSERT INTO products (code, name, category, is_public, featured_rank, image_path)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(code, code, extra.category ?? "", extra.is_public ?? 0, extra.featured_rank ?? null, extra.image_path ?? "");
  return Number(info.lastInsertRowid);
}

async function seedProductImage(
  db: AsyncDb,
  productId: number,
  path: string,
  extra: Record<string, string | number | null | undefined> = {},
): Promise<number> {
  const info = await db
    .prepare(
      `INSERT INTO product_images (product_id, path, kind, is_public, is_primary, caption, ai_description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      productId,
      path,
      extra.kind ?? "normal",
      extra.is_public ?? 1,
      extra.is_primary ?? 0,
      extra.caption ?? "",
      extra.ai_description ?? "",
    );
  return Number(info.lastInsertRowid);
}

function dbOpen(): AsyncDb {
  const db = openMemoryDb();
  return db;
}

async function open(): Promise<AsyncDb> {
  const db = dbOpen();
  await applyTestSchema(db);
  return db;
}

test("db: ensureMediaAsset tạo asset từ path và chống trùng theo storage_key", async () => {
  const db = await open();
  const path = `/images/${H}.webp`;
  const a = await ensureMediaAsset(db, path, { width: 100, height: 200, mime_type: "image/webp" });
  const b = await ensureMediaAsset(db, path);
  assert.equal(a.storage_key, KEY);
  assert.equal(b.id, a.id); // cùng file → cùng asset (idempotent)
  assert.equal(a.width, 100);
  assert.equal(b.width, 100);
  await db.close();
});

test("db: ensureMediaAsset cập nhật path display khi khác nhưng không đổi key", async () => {
  const db = await open();
  const a = await ensureMediaAsset(db, `/images/${H}.webp`);
  const b = await ensureMediaAsset(db, `https://x.supabase.co/.../${H}.webp`);
  assert.equal(b.id, a.id);
  assert.equal(b.path, `https://x.supabase.co/.../${H}.webp`);
  const row = await db.prepare("SELECT path FROM media_assets WHERE id = ?").get<{ path: string }>(a.id);
  assert.equal(row?.path, `https://x.supabase.co/.../${H}.webp`);
  await db.close();
});

test("db: ensureMediaAsset ném lỗi khi path không trích được storage_key", async () => {
  const db = await open();
  await assert.rejects(() => ensureMediaAsset(db, "/images/hello.webp"), /storage_key/);
  await db.close();
});

test("db: linkProductImageAsset gắn media_asset_id cho row", async () => {
  const db = await open();
  const pid = await seedProduct(db, "A1");
  const imgId = await seedProductImage(db, pid, `/images/${H}.webp`, { kind: "map" });
  await linkProductImageAsset(db, { id: imgId, path: `/images/${H}.webp` });
  const row = await db
    .prepare("SELECT media_asset_id FROM product_images WHERE id = ?")
    .get<{ media_asset_id: number | null }>(imgId);
  assert.ok(row?.media_asset_id != null);
  const asset = await db
    .prepare("SELECT id, storage_key FROM media_assets WHERE id = ?")
    .get<{ id: number; storage_key: string }>(row!.media_asset_id!);
  assert.equal(asset?.storage_key, KEY);
  await db.close();
});

test("db: syncMappingItemUsage tạo usage cho cả 2 cột và idempotent", async () => {
  const db = await open();
  const info = await db
    .prepare("INSERT INTO customer_mapping_items (mapping_id, image_path, custom_product_image_path) VALUES (?, ?, ?)")
    .run(1, `/images/${H}.webp`, `/images/${H.replace(/^a/, "b")}.webp`);
  const itemId = Number(info.lastInsertRowid);
  await syncMappingItemUsage(db, { id: itemId, image_path: `/images/${H}.webp`, custom_product_image_path: `/images/${H.replace(/^a/, "b")}.webp` });
  await syncMappingItemUsage(db, { id: itemId, image_path: `/images/${H}.webp`, custom_product_image_path: `/images/${H.replace(/^a/, "b")}.webp` });
  const rows = await db
    .prepare("SELECT col FROM mapping_media_usages WHERE mapping_item_id = ? ORDER BY col")
    .all<{ col: string }>(itemId);
  assert.deepEqual(rows.map((r) => r.col), ["custom_product_image_path", "image_path"]);
  await db.close();
});

test("db: syncHeroUsage tạo/tắt usage hero", async () => {
  const db = await open();
  await syncHeroUsage(db, `/images/${H}.webp`);
  assert.equal(await countAssetUsages(db, (await ensureMediaAsset(db, `/images/${H}.webp`)).id), 1);
  await syncHeroUsage(db, "");
  assert.equal(await countAssetUsages(db, (await ensureMediaAsset(db, `/images/${H}.webp`)).id), 0);
  await db.close();
});

test("db: getAssetUsageSummary phân loại used/unused", async () => {
  const db = await open();
  const path = `/images/${H}.webp`;
  const asset = await ensureMediaAsset(db, path);

  // chưa có usage → unused
  let s = await getAssetUsageSummary(db, asset.id);
  assert.equal(s.status, "unused");

  // map → used
  const pid = await seedProduct(db, "A1", { is_public: 0 });
  const imgId = await seedProductImage(db, pid, path, { kind: "map" });
  await linkProductImageAsset(db, { id: imgId, path });
  s = await getAssetUsageSummary(db, asset.id);
  assert.equal(s.status, "used");
  assert.equal(s.groups.product, 1);
  assert.equal(s.groups.mapping, 0);

  // làm thường + sản phẩm ẩn → vẫn used (đã gắn sản phẩm)
  await db.prepare("UPDATE product_images SET kind = 'normal' WHERE id = ?").run(imgId);
  s = await getAssetUsageSummary(db, asset.id);
  assert.equal(s.status, "used");
  await db.close();
});

test("db: batchesUsageSummaries không N+1 — 1 batch cho nhiều asset", async () => {
  const db = await open();
  const k1 = `${H}.webp`;
  const k2 = `${H.replace(/^a/, "b")}.webp`;
  const a1 = await ensureMediaAsset(db, `/images/${k1}`);
  const a2 = await ensureMediaAsset(db, `/images/${k2}`);
  const map = await batchesUsageSummaries(db, [a1.id, a2.id, 99999]);
  assert.equal(map.size, 2);
  assert.equal(map.get(a1.id)?.status, "unused");
  assert.equal(map.get(a2.id)?.status, "unused");
  await db.close();
});

test("db: deleteMediaAsset trả usages_removed và SET NULL product_images", async () => {
  const db = await open();
  const path = `/images/${H}.webp`;
  const asset = await ensureMediaAsset(db, path);
  const pid = await seedProduct(db, "A1", { is_public: 1 });
  const imgId = await seedProductImage(db, pid, path, { kind: "map" });
  await linkProductImageAsset(db, { id: imgId, path });
  await syncHeroUsage(db, path);

  const before = await countAssetUsages(db, asset.id);
  assert.equal(before, 2); // product_image + hero

  const res = await deleteMediaAsset(db, asset.id);
  assert.equal(res.deleted, true);
  assert.equal(res.usages_removed, 2);

  const img = await db.prepare("SELECT media_asset_id FROM product_images WHERE id = ?").get<{ media_asset_id: number | null }>(imgId);
  assert.equal(img?.media_asset_id, null);
  const gone = await db.prepare("SELECT id FROM media_assets WHERE id = ?").get(asset.id);
  assert.equal(gone, undefined);
  await db.close();
});

test("db: deleteMediaAsset xoá asset không tồn tại → deleted=false", async () => {
  const db = await open();
  assert.deepEqual(await deleteMediaAsset(db, 999), { deleted: false, usages_removed: 0 });
  await db.close();
});

test("db: deleteMediaAsset — xoá asset vẫn còn product_images thường (không active)", async () => {
  const db = await open();
  const path = `/images/${H}.webp`;
  const asset = await ensureMediaAsset(db, path);
  const pid = await seedProduct(db, "A1", { is_public: 0 });
  const imgId = await seedProductImage(db, pid, path, { kind: "normal" });
  await linkProductImageAsset(db, { id: imgId, path });
  const res = await deleteMediaAsset(db, asset.id);
  assert.equal(res.deleted, true);
  assert.equal(res.usages_removed, 1);
  // row product_images còn (chỉ bỏ liên kết) — không xoá file/row
  const img = await db.prepare("SELECT media_asset_id FROM product_images WHERE id = ?").get<{ media_asset_id: number | null }>(imgId);
  assert.equal(img?.media_asset_id, null);
  await db.close();
});

test("db: applyMediaBackfill idempotent — chạy 2 lần ra cùng số usages", async () => {
  const db = await open();
  const k1 = `${H}.webp`;
  const k2 = `${H.replace(/^a/, "b")}.webp`;
  const pid = await seedProduct(db, "A1", { is_public: 1 });
  await seedProductImage(db, pid, `/images/${k1}`, { kind: "map" });
  await seedProductImage(db, pid, `/images/${k2}`, { kind: "map" });
  const srcs = [
    { src: "product_images", path: `/images/${k1}` },
    { src: "product_images", path: `/images/${k2}` },
  ];

  const first = await applyMediaBackfill(db, srcs as never);
  assert.equal(first.assetKeys, 2);
  assert.equal(first.productUsages, 2);
  const second = await applyMediaBackfill(db, srcs as never);
  assert.equal(second.assetKeys, 0); // đã có, INSERT OR IGNORE
  assert.equal(second.productUsages, 0); // đều đã gắn media_asset_id

  const assets = await db.prepare("SELECT COUNT(*) AS n FROM media_assets").get<{ n: number }>();
  assert.equal(Number(assets?.n), 2);
  const linked = await db
    .prepare("SELECT COUNT(*) AS n FROM product_images WHERE media_asset_id IS NOT NULL")
    .get<{ n: number }>();
  assert.equal(Number(linked?.n), 2);
  await db.close();
});

test("db: listMediaAssets — asset-level, item không product usage có id=0", async () => {
  const db = await open();
  await ensureMediaAsset(db, `/images/${H}.webp`);
  const res = await listMediaAssets(db);
  assert.equal(res.total, 1);
  const item = res.items[0]!;
  assert.equal(item.asset_id, item.asset_id);
  assert.equal(item.storage_key, KEY);
  assert.equal(item.id, 0); // không có product usage
  assert.equal(item.product_id, 0);
  assert.equal(item.status, "unused");
  await db.close();
});

test("db: listMediaAssets — surface path + meta (width/height/mime/file_size)", async () => {
  const db = await open();
  const path = `/images/${H}.webp`;
  await ensureMediaAsset(db, path, { width: 1600, height: 1200, mime_type: "image/webp", file_size: 245_000 });
  const res = await listMediaAssets(db);
  assert.equal(res.total, 1);
  const item = res.items[0]!;
  // path thật (không rỗng) — card render <img src>; meta để hiện kích thước.
  assert.equal(item.path, path);
  assert.equal(item.width, 1600);
  assert.equal(item.height, 1200);
  assert.equal(item.mime_type, "image/webp");
  assert.equal(item.file_size, 245_000);
  await db.close();
});

test("db: applyMediaBackfill điền path thật (không để rỗng) + bù meta khi chạy lại", async () => {
  const db = await open();
  const k1 = `${H}.webp`;
  const srcs = [{ src: "product_images", path: `https://x.supabase.co/.../${k1}` }];

  await applyMediaBackfill(db, srcs as never);
  const afterFirst = await db
    .prepare("SELECT path FROM media_assets WHERE storage_key = ?")
    .get<{ path: string }>(k1);
  // Backfill đời đầu để path='' → lưới trắng; giờ phải điền path thật.
  assert.equal(afterFirst?.path, `https://x.supabase.co/.../${k1}`);

  // Chạy lại với cùng nguồn: không nhân bản, path giữ nguyên.
  const second = await applyMediaBackfill(db, srcs as never);
  assert.equal(second.assetKeys, 0);
  const rows = await db
    .prepare("SELECT COUNT(*) AS n FROM media_assets WHERE storage_key = ?")
    .get<{ n: number }>(k1);
  assert.equal(rows?.n, 1);
  await db.close();
});

test("db: listMediaAssets — item có product usage lấy rep product", async () => {
  const db = await open();
  const pid = await seedProduct(db, "BX-1", { is_public: 1, category: "Gach" });
  const path = `/images/${H}.webp`;
  await seedProductImage(db, pid, path, { kind: "map", caption: "Cap" });
  await linkProductImageAsset(db, { id: (await db.prepare("SELECT id FROM product_images LIMIT 1").get<{ id: number }>())?.id ?? 0, path });
  const res = await listMediaAssets(db);
  assert.equal(res.total, 1);
  const item = res.items[0]!;
  assert.equal(item.product_code, "BX-1");
  assert.equal(item.product_category, "Gach");
  assert.equal(item.kind, "map");
  assert.equal(item.status, "used");
  assert.equal(item.usage_groups.product, 1);
  await db.close();
});

test("db: listMediaAssets — status filter used/unused", async () => {
  const db = await open();
  const usedPath = `/images/${H}.webp`;
  const draftPath = `/images/${H.replace(/^a/, "b")}.webp`;
  const unusedPath = `/images/${H.replace(/^a/, "c")}.webp`;

  // used: map public product
  const p1 = await seedProduct(db, "U1", { is_public: 1 });
  const img1 = await seedProductImage(db, p1, usedPath, { kind: "map" });
  await linkProductImageAsset(db, { id: img1, path: usedPath });

  // cũng used: ảnh thường của sản phẩm ẩn (đã gắn sản phẩm, chỉ chưa public)
  const p2 = await seedProduct(db, "D1", { is_public: 0 });
  const img2 = await seedProductImage(db, p2, draftPath, { kind: "normal" });
  await linkProductImageAsset(db, { id: img2, path: draftPath });

  // unused: asset không nơi nào trỏ tới
  await ensureMediaAsset(db, unusedPath);

  const used = await listMediaAssets(db, { usage: "used" });
  assert.equal(used.total, 2);
  assert.deepEqual(used.items.map((i) => i.product_code).sort(), ["D1", "U1"]);
  assert.ok(used.items.every((i) => i.status === "used"));

  const unused = await listMediaAssets(db, { usage: "unused" });
  assert.equal(unused.total, 1);
  assert.equal(unused.items[0]?.status, "unused");
  assert.equal(unused.items[0]?.storage_key, `${H.replace(/^a/, "c")}.webp`);
  await db.close();
});

test("db: listMediaAssets — tab map/concept/featured/unassigned filter theo product usage", async () => {
  const db = await open();
  const p = await seedProduct(db, "M1", { is_public: 1, featured_rank: 3 });
  const img = await seedProductImage(db, p, `/images/${H}.webp`);
  await linkProductImageAsset(db, { id: img, path: `/images/${H}.webp` });

  const r = await listMediaAssets(db, { tab: "featured" });
  assert.equal(r.total, 1);

  // kind normal → map tab rỗng, unassigned có
  const mapRes = await listMediaAssets(db, { tab: "map" });
  assert.equal(mapRes.total, 0);
  const unassigned = await listMediaAssets(db, { tab: "unassigned" });
  assert.equal(unassigned.total, 1);
  await db.close();
});

test("db: listMediaAssets — facet & search & publicFilter", async () => {
  const db = await open();
  const p = await seedProduct(db, "F-99", { is_public: 1, category: "Men" });
  const img = await seedProductImage(db, p, `/images/${H}.webp`, { kind: "concept", is_public: 1 });
  await linkProductImageAsset(db, { id: img, path: `/images/${H}.webp` });

  const byCategory = await listMediaAssets(db, { category: "men" });
  assert.equal(byCategory.total, 1);

  const bySearch = await listMediaAssets(db, { search: "F-99" });
  assert.equal(bySearch.total, 1);

  const byPublicOnly = await listMediaAssets(db, { publicFilter: "public" });
  assert.equal(byPublicOnly.total, 1);

  const hidden = await listMediaAssets(db, { publicFilter: "hidden" });
  assert.equal(hidden.total, 0);
  await db.close();
});