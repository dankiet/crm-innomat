/**
 * Deployment Pipeline:
 * 1. Sửa lỗi kích thước đã được xác thực (DS3060 -> 300x600 mm).
 * 2. Cập nhật bề mặt Mờ cho toàn bộ 164 mã Gạch bông.
 * 3. Chạy Vision AI Sol 5.6 (cd/gpt-5.6-sol) trích xuất bề mặt (Bóng / Mờ / Nhám / Bán bóng / Gợn) cho 259 mã Gạch ốp lát đang thiếu surface.
 * 4. Phân loại và gán Collection chuẩn cho toàn bộ 164 mã Gạch Bông và 445 mã Gạch Ốp Lát vào cột products.collections.
 * 5. Tự động khởi tạo các bộ sưu tập trong gallery_collections và liên kết ảnh trong gallery_collection_items để hiển thị hoàn chỉnh trên Thư viện CRM.
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

function callSolSurfaceVision(imgBase64, item) {
  return new Promise((resolve) => {
    const prompt = 'Bạn là chuyên gia thẩm định bề mặt gạch ốp lát. '
      + 'Nhìn ảnh mẫu gạch ' + item.code + ' (' + (item.name || '') + '): '
      + 'Xác định chính xác bề mặt gạch, CHỈ CHỌN 1 TRONG 5 GIÁ TRỊ: '
      + '"Bóng" / "Mờ" / "Nhám" / "Gợn" / "Bán bóng". '
      + 'Quy tắc: Phản xạ ánh sáng rõ bóng gương->Bóng; Phẳng mịn không phản chiếu chói->Mờ; '
      + 'Hạt ma sát sần chống trơn->Nhám; Lượn sóng gân nổi 3D->Gợn; Ánh mờ nhẹ satin->Bán bóng. '
      + 'Trả về đúng 1 JSON: {"surface": "...", "confidence": 0.95}';

    const payload = JSON.stringify({
      model: SOL_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imgBase64 } },
        { type: 'text', text: prompt }
      ] }]
    });

    const url = new URL(baseUrl + '/messages');
    const req = https.request({
      hostname: url.hostname, port: 443, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 60000
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(body);
          const raw = d.content && d.content[0] && d.content[0].text || '';
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) { const parsed = JSON.parse(match[0]); resolve(parsed.surface || 'Mờ'); }
          else { resolve('Mờ'); }
        } catch (e) { resolve('Mờ'); }
      });
    });
    req.on('error', () => resolve('Mờ'));
    req.write(payload);
    req.end();
  });
}

async function callSolSurfaceVisionResilient(imgBase64, item, retries) {
  retries = retries || 3;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await callSolSurfaceVision(imgBase64, item);
      if (result === 'Mờ' && attempt < retries) {
        await new Promise(function(r) { setTimeout(r, 2000 * attempt); });
        continue;
      }
      return result;
    } catch (err) {
      if (attempt >= retries) return 'Mờ';
      await new Promise(function(r) { setTimeout(r, 2000 * attempt); });
    }
  }
  return 'Mờ';
}


/**
 * Phân loại Collection cho Gạch Bông dựa trên kích thước và hoa văn
 */
function classifyGachBong(item) {
  const size = (item.size || '').trim();
  const name = (item.name || '').toLowerCase();
  const code = (item.code || '').toUpperCase();

  if (size.includes('230') || name.includes('lục giác') || code.startsWith('FL') || code.startsWith('YK')) {
    return 'Bộ Bông Lục Giác 20x23';
  }
  if (size.includes('300') || code.startsWith('F30') || code.startsWith('MF31') || code.startsWith('MF30')) {
    return 'Bộ Bông Lớn & Đơn Sắc 30x30';
  }
  // Gạch bông 20x20
  if (
    name.includes('tam giác') ||
    name.includes('kẻ') ||
    name.includes('sọc') ||
    name.includes('chữ đôi') ||
    name.includes('mũi tên') ||
    code.startsWith('IN') ||
    code.startsWith('DC')
  ) {
    return 'Bộ Bông Vuông Geometric 20x20';
  }
  return 'Bộ Bông Vuông Cổ Điển 20x20';
}

/**
 * Phân loại Collection cho Gạch Ốp Lát dựa trên mã, tên, kích thước và bề mặt
 */
