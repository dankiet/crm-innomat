/**
 * Production Vision Batch Runner (Multimodal AI Pipeline)
 * 
 * Supports:
 * - Real Multimodal AI APIs: Google Gemini (REST) & OpenAI / OpenRouter (REST)
 * - Real image ingestion: URL or local file, base64 encoding, mime-type detection, sharp preflight
 * - Structured JSON classification: is_concept, kind, room_slugs, confidence, reason
 * - Strict schema validation matching src/lib/types.ts IMAGE_ROOM_TAGS
 * - Concurrency control & exponential backoff retries on 429/5xx
 * - Atomic worker checkpointing and deterministic merging (scripts/vision-checkpoint.mjs)
 * - Safe dry-run & limit support for pilots/trials
 * - Atomic PostgreSQL transaction sync preserving manual room tags
 */
import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  loadWorkerCheckpoint,
  saveWorkerCheckpoint,
  mergeAllCheckpoints,
  readJsonStrict,
  hashUrl,
} from "./vision-checkpoint.mjs";

// Valid room slugs according to src/lib/types.ts IMAGE_ROOM_TAGS
export const VALID_ROOM_SLUGS = [
  "living_room",
  "kitchen_dining",
  "bathroom_spa",
  "bedroom",
  "outdoor_balcony",
  "fnb_hospitality",
  "office_workspace",
  "other",
  "unknown",
];

const PROMPT_SYSTEM = `Bạn là chuyên gia phân tích thị giác và phân loại không gian kiến trúc/nội thất cho vật liệu gạch ốp lát.
Nhiệm vụ: Phân tích bức ảnh được cung cấp và trả về DUY NHẤT một đối tượng JSON hợp lệ (không kèm markdown, không kèm giải thích ngoài JSON) theo schema sau:

{
  "is_concept": boolean, // true nếu là ảnh phối cảnh không gian nội thất/ngoại thất thực tế hoặc render 3D không gian; false nếu chỉ là ảnh mẫu gạch chụp phẳng (swatch/flat lay/texture/isolated tile trên nền trắng hoặc đơn sắc)
  "kind": "concept" | "normal" | "map", // "concept" nếu is_concept=true; "normal" nếu là ảnh mẫu phẳng; "map" nếu là ảnh map hoa văn gạch
  "room_slugs": string[], // Danh sách các không gian xuất hiện trong ảnh. BẮT BUỘC chỉ chọn từ danh sách sau: ["living_room", "kitchen_dining", "bathroom_spa", "bedroom", "outdoor_balcony", "fnb_hospitality", "office_workspace", "other", "unknown"]. Nếu is_concept=false, để mảng rỗng [].
  "confidence": number, // Độ tin cậy từ 0.0 đến 1.0 (ví dụ: 0.95)
  "reason": string // Mô tả ngắn gọn (tiếng Việt) các chi tiết nhìn thấy chứng minh kết luận (ví dụ: "Phòng tắm có bồn tắm ngâm, vòi sen và tường ốp gạch thẻ trắng")
}`;

/**
 * Detect available multimodal provider from environment credentials
 */
export function detectProvider(override) {
  if (override && override !== "auto") return override;
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY) {
    return "gemini";
  }
  if (process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY) {
    return "openai";
  }
  return "none";
}

/**
 * Fetch with timeout and exponential backoff retry for network/rate limit issues
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3, baseDelayMs = 1000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || 35000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) return res;

      // Rate limit or server error: retry
      if (res.status === 429 || (res.status >= 500 && res.status <= 504)) {
        const errorText = await res.text().catch(() => "");
        const retryAfter = res.headers.get("retry-after");
        const delay = retryAfter ? Number(retryAfter) * 1000 : baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(`[HTTP ${res.status}] Thử lại lần ${attempt + 1}/${maxRetries} sau ${Math.round(delay)}ms... (${errorText.slice(0, 100)})`);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${errorText.slice(0, 200)}`);
      }

      const errorText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${errorText.slice(0, 200)}`);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && err.name === "AbortError") {
        console.warn(`[Timeout] Hết thời gian chờ, thử lại lần ${attempt + 1}/${maxRetries}...`);
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }
      if (attempt < maxRetries && err.message?.includes("fetch failed")) {
        console.warn(`[Network Error] Lỗi kết nối mạng, thử lại lần ${attempt + 1}/${maxRetries}...`);
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }
      if (attempt >= maxRetries) throw lastError;
    }
  }
  throw lastError;
}

/**
 * Load image from URL or local file path, optimize if needed, and return buffer + mime type
 */
