/**
 * Pipeline chạy hàng loạt AI Vision phân loại bối cảnh ảnh (Room Tagging)
 * Cách dùng:
 *   node scripts/batch-vision-room-tags.mjs status          (Xem thống kê tiến độ)
 *   node scripts/batch-vision-room-tags.mjs export [batchSize] [startAfterId] (Trích xuất batch ảnh cần phân loại)
 *   node scripts/batch-vision-room-tags.mjs apply [results.json]             (Ghi kết quả đã duyệt vào DB)
 */
import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";

const url = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "").trim();
if (!url) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const cmd = process.argv[2] || "status";

async function getStatus() {
  const client = await pool.connect();
  try {
    const totalRes = await client.query("SELECT COUNT(*)::int AS count FROM product_images WHERE kind = 'concept'");
    const taggedRes = await client.query("SELECT COUNT(DISTINCT product_image_id)::int AS count FROM product_image_room_tags");
    const visionRes = await client.query("SELECT COUNT(DISTINCT product_image_id)::int AS count FROM product_image_room_tags WHERE source = 'vision'");
    const manualRes = await client.query("SELECT COUNT(DISTINCT product_image_id)::int AS count FROM product_image_room_tags WHERE source = 'manual'");
    
    const byRoom = await client.query(`
      SELECT room_slug, COUNT(*)::int AS count 
      FROM product_image_room_tags 
      GROUP BY room_slug ORDER BY count DESC
    `);

    console.log("=== TIẾN ĐỘ PHÂN LOẠI AI VISION ===");
    console.log(`- Tổng ảnh concept: ${totalRes.rows[0].count}`);
    console.log(`- Đã được gắn tag: ${taggedRes.rows[0].count} / ${totalRes.rows[0].count} (${((taggedRes.rows[0].count / totalRes.rows[0].count) * 100).toFixed(1)}%)`);
    console.log(`  + Nguồn Vision: ${visionRes.rows[0].count}`);
    console.log(`  + Nguồn Manual: ${manualRes.rows[0].count}`);
    console.log("- Phân bố theo không gian:");
    for (const r of byRoom.rows) {
      console.log(`  • ${r.room_slug.padEnd(20)}: ${r.count}`);
    }
  } finally {
    client.release();
  }
}

async function exportBatch(size = 100, startAfterId = 0) {
  const client = await pool.connect();
  try {
    const dir = path.resolve("tmp/vision-batches");
    await fs.mkdir(dir, { recursive: true });

    const res = await client.query(`
      SELECT pi.id, pi.product_id, p.code AS product_code, p.name AS product_name, p.category, pi.path
      FROM product_images pi
      JOIN products p ON p.id = pi.product_id
      LEFT JOIN product_image_room_tags rt ON rt.product_image_id = pi.id
      WHERE pi.kind = 'concept' AND rt.product_image_id IS NULL AND pi.id > $1
      ORDER BY pi.id ASC
      LIMIT $2
    `, [startAfterId, size]);

    const batchFile = path.join(dir, `batch_start_${startAfterId}_size_${size}.json`);
    await fs.writeFile(batchFile, JSON.stringify(res.rows, null, 2));
    console.log(`[Export] Đã xuất ${res.rows.length} ảnh chưa gắn tag vào ${batchFile}`);
  } finally {
    client.release();
  }
}

async function applyResults(filePath) {
  if (!filePath) throw new Error("Vui lòng truyền đường dẫn file kết quả .json");
  const data = JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let count = 0;
    for (const item of data) {
      const imageId = item.image_id;
      const rawSlugs = item.room_slugs || (item.advisor && item.advisor.room_slugs) || [];
      const canonicalSlugs = [
        "living_room",
        "kitchen_dining",
        "bathroom_spa",
        "bedroom",
        "outdoor_balcony",
        "fnb_hospitality",
        "office_workspace",
        "other",
        "unknown",
      ];
      const slugs = rawSlugs.filter((s) => canonicalSlugs.includes(s));
      const confidence = item.confidence || (item.vision && item.vision.confidence) || 0.9;
      const reviewStatus = item.review_status || (item.advisor && item.advisor.review_status) || "accepted";
      const model = item.model || "vision-batch";
      const modelVersion = item.model_version || "v1.0";
      
      await client.query("DELETE FROM product_image_room_tags WHERE product_image_id = $1 AND source = 'vision'", [imageId]);
      for (const slug of slugs) {
        await client.query(`
          INSERT INTO product_image_room_tags
            (product_image_id, room_slug, source, confidence, model, model_version, review_status, created_at, updated_at)
          VALUES ($1, $2, 'vision', $3, $4, $5, $6, NOW()::text, NOW()::text)
          ON CONFLICT (product_image_id, room_slug) DO UPDATE SET
            source = EXCLUDED.source,
            confidence = EXCLUDED.confidence,
            model = EXCLUDED.model,
            model_version = EXCLUDED.model_version,
            review_status = EXCLUDED.review_status,
            updated_at = EXCLUDED.updated_at
          WHERE product_image_room_tags.source <> 'manual'
        `, [imageId, slug, confidence, model, modelVersion, reviewStatus]);
        count++;
      }
    }
    await client.query("COMMIT");
    console.log(`[Apply] Đã cập nhật thành công ${count} tag cho ${data.length} ảnh vào database!`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    if (cmd === "status") {
      await getStatus();
    } else if (cmd === "export") {
      const size = Number(process.argv[3] || 100);
      const start = Number(process.argv[4] || 0);
      await exportBatch(size, start);
    } else if (cmd === "apply") {
      await applyResults(process.argv[3]);
    } else {
      console.log(`Lệnh không hợp lệ: ${cmd}`);
    }
  } finally {
    await pool.end();
  }
}

main();
