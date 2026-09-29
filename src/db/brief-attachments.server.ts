/**
 * File đính kèm brief — nghiệp vụ (server).
 *
 * Luồng đầy đủ:
 *
 *   1. `startBriefUpload`  — cấp token + signed URL. Chỉ cấp token, CHƯA có file.
 *   2. browser PUT thẳng lên bucket riêng tư (không qua server app).
 *   3. `verifyBriefUpload` — đọc magic bytes, chốt định dạng thật, đánh dấu
 *      'uploaded'. Đây là bước DUY NHẤT quyết định file có hợp lệ không.
 *   4. `claimBriefUploads` — khi lead được ghi, gắn token vào lead.
 *
 * Vì sao tách bước 3 khỏi bước 4: khách cần biết NGAY file của mình bị từ chối
 * (sai định dạng / quá lớn) để chọn file khác, chứ không phải bấm Gửi rồi mới
 * nhận lỗi. Ngoài ra nhờ vậy lúc ghi lead không phải đọc storage nữa.
 *
 * Bất biến: mọi object trên bucket đều có row tương ứng, và row 'pending'/
 * 'uploaded' quá hạn bị sweep xoá (xem `scripts/lp-attachments-sweep.mjs`).
 */
import { getDb, type SqlValue } from "./index.server";
import { nowUtc } from "@/lib/format";
import {
  BRIEF_FILE_MAX_BYTES,
  BRIEF_FILE_MAX_COUNT,
  BRIEF_MIME_BY_KIND,
  detectBriefFileKind,
  kindFromDeclaredMime,
  sanitizeBriefFileName,
  type BriefFileKind,
} from "@/lib/brief-files";
import {
  briefObjectExists,
  briefObjectSize,
  createBriefUploadUrl,
  deleteBriefObject,
  newAttachmentToken,
  readBriefObjectBytes,
  readBriefObjectHead,
  writeBriefObjectLocal,
} from "@/lib/brief-storage.server";

/** Số token tối đa cấp cho một IP trong một cửa sổ — chặn dò / lạm dụng. */
const UPLOAD_TOKENS_PER_WINDOW = 12;
/** Cửa sổ cấp token (phút). Ngắn hơn lead (10 phút) vì đây là thao tác nặng. */
const UPLOAD_WINDOW_MINUTES = 60;

type StartResult =
  | { ok: true; token: string; uploadUrl: string }
  | { ok: false; error: string };

/**
 * Cấp token + signed URL để browser tải một file lên.
 *
 * KHÔNG kiểm tra định dạng ở đây: lúc này chưa có file. Header `Content-Type`
 * do client khai chỉ dùng làm cửa chặn đầu (tránh upload rác cho khách); phán
 * quyết thật nằm ở `verifyBriefUpload`.
 */
