/**
 * File đính kèm brief — hằng số + nhận dạng định dạng, dùng chung client/server.
 *
 * Vì sao phải có module này: LP là bề mặt CÔNG KHAI, ai cũng POST được. Hai lớp
 * chặn đã dựng ở hạ tầng (`allowed_mime_types` của bucket, `accept` của input)
 * đều chỉ đọc **header do client khai** — đã kiểm chứng thực tế: đẩy bytes SVG
 * kèm header `application/pdf` thì bucket nhận. Nên định dạng thật PHẢI suy từ
 * magic bytes, đọc lại từ storage, không tin bất cứ thứ gì client gửi kèm.
 *
 * Danh sách trắng hẹp có chủ đích: KHÔNG có `image/svg+xml`. SVG là XML chạy
 * được script — lưu rồi trả về cùng origin là stored XSS.
 */

/** Trần dung lượng mỗi file. Phải khớp `file_size_limit` của bucket. */
export const BRIEF_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** Số file tối đa mỗi brief. Phải khớp `.slice(0, 4)` khi ghi `attachment_names`. */
export const BRIEF_FILE_MAX_COUNT = 4;

/** Định dạng được nhận — khoá nội bộ, không phải MIME. */
export type BriefFileKind = "png" | "jpeg" | "webp" | "pdf";

/** MIME suy từ kind (dùng khi trả file về, KHÔNG dùng để tin client). */
export const BRIEF_MIME_BY_KIND: Record<BriefFileKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
};

/** `accept` cho `<input type="file">` — chỉ gợi ý cho người dùng, không phải bảo vệ. */
export const BRIEF_FILE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,.pdf";

/** MIME client khai → kind. Dùng làm cửa chặn đầu; magic bytes mới là phán quyết. */
const KIND_BY_DECLARED_MIME: Record<string, BriefFileKind> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Client khai MIME này có nằm trong danh sách trắng không. */
export function kindFromDeclaredMime(mime: string): BriefFileKind | null {
  return KIND_BY_DECLARED_MIME[(mime ?? "").trim().toLowerCase()] ?? null;
}

/**
 * Suy định dạng THẬT từ magic bytes. Trả `null` nếu không khớp định dạng nào
 * được nhận — caller phải coi `null` là từ chối và xoá object.
 *
 * Cần tối thiểu 12 byte để nhận WEBP (khối RIFF ở đầu, nhãn `WEBP` ở offset 8).
 */
export function detectBriefFileKind(bytes: Uint8Array | Buffer): BriefFileKind | null {
  const b = bytes;
  if (b.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b.length >= 8 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return "png";
  }

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";

  // WEBP: "RIFF" + 4 byte độ dài + "WEBP"
  if (b.length >= 12) {
    const riff =
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46; // RIFF
    const webp =
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50; // WEBP
    if (riff && webp) return "webp";
  }

  // PDF: "%PDF-"
  if (
    b[0] === 0x25 &&
    b[1] === 0x50 &&
    b[2] === 0x44 &&
    b[3] === 0x46 &&
    b.length >= 5 &&
    b[4] === 0x2d
  ) {
    return "pdf";
  }

  return null;
}

/**
 * Tên file an toàn để hiển thị / đặt trong `Content-Disposition`.
 *
 * Bỏ mọi ký tự điều khiển và dấu phân cách đường dẫn, chặn `..`, và cắt độ dài.
 * Giữ dấu tiếng Việt (khách hay đặt tên "Mặt bằng tầng 2.pdf").
 */
export function sanitizeBriefFileName(raw: string): string {
  const cleaned = (raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    // `..` còn sót sau khi bỏ dấu phân cách (vd "a/../b" → "a-..-b"). Không còn
    // nguy hiểm khi đã hết `/`, nhưng để lại thì gây nhầm lẫn khi đọc log.
    .replace(/\.{2,}/g, "-")
    .replace(/^[-.\s]+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || "file-dinh-kem";
}
