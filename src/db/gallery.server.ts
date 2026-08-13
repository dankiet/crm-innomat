import { getDb, type AsyncDb, type SqlValue } from "./driver";
import { isPublicImagePathReferenced } from "./crm.server";
import { saveBase64Image } from "@/lib/image-upload.server";
import { deleteImageRef, isManagedImageRef } from "@/lib/storage";
import type { GalleryCollection, GalleryCollectionItem, GalleryImageCandidate } from "@/lib/types";

const MAX_BULK_IMAGE_IDS = 5_000;
const BULK_CHUNK_SIZE = 400;

function nowLocal(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function cleanName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error("Tên bộ sưu tập không được để trống");
  if (name.length > 160) throw new Error("Tên bộ sưu tập tối đa 160 ký tự");
  return name;
}

async function getCollectionRow(db: AsyncDb, id: number): Promise<GalleryCollection | null> {
  return (
    (await db
      .prepare(
        `SELECT c.*,
          COALESCE((SELECT COUNT(*) FROM gallery_collection_items i WHERE i.collection_id = c.id), 0) AS item_count
         FROM gallery_collections c
         WHERE c.id = ?`,
      )
      .get<GalleryCollection>(id)) ?? null
  );
}

async function getItemRow(db: AsyncDb, id: number): Promise<GalleryCollectionItem | null> {
  return (
    (await db
      .prepare("SELECT * FROM gallery_collection_items WHERE id = ?")
      .get<GalleryCollectionItem>(id)) ?? null
  );
}

async function deleteUnreferencedPaths(paths: string[]): Promise<void> {
  const db = getDb();
  for (const path of [...new Set(paths)]) {
    if (isManagedImageRef(path) && !(await isPublicImagePathReferenced(db, path))) {
      await deleteImageRef(path);
    }
  }
}

async function applyGalleryItemOrder(
  db: AsyncDb,
  collectionId: number,
  itemIds: number[],
): Promise<void> {
  const update = db.prepare(
    "UPDATE gallery_collection_items SET sort_order = ? WHERE id = ? AND collection_id = ?",
  );
  for (const [sortOrder, itemId] of itemIds.entries()) {
    const result = await update.run(sortOrder, itemId, collectionId);
    if (!result.changes) throw new Error("Ảnh không thuộc bộ sưu tập này");
  }
}

export async function listGalleryCollections(): Promise<GalleryCollection[]> {
  return await getDb()
    .prepare(
      `SELECT c.*,
        COALESCE((SELECT COUNT(*) FROM gallery_collection_items i WHERE i.collection_id = c.id), 0) AS item_count
       FROM gallery_collections c
       ORDER BY c.updated_at DESC, c.id DESC`,
    )
    .all<GalleryCollection>();
}

export async function getGalleryCollection(id: number): Promise<{
  collection: GalleryCollection;
  items: GalleryCollectionItem[];
}> {
  const db = getDb();
  const collection = await getCollectionRow(db, id);
  if (!collection) throw new Error("Không tìm thấy bộ sưu tập");
  const items = await db
    .prepare(
      `SELECT * FROM gallery_collection_items
       WHERE collection_id = ?
       ORDER BY sort_order, id`,
    )
    .all<GalleryCollectionItem>(id);
  return { collection, items };
}

export async function createGalleryCollection(input: {
  name: string;
  description?: string;
  createdBy?: number | null;
}): Promise<GalleryCollection> {
  const db = getDb();
  const now = nowLocal();
  const result = await db
    .prepare(
      `INSERT INTO gallery_collections
        (name, description, cover_path, created_by, created_at, updated_at)
       VALUES (?, ?, '', ?, ?, ?)`,
    )
    .run(cleanName(input.name), input.description?.trim() ?? "", input.createdBy ?? null, now, now);
  return (await getCollectionRow(db, Number(result.lastInsertRowid)))!;
}

