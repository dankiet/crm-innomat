#!/usr/bin/env node
/**
 * Option 2: Vision AI Pipeline toàn kho sử dụng Model Gemini 3.7 Flash High
 * - Quét toàn bộ 2.772 ảnh non-map bằng Gemini 3.7 Flash High (vilao/mn/ag/gemini-3.7-flash-tiered (high))
 * - Tự động nhận diện bối cảnh Concept/Normal, gán Room Slugs và sinh mô tả kiến trúc chi tiết
 * - Chạy song song 20 worker (Concurrency = 20)
 * - Xong đợt 20 ảnh nào là commit ngay đợt đó vào PostgreSQL (Stream Commit)
 * - In realtime số ảnh còn lại
 * - Bảo toàn tuyệt đối 100% manual tags và map images
 */
import https from 'node:https';
import fs from 'node:fs';
import yaml from 'js-yaml';
import pg from 'pg';
import sharp from 'sharp';

// 1. Cấu hình
const CONCURRENCY = 20; // 20 worker song song
const MINI_BATCH = 20;   // Commit DB sau mỗi 20 ảnh hoàn tất
const BATCH_SIZE = 500;  // Mỗi đợt query 500 ảnh

const modelsYml = yaml.load(fs.readFileSync('C:/Users/dankiet/.omp/agent/models.yml', 'utf8'));
const apiKey = modelsYml.providers.vilao.apiKey;
const baseUrl = modelsYml.providers.vilao.baseUrl;
const modelName = 'mn/ag/gemini-3.7-flash-tiered (high)';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 25
});

