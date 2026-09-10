import pg from "pg";

const url = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "").trim();
if (!url) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
});

async function main() {
  const client = await pool.connect();
  const startTime = Date.now();
  try {
    console.log("=== BẮT ĐẦU PHÂN LOẠI TỰ ĐỘNG TOÀN BỘ KHO ẢNH (BULK ARRAY MODE) ===");

    // 1. Lấy toàn bộ sản phẩm có ảnh
    const productsRes = await client.query(`
      SELECT p.id, p.code, p.name, p.category, COUNT(i.id)::int as img_count
      FROM products p
      JOIN product_images i ON i.product_id = p.id AND i.path <> ''
      GROUP BY p.id, p.code, p.name, p.category
      ORDER BY p.id ASC
    `);
    const products = productsRes.rows;
    console.log(`- Đã tải ${products.length} sản phẩm có ảnh.`);

    // 2. Lấy toàn bộ ảnh của tất cả sản phẩm
    const imagesRes = await client.query(`
      SELECT id, product_id, path, is_primary, sort_order, caption, kind
      FROM product_images
      WHERE path <> ''
      ORDER BY product_id, is_primary DESC, sort_order ASC, id ASC
    `);
    const allImages = imagesRes.rows;
    console.log(`- Đã tải ${allImages.length} ảnh trong database.`);

    const imagesByProduct = new Map();
    for (const img of allImages) {
      const list = imagesByProduct.get(img.product_id) || [];
      list.push(img);
      imagesByProduct.set(img.product_id, list);
    }

    const targetMapIds = [];
    const targetConceptIds = [];

    for (const product of products) {
      const images = imagesByProduct.get(product.id) || [];
      if (!images.length) continue;

      // Ưu tiên:
      // 1. Ảnh đã là MAP
      // 2. Caption chứa 'map' và is_primary = 1
      // 3. Caption chứa 'map'
      // 4. is_primary = 1
      // 5. Ảnh đầu tiên
      const existingMap = images.find((img) => img.kind === "map");
      const mapImage =
        existingMap ||
        images.find((img) => img.is_primary === 1 && /map/i.test(img.caption || "")) ||
        images.find((img) => /map/i.test(img.caption || "")) ||
        images.find((img) => img.is_primary === 1) ||
        images[0];

      targetMapIds.push(Number(mapImage.id));

      const otherImages = images.filter((img) => img.id !== mapImage.id);
      for (const other of otherImages) {
        targetConceptIds.push(Number(other.id));
      }
    }

    console.log(`- Đã tính toán xong: ${targetMapIds.length} ảnh MAP và ${targetConceptIds.length} ảnh Concept.`);

    // 3. Thực thi ghi vào Database trong 1 transaction an toàn tuyệt đối
    console.log("- Đang cập nhật vào PostgreSQL...");
    await client.query("BEGIN");

    // Bước A: Hạ tất cả các ảnh map khác không thuộc targetMapIds về normal để tránh đụng unique constraint
    const demoteRes = await client.query(
      `UPDATE product_images
       SET kind = 'normal'
       WHERE kind = 'map' AND NOT (id = ANY($1::bigint[]))`,
      [targetMapIds],
    );

    // Bước B: Cập nhật toàn bộ các ảnh MAP trong 1 câu query duy nhất
    const mapRes = await client.query(
      `UPDATE product_images
       SET kind = 'map'
       WHERE id = ANY($1::bigint[]) AND kind <> 'map'`,
      [targetMapIds],
    );

    // Bước C: Cập nhật toàn bộ các ảnh Concept trong 1 câu query duy nhất
    const conceptRes = await client.query(
      `UPDATE product_images
       SET kind = 'concept'
       WHERE id = ANY($1::bigint[]) AND kind <> 'concept'`,
      [targetConceptIds],
    );

    await client.query("COMMIT");

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n=== KẾT QUẢ THỰC THI THÀNH CÔNG ===");
    console.log(`- Thời gian xử lý: ${duration}s.`);
    console.log(`- Tổng sản phẩm đã hoàn thiện: ${products.length} sản phẩm.`);
    console.log(`- Ảnh MAP được thiết lập: ${targetMapIds.length} ảnh (mới cập nhật: ${mapRes.rowCount}).`);
    console.log(`- Ảnh Concept được thiết lập: ${targetConceptIds.length} ảnh (mới cập nhật: ${conceptRes.rowCount}).`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Lỗi cập nhật:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
