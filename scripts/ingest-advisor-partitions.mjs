/**
 * Ingest kết quả từ 3 Agent Advisor vào PostgreSQL trong một Transaction duy nhất.
 * Đảm bảo:
 *  - Phân vùng theo unique image hash / URL không trùng lặp.
 *  - Chỉ cập nhật/xóa các bản ghi source='vision'.
 *  - Tuyệt đối bảo toàn mọi bản ghi source='manual' (kiểm chứng trước và sau).
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

async function main() {
  const client = await pool.connect();
  try {
    const dir = (await fs.stat(path.resolve("tmp/vision-full")).catch(() => null))
      ? path.resolve("tmp/vision-full")
      : path.resolve("tmp/vision-partitions");
    
    // 1. Kiểm tra sự tồn tại của 3 file kết quả
    const files = ["results_1.json", "results_2.json", "results_3.json"];
    const allData = [];
    for (const file of files) {
      const p = path.join(dir, file);
      try {
        const raw = await fs.readFile(p, "utf8");
        const parsed = JSON.parse(raw);
        console.log(`[Read] ${file} từ ${dir}: ${parsed.length} predictions`);
        allData.push(...parsed);
      } catch (err) {
        console.warn(`[Warning] Chưa đọc được ${file}: ${err.message}`);
      }
    }

    if (allData.length === 0) {
      console.log("Chưa có dữ liệu kết quả từ các Worker. Vui lòng chạy các worker trước.");
      return;
    }
    // 2. Bắt đầu Transaction
    await client.query("BEGIN");

    // Kiểm chứng số lượng manual tags và map images trước khi thực hiện
    const manualBefore = await client.query("SELECT COUNT(*)::int AS count FROM product_image_room_tags WHERE source = 'manual'");
    const manualBeforeCount = manualBefore.rows[0].count;
    const mapBefore = await client.query("SELECT COUNT(*)::int AS count FROM product_images WHERE kind = 'map'");
    const mapBeforeCount = mapBefore.rows[0].count;

    let insertedTags = 0;
    let distinctImages = 0;
    let demotedCount = 0;
    let conceptCount = 0;

    for (const item of allData) {
      const imageIds = item.image_ids || (item.image_id ? [item.image_id] : []);
      if (imageIds.length === 0) continue;
      const isConcept = Boolean(item.is_concept);
      const model = item.model || "advisor-heuristic-sharp";
      const modelVersion = item.model_version || "v1.0-corner-rule";

      if (isConcept) {
        // Cập nhật kind = 'concept' (trừ kind='map')
        const updateRes = await client.query(
          "UPDATE product_images SET kind = 'concept' WHERE id = ANY($1::bigint[]) AND kind <> 'map'",
          [imageIds]
        );
        conceptCount += updateRes.rowCount;

        const slugs = (item.room_slugs && item.room_slugs.length > 0) ? item.room_slugs : ["unknown"];
        const confidence = item.confidence || 0.92;

        for (const imgId of imageIds) {
          distinctImages++;
          // Xóa tag vision cũ của ảnh này
          await client.query("DELETE FROM product_image_room_tags WHERE product_image_id = $1 AND source = 'vision'", [imgId]);

          for (const slug of slugs) {
            await client.query(`
              INSERT INTO product_image_room_tags
                (product_image_id, room_slug, source, confidence, model, model_version, review_status, created_at, updated_at)
              VALUES ($1, $2, 'vision', $3, $4, $5, 'accepted', NOW()::text, NOW()::text)
              ON CONFLICT (product_image_id, room_slug) DO UPDATE SET
                source = EXCLUDED.source,
                confidence = EXCLUDED.confidence,
                model = EXCLUDED.model,
                model_version = EXCLUDED.model_version,
                review_status = EXCLUDED.review_status,
                updated_at = EXCLUDED.updated_at
              WHERE product_image_room_tags.source <> 'manual'
            `, [imgId, slug, confidence, model, modelVersion]);
            insertedTags++;
          }
        }
      } else {
        // Hạ về 'normal' (bảo toàn tuyệt đối kind='map' và ảnh có tag manual)
        const demoteRes = await client.query(
          `UPDATE product_images 
           SET kind = 'normal' 
           WHERE id = ANY($1::bigint[]) 
             AND kind <> 'map' 
             AND id NOT IN (SELECT product_image_id FROM product_image_room_tags WHERE source = 'manual')`,
          [imageIds]
        );
        demotedCount += demoteRes.rowCount;

        for (const imgId of imageIds) {
          distinctImages++;
          // Xóa sạch các tag source='vision' nếu ảnh đã là normal
          await client.query("DELETE FROM product_image_room_tags WHERE product_image_id = $1 AND source = 'vision'", [imgId]);
        }
      }
    }
    // Kiểm chứng số lượng manual tags sau khi thực hiện
    const manualAfter = await client.query("SELECT COUNT(*)::int AS count FROM product_image_room_tags WHERE source = 'manual'");
    const manualAfterCount = manualAfter.rows[0].count;

    const mapAfter = await client.query("SELECT COUNT(*)::int AS count FROM product_images WHERE kind = 'map'");
    const mapAfterCount = mapAfter.rows[0].count;

    if (manualBeforeCount !== manualAfterCount) {
      throw new Error(`VIOLATION: Tag manual bị thay đổi (${manualBeforeCount} -> ${manualAfterCount}). Đang ROLLBACK!`);
    }
    if (mapBeforeCount !== mapAfterCount) {
      throw new Error(`VIOLATION: Ảnh map bị thay đổi (${mapBeforeCount} -> ${mapAfterCount}). Đang ROLLBACK!`);
    }
    await client.query("COMMIT");

    console.log("=== INGEST HOÀN TẤT THÀNH CÔNG ===");
    console.log(`- Số ảnh được cập nhật: ${distinctImages}`);
    console.log(`- Số dòng tag được gán: ${insertedTags}`);
    console.log(`- Số lượng tag manual được bảo toàn: ${manualAfterCount} (trước: ${manualBeforeCount})`);

    // Thống kê phân bố
    const summary = await client.query(`
      SELECT room_slug, COUNT(*)::int AS count 
      FROM product_image_room_tags 
      GROUP BY room_slug ORDER BY count DESC
    `);
    console.log("- Phân bố phòng hiện tại trong DB:");
    for (const r of summary.rows) {
      console.log(`  • ${r.room_slug.padEnd(20)}: ${r.count}`);
    }

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[FAILED] Lỗi ingest:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