function log(msg) {
  const t = new Date().toLocaleTimeString('vi-VN');
  console.log(`[${t}] ${msg}`);
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function callGemini37Vision(imgBase64, retries = 3) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: modelName,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: imgBase64
              }
            },
            {
              type: 'text',
              text: 'Bạn là chuyên gia thẩm định thị giác kiến trúc và tư vấn không gian nội thất vật liệu gạch ốp lát. Hãy nhìn ảnh này và phân tích theo cấu trúc JSON:\n1. is_concept (boolean): true nếu là ảnh phối cảnh 3D nội ngoại thất hoặc công trình thực tế có chiều sâu không gian, bàn ghế, thiết bị nội thất rõ ràng; false nếu là ảnh chụp mẫu gạch phẳng, flat lay, swatch studio nền trắng/xám, tấm lưới mesh sheet, tay cầm mẫu gạch.\n2. kind: "concept" hoặc "normal"\n3. room_slugs: mảng các phòng phù hợp nhất (chỉ chọn từ: living_room, kitchen_dining, bathroom_spa, bedroom, outdoor_balcony, fnb_hospitality, office_workspace, other). Rỗng [] nếu là normal.\n4. confidence: float 0.85 - 0.99\n5. ai_description: 1-2 câu tiếng Việt miêu tả chi tiết chất liệu gạch, màu sắc hoa văn, không gian phòng, đồ đạc nội thất và ánh sáng trong ảnh.\nTrả về ĐÚNG 1 JSON object hợp lệ duy nhất.'
            }
          ]
        }
      ]
    });

    const url = new URL(baseUrl + '/messages');
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 35000
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          if (retries > 0 && (res.statusCode === 503 || res.statusCode === 429 || res.statusCode >= 500)) {
            setTimeout(() => {
              callGemini37Vision(imgBase64, retries - 1).then(resolve).catch(reject);
            }, 1500);
            return;
          }
          return reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 120)}`));
        }
        try {
          const data = JSON.parse(body);
          const rawText = data.content?.[0]?.text || '';
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('No JSON object found in response');
          const cleanJson = jsonMatch[0].replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').trim();
          const parsed = JSON.parse(cleanJson);
          resolve(parsed);
        } catch (err) {
          if (retries > 0) {
            setTimeout(() => {
              callGemini37Vision(imgBase64, retries - 1).then(resolve).catch(reject);
            }, 1500);
          } else {
            reject(new Error(`JSON Parse Error: ${err.message}`));
          }
        }
      });
    });

    req.on('error', err => {
      if (retries > 0) {
        setTimeout(() => {
          callGemini37Vision(imgBase64, retries - 1).then(resolve).catch(reject);
        }, 1500);
      } else {
        reject(err);
      }
    });

    req.on('timeout', () => {
      req.destroy();
      if (retries > 0) {
        setTimeout(() => {
          callGemini37Vision(imgBase64, retries - 1).then(resolve).catch(reject);
        }, 1500);
      } else {
        reject(new Error('Request timeout'));
      }
    });

    req.write(payload);
    req.end();
  });
}

async function processImage(item) {
  try {
    const rawBuf = await downloadImage(item.path);
    const optJpeg = await sharp(rawBuf).resize(800, 800, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
    const b64 = optJpeg.toString('base64');
    
    const pred = await callGemini37Vision(b64);
    
    const kind = pred.is_concept ? 'concept' : 'normal';
    const roomSlugs = Array.isArray(pred.room_slugs) ? pred.room_slugs : [];
    const aiDesc = pred.ai_description || (kind === 'concept' ? 'Phối cảnh không gian nội thất' : 'Mẫu gạch ốp lát phẳng');
    const confidence = typeof pred.confidence === 'number' ? pred.confidence : 0.95;

    return {
      id: item.id,
      kind,
      roomSlugs,
      aiDesc,
      confidence
    };
  } catch (err) {
    log(`[WARN Image ${item.id}] Bỏ qua vì lỗi Gemini Vision (sẽ retry tự động): ${err.message}`);
    return null; // Không gán normal giả, giữ nguyên để retry
  }
}

async function runBatch() {
  const client = await pool.connect();
  try {
    const r = await client.query(`
      SELECT id, path 
      FROM product_images 
      WHERE kind <> 'map' 
        AND (ai_description = '' OR ai_description IS NULL)
      ORDER BY id ASC 
      LIMIT $1
    `, [BATCH_SIZE]);

    const items = r.rows;
    if (items.length === 0) {
      return 0; // Đã hoàn thành toàn bộ
    }

    log(`Đang xử lý batch ${items.length} ảnh (ID ${items[0].id} -> ${items[items.length - 1].id}) với ${CONCURRENCY} worker Gemini 3.7 song song...`);

    let conceptTotal = 0;
    let normalTotal = 0;
    let tagTotal = 0;

    for (let i = 0; i < items.length; i += MINI_BATCH) {
      const chunk = items.slice(i, i + MINI_BATCH);
      const chunkResults = await Promise.all(chunk.map(item => processImage(item)));
      const validResults = chunkResults.filter(r => r !== null);

      if (validResults.length > 0) {
        await client.query('BEGIN');
        let cCount = 0;
        let nCount = 0;
        let tCount = 0;

        for (const res of validResults) {
          if (res.kind === 'concept') {
            await client.query(`
              UPDATE product_images 
              SET kind = 'concept', ai_description = $2 
              WHERE id = $1 AND kind <> 'map'
            `, [res.id, res.aiDesc]);
            cCount++;

            await client.query("DELETE FROM product_image_room_tags WHERE product_image_id = $1 AND source = 'vision'", [res.id]);

            for (const slug of res.roomSlugs) {
              await client.query(`
                INSERT INTO product_image_room_tags
                  (product_image_id, room_slug, source, confidence, model, model_version, review_status, created_at, updated_at)
                VALUES ($1, $2, 'vision', $3, 'advisor-gemini-3.7-flash-high', 'v1.0', 'accepted', NOW()::text, NOW()::text)
                ON CONFLICT (product_image_id, room_slug) DO UPDATE SET
                  source = EXCLUDED.source,
                  confidence = EXCLUDED.confidence,
                  model = EXCLUDED.model,
                  model_version = EXCLUDED.model_version,
                  review_status = EXCLUDED.review_status,
                  updated_at = EXCLUDED.updated_at
                WHERE product_image_room_tags.source <> 'manual'
              `, [res.id, slug, res.confidence]);
              tCount++;
            }
          } else {
            await client.query(`
              UPDATE product_images 
              SET kind = 'normal', ai_description = $2 
              WHERE id = $1 AND kind <> 'map' AND id NOT IN (SELECT product_image_id FROM product_image_room_tags WHERE source = 'manual')
            `, [res.id, res.aiDesc]);
            nCount++;
          }
        }
        await client.query('COMMIT');
        conceptTotal += cCount;
        normalTotal += nCount;
        tagTotal += tCount;

        const rRemain = await client.query(`
          SELECT COUNT(*)::int as remaining 
          FROM product_images 
          WHERE kind <> 'map' AND (ai_description = '' OR ai_description IS NULL)
        `);
        const rem = rRemain.rows[0].remaining;
        log(`[Mini-Batch Ingest] Đã ghi ${validResults.length} ảnh vào DB (Lũy kế batch: +${conceptTotal} Concept, +${normalTotal} Normal, +${tagTotal} Tags | CÒN LẠI: ${rem} ảnh).`);
      }
    }

    log(`-> Hoàn tất toàn bộ batch ${items.length} ảnh.`);
    return items.length;
  } finally {
    client.release();
  }
}

async function main() {
  log('=====================================================');
  log('KHỞI ĐỘNG VISION AI PIPELINE TOÀN KHO: MODEL GEMINI 3.7 FLASH HIGH');
  log(`Cấu hình: Concurrency ${CONCURRENCY} worker song song | Stream commit mini-batch ${MINI_BATCH}`);
  log('=====================================================');

  const startT = Date.now();
  let totalProcessed = 0;

  while (true) {
    const processed = await runBatch();
    if (processed === 0) break;
    totalProcessed += processed;
  }

  const client = await pool.connect();
  const rStats = await client.query(`
    SELECT 
      COUNT(*)::int as total_non_map,
      COUNT(CASE WHEN ai_description <> '' THEN 1 END)::int as total_processed,
      COUNT(CASE WHEN kind = 'concept' THEN 1 END)::int as total_concepts,
      COUNT(CASE WHEN kind = 'normal' THEN 1 END)::int as total_normals
    FROM product_images 
    WHERE kind <> 'map'
  `);
  const rTags = await client.query(`
    SELECT room_slug, COUNT(*)::int as count 
    FROM product_image_room_tags 
    GROUP BY room_slug ORDER BY count DESC
  `);
  client.release();
  await pool.end();

  const elapsed = Math.round((Date.now() - startT) / 1000);
  log('=====================================================');
  log(`HOÀN TẤT TOÀN BỘ KHO ẢNH BẰNG GEMINI 3.7 FLASH HIGH TRONG ${elapsed} GIÂY!`);
  console.log('Thống kê kết quả phân loại cuối cùng:', rStats.rows[0]);
  console.log('Phân bố Room Tags trên toàn bộ kho:');
  console.table(rTags.rows);
  log('=====================================================');
}

main().catch(err => {
  console.error('Fatal Pipeline Error:', err);
  process.exit(1);
});
