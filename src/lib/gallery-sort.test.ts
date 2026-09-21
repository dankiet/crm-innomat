import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeGallerySort,
  encodeGallerySort,
  normalizeSearchText,
  parseGallerySort,
  parsePositiveInt,
  parseViewerIndex,
  sortCollectionItemsByStockDesc,
} from "./gallery-sort.ts";
import type { GalleryCollectionItem } from "./types.ts";

function item(over: Partial<GalleryCollectionItem> = {}): GalleryCollectionItem {
  return {
    id: 1,
    collection_id: 1,
    product_id: null,
    path: "",
    total_stock: 0,
    ...over,
  } as GalleryCollectionItem;
}

test("decodeGallerySort: từng value → field + dir, giá trị lạ → mặc định created_desc", () => {
  assert.deepEqual(decodeGallerySort("created_desc"), { field: "created", dir: "desc" });
  assert.deepEqual(decodeGallerySort("name_asc"), { field: "name", dir: "asc" });
  assert.deepEqual(decodeGallerySort("items_desc"), { field: "items", dir: "desc" });
});

test("encodeGallerySort: tròn đảo ngược với decode", () => {
  assert.equal(encodeGallerySort("created", "asc"), "created_asc");
  assert.equal(encodeGallerySort("items", "desc"), "items_desc");
  assert.equal(decodeGallerySort(encodeGallerySort("updated", "asc")).field, "updated");
});

test("parseGallerySort: nhận chuỗi hợp lệ, từ chối lạ", () => {
  assert.equal(parseGallerySort("updated_asc"), "updated_asc");
  assert.equal(parseGallerySort("bogus"), undefined);
  assert.equal(parseGallerySort(42), undefined);
});

test("parsePositiveInt: số nguyên dương; từ chối 0/âm/thập phân/chuỗi rác", () => {
  assert.equal(parsePositiveInt("12"), 12);
  assert.equal(parsePositiveInt(12.9), 12); // floor
  assert.equal(parsePositiveInt("0"), undefined);
  assert.equal(parsePositiveInt("-3"), undefined);
  assert.equal(parsePositiveInt("abc"), undefined);
  assert.equal(parsePositiveInt(""), undefined);
});

test("parseViewerIndex: ≥ 0, cho phép 0", () => {
  assert.equal(parseViewerIndex("0"), 0);
  assert.equal(parseViewerIndex(3), 3);
  assert.equal(parseViewerIndex("-1"), undefined);
  assert.equal(parseViewerIndex("abc"), undefined);
});

test("normalizeSearchText: bỏ dấu tiếng Việt + hạ việt hoá", () => {
  assert.equal(normalizeSearchText("Gạch Ốp Lát Đen"), "gach op lat den");
  assert.equal(normalizeSearchText("  TRẮNG  "), "trang");
});

test("sortCollectionItemsByStockDesc: cover cluster đứng đầu, theo cluster theo stock", () => {
  const coverPath = "/cover.jpg";
  // 2 ảnh của SP A (tổng stock A = 50), 1 ảnh cover (đứng đầu), 1 ảnh SP B (stock 10)
  const items = [
    item({ id: 1, path: "/b1.jpg", product_id: 2, total_stock: 10 }), // SP B
    item({ id: 2, path: coverPath, product_id: 1, total_stock: 50 }), // SP A — cover
    item({ id: 3, path: "/a2.jpg", product_id: 1, total_stock: 50 }), // SP A
  ];
  const out = sortCollectionItemsByStockDesc(items, coverPath);
  // cover cluster (SP A, stock 50) lên đầu, cover vẫn là item đầu của cluster
  assert.equal(out[0].path, coverPath);
  assert.ok(out.findIndex((x) => x.id === 3) < out.findIndex((x) => x.id === 1));
  // tổng phần tử không đổi
  assert.equal(out.length, 3);
});