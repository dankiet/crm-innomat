import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";

const url = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "").trim();
if (!url) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const limit = parseInt(process.argv[2] || "90", 10);

async function main() {
  const client = await pool.connect();
  try {
    const dir = path.resolve("tmp/vision-batch");
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
      WHERE pi.kind <> 'map' AND (pi.ai_description IS NULL OR pi.ai_description = '')
      ORDER BY pi.id ASC
      LIMIT $1
    `;

    const res = await client.query(query, [limit]);
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

    if (items.length === 0) {
      console.log("No remaining unprocessed images! All images processed.");
      return;
    }

    console.log(`Fetched ${items.length} unprocessed images (limit: ${limit}).`);
    await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(items, null, 2));

    const chunkSize = Math.ceil(items.length / 3);
    const slice1 = items.slice(0, chunkSize);
    const slice2 = items.slice(chunkSize, chunkSize * 2);
    const slice3 = items.slice(chunkSize * 2);

    await fs.writeFile(path.join(dir, "slice_1.json"), JSON.stringify(slice1, null, 2));
    await fs.writeFile(path.join(dir, "slice_2.json"), JSON.stringify(slice2, null, 2));
    await fs.writeFile(path.join(dir, "slice_3.json"), JSON.stringify(slice3, null, 2));

    console.log(`- Slice 1: ${slice1.length} images (ID ${slice1[0]?.id} -> ${slice1[slice1.length - 1]?.id})`);
    console.log(`- Slice 2: ${slice2.length} images (ID ${slice2[0]?.id} -> ${slice2[slice2.length - 1]?.id})`);
    console.log(`- Slice 3: ${slice3.length} images (ID ${slice3[0]?.id} -> ${slice3[slice3.length - 1]?.id})`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
