import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildExactCodeSet,
  codeRowFromProduct,
  matchSearchTokens,
  splitSearchTokens,
} from "./product-search.ts";

const lower = (s: string) => s.toLowerCase();

test("splitSearchTokens: cắt theo khoảng trắng / phẩy / chấm phẩy", () => {
  assert.deepEqual(splitSearchTokens("a,b c", lower), ["a", "b", "c"]);
  assert.deepEqual(splitSearchTokens("A,B; C，D、E|F　G", lower), [
    "a", "b", "c", "d", "e", "f", "g",
  ]);
  assert.deepEqual(splitSearchTokens("", lower), []);
});

test("codeRowFromProduct: tách mã chính + danh sách mã phụ", () => {
  assert.deepEqual(codeRowFromProduct("IN2013LM", "IN2013LM-HN, IN2013LM-2", lower), {
    code: "in2013lm",
    codes: ["in2013lm-hn", "in2013lm-2"],
  });
  assert.deepEqual(codeRowFromProduct("X", null, lower), { code: "x", codes: [] });
});

test("buildExactCodeSet: gom toàn bộ mã chính + phụ", () => {
  const set = buildExactCodeSet([
    { code: "a", codes: ["a-1", "a-2"] },
    { code: "b", codes: [] },
  ]);
  assert.deepEqual([...set].sort(), ["a", "a-1", "a-2", "b"]);
});

test("matchSearchTokens: rỗng token → true (không lọc)", () => {
  assert.equal(
    matchSearchTokens({ code: "a", codes: [] }, [], "a sản phẩm", new Set(["a"])),
    true,
  );
});

test("matchSearchTokens: token là mã đầy đủ → so exact (không substring)", () => {
  const rows = { code: "in2013lm", codes: ["in2013lm-hn"] };
  const exact = new Set(["in2013lm", "in2013lm-hn"]);
  assert.equal(matchSearchTokens(rows, ["in2013lm"], "", exact), true);
  assert.equal(matchSearchTokens(rows, ["in2013lm-hn"], "", exact), true);
  // mã đầy đủ nhưng row khác → false dù searchable chứa chuỗi
  assert.equal(matchSearchTokens(rows, ["in2013lm-hn"], "chứa IN2013LM", exact), true);
  assert.equal(matchSearchTokens({ code: "x", codes: [] }, ["in2013lm"], "chứa in2013l", exact), false);
});

test("matchSearchTokens: token thường → substring trên searchable", () => {
  const exact = new Set<string>();
  assert.equal(
    matchSearchTokens({ code: "in2013lm", codes: [] }, ["đen"], "gạch đen mờ", exact),
    true,
  );
  assert.equal(
    matchSearchTokens({ code: "in2013lm", codes: [] }, ["đỏ"], "gạch đen mờ", exact),
    false,
  );
});