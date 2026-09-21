import { test } from "node:test";
import assert from "node:assert/strict";
import { getPageNumbers } from "./pagination.ts";

test("getPageNumbers: ≤7 trang thì liệt kê đủ", () => {
  assert.deepEqual(getPageNumbers(1, 5), [1, 2, 3, 4, 5]);
});

test("getPageNumbers: cố định trang đầu + cuối, nhóm quanh trang hiện tại", () => {
  assert.deepEqual(getPageNumbers(30, 153), [1, "...", 29, 30, 31, "...", 153]);
});

test("getPageNumbers: trang đầu — cửa sổ [2..2] nên không liệt kê 3", () => {
  assert.deepEqual(getPageNumbers(1, 50), [1, 2, "...", 50]);
  assert.deepEqual(getPageNumbers(50, 50), [1, "...", 49, 50]);
});