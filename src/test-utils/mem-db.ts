/**
 * Fake AsyncDb dựa trên node:sqlite (DatabaseSync) — DÙNG CHO TEST.
 *
 * Mục đích: chạy ĐÚNG các câu query mà media-assets.server dùng trên SQLite
 * in-memory, để test write/delete/replace/backfill end-to-end không cần PG.
 *
 * Quy ước viết query cho module mới (để chạy được trên cả PG lẫn SQLite):
 *  - placeholder vị trí `?` (không dùng `@name`).
 *  - không dùng ILIKE / `substring(x from …)` / json_agg / DISTINCT ON /
 *    `INSERT … RETURNING` thủ công (driver tự quyết RETURNING cho ID_TABLES;
 *    fake bắt chước ở đây).
 *  - storage-key: tính bằng JS (storageKeyForRef), không tính trong SQL.
 */

import { DatabaseSync } from "node:sqlite";

export type SqlValue = string | number | boolean | bigint | null;

interface RunResult {
  changes: number;
  lastInsertRowid: number | null;
}

export interface AsyncStmt {
  get<T = unknown>(...params: SqlValue[]): Promise<T | undefined>;
  all<T = unknown>(...params: SqlValue[]): Promise<T[]>;
  run(...params: SqlValue[]): Promise<RunResult>;
}

export interface AsyncDb {
  prepare(sql: string): AsyncStmt;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (db: AsyncDb) => Promise<T> | T): { (): Promise<T> } & Promise<T>;
  close(): Promise<void>;
}

const ID_TABLES = new Set([
  "products",
  "product_images",
  "customer_mappings",
  "customer_mapping_items",
  "customers",
  "media_assets",
  "mapping_media_usages",
  "landing_page_media_usages",
]);

function targetInsertTable(sql: string): string | null {
  const m = /^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+["']?([A-Za-z0-9_]+)/i.exec(sql);
  return m ? m[1]!.toLowerCase() : null;
}

function isMainInsert(sql: string): boolean {
  return /^\s*INSERT\s+INTO/i.test(sql);
}

class FakeDb implements AsyncDb {
  readonly isPg = false;
  private syncing = false;

  constructor(
    private readonly db: DatabaseSync,
    private readonly autoSync: boolean,
  ) {}

  prepare(sql: string): AsyncStmt {
    // SQLiteSync: câu lệnh cần thực thi lặp → prepare một lần.
    const self = this;
    const target = targetInsertTable(sql);
    const needReturning =
      isMainInsert(sql) && target != null && ID_TABLES.has(target) && !/\bRETURNING\b/i.test(sql);
    const finalSql = needReturning ? `${sql} RETURNING id` : sql;
    const raw = this.db.prepare(finalSql);

    return {
      async get<T = unknown>(...params: SqlValue[]): Promise<T | undefined> {
        const row = raw.get(...(params as never[])) as unknown;
        if (self.autoSync) self.sync();
        return (row ?? undefined) as T | undefined;
      },
      async all<T = unknown>(...params: SqlValue[]): Promise<T[]> {
        const rows = raw.all(...(params as never[])) as unknown as T[];
        if (self.autoSync) self.sync();
        return rows;
      },
      async run(...params: SqlValue[]): Promise<RunResult> {
        const r = raw.run(...(params as never[])) as unknown as {
          changes?: number | bigint;
          lastInsertRowid?: number | bigint;
          id?: number | bigint;
        };
        const res: RunResult = {
          changes: Number(r.changes ?? 0),
          lastInsertRowid:
            needReturning && r.id != null ? Number(r.id) : r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null,
        };
        if (self.autoSync) self.sync();
        return res;
      },
    };
  }

  private sync() {
    /* no-op: DatabaseSync tự đồng bộ */
    void this.syncing;
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  transaction<T>(fn: (db: AsyncDb) => Promise<T> | T): { (): Promise<T> } & Promise<T> {
    const run = async () => {
      this.db.exec("BEGIN");
      try {
        const result = await fn(this);
        this.db.exec("COMMIT");
        return result;
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
    };
    const wrapped = Object.assign(async () => run(), {
      then: <A, B>(ok?: (v: T) => A, bad?: (e: unknown) => B) => run().then(ok, bad),
      catch: <B>(bad?: (e: unknown) => B) => run().catch(bad),
      finally: (fn2?: () => void) => run().finally(fn2),
    }) as { (): Promise<T> } & Promise<T>;
    return wrapped;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/** Mở DB in-memory mới. */
export function openMemoryDb(autoCommitSync = true): AsyncDb {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return new FakeDb(db, autoCommitSync);
}

/** Schema tối thiểu (SQLite) — chỉ bảng/cột mà media-assets.server dùng. */
export async function applyTestSchema(db: AsyncDb): Promise<void> {
  await db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      surface TEXT NOT NULL DEFAULT '',
      shape TEXT NOT NULL DEFAULT '',
      texture TEXT NOT NULL DEFAULT '',
      collections TEXT NOT NULL DEFAULT '',
      is_public INTEGER NOT NULL DEFAULT 0,
      featured_rank INTEGER,
      image_path TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      path TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_primary INTEGER NOT NULL DEFAULT 0,
      caption TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'normal',
      is_public INTEGER NOT NULL DEFAULT 1,
      ai_description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      media_asset_id INTEGER
    );
    CREATE INDEX idx_pi_product ON product_images(product_id);
    CREATE INDEX idx_pi_asset ON product_images(media_asset_id);

    CREATE TABLE product_image_room_tags (
      product_image_id INTEGER NOT NULL,
      room_slug TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence NUMERIC,
      model TEXT,
      model_version TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (product_image_id, room_slug)
    );

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE customer_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      version TEXT NOT NULL DEFAULT '01'
    );

    CREATE TABLE customer_mapping_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mapping_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '',
      product_id INTEGER,
      image_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      custom_product_code TEXT NOT NULL DEFAULT '',
      custom_product_name TEXT NOT NULL DEFAULT '',
      custom_product_size TEXT NOT NULL DEFAULT '',
      custom_product_surface TEXT NOT NULL DEFAULT '',
      custom_product_retail_price REAL NOT NULL DEFAULT 0,
      custom_product_image_path TEXT NOT NULL DEFAULT '',
      area_group_key TEXT NOT NULL DEFAULT '',
      area_description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE lp_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE media_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_key TEXT NOT NULL UNIQUE,
      path TEXT NOT NULL DEFAULT '',
      width INTEGER,
      height INTEGER,
      mime_type TEXT NOT NULL DEFAULT '',
      file_size INTEGER,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX idx_ma_path ON media_assets(path);

    CREATE TABLE mapping_media_usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_asset_id INTEGER NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      mapping_item_id INTEGER NOT NULL REFERENCES customer_mapping_items(id) ON DELETE CASCADE,
      col TEXT NOT NULL DEFAULT 'image_path' CHECK (col IN ('image_path','custom_product_image_path')),
      created_at TEXT NOT NULL DEFAULT '',
      UNIQUE (mapping_item_id, col)
    );
    CREATE INDEX idx_mmu_asset ON mapping_media_usages(media_asset_id);

    CREATE TABLE landing_page_media_usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_asset_id INTEGER NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      setting_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX idx_lpmu_asset ON landing_page_media_usages(media_asset_id);
  `);
}