export async function startBriefUpload(input: {
  declaredMime: string;
  fileName: string;
  ipHash: string;
}): Promise<StartResult> {
  const kind = kindFromDeclaredMime(input.declaredMime);
  if (!kind) {
    return {
      ok: false,
      error: "Chỉ nhận file PDF, PNG, JPG hoặc WEBP.",
    };
  }

  const db = getDb();

  // Trần số token mỗi IP: cấp token rồi bỏ ngang là cách rẻ nhất để lấp đầy
  // bucket, nên giới hạn ở đây chứ không đợi tới lúc ghi lead.
  const since = new Date(Date.now() - UPLOAD_WINDOW_MINUTES * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const recent = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM lp_lead_attachments
        WHERE ip_hash = ? AND created_at > ?`,
    )
    .get<{ n: number }>(input.ipHash, since);
  if ((recent?.n ?? 0) >= UPLOAD_TOKENS_PER_WINDOW) {
    return {
      ok: false,
      error: "Bạn đã tải lên khá nhiều file. Vui lòng thử lại sau hoặc gửi qua Zalo.",
    };
  }

  const token = newAttachmentToken();
  const created = await createBriefUploadUrl(token);
  if ("error" in created) {
    return { ok: false, error: "Không tạo được phiên tải lên. Vui lòng thử lại." };
  }

  await db
    .prepare(
      `INSERT INTO lp_lead_attachments
         (token, status, file_name, mime_type, file_size, kind, ip_hash, created_at)
       VALUES (?, 'pending', ?, '', 0, ?, ?, ?)`,
    )
    .run(
      token,
      sanitizeBriefFileName(input.fileName) as SqlValue,
      kind as SqlValue,
      input.ipHash as SqlValue,
      nowUtc() as SqlValue,
    );

  return { ok: true, token, uploadUrl: created.uploadUrl };
}

type VerifyResult =
  | { ok: true; token: string; fileName: string; size: number }
  | { ok: false; error: string };

/**
 * Xác thực file đã tải lên: đọc magic bytes và chốt định dạng THẬT.
 *
 * Object nào không đạt sẽ bị XOÁ ngay — không để lại rác trong bucket. Đây là
 * lá chắn chính chống stored XSS: đã kiểm chứng bucket chỉ tin header client
 * khai, nên một file SVG gắn nhãn `application/pdf` vẫn lọt qua tầng bucket.
 */
export async function verifyBriefUpload(input: {
  token: string;
  ipHash: string;
}): Promise<VerifyResult> {
  const db = getDb();
  const row = await db
    .prepare(
      `SELECT token, status, ip_hash, file_name FROM lp_lead_attachments WHERE token = ?`,
    )
    .get<{ token: string; status: string; ip_hash: string; file_name: string }>(input.token);

  if (!row) return { ok: false, error: "Phiên tải lên không tồn tại." };
  // Chỉ chủ phiên mới xác thực được token của mình.
  if (row.ip_hash !== input.ipHash) return { ok: false, error: "Phiên tải lên không hợp lệ." };
  if (row.status !== "pending") return { ok: false, error: "Phiên tải lên đã được xử lý." };

  const fail = async (error: string): Promise<VerifyResult> => {
    await deleteBriefObject(input.token);
    await db.prepare(`DELETE FROM lp_lead_attachments WHERE token = ?`).run(input.token);
    return { ok: false, error };
  };

  if (!(await briefObjectExists(input.token))) {
    return await fail("Không tìm thấy file đã tải lên.");
  }

  const size = await briefObjectSize(input.token);
  if (size === null) return await fail("Không đọc được file đã tải lên.");
  if (size > BRIEF_FILE_MAX_BYTES) {
    return await fail("File vượt quá 10MB.");
  }

  // 12 byte đủ cho mọi định dạng trong danh sách trắng (WEBP cần tới byte 12).
  const head = await readBriefObjectHead(input.token, 12);
  if (!head) return await fail("Không đọc được file đã tải lên.");

  const kind = detectBriefFileKind(head);
  if (!kind) {
    return await fail("File không đúng định dạng PDF, PNG, JPG hoặc WEBP.");
  }

  const mimeType = BRIEF_MIME_BY_KIND[kind];
  await db
    .prepare(
      `UPDATE lp_lead_attachments
          SET status = 'uploaded', mime_type = ?, file_size = ?, kind = ?, verified_at = ?
        WHERE token = ?`,
    )
    .run(
      mimeType as SqlValue,
      size as SqlValue,
      kind as SqlValue,
      nowUtc() as SqlValue,
      input.token as SqlValue,
    );

  return { ok: true, token: input.token, fileName: row.file_name || input.token, size };
}

/**
 * Gắn các token đã xác thực vào lead vừa ghi. Trả về nhãn tên file để lưu vào
 * `lp_leads.attachment_names` (cột đó chỉ là nhãn hiển thị, không phải nơi lưu file).
 *
 * Token lạ / chưa xác thực / của người khác bị BỎ QUA im lặng: khách gửi lead
 * vẫn phải thành công, cùng lắm là mất phần đính kèm — không được để mất lead.
 */
export async function claimBriefUploads(input: {
  tokens: string[];
  leadId: number;
  ipHash: string;
}): Promise<string[]> {
  const db = getDb();
  const labels: string[] = [];
  const tokens = [...new Set(input.tokens)].slice(0, BRIEF_FILE_MAX_COUNT);

  for (const token of tokens) {
    const row = await db
      .prepare(
        `SELECT file_name FROM lp_lead_attachments
          WHERE token = ? AND status = 'uploaded' AND ip_hash = ?`,
      )
      .get<{ file_name: string }>(token, input.ipHash);
    if (!row) continue;

    await db
      .prepare(
        `UPDATE lp_lead_attachments
            SET lead_id = ?, status = 'claimed', claimed_at = ?
          WHERE token = ? AND status = 'uploaded'`,
      )
      .run(input.leadId as SqlValue, nowUtc() as SqlValue, token as SqlValue);

    labels.push(row.file_name || token);
  }

  return labels;
}

/** File đã gắn vào một lead, kèm kind để client biết hiển thị icon gì. */
export type LeadAttachment = {
  token: string;
  file_name: string;
  mime_type: string;
  kind: BriefFileKind;
  file_size: number;
};

/** Danh sách file của một lead (CRM đọc để hiện link tải). */
export async function listLeadAttachments(leadId: number): Promise<LeadAttachment[]> {
  const db = getDb();
  const rows = await db
    .prepare(
      `SELECT token, file_name, mime_type, kind, file_size
         FROM lp_lead_attachments
        WHERE lead_id = ? AND status = 'claimed'
        ORDER BY id`,
    )
    .all<LeadAttachment>(leadId);
  return rows;
}

/** Một token thuộc về lead nào — dùng để chặn tải chéo lead. */
export async function attachmentLeadId(token: string): Promise<number | null> {
  const db = getDb();
  const row = await db
    .prepare(
      `SELECT lead_id FROM lp_lead_attachments
        WHERE token = ? AND status = 'claimed'`,
    )
    .get<{ lead_id: number | null }>(token);
  return row?.lead_id ?? null;
}

/**
 * Row mồ côi: 'pending' (khách xin token rồi bỏ) hoặc 'uploaded' (khách chọn
 * file rồi không bấm Gửi). Quá hạn thì xoá cả object lẫn row.
 */
export async function listStaleAttachments(
  olderThanIso: string,
  limit: number,
): Promise<Array<{ token: string }>> {
  const db = getDb();
  return await db
    .prepare(
      `SELECT token FROM lp_lead_attachments
        WHERE status IN ('pending', 'uploaded') AND created_at < ?
        ORDER BY id
        LIMIT ?`,
    )
    .all<{ token: string }>(olderThanIso, limit);
}

/** Xoá row attachment (sau khi object đã xoá hoặc xác nhận không còn). */
export async function deleteAttachmentRow(token: string): Promise<void> {
  const db = getDb();
  await db.prepare(`DELETE FROM lp_lead_attachments WHERE token = ?`).run(token);
}

/** Xoá object của một attachment. Trả `true` khi object đã không còn. */
export async function deleteAttachmentObject(token: string): Promise<boolean> {
  return await deleteBriefObject(token);
}

// ─── Local mode (dev, thiếu cấu hình Supabase) ───────────────
//
// Production không dùng các hàm dưới đây: browser PUT thẳng lên Supabase qua
// signed URL, nên bytes không bao giờ đi qua server app.

/** Token còn 'pending' — điều kiện để route local nhận một lần PUT. */
export async function getPendingUploadToken(token: string): Promise<boolean> {
  const db = getDb();
  const row = await db
    .prepare(`SELECT status FROM lp_lead_attachments WHERE token = ?`)
    .get<{ status: string }>(token);
  return row?.status === "pending";
}

/** Ghi bytes vào thư mục local (chỉ dev). */
export async function writeLocalBriefBytes(
  token: string,
  bytes: Uint8Array,
): Promise<boolean> {
  return await writeBriefObjectLocal(token, bytes);
}

/** Đọc bytes từ thư mục local (chỉ dev). */
export async function readLocalBriefBytes(token: string): Promise<Uint8Array | null> {
  return await readBriefObjectBytes(token);
}
