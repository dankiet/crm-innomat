/**
 * Tests cho nhận dạng file đính kèm brief.
 *
 * Trọng tâm là `detectBriefFileKind`: đây là lá chắn DUY NHẤT chống stored XSS.
 * Hai lớp ngoài (bucket `allowed_mime_types`, thuộc tính `accept` của input)
 * đều chỉ đọc header do client khai — đã kiểm chứng thực tế rằng đẩy bytes SVG
 * kèm header `application/pdf` vẫn lọt qua bucket. Nên bộ test này khoá đúng
 * hành vi: định dạng suy từ NỘI DUNG, và SVG/HTML phải bị từ chối.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectBriefFileKind,
  kindFromDeclaredMime,
  sanitizeBriefFileName,
  BRIEF_FILE_MAX_BYTES,
} from "../lib/brief-files.ts";

/** Ghép magic bytes với phần đuôi tuỳ ý để dựng file giả. */
function bytes(...head: number[]): Uint8Array {
  return new Uint8Array([...head, ...new Array(20).fill(0)]);
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34);

test("detectBriefFileKind nhận đúng 4 định dạng trong danh sách trắng", () => {
  assert.equal(detectBriefFileKind(PNG), "png");
  assert.equal(detectBriefFileKind(JPEG), "jpeg");
  assert.equal(detectBriefFileKind(WEBP), "webp");
  assert.equal(detectBriefFileKind(PDF), "pdf");
});

test("detectBriefFileKind từ chối SVG — đây là stored XSS nếu lọt", () => {
  const svg = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'));
  assert.equal(detectBriefFileKind(svg), null);
  // Có cả kê khai XML ở đầu (biến thể hay gặp của file SVG thật).
  const svgWithProlog = new Uint8Array(Buffer.from('<?xml version="1.0"?><svg onload="x"/>'));
  assert.equal(detectBriefFileKind(svgWithProlog), null);
});

test("detectBriefFileKind từ chối HTML và định dạng ngoài danh sách", () => {
  assert.equal(detectBriefFileKind(new Uint8Array(Buffer.from("<html><body>hi</body></html>"))), null);
  assert.equal(detectBriefFileKind(new Uint8Array(Buffer.from("GIF89a"))), null);
  assert.equal(detectBriefFileKind(new Uint8Array(Buffer.from("PK\u0003\u0004"))), null); // zip/docx
});

test("detectBriefFileKind không nhận file rỗng hoặc quá ngắn", () => {
  assert.equal(detectBriefFileKind(new Uint8Array(0)), null);
  assert.equal(detectBriefFileKind(new Uint8Array([0x25, 0x50, 0x44])), null);
  // "%PDF" thiếu dấu gạch nối không phải PDF hợp lệ.
  assert.equal(detectBriefFileKind(new Uint8Array([0x25, 0x50, 0x44, 0x46])), null);
});

test("detectBriefFileKind cần đủ 12 byte mới nhận WEBP", () => {
  // "RIFF" + 4 byte độ dài nhưng thiếu nhãn "WEBP" — không được nhận bừa.
  assert.equal(detectBriefFileKind(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0)), null);
  // RIFF của WAV/AVI cũng bắt đầu bằng RIFF, không được nhận thành WEBP.
  assert.equal(detectBriefFileKind(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45)), null);
});

test("kindFromDeclaredMime chỉ nhận MIME trong danh sách trắng", () => {
  assert.equal(kindFromDeclaredMime("image/png"), "png");
  assert.equal(kindFromDeclaredMime("IMAGE/JPEG"), "jpeg");
  assert.equal(kindFromDeclaredMime("image/jpg"), "jpeg");
  assert.equal(kindFromDeclaredMime("application/pdf"), "pdf");
  // SVG và wildcard phải bị chặn ở cửa đầu.
  assert.equal(kindFromDeclaredMime("image/svg+xml"), null);
  assert.equal(kindFromDeclaredMime("image/*"), null);
  assert.equal(kindFromDeclaredMime(""), null);
});

test("sanitizeBriefFileName chặn path traversal và giữ tên tiếng Việt", () => {
  assert.equal(sanitizeBriefFileName("../../etc/passwd"), "etc-passwd");
  assert.equal(sanitizeBriefFileName("a\\b\\c.pdf"), "a-b-c.pdf");
  assert.equal(sanitizeBriefFileName("Mặt bằng tầng 2.pdf"), "Mặt bằng tầng 2.pdf");
  // Ký tự điều khiển bị bỏ, không được lọt vào header HTTP.
  assert.equal(sanitizeBriefFileName("a\u0000b\u001fc.pdf"), "abc.pdf");
  assert.equal(sanitizeBriefFileName(""), "file-dinh-kem");
  assert.equal(sanitizeBriefFileName("   "), "file-dinh-kem");
  assert.equal(sanitizeBriefFileName("..."), "file-dinh-kem");
});

test("sanitizeBriefFileName cắt độ dài để không phình header", () => {
  const long = "x".repeat(500) + ".pdf";
  assert.equal(sanitizeBriefFileName(long).length, 120);
});

test("trần dung lượng là 10MB — khớp file_size_limit của bucket", () => {
  assert.equal(BRIEF_FILE_MAX_BYTES, 10 * 1024 * 1024);
});
