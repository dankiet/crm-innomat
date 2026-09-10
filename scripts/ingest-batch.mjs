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
    const dir = path.resolve("tmp/vision-batch");
    const allResults = [];

    // Kiểm tra tính trọn vẹn của từng slice trước khi ingest
    for (let i = 1; i <= 3; i++) {
      const slicePath = path.join(dir, `slice_${i}.json`);
      const resultPath = path.join(dir, `results_${i}.json`);

      const sliceExists = await fs.stat(slicePath).catch(() => null);
      if (!sliceExists) continue;

      const sliceData = JSON.parse(await fs.readFile(slicePath, "utf8"));
      const resultExists = await fs.stat(resultPath).catch(() => null);
      if (!resultExists) {
        throw new Error(`Slice ${i} có ${sliceData.length} ảnh nhưng chưa có kết quả ${resultPath}!`);
      }

      const resultData = JSON.parse(await fs.readFile(resultPath, "utf8"));
      if (resultData.length !== sliceData.length) {
        throw new Error(`Lệch số lượng ở Slice ${i}: cần ${sliceData.length} nhưng kết quả chỉ có ${resultData.length}! Cần chạy lại slice này.`);
      }

      console.log(`[Verified Slice ${i}] ${resultData.length}/${sliceData.length} ảnh đầy đủ 100%.`);
      allResults.push(...resultData);
    }

    if (allResults.length === 0) {
      throw new Error("No results found in tmp/vision-batch/");
    }
    const manualBefore = await client.query("SELECT COUNT(*)::int AS count FROM product_image_room_tags WHERE source = 'manual'");
    const manualBeforeCount = manualBefore.rows[0].count;

    const mapBefore = await client.query("SELECT COUNT(*)::int AS count FROM product_images WHERE kind = 'map'");
    const mapBeforeCount = mapBefore.rows[0].count;

    let updatedConcept = 0;
    let updatedNormal = 0;
    let insertedTags = 0;

    for (const item of allResults) {
      const imageId = item.id;
      const isConcept = Boolean(item.is_concept);
      const aiDesc = (item.ai_description || "").trim();
      const model = item.model || "advisor-vision";
      const modelVersion = item.model_version || "v1.0";
      const confidence = item.confidence || 0.95;

      if (isConcept) {
        const r = await client.query(
          `UPDATE product_images 
           SET kind = 'concept', ai_description = $2 
           WHERE id = $1 AND kind <> 'map'`,
          [imageId, aiDesc]
        );
        updatedConcept += r.rowCount;

        await client.query("DELETE FROM product_image_room_tags WHERE product_image_id = $1 AND source = 'vision'", [imageId]);

        const slugs = (item.room_slugs && item.room_slugs.length > 0) ? item.room_slugs : ["unknown"];
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
          `, [imageId, slug, confidence, model, modelVersion]);
          insertedTags++;
        }
      } else {
        const r = await client.query(
          `UPDATE product_images 
           SET kind = 'normal', ai_description = $2 
           WHERE id = $1 AND kind <> 'map' AND id NOT IN (SELECT product_image_id FROM product_image_room_tags WHERE source = 'manual')`,
          [imageId, aiDesc]
        );
        updatedNormal += r.rowCount;

        await client.query("DELETE FROM product_image_room_tags WHERE product_image_id = $1 AND source = 'vision'", [imageId]);
      }
    }

    const manualAfter = await client.query("SELECT COUNT(*)::int AS count FROM product_image_room_tags WHERE source = 'manual'");
    const manualAfterCount = manualAfter.rows[0].count;

    const mapAfter = await client.query("SELECT COUNT(*)::int AS count FROM product_images WHERE kind = 'map'");
    const mapAfterCount = mapAfter.rows[0].count;

    if (manualBeforeCount !== manualAfterCount) {
      throw new Error(`VIOLATION: Manual tags count changed (${manualBeforeCount} -> ${manualAfterCount}). Rolling back!`);
    }
    if (mapBeforeCount !== mapAfterCount) {
      throw new Error(`VIOLATION: Map images count changed (${mapBeforeCount} -> ${mapAfterCount}). Rolling back!`);
    }

    await client.query("COMMIT");

    console.log("=== BATCH INGEST COMPLETED SUCCESSFULLY ===");
    console.log(`- Concept images updated: ${updatedConcept}`);
    console.log(`- Normal images updated: ${updatedNormal}`);
    console.log(`- Room tags inserted: ${insertedTags}`);
    console.log(`- Manual tags preserved: ${manualAfterCount}`);
    console.log(`- Map images preserved: ${mapAfterCount}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Batch ingest failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
