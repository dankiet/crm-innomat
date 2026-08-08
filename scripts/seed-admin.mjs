/**
 * Bootstrap admin user vào DB PostgreSQL khi bảng users rỗng.
 * Run: npm run db:seed  (dùng env CRM_ADMIN_USERNAME / CRM_ADMIN_PASSWORD / CRM_ADMIN_NAME)
 */
import pg from "pg";
import crypto from "node:crypto";

const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Missing DATABASE_URL / DATABASE_URL_UNPOOLED.");
  process.exit(1);
}

const plain = process.env.CRM_ADMIN_PASSWORD?.trim() || "admin123";
if (plain === "admin123") {
  console.warn("[db:seed-admin] Đang dùng mật khẩu mặc định 'admin123' — hãy đặt CRM_ADMIN_PASSWORD.");
}

const salt = crypto.randomBytes(16).toString("hex");
const derived = crypto.scryptSync(plain, salt, 64).toString("hex");
const password_hash = `${salt}:${derived}`;
const username = (process.env.CRM_ADMIN_USERNAME?.trim() || "admin").toLowerCase();
const displayName = process.env.CRM_ADMIN_NAME?.trim() || "Thế Kiệt";
const ts = new Date().toISOString().slice(0, 19).replace("T", " ");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const { rows } = await client.query("SELECT COUNT(*) AS n FROM users");
  if (Number(rows[0].n) > 0) {
    console.log("[db:seed-admin] users đã có dữ liệu — bỏ qua.");
    process.exit(0);
  }
  await client.query(
    `INSERT INTO users (username, password_hash, display_name, role, is_active, created_at, updated_at, phone)
     VALUES ($1, $2, $3, 'admin', 1, $4, $4, '')`,
    [username, password_hash, displayName, ts],
  );
  await client.query("UPDATE customers SET owner_id = (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1) WHERE owner_id IS NULL");
  console.log(`[db:seed-admin] Đã tạo admin "${username}".`);
} catch (err) {
  console.error("[db:seed-admin] FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}