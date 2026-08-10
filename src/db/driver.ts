/**
 * Async database facade over PostgreSQL (Supabase).
 *
 * API theo kiểu `prepare(...).get/all/run` quen thuộc:
 *   const db = getDb();
 *   await db.prepare(sql).get/all/run(...params);
 *   await db.transaction(async () => { ... })();
 *
 * Khác biệt chính so với driver đồng bộ:
 *  - Mọi thao tác trả Promise → call-site phải `await`.
 *  - `run()` trả về { changes, lastInsertRowid } — cho INSERT vào bảng có cột `id`
 *    driver tự append `RETURNING id`.
 *  - Placeholder `?` / `@name` được dịch sang `$n` cho PostgreSQL.
 *  - Một số cú pháp SQLite được dịch tự động (INSERT OR IGNORE, datetime('now','localtime'),
 *    GROUP_CONCAT(DISTINCT x)).
 */
import { Pool, types as pgTypes, type PoolClient, type QueryResult } from "pg";

pgTypes.setTypeParser(20, (v) => Number.parseInt(v, 10));
pgTypes.setTypeParser(1700, (v) => Number(v));

export type SqlValue = string | number | boolean | bigint | null;

export interface RunResult {
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
  transaction<T>(fn: (db: AsyncDb) => Promise<T> | T): () => Promise<T>;
  close(): Promise<void>;
}

const ID_TABLES = new Set([
  "products",
  "customers",
  "quotes",
  "quote_items",
  "orders",
  "payments",
  "notes",
  "users",
  "product_images",
  "product_internal_codes",
  "inventory",
  "customer_product_samples",
  "customer_mappings",
  "customer_mapping_items",
  "sessions",
  "audit_logs",
]);
const TABLES_WITHOUT_ID = new Set(["customer_mapping_quote_links"]);

function targetInsertTable(sql: string): string | null {
  const m = /^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+["']?([A-Za-z0-9_]+)/i.exec(sql);
  return m ? m[1]!.toLowerCase() : null;
}

function isIgnoreInsert(sql: string): boolean {
  return /^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql);
}

/**
 * Dịch SQL kiểu SQLite sang PostgreSQL + mapping placeholder → $n.
 */
