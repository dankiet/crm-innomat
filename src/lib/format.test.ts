import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, formatVND, formatVNDShort, nowLocal } from "./format.ts";

test("formatVND: dấu chấm nghìn + hậu tố đ", () => {
  assert.equal(formatVND(0), "0đ");
  assert.equal(formatVND(1000000), "1.000.000đ");
  assert.equal(formatVND(1234567890), "1.234.567.890đ");
});

test("formatVNDShort: tỷ / tr / giữ nguyên dưới triệu", () => {
  assert.equal(formatVNDShort(2_000_000_000), "2 tỷ");
  assert.equal(formatVNDShort(1_500_000_000), "1.5 tỷ");
  assert.equal(formatVNDShort(2_350_000), "2tr");
  assert.equal(formatVNDShort(950_000), "950.000đ");
});

test("escapeHtml: thoát 5 ký tự HTML", () => {
  assert.equal(
    escapeHtml(`<a href="x" title='q'>&`),
    `&lt;a href=&quot;x&quot; title=&#039;q&#039;&gt;&amp;`,
  );
});

test("escapeHtml: null/undefined → rỗng", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(0), "0");
});

test("nowLocal: đúng dạng YYYY-MM-DD HH:mm:ss", () => {
  assert.match(nowLocal(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});