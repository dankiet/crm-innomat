/**
 * Seed SQLite CRM database from products_seed.json (generated from Excel).
 * Run: node scripts/seed-db.mjs
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dbPath = path.join(root, "data", "crm.db");
const seedPath = path.join(root, "data", "products_seed.json");

if (!fs.existsSync(seedPath)) {
  console.error("Missing data/products_seed.json — run the Excel import first.");
  process.exit(1);
}

const products = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const force = process.argv.includes("--force");
const exists = fs.existsSync(dbPath);
if (exists && force) {
  fs.unlinkSync(dbPath);
  console.log("Removed existing DB (--force)");
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  internal_code TEXT NOT NULL DEFAULT '',
  stock_m2 REAL,
  name TEXT NOT NULL,
  size TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  section TEXT NOT NULL DEFAULT '',
  collection TEXT NOT NULL DEFAULT '',
  retail_price INTEGER NOT NULL,
  discount_tp REAL,
  discount_b2b REAL,
  note TEXT NOT NULL DEFAULT '',
  is_hot INTEGER NOT NULL DEFAULT 0,
  image_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'consulting',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT '',
  discount_type TEXT NOT NULL DEFAULT 'custom',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS quote_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  size TEXT NOT NULL DEFAULT '',
  quantity_m2 REAL NOT NULL DEFAULT 0,
  retail_price INTEGER NOT NULL,
  discount_pct REAL NOT NULL DEFAULT 0,
  unit_price INTEGER NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  line_total INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'preparing',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  author TEXT NOT NULL DEFAULT 'Showroom',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
`);

// Ensure collection / color columns exist (older DBs)
for (const col of ["collection", "color"]) {
  try {
    db.exec(
      `ALTER TABLE products ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`,
    );
  } catch {
    /* already exists */
  }
}

// Upsert products by code — keep customers / orders / payments
const insert = db.prepare(`
  INSERT INTO products (
    code, name, size, material, category, section, collection, color,
    retail_price, discount_tp, discount_b2b, note, is_hot, image_path
  ) VALUES (
    @code, @name, @size, @material, @category, @section, @collection, @color,
    @retail_price, @discount_tp, @discount_b2b, @note, @is_hot, @image_path
  )
  ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    size = excluded.size,
    material = excluded.material,
    category = excluded.category,
    section = excluded.section,
    collection = excluded.collection,
    color = excluded.color,
    retail_price = excluded.retail_price,
    discount_tp = excluded.discount_tp,
    discount_b2b = excluded.discount_b2b,
    note = excluded.note,
    is_hot = excluded.is_hot,
    image_path = excluded.image_path
`);

function inferColor(name) {
  const n = String(name || "").toLowerCase();
  const rules = [
    ["Xanh mint", ["mint", "xanh mint"]],
    ["Xanh dương", ["xanh dương", "xanh duong", "xanh da trời", "navy"]],
    ["Xanh lá", ["xanh lá", "xanh la", "xanh rêu"]],
    ["Xanh", ["xanh", "blue", "green"]],
    ["Beige", ["beige"]],
    ["Trắng", ["trắng", "trang", "white"]],
    ["Đen", ["đen", "black"]],
    ["Xám", ["xám", "xam", "grey", "gray"]],
    ["Kem", ["kem", "cream"]],
    ["Nâu", ["nâu", "nau", "brown"]],
    ["Vàng", ["vàng", "vang", "yellow", "gold"]],
    ["Cam", ["cam", "orange"]],
    ["Đỏ", ["đỏ", "red"]],
    ["Hồng", ["hồng", "hong", "pink"]],
    ["Tím", ["tím", "purple"]],
  ];
  for (const [label, keys] of rules) {
    if (keys.some((k) => n.includes(k))) return label;
  }
  return "";
}

const tx = db.transaction((rows) => {
  for (const p of rows) {
    insert.run({
      code: p.code,
      name: p.name,
      size: p.size || "",
      material: p.material || "",
      category: p.category || "",
      section: p.section || "",
      collection: p.collection || p.section || p.category || "",
      color: p.color || inferColor(p.name),
      retail_price: p.retail_price,
      discount_tp: p.discount_tp ?? null,
      discount_b2b: p.discount_b2b ?? null,
      note: p.note || "",
      is_hot: p.is_hot ? 1 : 0,
      image_path: p.image_path || "",
    });
  }
});

tx(products);

// product_images: ensure table + sync from image_path for rows without images
db.exec(`
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,
  caption TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_unique_path
  ON product_images(product_id, path);
`);

const imageColumns = new Set(
  db.prepare("PRAGMA table_info(product_images)").all().map((column) => column.name),
);
if (imageColumns.has("kind")) {
  db.exec("ALTER TABLE product_images DROP COLUMN kind");
}

const missing = db
  .prepare(
    `SELECT p.id, p.image_path FROM products p
     WHERE p.image_path != ''
       AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)`,
  )
  .all();
const insertImg = db.prepare(
  `INSERT INTO product_images (product_id, path, sort_order, is_primary)
   VALUES (?, ?, 0, 1)`,
);
const imgTx = db.transaction((rows) => {
  for (const r of rows) insertImg.run(r.id, r.image_path);
});
imgTx(missing);

const count = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
const withImg = db
  .prepare("SELECT COUNT(*) AS n FROM products WHERE image_path != ''")
  .get().n;
const imgRows = db.prepare("SELECT COUNT(*) AS n FROM product_images").get().n;

console.log(
  `Seeded ${count} products (${withImg} with primary image, ${imgRows} image rows) → ${dbPath}`,
);
db.close();
