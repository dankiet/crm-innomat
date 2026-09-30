/**
 * Dọn file đính kèm brief mồ côi — hai loại:
 *
 *  1. **Row mồ côi** — 'pending' (khách xin token rồi bỏ) hoặc 'uploaded' (khách
 *     chọn file rồi không bấm Gửi) quá hạn. Xoá cả object lẫn row.
 *  2. **Object mồ côi** — object nằm trên bucket mà KHÔNG còn row nào trỏ tới.
 *     Loại này sinh ra khi xoá lead lúc row bị cascade trước khi object kịp xoá,
 *     hoặc khi xoá object thất bại giữa đường. Không quét thì rác tồn tại vĩnh
 *     viễn vì không ai còn biết token.
 *
 * Row 'claimed' thuộc về một lead thật → KHÔNG bao giờ bị đụng tới.
 *
 * Run: npm run lp:attachments-sweep [-- --hours 24 --limit 500]
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StorageClient } from "@supabase/storage-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
}

loadDotEnvFile(path.join(root, ".env"));
loadDotEnvFile(path.join(root, ".env.local"));

/** Tuổi tối thiểu (giờ) trước khi coi là mồ côi. Mặc định 24h. */
function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  // Cho phép 0: hữu ích khi muốn dọn ngay (kiểm thử, hoặc xử lý sự cố).
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const HOURS = argValue("--hours", 24);
const LIMIT = argValue("--limit", 500);
/** `--dry-run`: chỉ in ra sẽ xoá gì, KHÔNG xoá thật. */
const DRY_RUN = process.argv.includes("--dry-run");

const bucket = (process.env.SUPABASE_BRIEF_BUCKET ?? "crm-brief-files").replace(/\/+$/, "");
const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const dbUrl = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();

if (!dbUrl) {
  console.error("Missing DATABASE_URL (hoặc DATABASE_URL_UNPOOLED).");
  process.exit(1);
}

// Dạng SQL (so với `created_at` trong DB, không có 'T').
const cutoff = new Date(Date.now() - HOURS * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 19)
  .replace("T", " ");

// Dạng ISO đầy đủ — `list()` của Storage trả `created_at` kiểu ISO 8601 có 'T'
// và 'Z', nên so chuỗi với dạng SQL sẽ sai. Cắt ở 19 ký tự để so cùng độ dài.
const cutoffIso = new Date(Date.now() - HOURS * 60 * 60 * 1000).toISOString().slice(0, 19);

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
let removedObjects = 0;
let removedRows = 0;
let failed = 0;

