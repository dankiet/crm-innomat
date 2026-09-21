import { test } from "node:test";
import assert from "node:assert/strict";
import {
  basisToDiscountType,
  effectiveDiscountPct,
  estimateLineProfitInfo,
  unitPriceForProduct,
} from "./pricing.ts";
import type { DiscountType, MappingPriceBasis } from "./types.ts";

type PriceInput = {
  retail_price: number | string | null;
  trade_price: number | null;
  b2b_price: number | null;
  discount_tp: number | null;
  discount_b2b: number | null;
};

const base: PriceInput = {
  retail_price: 100000,
  trade_price: null,
  b2b_price: null,
  discount_tp: null,
  discount_b2b: null,
};

function price(p: Partial<PriceInput> = {}, dt: DiscountType = "none", customPct?: number | null) {
  return unitPriceForProduct(
    { ...base, ...p } as Parameters<typeof unitPriceForProduct>[0],
    dt,
    customPct,
  );
}

test("basisToDiscountType: tp→tp, b2b→b2b, retail→none", () => {
  assert.equal(basisToDiscountType("tp" as MappingPriceBasis), "tp");
  assert.equal(basisToDiscountType("b2b" as MappingPriceBasis), "b2b");
  assert.equal(basisToDiscountType("retail" as MappingPriceBasis), "none");
});

test("unitPriceForProduct: none → giá lẻ", () => {
  assert.equal(price(), 100000);
});

test("unitPriceForProduct: tp ưu tiên trade_price đã lưu", () => {
  assert.equal(price({ trade_price: 85000 }, "tp"), 85000);
});

test("unitPriceForProduct: tp fallback theo discount_tp (%), làm tròn", () => {
  assert.equal(price({ discount_tp: 10 }, "tp"), 90000);
  assert.equal(price({ discount_tp: 25.5 }, "tp"), Math.round(100000 * 0.745));
});

test("unitPriceForProduct: b2b ưu tiên b2b_price, fallback discount_b2b", () => {
  assert.equal(price({ b2b_price: 78000 }, "b2b"), 78000);
  assert.equal(price({ discount_b2b: 20 }, "b2b"), 80000);
});

test("unitPriceForProduct: custom theo %, mặc định không chiết khấu", () => {
  assert.equal(price({}, "custom", 15), 85000);
  assert.equal(price({}, "custom", null), 100000);
});

test("unitPriceForProduct: retail từ chuỗi DB (tự Number)", () => {
  assert.equal(price({ retail_price: "99999" }), 99999);
});

test("effectiveDiscountPct: làm tròn 2 chữ số, retail<=0 → 0", () => {
  assert.equal(effectiveDiscountPct(100000, 90000), 10);
  assert.equal(effectiveDiscountPct(100000, 50000), 50);
  assert.equal(effectiveDiscountPct(0, 0), 0);
  assert.equal(effectiveDiscountPct(-5, 0), 0);
});

test("estimateLineProfitInfo: lợi nhuận = (giá bán − vốn) × m², pct theo doanh thu", () => {
  const r = estimateLineProfitInfo(100000, 10, 80000, true);
  assert.deepEqual(r, { amount: 200000, pct: 20 });
});

test("estimateLineProfitInfo: includeVat=false → giá bán quy về +VAT trước", () => {
  const r = estimateLineProfitInfo(100000, 10, 80000, false);
  const saleUnit = Math.round(100000 * 1.08); // 108000
  assert.deepEqual(r, {
    amount: (saleUnit - 80000) * 10,
    pct: (((saleUnit - 80000) * 10) / (saleUnit * 10)) * 100,
  });
});

test("estimateLineProfitInfo: null khi thiếu giá vốn hoặc số lượng", () => {
  assert.equal(estimateLineProfitInfo(100000, 10, null, true), null);
  assert.equal(estimateLineProfitInfo(100000, 10, 0, true), null);
  assert.equal(estimateLineProfitInfo(100000, 10, -1, true), null);
  assert.equal(estimateLineProfitInfo(100000, 0, 80000, true), null);
});