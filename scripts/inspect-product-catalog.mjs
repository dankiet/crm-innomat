import pg from "pg";

const url = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "").trim();
if (!url) {
  throw new Error("DATABASE_URL is unavailable for this read-only catalog inspection.");
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: process.env.PG_SSL_DISABLE === "1" ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 8_000,
  query_timeout: 12_000,
});

const query = (text) => pool.query(text).then((result) => result.rows);

try {
  const [overview, categories, surfaces, effects, materials, shapes, imageKinds, samples] = await Promise.all([
    query(`SELECT COUNT(*)::int AS product_count, COUNT(*) FILTER (WHERE image_path <> '')::int AS products_with_primary_path FROM products`),
    query(`SELECT COALESCE(NULLIF(TRIM(category), ''), '(trống)') AS value, COUNT(*)::int AS count FROM products GROUP BY 1 ORDER BY count DESC, value`),
    query(`SELECT COALESCE(NULLIF(TRIM(surface), ''), '(trống)') AS value, COUNT(*)::int AS count FROM products GROUP BY 1 ORDER BY count DESC, value LIMIT 30`),
    query(`SELECT COALESCE(NULLIF(TRIM(collections), ''), '(trống)') AS value, COUNT(*)::int AS count FROM products GROUP BY 1 ORDER BY count DESC, value LIMIT 30`),
    query(`SELECT COALESCE(NULLIF(TRIM(material), ''), '(trống)') AS value, COUNT(*)::int AS count FROM products GROUP BY 1 ORDER BY count DESC, value LIMIT 30`),
    query(`SELECT COALESCE(NULLIF(TRIM(shape), ''), '(trống)') AS value, COUNT(*)::int AS count FROM products GROUP BY 1 ORDER BY count DESC, value LIMIT 30`),
    query(`SELECT kind, COUNT(*)::int AS image_count, COUNT(DISTINCT product_id)::int AS product_count FROM product_images GROUP BY kind ORDER BY kind`),
    query(`SELECT p.code, p.name, p.category, p.surface, p.collections AS effect, p.shape, p.material, p.color, COUNT(pi.id)::int AS image_count, COUNT(*) FILTER (WHERE pi.kind = 'map')::int AS map_count, COUNT(*) FILTER (WHERE pi.kind = 'concept')::int AS concept_count FROM products p LEFT JOIN product_images pi ON pi.product_id = p.id GROUP BY p.id ORDER BY p.category, p.code LIMIT 24`),
  ]);

  console.log(JSON.stringify({ overview, categories, surfaces, effects, materials, shapes, imageKinds, samples }, null, 2));
} finally {
  await pool.end();
}