export async function updateGalleryCollection(input: {
  id: number;
  name: string;
  description?: string;
}): Promise<GalleryCollection> {
  const db = getDb();
  const result = await db
    .prepare(
      `UPDATE gallery_collections
       SET name = ?, description = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(cleanName(input.name), input.description?.trim() ?? "", nowLocal(), input.id);
  if (!result.changes) throw new Error("Không tìm thấy bộ sưu tập");
  return (await getCollectionRow(db, input.id))!;
}

export async function listGalleryImageCandidates(): Promise<GalleryImageCandidate[]> {
  return await getDb()
    .prepare(
      `SELECT i.id AS product_image_id, i.product_id, i.path, i.caption,
        i.is_primary, i.sort_order, p.code, p.name,
        CONCAT_WS(', ', NULLIF(p.internal_code, ''), NULLIF(p.internal_codes, ''), codes.internal_codes) AS internal_codes,
        p.category, p.supplier, p.color, p.surface, p.size, p.shape,
        p.collections, p.material
       FROM product_images i
       JOIN products p ON p.id = i.product_id
       LEFT JOIN (
         SELECT product_id, STRING_AGG(internal_code, ', ' ORDER BY internal_code) AS internal_codes
         FROM product_internal_codes
         GROUP BY product_id
       ) codes ON codes.product_id = p.id
       WHERE i.path <> ''
       ORDER BY p.code, i.is_primary DESC, i.sort_order, i.id`,
    )
    .all<GalleryImageCandidate>();
}

export async function addGalleryProductImages(input: {
  collectionId: number;
  productImageIds: number[];
}): Promise<{ added: number; total: number }> {
  const ids = [...new Set(input.productImageIds)]
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  if (!ids.length) throw new Error("Chưa chọn ảnh để thêm");
  if (ids.length > MAX_BULK_IMAGE_IDS) {
    throw new Error(`Mỗi lần chỉ thêm tối đa ${MAX_BULK_IMAGE_IDS} ảnh`);
  }

  const db = getDb();
  let added = 0;
  await db.transaction(async (tx) => {
    const collection = await getCollectionRow(tx, input.collectionId);
    if (!collection) throw new Error("Không tìm thấy bộ sưu tập");
    const maxRow = await tx
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM gallery_collection_items WHERE collection_id = ?",
      )
      .get<{ max_sort: number }>(input.collectionId);
    let nextSort = Number(maxRow?.max_sort ?? -1) + 1;

    for (let offset = 0; offset < ids.length; offset += BULK_CHUNK_SIZE) {
      const chunk = ids.slice(offset, offset + BULK_CHUNK_SIZE);
      const placeholders = chunk.map(() => "?").join(", ");
      const result = await tx
        .prepare(
          `INSERT INTO gallery_collection_items
            (collection_id, path, product_image_id, product_id, product_code,
             product_name, caption, sort_order, created_at)
           SELECT ?, i.path, i.id, p.id, p.code, p.name, i.caption,
             ? + ROW_NUMBER() OVER (ORDER BY p.code, i.is_primary DESC, i.sort_order, i.id) - 1,
             ?
           FROM product_images i
           JOIN products p ON p.id = i.product_id
           WHERE i.id IN (${placeholders}) AND i.path <> ''
           ON CONFLICT (collection_id, path) DO NOTHING`,
        )
        .run(input.collectionId, nextSort, nowLocal(), ...(chunk as SqlValue[]));
      added += result.changes;
      await tx
        .prepare(
          `UPDATE products
           SET collections = ?
           WHERE id IN (
             SELECT DISTINCT product_id
             FROM product_images
             WHERE id IN (${placeholders})
           )`,
        )
        .run(collection.name, ...(chunk as SqlValue[]));
      nextSort += chunk.length;
    }

    const first = await tx
      .prepare(
        `SELECT path FROM gallery_collection_items
         WHERE collection_id = ? ORDER BY sort_order, id LIMIT 1`,
      )
      .get<{ path: string }>(input.collectionId);
    await tx
      .prepare(
        `UPDATE gallery_collections
         SET cover_path = CASE WHEN cover_path = '' THEN ? ELSE cover_path END,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(first?.path ?? "", nowLocal(), input.collectionId);
  })();

  const collection = await getCollectionRow(db, input.collectionId);
  return { added, total: collection?.item_count ?? 0 };
}

export async function uploadGalleryImage(input: {
  collectionId: number;
  dataBase64: string;
  caption?: string;
}): Promise<GalleryCollectionItem> {
  const collection = await getCollectionRow(getDb(), input.collectionId);
  if (!collection) throw new Error("Không tìm thấy bộ sưu tập");
  const path = await saveBase64Image(input.dataBase64);
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const maxRow = await tx
        .prepare(
          "SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM gallery_collection_items WHERE collection_id = ?",
        )
        .get<{ max_sort: number }>(input.collectionId);
      await tx
        .prepare(
          `INSERT INTO gallery_collection_items
            (collection_id, path, product_image_id, product_id, product_code,
             product_name, caption, sort_order, created_at)
           VALUES (?, ?, NULL, NULL, '', '', ?, ?, ?)
           ON CONFLICT (collection_id, path) DO NOTHING`,
        )
        .run(
          input.collectionId,
          path,
          input.caption?.trim() ?? "",
          Number(maxRow?.max_sort ?? -1) + 1,
          nowLocal(),
        );
      await tx
        .prepare(
          `UPDATE gallery_collections
           SET cover_path = CASE WHEN cover_path = '' THEN ? ELSE cover_path END,
               updated_at = ?
           WHERE id = ?`,
        )
        .run(path, nowLocal(), input.collectionId);
      return (await tx
        .prepare("SELECT * FROM gallery_collection_items WHERE collection_id = ? AND path = ?")
        .get<GalleryCollectionItem>(input.collectionId, path))!;
    })();
  } catch (error) {
    await deleteUnreferencedPaths([path]);
    throw error;
  }
}