try {
  await client.connect();

  const { rows } = await client.query(
    `SELECT token, status FROM lp_lead_attachments
      WHERE status IN ('pending', 'uploaded') AND created_at < $1
      ORDER BY id
      LIMIT $2`,
    [cutoff, LIMIT],
  );

  if (rows.length === 0) {
    console.log(`[sweep] không có file mồ côi quá ${HOURS}h.`);
  }

  const storage =
    url && key
      ? new StorageClient(`${url}/storage/v1`, {
          apikey: key,
          Authorization: `Bearer ${key}`,
        })
      : null;

  for (const row of rows) {
    if (DRY_RUN) {
      console.log(`[dry-run] sẽ xoá row+object: ${row.token} (${row.status})`);
      removedObjects += 1;
      removedRows += 1;
      continue;
    }

    // Xoá object TRƯỚC, row sau: nếu object xoá lỗi thì row còn lại để lần sau
    // thử tiếp. Ngược lại sẽ để object mồ côi vĩnh viễn không ai biết.
    let objectGone = true;
    if (storage) {
      const { error } = await storage.from(bucket).remove([row.token]);
      if (error) {
        console.error(`[sweep] xoá object ${row.token} lỗi: ${error.message}`);
        objectGone = false;
      }
    } else {
      // Local mode: file nằm ngoài webroot ở .local-brief-files/
      const file = path.join(root, ".local-brief-files", row.token);
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch (err) {
        console.error(`[sweep] xoá local ${row.token} lỗi:`, err.message);
        objectGone = false;
      }
    }

    if (!objectGone) {
      failed += 1;
      continue;
    }

    await client.query(`DELETE FROM lp_lead_attachments WHERE token = $1`, [row.token]);
    removedObjects += 1;
    removedRows += 1;
  }

  // ── Lượt 2: object không còn row nào trỏ tới ──
  // Sinh ra khi row bị xoá cascade (xoá lead) trước khi object kịp xoá, hoặc khi
  // lần xoá object trước đó thất bại. Không có row nghĩa là không ai còn biết
  // token, nên chỉ có thể phát hiện bằng cách liệt kê bucket rồi đối chiếu.
  //
  // Ba chốt an toàn, vì lượt này XOÁ THEO SUY ĐOÁN — sai một bước là mất file
  // thật của khách:
  //   1. `list()` KHÔNG đệ quy: trả cả thư mục (`id === null`) lẫn file. Phải tự
  //      đi xuống, và chỉ coi entry có `id` là file thật.
  //   2. Grace period: chỉ xét object cũ hơn cutoff. Object vừa upload mà row
  //      chưa insert xong vẫn "không có row" — xoá ngay là phá file đang lên.
  //   3. DB tra lỗi → BỎ QUA toàn bộ lượt, không xoá gì. Không biết chắc thì
  //      không được xoá.
  let orphanObjects = 0;
  if (storage) {
    /** Đi đệ quy, chỉ lấy file thật (entry có `id`), bỏ qua thư mục. */
    const walk = async (prefix) => {
      const files = [];
      const { data, error } = await storage.from(bucket).list(prefix, { limit: 1000 });
      if (error) return { error };
      for (const entry of data ?? []) {
        const full = `${prefix}/${entry.name}`;
        if (entry.id) {
          files.push({ path: full, createdAt: entry.created_at ?? "" });
          continue;
        }
        const nested = await walk(full);
        if (nested.error) return { error: nested.error };
        files.push(...(nested.files ?? []));
      }
      return { files };
    };

    const listed = await walk("brief");
    if (listed.error) {
      console.error(`[sweep] liệt kê bucket lỗi: ${listed.error.message}`);
    } else {
      // Grace period: bỏ qua object mới hơn cutoff.
      const candidates = (listed.files ?? []).filter((f) => f.createdAt && f.createdAt < cutoffIso);
      const skippedFresh = (listed.files ?? []).length - candidates.length;

      // In rõ số lượng để lượt này QUAN SÁT ĐƯỢC: "báo 0" phải phân biệt được với
      // "không quét tới nơi". Không có dòng này thì một `walk` hỏng cũng im lặng.
      console.log(
        `[sweep] lượt object: thấy ${(listed.files ?? []).length} file trên bucket, ` +
          `${candidates.length} đủ tuổi, ${skippedFresh} còn mới.`,
      );

      if (candidates.length > 0) {
        let knownRows;
        try {
          const res = await client.query(
            `SELECT token FROM lp_lead_attachments WHERE token = ANY($1)`,
            [candidates.map((c) => c.path)],
          );
          knownRows = res.rows;
        } catch (err) {
          // Không tra được DB thì KHÔNG xoá gì — thà để rác lại còn hơn xoá nhầm.
          console.error(`[sweep] tra DB lỗi, bỏ qua lượt object: ${err.message}`);
          knownRows = null;
        }

        if (knownRows) {
          const knownSet = new Set(knownRows.map((r) => r.token));
          for (const cand of candidates) {
            if (knownSet.has(cand.path)) continue;
            if (DRY_RUN) {
              console.log(`[dry-run] sẽ xoá object mồ côi: ${cand.path}`);
              orphanObjects += 1;
              continue;
            }
            const { error: delErr } = await storage.from(bucket).remove([cand.path]);
            if (delErr) {
              console.error(`[sweep] xoá object mồ côi ${cand.path} lỗi: ${delErr.message}`);
              failed += 1;
              continue;
            }
            orphanObjects += 1;
            console.log(`[sweep] đã xoá object mồ côi: ${cand.path}`);
          }
        }
      }

      if (skippedFresh > 0) {
        console.log(`[sweep] bỏ qua ${skippedFresh} object mới hơn ${HOURS}h (đang trong phiên khách).`);
      }
    }
  }

  console.log(
    `[sweep] xoá ${removedObjects} object + ${removedRows} row (quá ${HOURS}h)` +
      (orphanObjects ? ` · thêm ${orphanObjects} object mồ côi (không có row)` : "") +
      (failed ? ` · ${failed} lỗi (giữ lại để thử lại)` : ""),
  );
} catch (err) {
  console.error("[sweep] FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
