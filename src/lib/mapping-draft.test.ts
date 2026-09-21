import { test } from "node:test";
import assert from "node:assert/strict";
import { autoPriceFor, blankDraft, key } from "./mapping-draft.ts";

test("key: id duy nhất, không rỗng", () => {
  assert.ok(key().length > 0);
  assert.notEqual(key(), key());
});

test("blankDraft: dòng trắng với 2 key khác nhau", () => {
  const d = blankDraft();
  assert.equal(d.collapsed, false);
  assert.equal(d.product, null);
  assert.equal(d.priceOverride, "");
  assert.notEqual(d.key, d.areaGroupKey);
});

test("autoPriceFor: chưa chọn sản phẩm → 0", () => {
  assert.equal(autoPriceFor(blankDraft(), "retail"), 0);
});

test("autoPriceFor: theo căn cứ giá + nhóm chiết khấu", () => {
  const line = {
    ...blankDraft(),
    product: { retail_price: 100000, trade_price: null, b2b_price: null, discount_tp: 10, discount_b2b: null } as never,
  };
  assert.equal(autoPriceFor(line, "tp"), 90000);
  assert.equal(autoPriceFor(line, "retail"), 100000);
});

test("autoPriceFor: sản phẩm custom → parse số từ chuỗi", () => {
  const line = {
    ...blankDraft(),
    customProduct: {
      code: "X",
      name: "",
      size: "",
      surface: "",
      retailPrice: "120 000 đ",
      imagePath: "",
      imageDataUrl: null,
      imageName: "",
    },
  };
  assert.equal(autoPriceFor(line, "retail"), 120000);
});