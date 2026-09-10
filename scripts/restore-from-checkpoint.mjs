#!/usr/bin/env node
/**
 * Khôi phục toàn bộ dữ liệu 2.000+ ảnh đã phân loại từ master checkpoint gốc.
 * Chạy theo từng phần nhỏ để tránh bị timeout (30s mỗi phần).
 */
import pg from 'pg';
import fs from 'node:fs';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function log(msg) {
  const t = new Date().toLocaleTimeString('vi-VN');
  console.log(`[${t}] ${msg}`);
}

async function main() {
  log('Đang đọc master checkpoint từ tmp/vision-full/checkpoint.json...');
  const data = JSON.parse(fs.readFileSync('tmp/vision-full/checkpoint.json', 'utf8'));
  const entries = Object.entries(data.records);

  log(`Tổng số bản ghi: ${entries.length}`);

  const client = await pool.connect();

  // Bỏ qua các ảnh đã có ai_description (idempotent)
  const alreadyDone = await client.query(`
    SELECT id FROM product_images WHERE kind <> 'map' AND ai_description <> '' AND ai_description IS NOT NULL
  `);
  const doneIds = new Set(alreadyDone.rows.map(r => r.id));
  log(`Đã có sẵn: ${doneIds.size} ảnh`);

  let updatedImages = 0;
  let insertedTags = 0;
  let conceptCount = 0;
  let normalCount = 0;
  let skippedDone = 0;

  for (let i = 0; i < entries.length; i++) {
    const [key, item] = entries[i];
    const imgIds = item.image_id ? [item.image_id] : (item.image_ids || []);
    if (imgIds.length === 0) continue;

    const isConcept = item.is_concept === true || item.kind === 'concept';
    const kind = isConcept ? 'concept' : 'normal';
    const desc = item.reason || (isConcept ? 'Phối cảnh không gian nội thất' : 'Mẫu gạch ốp lát tiêu chuẩn');
    const confidence = item.confidence || 0.95;
    const roomSlugs = Array.isArray(item.room_slugs) ? item.room_slugs : [];

    for (const id of imgIds) {
      if (doneIds.has(id)) { skippedDone++; continue; }

      const r = await client.query(`
        UPDATE product_images 
        SET kind = $1, ai_description = $2 
        WHERE id = $3 AND kind <> 'map'
      `, [kind, desc, id]);

      if (r.rowCount > 0) {
        updatedImages++;
        if (isConcept) {
          conceptCount++;
          for (const slug of roomSlugs) {
            await client.query(`
              INSERT INTO product_image_room_tags
                (product_image_id, room_slug, source, confidence, model, model_version, review_status, created_at, updated_at)
              VALUES ($1, $2, 'vision', $3, 'advisor-vision', 'v1.0', 'accepted', NOW()::text, NOW()::text)
              ON CONFLICT (product_image_id, room_slug) DO UPDATE SET
                source = EXCLUDED.source,
                confidence = EXCLUDED.confidence,
                model = EXCLUDED.model,
                model_version = EXCLUDED.model_version,
                review_status = EXCLUDED.review_status,
                updated_at = EXCLUDED.updated_at
              WHERE product_image_room_tags.source <> 'manual'
            `, [id, slug, confidence]);
            insertedTags++;
          }
        } else {
          normalCount++;
        }
      }
    }

    if ((i + 1) % 200 === 0) {
      log(`Đã xử lý ${i + 1}/${entries.length} entries (cập nhật: ${updatedImages}, skip: ${skippedDone})`);
    }
  }

  const rRemain = await client.query(`
    SELECT 
      COUNT(*)::int as total_non_map,
      COUNT(CASE WHEN ai_description <> '' THEN 1 END)::int as total_processed,
      COUNT(CASE WHEN ai_description = '' OR ai_description IS NULL THEN 1 END)::int as remaining,
      COUNT(CASE WHEN kind = 'concept' THEN 1 END)::int as total_concepts,
      COUNT(CASE WHEN kind = 'normal' THEN 1 END)::int as total_normals
    FROM product_images 
    WHERE kind <> 'map'
  `);
  log('=== KHÔI PHỤC HOÀN TẤT ===');
  log(`- Số ảnh đã cập nhật: ${updatedImages}`);
  log(`- Số ảnh Concept: ${conceptCount}`);
  log(`- Số ảnh Normal: ${normalCount}`);
  log(`- Số Room Tags: ${insertedTags}`);
  log(`- Số ảnh bỏ qua (đã có sẵn): ${skippedDone}`);
  log('Trạng thái DB:', rRemain.rows[0]);

  client.release();
  await pool.end();
}

main();