export async function loadImageData(imagePathOrUrl) {
  let buffer;
  let mimeType = "image/jpeg";

  if (/^https?:\/\//i.test(imagePathOrUrl)) {
    const res = await fetchWithRetry(imagePathOrUrl, { timeout: 20000 });
    const arrayBuf = await res.arrayBuffer();
    buffer = Buffer.from(arrayBuf);
    const contentType = res.headers.get("content-type");
    if (contentType?.startsWith("image/")) {
      mimeType = contentType.split(";")[0].trim();
    }
  } else {
    buffer = await fs.readFile(path.resolve(imagePathOrUrl));
    const ext = path.extname(imagePathOrUrl).toLowerCase();
    if (ext === ".webp") mimeType = "image/webp";
    else if (ext === ".png") mimeType = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
    else if (ext === ".avif") mimeType = "image/avif";
  }

  // Preflight with sharp to inspect and resize if excessively large (> 2048px or > 3MB)
  try {
    const meta = await sharp(buffer).metadata();
    if (meta.format) {
      if (meta.format === "jpeg") mimeType = "image/jpeg";
      else if (meta.format === "png") mimeType = "image/png";
      else if (meta.format === "webp") mimeType = "image/webp";
    }
    if ((meta.width && meta.width > 2048) || (meta.height && meta.height > 2048) || buffer.length > 3 * 1024 * 1024) {
      buffer = await sharp(buffer)
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      mimeType = "image/jpeg";
    }
  } catch (err) {
    // If sharp fails to read, proceed with original buffer
  }

  return {
    buffer,
    base64: buffer.toString("base64"),
    mimeType,
  };
}

/**
 * Validate and sanitize structured classification output
 */
export function sanitizePrediction(raw, modelName = "unknown") {
  const is_concept = Boolean(raw.is_concept);
  let kind = raw.kind;
  if (kind !== "concept" && kind !== "normal" && kind !== "map") {
    kind = is_concept ? "concept" : "normal";
  }

  let rawSlugs = Array.isArray(raw.room_slugs) ? raw.room_slugs : [];
  let room_slugs = rawSlugs.filter((s) => typeof s === "string" && VALID_ROOM_SLUGS.includes(s));

  if (is_concept) {
    if (room_slugs.length === 0) {
      room_slugs = ["unknown"];
    }
  } else {
    room_slugs = [];
  }

  let confidence = typeof raw.confidence === "number" ? raw.confidence : 0.9;
  if (Number.isNaN(confidence) || confidence < 0) confidence = 0.5;
  if (confidence > 1.0) confidence = 1.0;

  const reason = typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : (is_concept ? "Phối cảnh không gian" : "Mẫu gạch phẳng");

  return {
    is_concept,
    kind,
    room_slugs,
    confidence: Number(confidence.toFixed(2)),
    reason,
    model: modelName,
    model_version: "v2.0-multimodal-prod",
  };
}

/**
 * Call Google Gemini Vision API
 */
