import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";

const url = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "").trim();
if (!url) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

export async function selectRepresentativeImages() {
  const client = await pool.connect();
  try {
    const categories = ["Gạch thẻ", "Gạch bông", "Gạch ốp lát", "Gạch mosaic"];
    const perCategory = 5;
    const selected = [];

    for (const cat of categories) {
      const res = await client.query(`
        SELECT pi.id, pi.product_id, pi.path, pi.kind, pi.caption, pi.is_primary,
               p.code AS product_code, p.name AS product_name, p.category
        FROM product_images pi
        JOIN products p ON p.id = pi.product_id
        LEFT JOIN product_image_room_tags rt ON rt.product_image_id = pi.id
        WHERE p.category = $1 
          AND pi.kind = 'concept' 
          AND rt.product_image_id IS NULL
          AND pi.path <> ''
        ORDER BY pi.id ASC
        LIMIT $2
      `, [cat, perCategory]);

      if (res.rows.length < perCategory) {
        console.warn(`[WARN] Chỉ tìm thấy ${res.rows.length} ảnh cho danh mục ${cat}`);
      }

      for (const row of res.rows) {
        selected.push({
          id: Number(row.id),
          product_id: Number(row.product_id),
          product_code: row.product_code,
          product_name: row.product_name,
          category: row.category,
          kind: row.kind,
          caption: row.caption || "",
          path: row.path,
        });
      }
    }

    console.log(`[Sample Discovery] Đã chọn ${selected.length} ảnh đại diện từ 4 danh mục:`);
    const verified = [];

    for (const item of selected) {
      try {
        const resp = await fetch(item.path, { method: "HEAD" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const contentLength = Number(resp.headers.get("content-length") || 0);
        const contentType = resp.headers.get("content-type") || "unknown";
        verified.push({
          ...item,
          reachable: true,
          content_type: contentType,
          content_length: contentLength,
        });
        console.log(`  ✓ [${item.category}] img=${item.id} prod=${item.product_code} (${item.product_name}) - ${contentType}, ${contentLength} bytes`);
      } catch (err) {
        console.error(`  ✗ [FAIL] img=${item.id} path=${item.path}: ${err.message}`);
        verified.push({
          ...item,
          reachable: false,
          error: err.message,
        });
      }
    }

    const tmpDir = path.resolve("tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const manifestPath = path.join(tmpDir, "trial-20-manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify(verified, null, 2), "utf8");
    console.log(`\n[Manifest Saved] Đã ghi danh sách vào: ${manifestPath}`);

    return {
      manifestPath,
      items: verified,
      total: verified.length,
      reachable: verified.filter((x) => x.reachable).length,
      unreachable: verified.filter((x) => !x.reachable).length,
    };
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/prepare-20-sample.mjs")) {
  selectRepresentativeImages().catch((err) => {
    console.error("Lỗi:", err);
    process.exit(1);
  });
}
