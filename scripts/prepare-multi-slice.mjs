import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";

const limit = Number(process.argv[2] || 150);
const startAfterProductId = Number(process.argv[3] || 182);
const numSlices = Number(process.argv[4] || 10);

const pool = new pg.Pool({
  connectionString: (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "").trim(),
  ssl: { rejectUnauthorized: false },
});

const dir = path.resolve("tmp/vision-batch");
await fs.rm(dir, { recursive: true, force: true });
await fs.mkdir(dir, { recursive: true });

const { rows } = await pool.query(`
  SELECT pi.id AS image_id, pi.product_id, p.code AS product_code, p.name AS product_name,
         p.category, pi.is_primary, pi.caption, pi.path
  FROM product_images pi
  JOIN products p ON p.id = pi.product_id
  WHERE pi.kind = 'concept' AND pi.product_id > $1
  ORDER BY pi.product_id ASC, pi.sort_order ASC, pi.id ASC
  LIMIT $2
`, [startAfterProductId, limit]);

if (rows.length === 0) {
  console.log(JSON.stringify({ count: 0, message: "No more concept images to review" }));
  await pool.end();
  process.exit(0);
}

// Download images in parallel with controlled concurrency
const manifest = [];
const downloadConcurrently = async (items, concurrency = 15) => {
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const row = items[idx++];
      const localFile = path.join(dir, `${row.product_code}_${row.image_id}.webp`);
      try {
        const res = await fetch(row.path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fs.writeFile(localFile, Buffer.from(await res.arrayBuffer()));
        manifest.push({ ...row, local_file: localFile.replaceAll("\\", "/") });
      } catch (err) {
        console.error(`Failed downloading image ${row.image_id}: ${err.message}`);
      }
    }
  });
  await Promise.all(workers);
};

await downloadConcurrently(rows);

// Sort manifest by product_id, image_id for consistent ordering
manifest.sort((a, b) => Number(a.product_id) - Number(b.product_id) || Number(a.image_id) - Number(b.image_id));

await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

// Split into numSlices
const sliceSize = Math.ceil(manifest.length / numSlices);
const sliceCounts = [];
for (let i = 0; i < numSlices; i++) {
  const slice = manifest.slice(i * sliceSize, (i + 1) * sliceSize);
  await fs.writeFile(path.join(dir, `slice${i + 1}.json`), JSON.stringify(slice, null, 2));
  sliceCounts.push(slice.length);
}

const lastProd = manifest[manifest.length - 1].product_id;
console.log(JSON.stringify({
  count: manifest.length,
  products_count: new Set(manifest.map((x) => x.product_id)).size,
  min_product_id: manifest[0].product_id,
  max_product_id: lastProd,
  slice_counts: sliceCounts,
  dir
}, null, 2));

await pool.end();