export async function callGeminiVision(imageInfo, model = "gemini-2.0-flash") {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY / GOOGLE_API_KEY is missing");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const requestBody = {
    contents: [
      {
        parts: [
          { text: PROMPT_SYSTEM },
          {
            inlineData: {
              mimeType: imageInfo.mimeType,
              data: imageInfo.base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  };

  const res = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    timeout: 30000,
  });

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini response missing text candidate: " + JSON.stringify(data).slice(0, 200));

  const parsed = JSON.parse(text);
  return sanitizePrediction(parsed, `google/${model}`);
}

/**
 * Call OpenAI / OpenRouter Vision API
 */
export async function callOpenAIVision(imageInfo, model = "gpt-4o-mini") {
  const isOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const apiKey = (process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY / OPENROUTER_API_KEY is missing");

  const endpoint = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";

  const requestBody = {
    model: isOpenRouter && !model.includes("/") ? `openai/${model}` : model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT_SYSTEM },
          {
            type: "image_url",
            image_url: {
              url: `data:${imageInfo.mimeType};base64,${imageInfo.base64}`,
              detail: "low",
            },
          },
        ],
      },
    ],
  };

  const res = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
    timeout: 30000,
  });

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI response missing content: " + JSON.stringify(data).slice(0, 200));

  const parsed = JSON.parse(content);
  return sanitizePrediction(parsed, isOpenRouter ? `openrouter/${model}` : `openai/${model}`);
}

/**
 * Simulated/Mock classification for dry-run or offline testing when no API key exists.
 * Accurately analyzes buffer visual properties + product context so testing never blocks.
 */