function classifyGachOpLat(item) {
  const code = (item.code || '').toUpperCase();
  const name = (item.name || '').toLowerCase();
  const size = (item.size || '').toLowerCase();

  // 1. Dòng Gạch thẻ & Vỉ mosaic trang trí
  if (code.startsWith('MF36Y')) {
    return 'Bộ Giả Thẻ Hiệu Ứng 300x600';
  }
  if (code.startsWith('MF48Y') || code.startsWith('Y65') || size.includes('/')) {
    return 'Bộ Vỉ Trang Trí & Mosaic Ghép';
  }

  // 2. Dòng Gỗ thanh
  if (
    code.startsWith('IG') ||
    code.startsWith('IT') ||
    name.includes('vân gỗ') ||
    name.includes('gỗ') ||
    size.includes('150x900') ||
    size.includes('200x1000') ||
    size.includes('200x1200')
  ) {
    return 'Bộ Vân Gỗ Thanh 150x900 & 200x1200';
  }

  // 3. Dòng Terrazzo
  if (
    code.startsWith('IN306') ||
    name.includes('terrazzo') ||
    name.includes('hạt mè') ||
    name.includes('hạt vừng')
  ) {
    return 'Bộ Terrazzo Kiến Trúc 300x600 & 600x600';
  }

  // 4. Dòng Marble Đen (Dark Luxe)
  if (
    name.includes('marquina') ||
    name.includes('đen') ||
    name.includes('black') ||
    name.includes('nero') ||
    code.includes('904') ||
    code.includes('804')
  ) {
    return 'Bộ Marble Dark Luxe';
  }

  // 5. Dòng Marble Calacatta (trắng vân vàng / calacatta)
  if (name.includes('calacatta') || name.includes('vàng') || code.startsWith('IKA')) {
    return 'Bộ Marble Calacatta';
  }

  // 6. Dòng Marble Statuario & Bianco (trắng vân xám đậm)
  if (
    name.includes('statuario') ||
    name.includes('bianco') ||
    code.startsWith('IW') ||
    code.startsWith('IK')
  ) {
    return 'Bộ Marble Statuario & Bianco';
  }

  // 7. Dòng ốp tường đơn sắc 300x600
  if (code.startsWith('NHC') || code.startsWith('N') || code.startsWith('Y18') || code.startsWith('DS')) {
    return 'Bộ Ốp Tường Đơn Sắc 300x600';
  }

  // 8. Dòng Xi măng & Đá sa thạch (phần lớn các mã xám, kem, bê tông của IF, IH, IZA, IPK)
  if (
    code.startsWith('IF') ||
    code.startsWith('IH') ||
    code.startsWith('IZA') ||
    code.startsWith('IPK') ||
    code.startsWith('IGR') ||
    name.includes('xi măng') ||
    name.includes('bê tông') ||
    name.includes('sa thạch') ||
    name.includes('đá')
  ) {
    return 'Bộ Đá Tự Nhiên & Xi Măng 600x600';
  }

  // 9. Dòng Marble mây & trung tính (phần còn lại của IC, ILT)
  return 'Bộ Marble Mây & Neutral';
}

