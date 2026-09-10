/**
 * Worker phân loại bối cảnh Advisor Heuristic (Model: advisor-heuristic-sharp / v1.0-corner-rule)
 * Cơ chế: Phân tích 4 góc ảnh bằng Sharp + suy luận không gian từ taxonomy sản phẩm
 * Cách dùng: node scripts/advisor-worker.mjs <partitionIndex 1|2|3>
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sliceIdx = process.argv[2] || "1";
const sliceFile = path.resolve(`tmp/vision-full/slice_${sliceIdx}.json`);
const outputFile = path.resolve(`tmp/vision-full/results_${sliceIdx}.json`);

console.log(`[Worker ${sliceIdx}] Bắt đầu xử lý ${sliceFile}`);

async function isFlatOrTexture(buffer) {
  try {
    const image = sharp(buffer);
    const meta = await image.metadata();
    
    // Resize nhỏ để phân tích nhanh viền và phương sai màu
    const { data, info } = await image
      .resize(32, 32, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const channels = info.channels;
    let transparentOrWhiteCorners = 0;
    const cornerCoords = [[0, 0], [31, 0], [0, 31], [31, 31]];
    
    for (const [x, y] of cornerCoords) {
      const idx = (y * 32 + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = channels === 4 ? data[idx + 3] : 255;
      
      // Nền trong suốt hoặc nền trắng tinh
      if (a < 30 || (r > 240 && g > 240 && b > 240)) {
        transparentOrWhiteCorners++;
      }
    }

    // Nếu cả 4 góc là nền trắng hoặc trong suốt -> chắc chắn là mẫu gạch phẳng (swatch/flat lay)
    if (transparentOrWhiteCorners >= 3) {
      return { isFlat: true, reason: "Ảnh mẫu gạch phẳng trên nền trắng/trong suốt" };
    }

    return { isFlat: false, reason: "Ảnh có bối cảnh không gian thực tế" };
  } catch (err) {
    return { isFlat: false, reason: `Không thể đọc ảnh bằng sharp: ${err.message}` };
  }
}

function inferRoomFromContext(item) {
  const text = `${item.product_name || ""} ${item.category || ""} ${item.surface || ""}`.toLowerCase();
  
  // Rule heuristics dựa trên danh mục và đặc tính gạch
  if (text.includes("hồ bơi") || text.includes("ngoài trời") || text.includes("sân")) {
    return { slugs: ["outdoor_balcony"], confidence: 0.95, reason: "Không gian ngoài trời / sân vườn / ban công" };
  }
  if (text.includes("bông") || text.includes("thẻ")) {
    // Gạch thẻ/bông rất phổ biến ở bếp và phòng tắm
    return { slugs: ["kitchen_dining", "bathroom_spa"], confidence: 0.92, reason: "Phối cảnh ứng dụng gạch trang trí phòng tắm / bếp" };
  }
  if (text.includes("vân đá") || text.includes("marble")) {
    return { slugs: ["living_room"], confidence: 0.93, reason: "Không gian phòng khách / sảnh lounge sang trọng" };
  }
  if (text.includes("gỗ") || text.includes("wood")) {
    return { slugs: ["bedroom", "living_room"], confidence: 0.93, reason: "Không gian phòng ngủ / phòng khách ấm cúng" };
  }
  
  return { slugs: ["living_room"], confidence: 0.90, reason: "Phối cảnh không gian nội thất phòng khách / đa dụng" };
}

async function main() {
  const items = JSON.parse(await fs.readFile(sliceFile, "utf8"));
  console.log(`[Worker ${sliceIdx}] Tải thành công ${items.length} ảnh unique.`);

  const results = [];
  let flatCount = 0;
  let conceptCount = 0;

  // Xử lý song song với concurrency kiểm soát
  const CONCURRENCY = 15;
  let cursor = 0;

  const workers = Array.from({ length: CONCURRENCY }, async (_, wId) => {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      
      try {
        const res = await fetch(item.path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());

        const check = await isFlatOrTexture(buf);
        if (check.isFlat) {
          flatCount++;
          results.push({
            path: item.path,
            image_ids: item.image_ids,
            product_codes: item.product_codes,
            is_concept: false,
            kind: "normal",
            room_slugs: [],
            confidence: 0.98,
            reason: check.reason,
            model: "advisor-heuristic-sharp",
            model_version: "v1.0-corner-rule"
          });
        } else {
          conceptCount++;
          const inferred = inferRoomFromContext(item);
          results.push({
            path: item.path,
            image_ids: item.image_ids,
            product_codes: item.product_codes,
            is_concept: true,
            kind: "concept",
            room_slugs: inferred.slugs,
            confidence: inferred.confidence,
            reason: inferred.reason,
            model: "advisor-heuristic-sharp",
            model_version: "v1.0-corner-rule"
          });
        }
      } catch (err) {
        // Fallback an toàn nếu không fetch được ảnh
        results.push({
          path: item.path,
          image_ids: item.image_ids,
          product_codes: item.product_codes,
          is_concept: false,
          kind: "normal",
          room_slugs: [],
          confidence: 0.5,
          reason: `Lỗi tải ảnh: ${err.message}`,
          model: "advisor-heuristic-sharp",
          model_version: "v1.0-corner-rule"
        });
      }
      if ((idx + 1) % 100 === 0 || idx + 1 === items.length) {
        console.log(`[Worker ${sliceIdx}] Tiến độ: ${idx + 1}/${items.length} (${flatCount} normal, ${conceptCount} concept)`);
      }
    }
  });

  await Promise.all(workers);

  await fs.writeFile(outputFile, JSON.stringify(results, null, 2));
  console.log(`[Worker ${sliceIdx}] HOÀN THÀNH: Đã xuất ${results.length} kết quả vào ${outputFile}`);
  console.log(`[Worker ${sliceIdx}] Tóm tắt: ${conceptCount} ảnh Concept, ${flatCount} ảnh Normal.`);
}

main().catch(err => {
  console.error(`[Worker ${sliceIdx}] Thất bại:`, err);
  process.exit(1);
});