function transpile(
  sql: string,
  rawArgs: unknown[],
): {
  text: string;
  isIgnore: boolean;
  targetTable: string | null;
  values: unknown[];
} {
  let out = "";
  let inStr = false;
  let prev = "";
  const values: unknown[] = [];
  const push = (v: unknown) => {
    values.push(v ?? null);
    return values.length;
  };
  let posIdx = 0;
  const chars = Array.from(sql);
  for (let j = 0; j < chars.length; j++) {
    const c = chars[j]!;
    if (c === "'" && prev !== "\\") {
      inStr = !inStr;
      out += c;
      prev = c;
      continue;
    }
    if (inStr) {
      out += c;
      prev = c;
      continue;
    }
    if (c === "?") {
      const v = rawArgs[posIdx];
      posIdx++;
      out += `$${push(v)}`;
      prev = c;
      continue;
    }
    if (c === "@") {
      let name = "";
      while (j + 1 < chars.length && /[A-Za-z0-9_]/.test(chars[j + 1]!)) {
        name += chars[j + 1];
        j++;
      }
      const obj = rawArgs[0];
      const v =
        obj !== null && typeof obj === "object" && !Array.isArray(obj)
          ? (obj as Record<string, unknown>)[name] ?? null
          : null;
      out += `$${push(v)}`;
      prev = c;
      continue;
    }
    out += c;
    prev = c;
  }

  const wasIgnore = isIgnoreInsert(sql);
  const targetTable = targetInsertTable(sql);

  let text = out;
  text = text.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO");
  text = text.replace(
    /datetime\(['"]?now['"]?\s*,\s*['"]localtime['"]?\s*\)/gi,
    "to_char(now(), 'YYYY-MM-DD HH24:MI:SS')",
  );
  text = text.replace(
    /\bGROUP_CONCAT\s*\(\s*DISTINCT\s+([^)]+)\)/gi,
    (_m, expr) => `STRING_AGG(DISTINCT ${(expr as string).trim()}, ',')`,
  );
  if (wasIgnore) text += " ON CONFLICT DO NOTHING";

  return { text, isIgnore: wasIgnore, targetTable, values };
}

function isSlowQueryLoggingEnabled(): boolean {
  return process.env.SQL_DEBUG === "1";
}

async function executeQuery(
  query: (text: string, values: unknown[]) => Promise<QueryResult>,
  text: string,
  values: unknown[],
): Promise<QueryResult> {
  if (!isSlowQueryLoggingEnabled()) return query(text, values);
  const startedAt = Date.now();
  try {
    const result = await query(text, values);
    console.info(
      `[sql] ${Date.now() - startedAt}ms rows=${result.rowCount ?? 0} ${text.replace(/\s+/g, " ").slice(0, 180)}`,
    );
    return result;
  } catch (error) {
    console.error(`[sql] failed after ${Date.now() - startedAt}ms ${text.replace(/\s+/g, " ").slice(0, 180)}`);
    throw error;
  }
}

function makeStmt(
  sql: string,
  query: (text: string, values: unknown[]) => Promise<QueryResult>,
): AsyncStmt {
  return {
    async get<T = unknown>(...params: SqlValue[]): Promise<T | undefined> {
      const { text, values } = transpile(sql, params);
      const res = await executeQuery(query, text, values);
      return res.rows[0] as T | undefined;
    },
    async all<T = unknown>(...params: SqlValue[]): Promise<T[]> {
      const { text, values } = transpile(sql, params);
      const res = await executeQuery(query, text, values);
      return res.rows as T[];
    },
    async run(...params: SqlValue[]): Promise<RunResult> {
      const { text, values, isIgnore, targetTable } = transpile(sql, params);
      let final = text;
      let returning = " RETURNING id";
      if (
        isMainInsert(text) &&
        targetTable &&
        !isIgnore &&
        !TABLES_WITHOUT_ID.has(targetTable)
      ) {
        if (ID_TABLES.has(targetTable) && !/\bRETURNING\b/i.test(text)) {
          final = text + returning;
        }
      }
      const res = await executeQuery(query, final, values);
      return {
        changes: res.rowCount ?? 0,
        lastInsertRowid: res.rows[0]?.id ?? null,
      };
    },
  };
}

function isMainInsert(text: string): boolean {
  return /^\s*INSERT\s+INTO/i.test(text);
}

class PostgresDb implements AsyncDb {
  private pool: Pool;
  readonly isPg = true;

  constructor() {
    const url = (process.env.DATABASE_URL ?? "").trim();
    if (!url) {
      throw new Error(
        "DATABASE_URL chưa được đặt. Cấu hình Supabase connection string (hoặc chạy `npm run db:migrate`) trước khi dùng.",
      );
    }
    this.pool = new Pool({
      connectionString: url,
      max: Number(process.env.PG_MAX_CONNECTIONS || 7),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15_000),
      ssl:
        process.env.PG_SSL_DISABLE === "1"
          ? false
          : { rejectUnauthorized: false },
    });
  }

  private async query(text: string, values: unknown[]): Promise<QueryResult> {
    const res = await this.pool.query(text, values);
    return res;
  }

  prepare(sql: string): AsyncStmt {
    return makeStmt(sql, (text, values) => this.query(text, values));
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  /** Trả về function thực thi transaction trên một connection riêng. */
  transaction<T>(fn: (db: AsyncDb) => Promise<T> | T): () => Promise<T> {
    return async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const clientDb = makeClientDb(client);
        const result = await fn(clientDb);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      } finally {
        client.release();
      }
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function makeClientDb(client: PoolClient): AsyncDb {
  const query = (text: string, values: unknown[]) => client.query(text, values);
  const db: AsyncDb = {
    prepare(sql: string): AsyncStmt {
      return makeStmt(sql, query);
    },
    async exec(sql: string): Promise<void> {
      await client.query(sql);
    },
    transaction<T>(fn: (db: AsyncDb) => Promise<T> | T): () => Promise<T> {
      // Nested transaction trong PG vẫn dùng cùng client.
      return async () => {
        const savepoint = `sp_${Math.random().toString(36).slice(2)}`;
        await client.query(`SAVEPOINT ${savepoint}`);
        try {
          const result = await fn(db);
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (err) {
          try {
            await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          } catch {
            /* ignore */
          }
          throw err;
        }
      };
    },
    async close(): Promise<void> {
      /* no-op: client do transaction quản lý */
    },
  };
  return db;
}

let globalDb: AsyncDb | null = null;

export function getDb(): AsyncDb {
  if (!globalDb) {
    globalDb = new PostgresDb();
  }
  return globalDb;
}
