import pg from "pg";
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows } = await c.query(`
  SELECT 'products' AS t,
    count(*) AS total,
    count(*) FILTER (WHERE image_path LIKE '%supabase.co%') AS blobd,
    count(*) FILTER (WHERE image_path LIKE '/images/%') AS locald
  FROM products
  UNION ALL
  SELECT 'product_images', count(*),
    count(*) FILTER (WHERE path LIKE '%supabase.co%'),
    count(*) FILTER (WHERE path LIKE '/images/%')
  FROM product_images
  UNION ALL
  SELECT 'customer_mapping_items', count(*),
    count(*) FILTER (WHERE image_path LIKE '%supabase.co%' OR custom_product_image_path LIKE '%supabase.co%'),
    count(*) FILTER (WHERE image_path LIKE '/images/%' OR custom_product_image_path LIKE '/images/%')
  FROM customer_mapping_items
`);
for (const x of rows) console.log(x.t, "total", x.total, "blob", x.blobd, "local", x.locald);
await c.end();