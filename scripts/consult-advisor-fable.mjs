import https from 'node:https';
import fs from 'node:fs';
import yaml from 'js-yaml';

const modelsYml = yaml.load(fs.readFileSync('C:/Users/dankiet/.omp/agent/models.yml', 'utf8'));
const apiKey = modelsYml.providers.vilao.apiKey;
const baseUrl = modelsYml.providers.vilao.baseUrl;

async function askAdvisorFable(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'pt/claude-fable-5',
      max_tokens: 3000,
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
      timeout: 150000
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(body);
          resolve(d.content?.[0]?.text || body);
        } catch {
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
  const prompt = `Bạn là Chuyên gia Tư vấn Kiến trúc & Danh mục Vật liệu (Advisor - Model Claude Fable 5) của Innomat / Em Bán Gạch.

User (Chủ showroom / Admin) vừa đưa ra định hướng chiến lược rất thực tế và yêu cầu bạn tham vấn kỹ lưỡng:

1. ĐỊNH HƯỚNG TỪ USER:
- Chỉ đọc các ảnh có kind = 'normal' (ảnh chụp mẫu phẳng, swatch, catalog kỹ thuật) vì các ảnh này thường in sẵn kích thước, thông số và thể hiện rõ chất cảm bề mặt thật nhất.
- Ưu tiên xử lý kích thước (size) cho Gạch Ốp Lát trước, kết hợp tạo Bộ sưu tập (Collection) luôn trong một quy trình.
- Về Collection: User thấy không cần cứng nhắc chia vụn theo từng kích thước. Cứ nhận diện bề mặt / dòng vân (vân đá marble, terrazzo, vân gỗ, xi măng, giả thẻ, gạch hoa/bông...) thì đặt tên Collection theo dòng vân/bề mặt đó, nếu gom kèm được kích thước phổ biến thì càng tốt (ví dụ: Bộ Marble Calacatta, Bộ Terrazzo Hạt Nhí, Bộ Vân Gỗ Thanh...).

2. HIỆN TRẠNG DỮ LIỆU THỰC TẾ:
- Gạch Ốp Lát (445 sản phẩm):
  + Nhóm Marble / Đá cẩm thạch (tiền tố IC, ILT, IW, IK, IKA): vân Calacatta, Marquina, Statuario, vân mây (chủ yếu 600x1200, 600x600, 800x800).
  + Nhóm Terrazzo kiến trúc & Xi măng (tiền tố IN, IH): terrazzo hạt mè/vừng, xi măng mờ, sa thạch (300x600, 600x600).
  + Nhóm Gạch thanh vân gỗ (tiền tố IG, IT, IZA): vân gỗ sồi, óc chó, tếch (150x900, 200x1000, 200x1200).
  + Nhóm Giả thẻ hiệu ứng xẻ rãnh (tiền tố MF36Y): xẻ rãnh 300x600 tạo cảm giác gạch thẻ.
  + Nhóm Vỉ trang trí & Mosaic ghép thanh (tiền tố MF48Y, Y65): dạng vỉ 306x306 vỉ thẻ vuông và vỉ thanh zellige 280x265.
  + Nhóm Gạch ốp tường đơn sắc & men bóng (tiền tố NHC, N, Y18): gạch ceramic 300x600.
- Gạch Bông (164 sản phẩm):
  + Bông vuông 200x200 cổ điển & hình học.
  + Bông lục giác 200x230.
  + Bông 300x300 đơn sắc và họa tiết lớn.

3. NHIỆM VỤ THAM VẤN CỦA BẠN (ADVISOR):
A. BẢNG DANH MỤC COLLECTION CHUẨN:
   Đề xuất danh sách 6 - 8 Collection chuẩn mực cho Gạch Ốp Lát và 3 - 4 Collection cho Gạch Bông theo đúng định hướng của user (gom theo dòng vân/chất liệu/bề mặt là chính, có kèm quy cách nếu tiện).
B. THIẾT KẾ PIPELINE 1-PASS VỚI VISION AI SOL 5.6 (cd/gpt-5.6-sol):
   Xây dựng prompt và logic để Sol 5.6 khi nhìn 1 ảnh normal sẽ trích xuất đồng thời 3 trường:
   1) size: Kích thước mm chuẩn (đọc từ text in trên ảnh hoặc tỷ lệ hình học).
   2) surface: Bề mặt chuẩn hóa (Bóng / Mờ / Nhám / Gợn / Bán bóng).
   3) collection_name: Gán ngay tên Collection trong danh mục đề xuất ở trên.
C. QUY TẮC VALIDATION & CẬP NHẬT DATABASE AN TOÀN:
   Các điều kiện an toàn khi cập nhật DB để bảo toàn 100% dữ liệu đang bán.

Hãy trả lời thật kỹ lưỡng, có cấu trúc rõ ràng, văn phong chuyên gia kiến trúc - vật liệu.`;

  console.log('Đang gửi yêu cầu tham vấn chuyên sâu đến Advisor (Claude Fable 5)...');
  const advice = await askAdvisorFable(prompt);
  console.log('=== THAM VẤN CHUYÊN SÂU TỪ ADVISOR CLAUDE FABLE 5 ===\n');
  console.log(advice);
  fs.writeFileSync('tmp/advisor-thorough-advice.md', advice);
  console.log('\n-> Đã lưu toàn văn vào tmp/advisor-thorough-advice.md');
}

main().catch(console.error);
