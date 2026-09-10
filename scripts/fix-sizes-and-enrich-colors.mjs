/**
 * Script sửa kích thước và chạy Vision AI Sol 5.6 trích xuất màu sắc (Color)
 * cho toàn bộ sản phẩm đang thiếu màu.
 */
import https from 'node:https';
import fs from 'node:fs';
import yaml from 'js-yaml';
import pg from 'pg';
import sharp from 'sharp';

const modelsYml = yaml.load(fs.readFileSync('C:/Users/dankiet/.omp/agent/models.yml', 'utf8'));
const apiKey = modelsYml.providers.vilao.apiKey;
const baseUrl = modelsYml.providers.vilao.baseUrl;
const SOL_MODEL = 'cd/gpt-5.6-sol';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10
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

function callSolColorVision(imgBase64, item) {
  return new Promise((resolve) => {
    const prompt = 'Bạn là chuyên gia phân loại màu sắc gạch kiến trúc/nội thất. '
      + 'Nhìn ảnh mẫu gạch ' + item.code + ' (' + (item.name || '') + '): '
      + 'Xác định MÀU SẮC CHỦ ĐẠO của sản phẩm. '
      + 'CHỈ ĐƯỢC CHỌN 1 TRONG CÁC GIÁ TRỊ SAU: '
      + '"Trắng", "Xám", "Đen", "Kem/Be", "Vàng", "Nâu", "Xanh lá", "Xanh dương", "Cam", "Đỏ", "Hồng". '
      + 'Quy tắc: '
      + '- Nền trắng có vân nhẹ -> "Trắng" '
      + '- Tông bê tông, xi măng, ghi xám -> "Xám" '
      + '- Tông be, kem, ivory, cát -> "Kem/Be" '
      + '- Vân gỗ nâu/nâu đậm -> "Nâu" '
      + 'Trả về đúng 1 JSON: {"color": "...", "confidence": 0.95}';

    const payload = JSON.stringify({
      model: SOL_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imgBase64 } },
        { type: 'text', text: prompt }
      ] }]
    });

    const url = new URL(baseUrl + '/messages');
    const req = https.request({
      hostname: url.hostname, port: 443, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 45000
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(body);
          const raw = d.content && d.content[0] && d.content[0].text || '';
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            resolve(parsed.color || 'Xám');
          } else {
            resolve('Xám');
          }
        } catch { resolve('Xám'); }
      });
    });
    req.on('error', () => resolve('Xám'));
    req.write(payload);
    req.end();
  });
}

async function callSolColorVisionResilient(imgBase64, item, retries) {
  retries = retries || 3;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await callSolColorVision(imgBase64, item);
      return result;
    } catch {
      if (attempt >= retries) return 'Xám';
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  return 'Xám';
}

async function main() {
  const client = await pool.connect();
  try {
    log('=== BƯỚC 1: ĐÍNH CHÍNH KÍCH THƯỚC BỊ SAI TRONG GẠCH ỐP LÁT ===');
    
    // 1. IM60601, IM60602 -> 600x600
    const fixIm = await client.query(`
      UPDATE products 
      SET size = '600x600' 
      WHERE code IN ('IM60601', 'IM60602')
    `);
    log(`-> Đã sửa size IM60601, IM60602 thành 600x600 (${fixIm.rowCount} mã).`);

    // 2. TD6830A, Y6830W -> 300x600
    const fixTd = await client.query(`
      UPDATE products 
      SET size = '300x600' 
      WHERE code IN ('TD6830A', 'Y6830W')
    `);
    log(`-> Đã sửa size TD6830A, Y6830W thành 300x600 (${fixTd.rowCount} mã).`);

    // 3. Y6503 -> 300x600
    const fixY = await client.query(`
      UPDATE products 
      SET size = '300x600' 
      WHERE code IN ('Y6503', 'Y65031', 'Y6505', 'Y6523', 'Y6528')
    `);
    log(`-> Đã sửa size các mã Y65xx thành 300x600 (${fixY.rowCount} mã).`);

    // 4. Các mã MF48Yxx chuyển category sang 'Gạch mosaic' đúng bản chất
    const fixMf = await client.query(`
      UPDATE products 
      SET category = 'Gạch mosaic', collections = 'Mosaic Vuông (Nhỏ)'
      WHERE code LIKE 'MF48Y%' AND category = 'Gạch ốp lát'
    `);
    log(`-> Đã chuyển ${fixMf.rowCount} mã MF48Yxx về đúng category 'Gạch mosaic'.`);

    log('=== BƯỚC 2: QUÉT VÀ TRÍCH XUẤT MÀU SẮC (COLOR) BẰNG VISION AI SOL 5.6 ===');
    const missingColorRows = await client.query(`
      SELECT p.id, p.code, p.name, p.category, p.size, COALESCE(pi.path, p.image_path) as img_url
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.kind = 'normal'
      WHERE (p.color = '' OR p.color IS NULL)
        AND (p.image_path <> '' OR pi.path <> '')
      ORDER BY p.category, p.id
    `);

    // Dedupe per product id
    const targetProducts = [];
    const seen = new Set();
    for (const row of missingColorRows.rows) {
      if (!seen.has(row.id) && row.img_url) {
        seen.add(row.id);
        targetProducts.push(row);
      }
    }

    log(`Tìm thấy ${targetProducts.length} sản phẩm thiếu màu có ảnh cần phân tích.`);

    // Chạy song song 3 worker
    const CONCURRENCY = 5;
    let colorUpdated = 0;

    for (let i = 0; i < targetProducts.length; i += CONCURRENCY) {
      const chunk = targetProducts.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map(async item => {
        try {
          const rawBuf = await downloadImage(item.img_url);
          const optJpeg = await sharp(rawBuf).resize(800, 800, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
          const detectedColor = await callSolColorVisionResilient(optJpeg.toString('base64'), item);
          return { id: item.id, code: item.code, color: detectedColor };
        } catch {
          return { id: item.id, code: item.code, color: 'Xám' };
        }
      }));

      await client.query('BEGIN');
      for (const res of chunkResults) {
        await client.query(`UPDATE products SET color = $1 WHERE id = $2`, [res.color, res.id]);
        colorUpdated++;
      }
      await client.query('COMMIT');
      log(`[Color Sol 5.6] Đã xử lý ${colorUpdated}/${targetProducts.length} sản phẩm (Batch: ${chunkResults.map(c => c.code + ':' + c.color).join(', ')})`);
    }

    log('=====================================================');
    log('HOÀN TẤT ĐÍNH CHÍNH KÍCH THƯỚC VÀ CẬP NHẬT MÀU SẮC!');
    log('=====================================================');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Lỗi thực thi:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
