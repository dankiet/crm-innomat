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
    const files = ["results_1.json", "results_2.json", "results_3.json"];
    const allResults = [];

    for (const f of files) {
      const p = path.join(dir, f);
      try {
        const raw = await fs.readFile(p, "utf8");
        const list = JSON.parse(raw);
        console.log(`[Read] ${f}: ${list.length} items`);
        allResults.push(...list);
      } catch (err) {
        console.warn(`[Warning] Missing or invalid ${f}: ${err.message}`);
      }
    }

    if (allResults.length === 0) {
      throw new Error("No results found in tmp/vision-50/");
    }

    console.log(`Total items to ingest: ${allResults.length}`);

    await client.query("BEGIN");

    // Invariants check
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
        // Cập nhật kind = 'concept', ai_description
        const r = await client.query(
          `UPDATE product_images 
           SET kind = 'concept', ai_description = $2 
           WHERE id = $1 AND kind <> 'map'`,
          [imageId, aiDesc]
        );
        updatedConcept += r.rowCount;

        // Xóa tag vision cũ của ảnh này
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
        // Cập nhật kind = 'normal', ai_description
        const r = await client.query(
          `UPDATE product_images 
           SET kind = 'normal', ai_description = $2 
           WHERE id = $1 AND kind <> 'map' AND id NOT IN (SELECT product_image_id FROM product_image_room_tags WHERE source = 'manual')`,
          [imageId, aiDesc]
        );
        updatedNormal += r.rowCount;

        // Xóa tag vision nếu ảnh là normal
        await client.query("DELETE FROM product_image_room_tags WHERE product_image_id = $1 AND source = 'vision'", [imageId]);
      }
    }

    // Invariant assertions
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

    console.log("=== INGEST 50 IMAGES COMPLETED SUCCESSFULLY ===");
    console.log(`- Concept images updated: ${updatedConcept}`);
    console.log(`- Normal images updated: ${updatedNormal}`);
    console.log(`- Room tags inserted: ${insertedTags}`);
    console.log(`- Manual tags preserved: ${manualAfterCount}`);
    console.log(`- Map images preserved: ${mapAfterCount}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Ingest failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
