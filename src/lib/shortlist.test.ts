import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeShortlistIds,
  shortlistIdsAsStrings,
  SHORTLIST_MAX_RESOLVE,
} from "./shortlist.ts";

test("normalizeShortlistIds: id canonical string → numeric", () => {
  const r = normalizeShortlistIds(["12", "250", "999"]);
  assert.deepEqual(r.numeric, [12, 250, 999]);
  assert.deepEqual(r.invalid, []);
});

test("normalizeShortlistIds: mock-id/giá trị lạ → invalid (KHÔNG map heuristic)", () => {
  const r = normalizeShortlistIds(["m1", "m2", "abc", "", "１２"]);
  assert.deepEqual(r.numeric, []);
  assert.equal(r.invalid.length, 4); // m1, m2, abc, １２ (số full-width không phải int thường)
});

test("normalizeShortlistIds: dedupe giữ thứ tự", () => {
  const r = normalizeShortlistIds(["5", "5", "3", "3", "3", "7"]);
  assert.deepEqual(r.numeric, [5, 3, 7]);
});

test("normalizeShortlistIds: chấp nhận +số và bỏ id ≤ 0", () => {
  const r = normalizeShortlistIds(["0", "-3", "1.5", "42"]);
  assert.deepEqual(r.numeric, [42]);
  assert.equal(r.invalid.length, 3);
});

test("normalizeShortlistIds: cap dung lượng", () => {
  const big = Array.from({ length: SHORTLIST_MAX_RESOLVE + 50 }, (_, i) => String(i + 1));
  const r = normalizeShortlistIds(big);
  assert.equal(r.numeric.length, SHORTLIST_MAX_RESOLVE);
});

test("shortlistIdsAsStrings: chuẩn hoá dạng lưu + dedupe", () => {
  assert.deepEqual(shortlistIdsAsStrings([12, "250", 12, " 8 ", ""]), ["12", "250", "8"]);
});

test("canonical round-trip: String(products.id) qua normalize", () => {
  const r = normalizeShortlistIds(["250"]);
  assert.equal(r.numeric[0], 250);
  // resolver map ngược: String(250) === id gốc
  assert.equal(String(r.numeric[0]), "250");
});
