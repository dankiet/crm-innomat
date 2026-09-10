import https from 'node:https';
import fs from 'node:fs';
import yaml from 'js-yaml';
import sharp from 'sharp';

const modelsYml = yaml.load(fs.readFileSync('C:/Users/dankiet/.omp/agent/models.yml', 'utf8'));
const apiKey = modelsYml.providers.vilao.apiKey;
const baseUrl = modelsYml.providers.vilao.baseUrl;

const SOL_MODEL = 'cd/gpt-5.6-sol';
const ADVISOR_MODEL = 'pt/claude-fable-5';

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

function callSolVision(imgBase64, item) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: SOL_MODEL,
      max_tokens: 600,
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
              text: `Bạn là chuyên gia thẩm định thị giác gạch ốp lát. Hãy nhìn ảnh mẫu gạch normal (swatch phẳng / catalog kỹ thuật) này:
- Mã sản phẩm: ${item.code}
- Tên sản phẩm: ${item.name}
- Kích thước hiện tại trong DB: ${item.current_size || '(đang để trống)'}
- Bề mặt hiện tại trong DB: ${item.current_surface || '(đang để trống)'}

Danh mục 8 Bộ sưu tập tham chiếu:
1. Marble Calacatta (vân đá cẩm thạch trắng Calacatta / vàng kem)
2. Marble Statuario & Bianco (vân đá trắng tương phản xám đậm)
3. Marble Dark Luxe (vân đá marble đen, marquina, đen chỉ vàng)
4. Marble Mây & Neutral (vân mây mềm, vân đá tone trung tính)
5. Terrazzo Studio (hạt mè, hạt vừng, đá nhỏ terrazzo)
6. Cement & Sandstone (xi măng bê tông mờ, sa thạch, xám ghi)
7. Gỗ Thanh (Wood Plank) (vân gỗ sồi, óc chó, thanh dài lát sàn)
8. Gạch Thẻ & Mosaic Trang Trí (xẻ rãnh giả thẻ 300x600, vỉ mosaic 306x306, vỉ zellige)

YÊU CẦU TRÍCH XUẤT (JSON):
1. detected_size: Kích thước mm thực tế (đọc text in trên ảnh nếu có, hoặc ước tính theo tỉ lệ hình học viên gạch 1:1, 1:2, 1:4..1:6, đối chiếu mã code).
2. size_action: "keep" (nếu DB đã đúng), "fix" (nếu DB sai/trống cần sửa), hoặc "unknown".
3. detected_surface: CHỈ CHỌN 1 TRONG 5 GIÁ TRỊ: "Bóng" / "Mờ" / "Nhám" / "Gợn" / "Bán bóng".
4. collection_name: Tên 1 trong 8 bộ sưu tập tham chiếu phù hợp nhất.
5. confidence: Số float 0.80 - 0.99.
6. evidence: Lý do ngắn gọn (thấy chữ gì, vân gì, bề mặt phản xạ ra sao).

Trả về ĐÚNG 1 JSON duy nhất:
{
  "detected_size": "...",
  "size_action": "keep|fix|unknown",
  "detected_surface": "Bóng|Mờ|Nhám|Gợn|Bán bóng",
  "collection_name": "...",
  "confidence": 0.xx,
  "evidence": "..."
}`
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
      timeout: 45000
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(body);
          const raw = d.content?.[0]?.text || '';
          const match = raw.match(/\{[\s\S]*\}/);
          if (!match) throw new Error('No JSON object in response');
          resolve(JSON.parse(match[0]));
        } catch (err) {
          resolve({ error: err.message, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function askAdvisorAudit(results) {
  return new Promise((resolve, reject) => {
    const prompt = `Bạn là Chuyên gia Tư vấn Kiến trúc & Vật liệu (Advisor - Model Claude Fable 5).
Hệ thống vừa chạy Vision AI Sol 5.6 (cd/gpt-5.6-sol) trên 10 sản phẩm mẫu Gạch Ốp Lát để trích xuất Size, Bề mặt và gán Bộ sưu tập:

${JSON.stringify(results, null, 2)}

Hãy thẩm định kết quả này:
1. Đánh giá tính chuẩn xác của việc phát hiện/hiệu chỉnh Kích thước (Size): các ca như DS3060, TD19215, MF36Y, vỉ mosaic... có chính xác không?
2. Đánh giá việc phân loại Bề mặt (Surface: Bóng, Mờ, Nhám, Gợn) và gán Bộ sưu tập (Collection).
3. Kết luận: Có đủ độ tin cậy để cho chạy tự động toàn bộ 445 sản phẩm Gạch Ốp Lát không?`;

    const payload = JSON.stringify({
      model: ADVISOR_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
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
      timeout: 120000
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(body);
          resolve(d.content?.[0]?.text || body);
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('====================================================================');
  console.log('BƯỚC 1: VISION AI SOL 5.6 QUÉT 10 ẢNH NORMAL TRÍCH XUẤT SIZE/SURFACE/COLLECTION');
  console.log('====================================================================\n');

  const items = JSON.parse(fs.readFileSync('tmp/test-10-selected.json', 'utf8'));
  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`[${i + 1}/10] Đang xử lý: ${item.code} - ${item.name}`);
    console.log(`       DB Size: ${item.current_size || 'TRỐNG'} | DB Surface: ${item.current_surface || 'TRỐNG'}`);

    const rawBuf = await downloadImage(item.image_url);
    const optJpeg = await sharp(rawBuf).resize(800, 800, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();

    const solOut = await callSolVision(optJpeg.toString('base64'), item);
    console.log(`    -> Sol 5.6: Size=${solOut.detected_size} (${solOut.size_action}) | Surface=${solOut.detected_surface} | Collection=${solOut.collection_name}`);

    results.push({
      id: item.product_id,
      code: item.code,
      name: item.name,
      current_size: item.current_size,
      current_surface: item.current_surface,
      sol_detected_size: solOut.detected_size,
      sol_size_action: solOut.size_action,
      sol_detected_surface: solOut.detected_surface,
      sol_collection: solOut.collection_name,
      sol_confidence: solOut.confidence,
      sol_evidence: solOut.evidence
    });
    console.log('--------------------------------------------------------------------');
  }

  fs.writeFileSync('tmp/test-10-results.json', JSON.stringify(results, null, 2));

  console.log('\n====================================================================');
  console.log('BƯỚC 2: ADVISOR CLAUDE FABLE 5 THẨM ĐỊNH TOÀN BỘ KẾT QUẢ 10 SẢN PHẨM');
  console.log('====================================================================\n');

  console.log('Đang gửi 10 kết quả cho Advisor Claude Fable 5 thẩm định...');
  const auditReport = await askAdvisorAudit(results);
  console.log(auditReport);
  fs.writeFileSync('tmp/test-10-advisor-audit.md', auditReport);

  console.log('\n-> Đã lưu kết quả hoàn chỉnh vào tmp/test-10-results.json và tmp/test-10-advisor-audit.md');
}

main().catch(console.error);
