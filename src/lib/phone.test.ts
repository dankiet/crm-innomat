import { test } from "node:test";
import assert from "node:assert/strict";
import { isPhoneMatchable, normalizePhone, phonesMatch } from "./phone.ts";

test("normalizePhone: bỏ khoảng trắng/gạch/dấu chấm", () => {
  assert.equal(normalizePhone("0911 084-668"), "0911084668");
  assert.equal(normalizePhone("091.108.4668"), "0911084668");
});

test("normalizePhone: +84 / 84 → 0xxx", () => {
  assert.equal(normalizePhone("+84911084668"), "0911084668");
  assert.equal(normalizePhone("84911084668"), "0911084668");
});

test("normalizePhone: 9 số thiếu 0 đầu → thêm 0", () => {
  assert.equal(normalizePhone("911084668"), "0911084668");
});

test("normalizePhone: 00 (double-zero typo) → 0", () => {
  assert.equal(normalizePhone("00911084668"), "0911084668");
});

test("normalizePhone: rỗng / không chứa chữ số → ''", () => {
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone("  "), "");
  assert.equal(normalizePhone("abc - !!"), "");
});

test("isPhoneMatchable: ≥9 chữ số mới coi là matchable", () => {
  assert.equal(isPhoneMatchable("0911084668"), true);
  assert.equal(isPhoneMatchable("911084668"), true); // 9 số nhưng normalize về 10
  assert.equal(isPhoneMatchable("123"), false);
  assert.equal(isPhoneMatchable(""), false);
});

test("phonesMatch: khác định dạng nhưng cùng số → true", () => {
  assert.equal(phonesMatch("0911 084 668", "0911084668"), true);
  assert.equal(phonesMatch("0911084668", "+84911084668"), true);
});

test("phonesMatch: khác số → false; thiếu ngắn → false", () => {
  assert.equal(phonesMatch("0911084668", "0911084669"), false);
  assert.equal(phonesMatch("0911084668", "12"), false);
});