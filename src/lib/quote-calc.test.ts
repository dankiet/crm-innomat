import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDiscountType,
  calcUnit,
  ceilTiles,
  formatSqm,
  parseQuantityInput,
  sanitizeQuantityInput,
  tileAreaM2,
} from "./quote-calc.ts";
import type { Line } from "./quote-calc.ts";
import type { Product } from "./types.ts";

/** Product tối thiểu chứa đúng các field mà quote-calc đọc. */
function mkProduct(over: Partial<Product> = {}): Product {
  return {
    id: 1,
    code: "TEST",
    name: "Test",
    category: "",
    size: "",
    material: "",
    surface: "",
    shape: "",
    texture: "",
    color: "",
    supplier: "",
    collections: "",
    unit: "",
    area_per_tile_m2: null,
    retail_price: 0,
    trade_price: null,
    b2b_price: null,
    discount_tp: null,
    discount_b2b: null,
    is_hot: 0,
    ...over,
  } as Product;
}

test("sanitizeQuantityInput: giữ chữ số + 1 dấu thập phân, nhận phẩy VN", () => {
  assert.equal(sanitizeQuantityInput("0,12"), "0.12");
  assert.equal(sanitizeQuantityInput("5.4"), "5.4");
  assert.equal(sanitizeQuantityInput("5.4.2"), "5.42"); // dấu thập phân thứ 2 nối vào
  assert.equal(sanitizeQuantityInput("abc12x"), "12");
  assert.equal(sanitizeQuantityInput(""), "");
});

test("parseQuantityInput: rỗng/không hợp lệ/âm → 0", () => {
  assert.equal(parseQuantityInput(""), 0);
  assert.equal(parseQuantityInput("12.5"), 12.5);
  assert.equal(parseQuantityInput("abc"), 0);
  assert.equal(parseQuantityInput("-3"), 0);
});

test("tileAreaM2: ưu tiên area_per_tile_m2", () => {
  assert.equal(tileAreaM2(mkProduct({ area_per_tile_m2: 0.18, size: "300x600" })), 0.18);
});

test("tileAreaM2: parse từ size WxH (mm), không có cột diện tích", () => {
  assert.equal(tileAreaM2(mkProduct({ size: "300x600" })), 0.18);
});

test("tileAreaM2: mosaic nhiều cỡ lấy cặp LỚN NHẤT", () => {
  const v = tileAreaM2(mkProduct({ size: "85x85/256x273" }));
  assert.ok(v !== null && Math.abs(v - (256 * 273) / 1_000_000) < 1e-9);
});

test("tileAreaM2: không xác định được → null", () => {
  assert.equal(tileAreaM2(mkProduct({ size: "" })), null);
  assert.equal(tileAreaM2(mkProduct({ size: "chữ không có số" })), null);
});

test("ceilTiles: tròn LÊN, trừ epsilon chống float noise", () => {
  assert.equal(ceilTiles(5.4, 0.18), 30); // 30.000000000000004 → 30
  assert.equal(ceilTiles(1, 0.18), 6); // 5.555… → 6
  assert.equal(ceilTiles(0, 0.18), null);
  assert.equal(ceilTiles(5.4, 0), null);
});

test("formatSqm: tối đa 2 chữ số thập phân, dấu phẩy VN", () => {
  assert.equal(formatSqm(0.18), "0,18");
  assert.equal(formatSqm(5), "5");
  assert.equal(formatSqm(Number.NaN), "0");
});

test("calcUnit: custom → truyền %; tp/b2b/none → không truyền custom", () => {
  const p = mkProduct({ retail_price: 100000, discount_tp: 10, discount_b2b: 20 });
  assert.equal(calcUnit(p, "none", 10), 100000);
  assert.equal(calcUnit(p, "tp", 30), 90000); // ưu tiên discount_tp trên sản phẩm
  assert.equal(calcUnit(p, "custom", 15), 85000);
});

test("applyDiscountType: cập nhật discount_pct + unit_price theo nhóm", () => {
  const lines: Line[] = [
    {
      key: "l1",
      collapsed: false,
      product: mkProduct({ retail_price: 100000, discount_tp: 10, discount_b2b: 20 }),
      product_code: "T1",
      product_name: "",
      size: "",
      material: "",
      quantity_raw: "1",
      quantity_m2: 1,
      discount_pct: 0,
      unit_price: 100000,
      area: "",
    },
  ];
  const out = applyDiscountType("tp", lines);
  assert.equal(out[0].discount_pct, 10);
  assert.equal(out[0].unit_price, 90000);
  // dòng không có product bị giữ nguyên
  const noProd = applyDiscountType("tp", [{ ...lines[0], product: null }]);
  assert.equal(noProd[0].discount_pct, 0);
});