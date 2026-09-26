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

test("pure: classify — CHỈ mapping (không có ảnh sản phẩm) → unused", () => {
  // Đề xuất vật liệu là tham chiếu ngoài catalog → không tính "in use".
  assert.equal(classifyAssetStatus(summarizeUsages([], 1, 0)), "unused");
});

test("pure: classify — CHỈ hero (không có ảnh sản phẩm) → unused", () => {
  // Hero bản chất là ảnh Concept; khi chưa gắn sản phẩm thì không tính "in use".
  assert.equal(classifyAssetStatus(summarizeUsages([], 0, 1)), "unused");
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
      `INSERT INTO products (code, name, category, is_public, featured_rank, image_path, color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      code,
      code,
      extra.category ?? "",
      extra.is_public ?? 0,
      extra.featured_rank ?? null,
      extra.image_path ?? "",
      extra.color ?? "",
    );
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

test("db: deleteMediaAsset xoá vĩnh viễn — row ảnh, hero ref, asset + trả path để xoá file", async () => {
  const db = await open();
  const path = `/images/${H}.webp`;
  const asset = await ensureMediaAsset(db, path);
  const pid = await seedProduct(db, "A1", { is_public: 1, image_path: path });
  const imgId = await seedProductImage(db, pid, path, { kind: "map", is_primary: 1 });
  await linkProductImageAsset(db, { id: imgId, path });
  await syncHeroUsage(db, path);

  const before = await countAssetUsages(db, asset.id);
  assert.equal(before, 2); // product_image + hero

  const res = await deleteMediaAsset(db, asset.id);
  assert.equal(res.deleted, true);
  assert.equal(res.usages_removed, 2);
  assert.equal(res.path, path); // tầng API cần storage_key để xoá file storage
  assert.equal(res.storage_key, KEY);

  // Row product_images bị XOÁ (giữ lại sẽ thành ảnh 404 vì file sắp bị xoá).
  const img = await db.prepare("SELECT id FROM product_images WHERE id = ?").get<{ id: number }>(imgId);
  assert.equal(img, undefined);
  // products.image_path được đồng bộ lại (không còn ảnh nào → rỗng).
  const prod = await db.prepare("SELECT image_path FROM products WHERE id = ?").get<{ image_path: string }>(pid);
  assert.equal(prod?.image_path, "");
  // Hero setting bị gỡ.
  const hero = await db.prepare("SELECT value FROM lp_settings WHERE key = 'hero_image'").get<{ value: string }>();
  assert.equal(hero?.value ?? "", "");
  // Asset row bị xoá.
  const gone = await db.prepare("SELECT id FROM media_assets WHERE id = ?").get(asset.id);
  assert.equal(gone, undefined);
  await db.close();
});

test("db: deleteMediaAsset xoá asset không tồn tại → deleted=false", async () => {
  const db = await open();
  assert.deepEqual(await deleteMediaAsset(db, 999), {
    deleted: false,
    usages_removed: 0,
    path: "",
    storage_key: "",
  });
  await db.close();
});

test("db: deleteMediaAsset — sản phẩm còn ảnh khác thì image_path chuyển sang ảnh đó", async () => {
  const db = await open();
  const doomed = `/images/${H}.webp`;
  const keeper = `/images/${H.replace(/^a/, "b")}.webp`;
  const pid = await seedProduct(db, "A1", { is_public: 1 });

  // 2 ảnh: ảnh sắp xoá là primary, ảnh còn lại sẽ thay thế.
  const keepId = await seedProductImage(db, pid, keeper, { kind: "normal", is_primary: 0 });
  await linkProductImageAsset(db, { id: keepId, path: keeper });
  const doomId = await seedProductImage(db, pid, doomed, { kind: "map", is_primary: 1 });
  await linkProductImageAsset(db, { id: doomId, path: doomed });
  await db.prepare("UPDATE products SET image_path = ? WHERE id = ?").run(doomed, pid);

  const doomAsset = await ensureMediaAsset(db, doomed);
  const res = await deleteMediaAsset(db, doomAsset.id);
  assert.equal(res.deleted, true);

  // Ảnh còn lại vẫn nguyên, và trở thành ảnh đại diện.
  const remain = await db
    .prepare("SELECT id FROM product_images WHERE product_id = ?")
    .all<{ id: number }>(pid);
  assert.equal(remain.length, 1);
  assert.equal(remain[0]?.id, keepId);
  const prod = await db
    .prepare("SELECT image_path FROM products WHERE id = ?")
    .get<{ image_path: string }>(pid);
  assert.equal(prod?.image_path, keeper);
  await db.close();
});

test("db: deleteMediaAsset — gỡ ref trong Đề xuất vật liệu (cả 2 cột)", async () => {
  const db = await open();
  const tile = `/images/${H}.webp`;
  const custom = `/images/${H.replace(/^a/, "b")}.webp`;
  const info = await db
    .prepare(
      "INSERT INTO customer_mapping_items (mapping_id, image_path, custom_product_image_path) VALUES (?, ?, ?)",
    )
    .run(1, tile, custom);
  const itemId = Number(info.lastInsertRowid);
  await syncMappingItemUsage(db, {
    id: itemId,
    image_path: tile,
    custom_product_image_path: custom,
  });

  const tileAsset = await ensureMediaAsset(db, tile);
  const res = await deleteMediaAsset(db, tileAsset.id);
  assert.equal(res.deleted, true);
  assert.equal(res.usages_removed, 1);

  // Cột image_path rỗng, custom giữ nguyên (asset khác).
  const row = await db
    .prepare("SELECT image_path, custom_product_image_path FROM customer_mapping_items WHERE id = ?")
    .get<{ image_path: string; custom_product_image_path: string }>(itemId);
  assert.equal(row?.image_path, "");
  assert.equal(row?.custom_product_image_path, custom);
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

test("db: listMediaAssets — asset CHỈ có mapping usage (không ảnh sản phẩm) nằm ở unused", async () => {
  const db = await open();
  const mapPath = `/images/${H}.webp`;

  // Chỉ có Đề xuất vật liệu trỏ tới, KHÔNG có product_images.
  const info = await db
    .prepare("INSERT INTO customer_mapping_items (mapping_id, image_path, custom_product_image_path) VALUES (?, ?, ?)")
    .run(1, mapPath, "");
  await syncMappingItemUsage(db, {
    id: Number(info.lastInsertRowid),
    image_path: mapPath,
    custom_product_image_path: "",
  });

  const used = await listMediaAssets(db, { usage: "used" });
  assert.equal(used.total, 0);

  const unused = await listMediaAssets(db, { usage: "unused" });
  assert.equal(unused.total, 1);
  assert.equal(unused.items[0]?.status, "unused");
  // Nhưng vẫn ghi nhận usage Đề xuất để UI hiện đúng "nơi đang dùng".
  assert.equal(unused.items[0]?.usage_groups.mapping, 1);
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

test("db: listMediaAssets — sort tên SP đẩy asset KHÔNG có tên xuống cuối (cả A-Z và Z-A)", async () => {
  const db = await open();
  // seedProduct đặt name = code, nên tên sort được theo code.
  const pAlpha = await seedProduct(db, "Alpha");
  const imgA = await seedProductImage(db, pAlpha, `/images/${H}.webp`);
  await linkProductImageAsset(db, { id: imgA, path: `/images/${H}.webp` });

  const pZeta = await seedProduct(db, "Zeta");
  const imgZ = await seedProductImage(db, pZeta, `/images/${H.replace(/^a/, "b")}.webp`);
  await linkProductImageAsset(db, { id: imgZ, path: `/images/${H.replace(/^a/, "b")}.webp` });

  // asset không có product usage (chỉ tồn tại trong kho) → tên rỗng
  await ensureMediaAsset(db, `/images/${H.replace(/^a/, "c")}.webp`);

  const asc = await listMediaAssets(db, { sort: "name_asc" });
  assert.deepEqual(asc.items.map((i) => i.product_name), ["Alpha", "Zeta", ""]);

  const desc = await listMediaAssets(db, { sort: "name_desc" });
  assert.deepEqual(desc.items.map((i) => i.product_name), ["Zeta", "Alpha", ""]);
  await db.close();
});

test("db: listMediaAssets — tab MAP đẩy ảnh Tuyển chọn #1–#12 lên đầu", async () => {
  const db = await open();
  // sản phẩm thường (không featured), tạo sau → id lớn hơn
  const pNormal = await seedProduct(db, "Normal");
  const imgN = await seedProductImage(db, pNormal, `/images/${H}.webp`, { kind: "map" });
  await linkProductImageAsset(db, { id: imgN, path: `/images/${H}.webp` });

  // sản phẩm Tuyển chọn #1, tạo sau (id lớn hơn) — phải được đẩy lên đầu
  const pFeat = await seedProduct(db, "Featured", { featured_rank: 1 });
  const imgF = await seedProductImage(db, pFeat, `/images/${H.replace(/^a/, "b")}.webp`, { kind: "map" });
  await linkProductImageAsset(db, { id: imgF, path: `/images/${H.replace(/^a/, "b")}.webp` });

  const res = await listMediaAssets(db, { tab: "map" });
  assert.equal(res.total, 2);
  assert.equal(res.items[0]?.product_code, "Featured"); // featured lên đầu dù tạo sau
  await db.close();
});

test("db: listMediaAssets — tab Lookbook đẩy ảnh đang làm Hero lên đầu", async () => {
  const db = await open();
  const pHidden = await seedProduct(db, "AAA");
  const imgH = await seedProductImage(db, pHidden, `/images/${H}.webp`, { kind: "concept" });
  await linkProductImageAsset(db, { id: imgH, path: `/images/${H}.webp` });

  const pOther = await seedProduct(db, "ZZZ");
  const imgO = await seedProductImage(db, pOther, `/images/${H.replace(/^a/, "b")}.webp`, { kind: "concept" });
  await linkProductImageAsset(db, { id: imgO, path: `/images/${H.replace(/^a/, "b")}.webp` });

  // đặt asset của "ZZZ" làm Hero → phải lên đầu dù tên xếp sau
  await syncHeroUsage(db, `/images/${H.replace(/^a/, "b")}.webp`);

  const res = await listMediaAssets(db, { tab: "concept", sort: "name_asc" });
  assert.equal(res.items[0]?.product_code, "ZZZ");
  await db.close();
});

test("db: listMediaAssets — lọc theo NHÓM TÔNG gom nhiều màu raw (như /san-pham)", async () => {
  const db = await open();
  // 3 sản phẩm: 2 màu raw khác nhau cùng thuộc nhóm "xanh_la", 1 màu nhóm "xam".
  const pMint = await seedProduct(db, "MINT", { color: "Xanh Mint" });
  const imgM = await seedProductImage(db, pMint, `/images/${H}.webp`);
  await linkProductImageAsset(db, { id: imgM, path: `/images/${H}.webp` });

  const pLa = await seedProduct(db, "LA", { color: "Xanh Lá" });
  const imgL = await seedProductImage(db, pLa, `/images/${H.replace(/^a/, "b")}.webp`);
  await linkProductImageAsset(db, { id: imgL, path: `/images/${H.replace(/^a/, "b")}.webp` });

  const pXam = await seedProduct(db, "XAM", { color: "Xám" });
  const imgX = await seedProductImage(db, pXam, `/images/${H.replace(/^a/, "c")}.webp`);
  await linkProductImageAsset(db, { id: imgX, path: `/images/${H.replace(/^a/, "c")}.webp` });

  // Nhóm "xanh_la" phải gom CẢ "Xanh Mint" lẫn "Xanh Lá" → 2 asset.
  const green = await listMediaAssets(db, { colors: ["xanh_la"] });
  assert.equal(green.total, 2);
  assert.deepEqual(green.items.map((i) => i.product_code).sort(), ["LA", "MINT"]);

  // Nhóm "xam" chỉ 1 asset.
  const grey = await listMediaAssets(db, { colors: ["xam"] });
  assert.equal(grey.total, 1);
  assert.equal(grey.items[0]?.product_code, "XAM");

  // Link cũ dùng màu raw vẫn phải hoạt động (round-trip không vỡ).
  const legacy = await listMediaAssets(db, { colors: ["Xám"] });
  assert.equal(legacy.total, 1);
  await db.close();
});

test("db: listMediaAssets — toneCounts gom raw color thành 8 nhóm", async () => {
  const db = await open();
  const p1 = await seedProduct(db, "C1", { color: "Xanh Mint" });
  const i1 = await seedProductImage(db, p1, `/images/${H}.webp`);
  await linkProductImageAsset(db, { id: i1, path: `/images/${H}.webp` });

  const p2 = await seedProduct(db, "C2", { color: "Xanh Lá" });
  const i2 = await seedProductImage(db, p2, `/images/${H.replace(/^a/, "b")}.webp`);
  await linkProductImageAsset(db, { id: i2, path: `/images/${H.replace(/^a/, "b")}.webp` });

  const p3 = await seedProduct(db, "C3", { color: "Đỏ" });
  const i3 = await seedProductImage(db, p3, `/images/${H.replace(/^a/, "c")}.webp`);
  await linkProductImageAsset(db, { id: i3, path: `/images/${H.replace(/^a/, "c")}.webp` });

  const res = await listMediaAssets(db);
  // 2 raw khác nhau ("Xanh Mint" + "Xanh Lá") gộp vào 1 nhóm xanh_la.
  assert.equal(res.toneCounts.xanh_la, 2);
  // "Đỏ" thuộc nhóm cam_terracotta.
  assert.equal(res.toneCounts.cam_terracotta, 1);
  // Nhóm không có asset → không xuất hiện (undefined, không phải 0).
  assert.equal(res.toneCounts.xam, undefined);
  await db.close();
});