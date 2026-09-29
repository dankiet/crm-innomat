/**
 * Dọn file đính kèm brief mồ côi.
 *
 * Vì sao cần: endpoint upload là CÔNG KHAI và không đăng nhập. Khách xin token
 * rồi bỏ ngang, hoặc chọn file rồi không bấm Gửi, đều để lại object trên bucket
 * mà không lead nào trỏ tới. Không dọn thì bucket phình theo traffic rác.
 *
 * Chỉ xoá row ở trạng thái 'pending' / 'uploaded' — row 'claimed' thuộc về một
 * lead thật, xoá nhầm là mất file của khách.
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
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const HOURS = argValue("--hours", 24);
const LIMIT = argValue("--limit", 500);

const bucket = (process.env.SUPABASE_BRIEF_BUCKET ?? "crm-brief-files").replace(/\/+$/, "");
const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const dbUrl = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();

if (!dbUrl) {
  console.error("Missing DATABASE_URL (hoặc DATABASE_URL_UNPOOLED).");
  process.exit(1);
}

const cutoff = new Date(Date.now() - HOURS * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 19)
  .replace("T", " ");

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

  console.log(
    `[sweep] xoá ${removedObjects} object + ${removedRows} row (quá ${HOURS}h)` +
      (failed ? ` · ${failed} lỗi (giữ lại để thử lại)` : ""),
  );
} catch (err) {
  console.error("[sweep] FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