export async function setGalleryCover(input: {
  collectionId: number;
  itemId: number;
}): Promise<GalleryCollection> {
  const db = getDb();
  const item = await getItemRow(db, input.itemId);
  if (!item || item.collection_id !== input.collectionId) {
    throw new Error("Ảnh không thuộc bộ sưu tập này");
  }
  const rows = await db
    .prepare(
      "SELECT id FROM gallery_collection_items WHERE collection_id = ? ORDER BY sort_order, id",
    )
    .all<{ id: number }>(input.collectionId);
  const itemIds = [item.id, ...rows.map((row) => row.id).filter((id) => id !== item.id)];
  await db.transaction(async (tx) => {
    await applyGalleryItemOrder(tx, input.collectionId, itemIds);
    const result = await tx
      .prepare("UPDATE gallery_collections SET cover_path = ?, updated_at = ? WHERE id = ?")
      .run(item.path, nowLocal(), input.collectionId);
    if (!result.changes) throw new Error("Không tìm thấy bộ sưu tập");
  })();
  return (await getCollectionRow(db, input.collectionId))!;
}

export async function reorderGalleryItems(input: {
  collectionId: number;
  itemIds: number[];
}): Promise<{ ok: true }> {
  const itemIds = input.itemIds.map(Number);
  if (itemIds.length > MAX_BULK_IMAGE_IDS) throw new Error("Bộ sưu tập có quá nhiều ảnh");
  if (itemIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("Thứ tự ảnh không hợp lệ");
  }
  if (new Set(itemIds).size !== itemIds.length) throw new Error("Thứ tự ảnh bị trùng");

  const db = getDb();
  const rows = await db
    .prepare("SELECT id FROM gallery_collection_items WHERE collection_id = ?")
    .all<{ id: number }>(input.collectionId);
  const currentIds = new Set(rows.map((row) => row.id));
  if (currentIds.size !== itemIds.length || itemIds.some((id) => !currentIds.has(id))) {
    throw new Error("Danh sách ảnh không khớp bộ sưu tập");
  }

  await db.transaction(async (tx) => {
    await applyGalleryItemOrder(tx, input.collectionId, itemIds);
    await tx
      .prepare("UPDATE gallery_collections SET updated_at = ? WHERE id = ?")
      .run(nowLocal(), input.collectionId);
  })();
  return { ok: true };
}

export async function removeGalleryItem(itemId: number): Promise<{
  ok: true;
  collectionId: number;
}> {
  const db = getDb();
  const item = await getItemRow(db, itemId);
  if (!item) throw new Error("Không tìm thấy ảnh trong bộ sưu tập");

  await db.transaction(async (tx) => {
    await tx.prepare("DELETE FROM gallery_collection_items WHERE id = ?").run(itemId);
    const next = await tx
      .prepare(
        `SELECT path FROM gallery_collection_items
         WHERE collection_id = ? ORDER BY sort_order, id LIMIT 1`,
      )
      .get<{ path: string }>(item.collection_id);
    await tx
      .prepare(
        `UPDATE gallery_collections
         SET cover_path = CASE WHEN cover_path = ? THEN ? ELSE cover_path END,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(item.path, next?.path ?? "", nowLocal(), item.collection_id);
  })();
  await deleteUnreferencedPaths([item.path]);
  return { ok: true, collectionId: item.collection_id };
}

export async function deleteGalleryCollection(id: number): Promise<{
  ok: true;
  name: string;
}> {
  const db = getDb();
  const collection = await getCollectionRow(db, id);
  if (!collection) throw new Error("Không tìm thấy bộ sưu tập");
  const paths = await db
    .prepare("SELECT path FROM gallery_collection_items WHERE collection_id = ?")
    .all<{ path: string }>(id);
  await db.prepare("DELETE FROM gallery_collections WHERE id = ?").run(id);
  await deleteUnreferencedPaths(paths.map((row) => row.path));
  return { ok: true, name: collection.name };
}
