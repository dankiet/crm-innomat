/**
 * Production Vision Batch Checkpoint với kiến trúc Per-Worker & Deterministic Merger
 * Đảm bảo:
 *   1. Mỗi worker chỉ ghi vào file checkpoint riêng (checkpoint_worker_1.json, ...) -> KHÔNG CẠNH TRANH (no race condition).
 *   2. Chỉ bắt lỗi ENOENT khi file chưa tồn tại; nếu file bị corrupt/malformed JSON phải THROW ERROR ngay, tuyệt đối không reset ngầm làm mất dữ liệu.
 *   3. Module merge tổng hợp deterministically toàn bộ worker files và chỉ master process được ghi file checkpoint.json chính thức.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const DIR = path.resolve("tmp/vision-full");
const MAIN_CHECKPOINT_FILE = path.join(DIR, "checkpoint.json");

export function getWorkerCheckpointFile(workerId) {
  return path.join(DIR, `checkpoint_worker_${workerId}.json`);
}

export async function readJsonStrict(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    // Lỗi malformed JSON hoặc quyền đọc -> THROW NGAY, không reset ngầm!
    console.error(`[CRITICAL ERROR] File checkpoint bị hỏng hoặc lỗi định dạng: ${filePath}`);
    throw err;
  }
}

export async function loadWorkerCheckpoint(workerId) {
  const file = getWorkerCheckpointFile(workerId);
  const data = await readJsonStrict(file);
  if (!data) {
    return {
      worker_id: workerId,
      updated_at: new Date().toISOString(),
      records: {}
    };
  }
  return data;
}

export async function saveWorkerCheckpoint(workerId, data) {
  const file = getWorkerCheckpointFile(workerId);
  data.updated_at = new Date().toISOString();
  
  // Ghi atomic qua file tạm cùng thư mục
  const tmpFile = `${file}.tmp.${Date.now()}`;
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpFile, file);
}

export async function mergeAllCheckpoints() {
  await fs.mkdir(DIR, { recursive: true });
  
  // Đọc checkpoint master trước nếu có
  const master = (await readJsonStrict(MAIN_CHECKPOINT_FILE)) || {
    version: "v2.0-vision-advisor",
    updated_at: new Date().toISOString(),
    records: {}
  };

  // Quét toàn bộ file checkpoint worker trong DIR thay vì fix cứng 1..3
  try {
    const entries = await fs.readdir(DIR);
    const workerFiles = entries
      .filter(f => /^checkpoint_worker_.*\.json$/.test(f))
      .sort();
    for (const f of workerFiles) {
      const workerData = await readJsonStrict(path.join(DIR, f));
      if (workerData && workerData.records) {
        for (const [key, val] of Object.entries(workerData.records)) {
          // Deterministic merge: ưu tiên bản ghi có status 'resolved'
          if (!master.records[key] || master.records[key].status !== "resolved" || val.status === "resolved") {
            master.records[key] = val;
          }
        }
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  let resolved = 0, unresolved = 0, concept = 0, normal = 0;
  for (const r of Object.values(master.records)) {
    if (r.status === "resolved") {
      resolved++;
      if (r.is_concept) concept++; else normal++;
    } else {
      unresolved++;
    }
  }

  master.stats = {
    total: Object.keys(master.records).length,
    resolved,
    unresolved,
    concept,
    normal
  };
  master.updated_at = new Date().toISOString();

  // Ghi atomic vào main checkpoint
  const tmp = `${MAIN_CHECKPOINT_FILE}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(master, null, 2), "utf8");
  await fs.rename(tmp, MAIN_CHECKPOINT_FILE);

  return master;
}

export function hashUrl(url) {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
}
