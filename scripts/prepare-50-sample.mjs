import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";

const url = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "").trim();
if (!url) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    const dir = path.resolve("tmp/vision-50");
    await fs.mkdir(dir, { recursive: true });

    const query = `
      SELECT 
        pi.id,
        pi.product_id,
        pi.path,
        pi.kind as current_kind,
        pi.caption,
        p.code as product_code,
        p.name as product_name,
        p.category,
        p.surface
      FROM product_images pi
      JOIN products p ON p.id = pi.product_id
      WHERE pi.kind <> 'map'
      ORDER BY pi.id ASC
      LIMIT 50
    `;

    const res = await client.query(query);
    const items = res.rows.map(r => ({
      id: Number(r.id),
      product_id: Number(r.product_id),
      path: r.path,
      product_code: r.product_code,
      product_name: r.product_name,
      category: r.category,
      surface: r.surface || "",
      caption: r.caption || ""
    }));

    console.log(`Loaded ${items.length} images from database.`);
    await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(items, null, 2));

    // Chia 3 slice: 17, 17, 16
    const slice1 = items.slice(0, 17);
    const slice2 = items.slice(17, 34);
    const slice3 = items.slice(34, 50);

    await fs.writeFile(path.join(dir, "slice_1.json"), JSON.stringify(slice1, null, 2));
    await fs.writeFile(path.join(dir, "slice_2.json"), JSON.stringify(slice2, null, 2));
    await fs.writeFile(path.join(dir, "slice_3.json"), JSON.stringify(slice3, null, 2));

    console.log(`- Slice 1: ${slice1.length} images (ID ${slice1[0].id} -> ${slice1[slice1.length - 1].id})`);
    console.log(`- Slice 2: ${slice2.length} images (ID ${slice2[0].id} -> ${slice2[slice2.length - 1].id})`);
    console.log(`- Slice 3: ${slice3.length} images (ID ${slice3[0].id} -> ${slice3[slice3.length - 1].id})`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
