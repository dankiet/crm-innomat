import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLANK_FILTER_VALUE,
  addFacetCount,
  compareProductCode,
  decodeProductSort,
  encodeProductSort,
  matchesFacet,
  parseCsv,
  parseSort,
  priceOf,
  toFacetOption,
} from "./product-facets.ts";

test("parseCsv: tách phẩy, trim, bỏ rỗng", () => {
  assert.deepEqual(parseCsv(" a , b ,c "), ["a", "b", "c"]);
  assert.deepEqual(parseCsv(""), []);
  assert.deepEqual(parseCsv(42), []);
  assert.deepEqual(parseCsv(" , "), []);
});

test("matchesFacet: rỗng → true; value trùng hoặc blank", () => {
  assert.equal(matchesFacet(new Set(), "x"), true);
  assert.equal(matchesFacet(new Set(["a"]), "a"), true);
  assert.equal(matchesFacet(new Set(["a"]), "b"), false);
  assert.equal(matchesFacet(new Set([BLANK_FILTER_VALUE]), ""), true);
  assert.equal(matchesFacet(new Set([BLANK_FILTER_VALUE]), "  "), true);
  assert.equal(matchesFacet(new Set([BLANK_FILTER_VALUE]), "x"), false);
});

test("addFacetCount + toFacetOption: đếm trùng, rỗng → Blank", () => {
  const map = new Map<string, number>();
  addFacetCount(map, "a");
  addFacetCount(map, "a");
  addFacetCount(map, null);
  assert.equal(map.get("a"), 2);
  assert.equal(map.get(BLANK_FILTER_VALUE), 1);
  assert.deepEqual(toFacetOption([BLANK_FILTER_VALUE, 1]), {
    value: BLANK_FILTER_VALUE,
    count: 1,
    label: "Blank",
  });
});

test("decodeProductSort: đảo với encode, mặc định default/asc", () => {
  assert.deepEqual(decodeProductSort("price_desc"), { field: "price", dir: "desc" });
  assert.deepEqual(decodeProductSort("hot_first"), { field: "hot", dir: "desc" });
  assert.equal(encodeProductSort("code", "desc"), "code_desc");
  assert.equal(encodeProductSort("hot", "asc"), "hot_first");
  const roundtrip = encodeProductSort(decodeProductSort("stock_asc").field, "asc");
  assert.equal(decodeProductSort(roundtrip).field, "stock");
});

test("parseSort: nhận chuỗi hợp lệ, từ chối lạ", () => {
  assert.equal(parseSort("name_desc"), "name_desc");
  assert.equal(parseSort("default"), "default");
  assert.equal(parseSort("bogus"), undefined);
});

test("compareProductCode: so mã số học, rồi id", () => {
  const a = { id: 1, code: "IN10" } as never;
  const b = { id: 2, code: "IN2" } as never;
  const c = { id: 3, code: "IN10" } as never;
  assert.ok(compareProductCode(a as never, b as never) > 0); // "IN10" > "IN2" numeric
  assert.ok(compareProductCode(a as never, c as never) < 0); // cùng mã → theo id
});

test("priceOf: giá lẻ, rỗng → 0", () => {
  assert.equal(priceOf({ retail_price: 100000 } as never), 100000);
  assert.equal(priceOf({ retail_price: null } as never), 0);
});