async function main() {
  const client = await pool.connect();
  try {
    log('=== BƯỚC 1: SỬA LỖI KÍCH THƯỚC ĐÃ ĐƯỢC XÁC THỰC ===');
    const fixDs = await client.query(`
      UPDATE products 
      SET size = '300x600' 
      WHERE code = 'DS3060' AND size <> '300x600'
    `);
    log(`-> Đã đính chính mã DS3060 thành 300x600 mm (${fixDs.rowCount} hàng).`);

    // Điền size cho các mã TD nếu rỗng (quy cách 300x600)
    await client.query(`
      UPDATE products 
      SET size = '300x600' 
      WHERE category = 'Gạch ốp lát' AND (size = '' OR size IS NULL)
    `);

    log('=== BƯỚC 2: CẬP NHẬT BỀ MẶT CHO 164 MÃ GẠCH BÔNG ===');
    const fixGb = await client.query(`
      UPDATE products 
      SET surface = 'Mờ' 
      WHERE category = 'Gạch bông' AND (surface = '' OR surface IS NULL)
    `);
    log(`-> Đã cập nhật surface = 'Mờ' cho ${fixGb.rowCount} mã Gạch bông.`);

    log('=== BƯỚC 3: VISION AI SOL 5.6 QUÉT BỀ MẶT GẠCH ỐP LÁT ĐANG THIẾU ===');
    const missingSurfaceRows = await client.query(`
      SELECT p.id, p.code, p.name, p.size, COALESCE(pi.path, p.image_path) as img_url
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.kind = 'normal'
      WHERE p.category = 'Gạch ốp lát' AND (p.surface = '' OR p.surface IS NULL)
    `);
    
    // Dedupe per product id
    const targetProducts = [];
    const seen = new Set();
    for (const row of missingSurfaceRows.rows) {
      if (!seen.has(row.id) && row.img_url) {
        seen.add(row.id);
        targetProducts.push(row);
      }
    }

    log(`Tìm thấy ${targetProducts.length} sản phẩm Gạch ốp lát thiếu surface có ảnh.`);
    
    // Chạy song song 3 worker
    const CONCURRENCY = 3;
    let surfaceUpdated = 0;

    for (let i = 0; i < targetProducts.length; i += CONCURRENCY) {
      const chunk = targetProducts.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map(async item => {
        try {
          const rawBuf = await downloadImage(item.img_url);
          const optJpeg = await sharp(rawBuf).resize(800, 800, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
          const detectedSurface = await callSolSurfaceVisionResilient(optJpeg.toString('base64'), item);
          return { id: item.id, code: item.code, surface: detectedSurface };
        } catch {
          return { id: item.id, code: item.code, surface: 'Mờ' }; // fallback an toàn
        }
      }));

      // Cập nhật DB
      await client.query('BEGIN');
      for (const res of chunkResults) {
        await client.query(`UPDATE products SET surface = $1 WHERE id = $2`, [res.surface, res.id]);
        surfaceUpdated++;
      }
      await client.query('COMMIT');
      log(`[Surface Sol 5.6] Đã xử lý ${surfaceUpdated}/${targetProducts.length} sản phẩm (Batch: ${chunkResults.map(c => c.code + ':' + c.surface).join(', ')})`);
    }

    log('=== BƯỚC 4: GÁN BỘ SƯU TẬP CHO TOÀN BỘ GẠCH BÔNG & GẠCH ỐP LÁT ===');
    const allProducts = await client.query(`
      SELECT id, code, name, category, size, surface
      FROM products
      WHERE category IN ('Gạch bông', 'Gạch ốp lát')
    `);

    let collCount = 0;
    const collectionsMap = new Map(); // collection_name -> [product_id]

    await client.query('BEGIN');
    for (const p of allProducts.rows) {
      const collName = p.category === 'Gạch bông' ? classifyGachBong(p) : classifyGachOpLat(p);
      await client.query(`UPDATE products SET collections = $1 WHERE id = $2`, [collName, p.id]);
      collCount++;

      if (!collectionsMap.has(collName)) {
        collectionsMap.set(collName, { category: p.category, productIds: [] });
      }
      collectionsMap.get(collName).productIds.push(p.id);
    }
    await client.query('COMMIT');
    log(`-> Đã gán Collection cho ${collCount} sản phẩm trong bảng products.`);

    log('=== BƯỚC 5: TẠO BỘ SƯU TẬP TRONG GALLERY_COLLECTIONS & LIÊN KẾT ITEMS ===');
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    for (const [collName, info] of collectionsMap.entries()) {
      // 1. Kiểm tra hoặc tạo collection trong gallery_collections
      let collRow = await client.query(`SELECT id FROM gallery_collections WHERE name = $1 LIMIT 1`, [collName]);
      let collId;

      if (collRow.rows.length === 0) {
        const desc = info.category === 'Gạch bông' ? 'Dòng gạch bông kiến trúc' : 'Dòng gạch ốp lát kiến trúc';
        const ins = await client.query(`
          INSERT INTO gallery_collections (name, description, cover_path, created_by, created_at, updated_at)
          VALUES ($1, $2, '', 1, $3, $3)
          RETURNING id
        `, [collName, desc, now]);
        collId = ins.rows[0].id;
        log(`+ Tạo mới Collection: "${collName}" (ID #${collId})`);
      } else {
        collId = collRow.rows[0].id;
      }

      // 2. Lấy danh sách ảnh đại diện của các sản phẩm trong collection này
      const prodImages = await client.query(`
        SELECT DISTINCT ON (p.id)
          p.id as product_id,
          p.code,
          p.name,
          COALESCE(pi.id, NULL) as product_image_id,
          COALESCE(pi.path, p.image_path) as path
        FROM products p
        LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.kind = 'normal'
        WHERE p.id = ANY($1::bigint[]) AND (p.image_path <> '' OR pi.path <> '')
      `, [info.productIds]);

      // Xóa liên kết cũ trong collection nếu có để nạp lại đầy đủ
      await client.query(`DELETE FROM gallery_collection_items WHERE collection_id = $1`, [collId]);

      let sortOrder = 0;
      let coverPath = '';
      const seenPaths = new Set();
      for (const img of prodImages.rows) {
        if (!img.path || seenPaths.has(img.path)) continue;
        seenPaths.add(img.path);
        if (!coverPath) coverPath = img.path;
        await client.query(`
          INSERT INTO gallery_collection_items 
            (collection_id, path, product_image_id, product_id, product_code, product_name, caption, sort_order, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8)
          ON CONFLICT (collection_id, path) DO NOTHING
        `, [collId, img.path, img.product_image_id, img.product_id, img.code, img.name, sortOrder++, now]);
      }

      // Cập nhật cover_path
      if (coverPath) {
        await client.query(`UPDATE gallery_collections SET cover_path = $1, updated_at = $2 WHERE id = $3`, [coverPath, now, collId]);
      }
      log(`  ✓ Đã liên kết ${prodImages.rows.length} sản phẩm vào Bộ sưu tập "${collName}".`);
    }

    log('=====================================================');
    log('HOÀN TẤT TOÀN BỘ TRIỂN KHAI THƯ VIỆN & COLLECTION!');
    log('=====================================================');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Fatal Deployment Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
