import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInternalCodesList } from "./product-internal-codes.ts";

test("parseInternalCodesList: chuẩn dấu phẩy, trim từng mã", () => {
  assert.deepEqual(parseInternalCodesList("F2115,F2115-HN,FG2115"), [
    "F2115",
    "F2115-HN",
    "FG2115",
  ]);
  assert.deepEqual(parseInternalCodesList(" A , B "), ["A", "B"]);
});

test("parseInternalCodesList: vẫn nhận | ; tab newline (file cũ)", () => {
  assert.deepEqual(parseInternalCodesList("A | B; C\nD\tE"), ["A", "B", "C", "D", "E"]);
});

test("parseInternalCodesList: unique case-insensitive, giữ casing lần đầu", () => {
  assert.deepEqual(parseInternalCodesList("f2115,F2115"), ["f2115"]);
  assert.deepEqual(parseInternalCodesList("A,a,B,b"), ["A", "B"]);
});

test("parseInternalCodesList: nhiều tham số + rỗng/null → bỏ", () => {
  assert.deepEqual(parseInternalCodesList("A", null, undefined, "", "B"), ["A", "B"]);
  assert.deepEqual(parseInternalCodesList(null, undefined), []);
  assert.deepEqual(parseInternalCodesList(""), []);
});