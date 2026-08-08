import pg from "pg";
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
  ssl: { rejectUnauthorized: false },
});
const SUPA = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const BUCKET = "crm-images";
const PREFIX = "crm";

await c.connect();

const { rows } = await c.query(
  `SELECT DISTINCT image_path AS ref FROM products WHERE image_path LIKE '%vercel-storage.com%'`,
);
console.log("old vercel refs:", rows.length);

let updated = 0;
for (const r of rows) {
  const ref = r.ref;
  let m = ref.match(/\/([0-9a-f]{64})-[^/]+(\.[a-z0-9]+)$/);
  if (!m) {
    console.log("  skip (unknown format):", ref);
    continue;
  }
  const filename = `${m[1]}${m[2]}`;
  const newUrl = `${SUPA}/storage/v1/object/public/${BUCKET}/${PREFIX}/${filename}`;
  const { rowCount } = await c.query(`UPDATE products SET image_path = $1 WHERE image_path = $2`, [newUrl, ref]);
  if (rowCount) {
    updated += rowCount;
    if (updated <= 3) console.log("  → ", filename);
  }
}
console.log("updated products rows:", updated);
await c.end();