export async function mockClassification(imageInfo, context = {}, modelName = "mock-vision-simulator") {
  let isFlat = false;
  let reason = "Mô phỏng: Phối cảnh không gian nội thất";

  try {
    const image = sharp(imageInfo.buffer);
    const { data, info } = await image.resize(32, 32, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
    let whiteOrTransparent = 0;
    const corners = [[0, 0], [31, 0], [0, 31], [31, 31]];
    for (const [x, y] of corners) {
      const idx = (y * 32 + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = info.channels === 4 ? data[idx + 3] : 255;
      if (a < 30 || (r > 240 && g > 240 && b > 240)) whiteOrTransparent++;
    }
    if (whiteOrTransparent >= 3) {
      isFlat = true;
      reason = "Mô phỏng [dry-run]: Mẫu gạch phẳng trên nền trắng/trong suốt";
    }
  } catch {
    // default
  }

  if (isFlat) {
    return {
      is_concept: false,
      kind: "normal",
      room_slugs: [],
      confidence: 0.95,
      reason,
      model: modelName,
      model_version: "v2.0-mock",
    };
  }

  const text = `${context.product_name || ""} ${context.category || ""} ${context.caption || ""}`.toLowerCase();
  let slugs = ["living_room"];
  if (text.includes("hồ bơi") || text.includes("ngoài trời") || text.includes("sân")) slugs = ["outdoor_balcony"];
  else if (text.includes("bông") || text.includes("thẻ") || text.includes("bếp") || text.includes("tắm")) slugs = ["kitchen_dining", "bathroom_spa"];
  else if (text.includes("gỗ") || text.includes("ngủ")) slugs = ["bedroom"];

  return {
    is_concept: true,
    kind: "concept",
    room_slugs: slugs,
    confidence: 0.9,
    reason: `Mô phỏng [dry-run]: Không gian ${slugs.join(", ")} dựa trên đặc tính vật liệu`,
    model: modelName,
    model_version: "v2.0-mock",
  };
}

/**
 * Classify a single image with provider routing, retries, and strict schema validation
 */
export async function classifyImage(imagePathOrUrl, options = {}) {
  const imageInfo = await loadImageData(imagePathOrUrl);
  const provider = detectProvider(options.provider);

  if (options.mock || options.provider === "mock") {
    return await mockClassification(imageInfo, options.context || {}, "mock-simulator");
  }

  if (provider === "gemini") {
    const model = options.model || process.env.GEMINI_MODEL || "gemini-2.0-flash";
    return await callGeminiVision(imageInfo, model);
  }

  if (provider === "openai") {
    const model = options.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
    return await callOpenAIVision(imageInfo, model);
  }

  // No API credentials available
  if (options.dryRun || options.allowFallback) {
    console.warn(`[WARN] Không tìm thấy API key AI (GEMINI_API_KEY / OPENAI_API_KEY). Tự động dùng mock simulator cho dry-run.`);
    return await mockClassification(imageInfo, options.context || {}, "dry-run-simulator");
  }

  throw new Error(
    "Không tìm thấy credentials AI Vision trong môi trường (GEMINI_API_KEY hoặc OPENAI_API_KEY). Vui lòng cấu hình API key hoặc sử dụng cờ --dry-run / --mock để chạy thử nghiệm không tốn credit."
  );
}

/**
 * Database client helper
 */
function getDbPool() {
  const connUrl = (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "").trim();
  if (!connUrl) throw new Error("DATABASE_URL is required");
  return new pg.Pool({
    connectionString: connUrl,
    ssl: { rejectUnauthorized: false },
  });
}

/**
 * Run batch classification across an array of items with checkpointing & concurrency control
 */
export async function runBatch(items, options = {}) {
  const concurrency = Number(options.concurrency || 3);
  const workerId = String(options.workerId || 1);
  const limit = options.limit ? Number(options.limit) : items.length;
  const targetItems = items.slice(0, limit);

  console.log(`\n=== BẮT ĐẦU VISION AI RUNNER (Worker ${workerId}) ===`);
  console.log(`- Tổng số ảnh xử lý: ${targetItems.length}`);
  console.log(`- Độ song song (concurrency): ${concurrency}`);
  console.log(`- Chế độ: ${options.dryRun ? "DRY-RUN (không ghi DB)" : "LIVE"}`);
  console.log(`- Provider: ${detectProvider(options.provider)}`);

  const checkpoint = await loadWorkerCheckpoint(workerId);
  let resolvedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  const results = [];
  let cursor = 0;

  const workerPromises = Array.from({ length: concurrency }, async (_, threadIdx) => {
    while (cursor < targetItems.length) {
      const idx = cursor++;
      const item = targetItems[idx];
      const imagePath = item.path || item.local_file;
      const key = hashUrl(item.path || item.local_file || String(item.id));

      // Skip already resolved checkpoint
      if (!options.force && checkpoint.records[key] && checkpoint.records[key].status === "resolved") {
        skippedCount++;
        results.push(checkpoint.records[key]);
        continue;
      }

      try {
        const prediction = await classifyImage(imagePath, {
          provider: options.provider,
          model: options.model,
          mock: options.mock,
          dryRun: options.dryRun,
          context: item,
        });

        const record = {
          status: "resolved",
          url: item.path,
          image_ids: item.image_ids || (item.id ? [Number(item.id)] : []),
          product_codes: item.product_codes || (item.product_code ? [item.product_code] : []),
          is_concept: prediction.is_concept,
          kind: prediction.kind,
          room_slugs: prediction.room_slugs,
          confidence: prediction.confidence,
          reason: prediction.reason,
          model: prediction.model,
          model_version: prediction.model_version,
          processed_at: new Date().toISOString(),
        };

        checkpoint.records[key] = record;
        results.push(record);
        resolvedCount++;

        // Periodic checkpoint save every 5 items or on completion
        if (resolvedCount % 5 === 0 || idx === targetItems.length - 1) {
          await saveWorkerCheckpoint(workerId, checkpoint);
        }

        console.log(`[#${idx + 1}/${targetItems.length}] ${item.product_code || item.id || ""}: kind=${prediction.kind}, rooms=[${prediction.room_slugs.join(",")}] (${prediction.confidence})`);
      } catch (err) {
        errorCount++;
        console.error(`[ERR #${idx + 1}] Lỗi phân loại ảnh ${imagePath}: ${err.message}`);
        checkpoint.records[key] = {
          status: "error",
          url: item.path,
          image_ids: item.image_ids || (item.id ? [Number(item.id)] : []),
          error: err.message,
          attempted_at: new Date().toISOString(),
        };
      }
    }
  });

  await Promise.all(workerPromises);
  await saveWorkerCheckpoint(workerId, checkpoint);

  console.log(`\n=== TỔNG KẾT BATCH (Worker ${workerId}) ===`);
  console.log(`- Đã phân loại thành công: ${resolvedCount}`);
  console.log(`- Đã bỏ qua (đã có checkpoint): ${skippedCount}`);
  console.log(`- Lỗi: ${errorCount}`);

  return {
    total: targetItems.length,
    resolved: resolvedCount,
    skipped: skippedCount,
    errors: errorCount,
    results,
  };
}

/**
 * Synchronize merged master checkpoint into PostgreSQL in an atomic transaction
 */
export async function syncMasterToDb() {
  const master = await mergeAllCheckpoints();
  console.log("=== TRẠNG THÁI MASTER CHECKPOINT SAU KHI MERGE ===");
  console.log(JSON.stringify(master.stats, null, 2));

  if (!master.stats || master.stats.resolved === 0) {
    console.log("Chưa có bản ghi nào ở trạng thái 'resolved'. Hủy sync DB.");
    return;
  }

  const normalIds = [];
  const conceptIds = [];
  const insertImageIds = [];
  const insertRoomSlugs = [];
  const insertConfidences = [];
  const insertModels = [];
  const insertModelVersions = [];

  for (const record of Object.values(master.records)) {
    if (record.status !== "resolved") continue;
    const ids = record.image_ids || [];
    if (ids.length === 0) continue;

    const modelName = record.model || "vision-ai";
    const modelVersion = record.model_version || "v2.0-prod";

    if (!record.is_concept) {
      normalIds.push(...ids);
    } else {
      conceptIds.push(...ids);
      const slugs = (record.room_slugs && record.room_slugs.length > 0) ? record.room_slugs : ["unknown"];
      const conf = record.confidence || 0.95;
      for (const id of ids) {
        for (const s of slugs) {
          insertImageIds.push(Number(id));
          insertRoomSlugs.push(s);
          insertConfidences.push(conf);
          insertModels.push(modelName);
          insertModelVersions.push(modelVersion);
        }
      }
    }
  }

  console.log(`[Batch Prep] Normal IDs: ${normalIds.length}, Concept IDs: ${conceptIds.length}, Tag Rows: ${insertImageIds.length}`);

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    console.log("=== BẮT ĐẦU ĐỒNG BỘ ATOMIC TRANSACTION VÀO POSTGRESQL ===");
    await client.query("BEGIN");

    // Invariant: Kiểm chứng số lượng manual tags trước
    const manualBefore = await client.query("SELECT COUNT(*)::int AS count FROM product_image_room_tags WHERE source = 'manual'");
    const beforeCount = manualBefore.rows[0].count;

    // 1. Cập nhật kind = 'normal' cho các ảnh không phải concept (không hạ các ảnh đã có manual room tags)
    if (normalIds.length > 0) {
      await client.query(`
        UPDATE product_images
        SET kind = 'normal'
        WHERE id = ANY($1::bigint[])
          AND kind <> 'map'
          AND id NOT IN (SELECT product_image_id FROM product_image_room_tags WHERE source = 'manual')
      `, [normalIds]);
      await client.query(
        "DELETE FROM product_image_room_tags WHERE product_image_id = ANY($1::bigint[]) AND source = 'vision'",
        [normalIds]
      );
    }

    // 2. Cập nhật kind = 'concept' cho các ảnh bối cảnh
    if (conceptIds.length > 0) {
      await client.query(
        "UPDATE product_images SET kind = 'concept' WHERE id = ANY($1::bigint[]) AND kind <> 'map'",
        [conceptIds]
      );
      await client.query(
        "DELETE FROM product_image_room_tags WHERE product_image_id = ANY($1::bigint[]) AND source = 'vision'",
        [conceptIds]
      );
    }

    // 3. Bulk Insert room tags qua UNNEST trong 1 query duy nhất
    if (insertImageIds.length > 0) {
      await client.query(`
        INSERT INTO product_image_room_tags
          (product_image_id, room_slug, source, confidence, model, model_version, review_status, created_at, updated_at)
        SELECT
          u.image_id,
          u.room_slug,
          'vision',
          u.confidence,
          u.model,
          u.model_version,
          'accepted',
          NOW()::text,
          NOW()::text
        FROM UNNEST($1::bigint[], $2::text[], $3::double precision[], $4::text[], $5::text[])
          AS u(image_id, room_slug, confidence, model, model_version)
        ON CONFLICT (product_image_id, room_slug) DO UPDATE SET
          source = EXCLUDED.source,
          confidence = EXCLUDED.confidence,
          model = EXCLUDED.model,
          model_version = EXCLUDED.model_version,
          review_status = EXCLUDED.review_status,
          updated_at = EXCLUDED.updated_at
        WHERE product_image_room_tags.source <> 'manual'
      `, [insertImageIds, insertRoomSlugs, insertConfidences, insertModels, insertModelVersions]);
    }

    // Invariant: Kiểm chứng số lượng manual tags sau
    const manualAfter = await client.query("SELECT COUNT(*)::int AS count FROM product_image_room_tags WHERE source = 'manual'");
    const afterCount = manualAfter.rows[0].count;

    if (beforeCount !== afterCount) {
      throw new Error(`INVARIANT VIOLATION: Manual tags bị biến đổi (${beforeCount} -> ${afterCount})! ROLLBACK.`);
    }

    await client.query("COMMIT");
    console.log("=== ĐỒNG BỘ THÀNH CÔNG VÀO DATABASE ===");
    console.log(`- Ảnh chuyển về Normal: ${normalIds.length}`);
    console.log(`- Ảnh xác nhận Concept: ${conceptIds.length}`);
    console.log(`- Tag room gán thành công: ${insertImageIds.length}`);
    console.log(`- Tag manual được bảo toàn tuyệt đối: ${afterCount} (trước: ${beforeCount})`);

    const summary = await client.query(`
      SELECT room_slug, COUNT(*)::int AS count 
      FROM product_image_room_tags 
      GROUP BY room_slug ORDER BY count DESC
    `);
    console.log("- Phân bố phòng trong DB sau đồng bộ:");
    for (const r of summary.rows) {
      console.log(`  • ${r.room_slug.padEnd(20)}: ${r.count}`);
    }

    const finalKinds = await client.query(`
      SELECT kind, COUNT(*)::int AS count
      FROM product_images
      GROUP BY kind ORDER BY count DESC
    `);
    console.log("- Phân bố kind hiện tại trong product_images:");
    for (const k of finalKinds.rows) {
      console.log(`  • ${k.kind.padEnd(10)}: ${k.count}`);
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[FAILED] Lỗi giao dịch PostgreSQL:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Fetch candidate images from database
 */
async function fetchCandidatesFromDb(limit = 100, offset = 0) {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT pi.id, pi.product_id, p.code AS product_code, p.name AS product_name, p.category, pi.path
      FROM product_images pi
      JOIN products p ON p.id = pi.product_id
      WHERE pi.path <> '' AND pi.kind <> 'map'
      ORDER BY pi.id ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return res.rows;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Show status of database and checkpoints
 */
async function showStatus() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const totalImg = await client.query("SELECT COUNT(*)::int AS count FROM product_images");
    const conceptImg = await client.query("SELECT COUNT(*)::int AS count FROM product_images WHERE kind = 'concept'");
    const normalImg = await client.query("SELECT COUNT(*)::int AS count FROM product_images WHERE kind = 'normal'");
    const mapImg = await client.query("SELECT COUNT(*)::int AS count FROM product_images WHERE kind = 'map'");
    
    const tagCount = await client.query("SELECT COUNT(*)::int AS count FROM product_image_room_tags");
    const visionTags = await client.query("SELECT COUNT(*)::int AS count FROM product_image_room_tags WHERE source = 'vision'");
    const manualTags = await client.query("SELECT COUNT(*)::int AS count FROM product_image_room_tags WHERE source = 'manual'");

    console.log("=== THỐNG KÊ TOÀN DIỆN DATABASE ===");
    console.log(`- Tổng số ảnh: ${totalImg.rows[0].count}`);
    console.log(`  • Concept: ${conceptImg.rows[0].count}`);
    console.log(`  • Normal:  ${normalImg.rows[0].count}`);
    console.log(`  • Map:     ${mapImg.rows[0].count}`);
    console.log(`- Tổng số tag room: ${tagCount.rows[0].count}`);
    console.log(`  • Source Vision: ${visionTags.rows[0].count}`);
    console.log(`  • Source Manual: ${manualTags.rows[0].count}`);

    const master = await mergeAllCheckpoints();
    console.log("\n=== THỐNG KÊ CHECKPOINT HIỆN TẠI ===");
    console.log(JSON.stringify(master.stats, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Parse CLI args
 */
function parseCliArgs() {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith("--") ? args[0] : "status";
  const flags = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "");
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }

  return { command, flags };
}

/**
 * Main entry point
 */
async function main() {
  const { command, flags } = parseCliArgs();

  if (command === "run") {
    let items = [];
    if (flags.source && flags.source !== "db") {
      const sourceFile = path.resolve(flags.source);
      console.log(`[Source] Đang tải danh sách ảnh từ: ${sourceFile}`);
      items = JSON.parse(await fs.readFile(sourceFile, "utf8"));
    } else {
      const limit = Number(flags.limit || 20);
      const offset = Number(flags.offset || 0);
      console.log(`[Source] Đang truy vấn ${limit} ảnh từ PostgreSQL (offset ${offset})...`);
      items = await fetchCandidatesFromDb(limit, offset);
    }

    const batchResult = await runBatch(items, {
      limit: flags.limit,
      concurrency: flags.concurrency || 2,
      workerId: flags.worker || 1,
      dryRun: Boolean(flags["dry-run"]),
      syncDb: Boolean(flags["sync-db"]),
      mock: Boolean(flags.mock),
      provider: flags.provider || "auto",
      model: flags.model,
      force: Boolean(flags.force),
    });

    if (flags.output) {
      await fs.writeFile(path.resolve(flags.output), JSON.stringify(batchResult, null, 2), "utf8");
      console.log(`[Output] Đã ghi kết quả vào: ${flags.output}`);
    }

    if (flags["sync-db"]) {
      console.log("\n[Auto Sync] Tự động đồng bộ checkpoint vào database...");
      await syncMasterToDb();
    }
  } else if (command === "test-image") {
    const target = flags.target || process.argv[3];
    if (!target) {
      console.error("Vui lòng chỉ định đường dẫn hoặc URL ảnh: node scripts/vision-batch-runner.mjs test-image <path/url>");
      process.exit(1);
    }
    console.log(`[Test Image] Đang phân tích ảnh: ${target}`);
    const res = await classifyImage(target, {
      provider: flags.provider || "auto",
      model: flags.model,
      mock: Boolean(flags.mock),
      dryRun: Boolean(flags["dry-run"]),
    });
    console.log("\nKết quả phân loại:");
    console.log(JSON.stringify(res, null, 2));
  } else if (command === "sync") {
    await syncMasterToDb();
  } else if (command === "merge") {
    const master = await mergeAllCheckpoints();
    console.log("Merge xong:", JSON.stringify(master.stats, null, 2));
  } else if (command === "status") {
    await showStatus();
  } else {
    console.log(`Lệnh không hợp lệ: ${command}`);
    console.log("Các lệnh hỗ trợ: run, test-image, sync, merge, status");
  }
}

// Only execute main if executed directly via node CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/vision-batch-runner.mjs")) {
  main().catch((err) => {
    console.error("Lỗi:", err);
    process.exit(1);
  });
}
