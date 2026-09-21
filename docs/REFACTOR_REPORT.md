REFACTOR REPORT
===============

Đợt refactor được duyệt (P1-0..P1-3, P2-1..P2-5) — thực hiện 2026-09-19 theo
[REFACTOR_ROADMAP](REFACTOR_ROADMAP.md).

APPROVED ITEMS
==============

P1-0 — DONE
Description:
  Dựng lưới test đầu tiên bằng `node --test` (Node 24 type-strips TS) —
  0 dependency mới. Thêm script `npm test`. Viết test cho 10 file test
  trong src/lib (pricing, phone, product-search, product-internal-codes,
  format, pagination, quote-calc, gallery-sort, product-facets, mapping-draft).

Files changed:
  package.json (+"test")
  + 10 file `src/lib/*.test.ts`

Result:
  `npm test` → **67 test pass, 0 fail**.
  Đáng chú ý: test đầu tiên bắt được giả định SAI của chính tôi về
  `getPageNumbers(1, 50)` — thực tế là `[1, 2, "...", 50]` (cửa sổ [2..2]).

P1-01 — DONE (rút hàm thuần khỏi file khổng lồ)
i.  NewQuoteDialog (1743 dòng) → `src/lib/quote-calc.ts`
    Line type + sanitizeQuantityInput, parseQuantityInput, tileAreaM2,
    ceilTiles, formatSqm, calcUnit, applyDiscountType. +10 test.
ii. /thu-vien (2699 → 2536) → `src/lib/gallery-sort.ts`
    Codec sort (decode/encode/parseGallerySort), parseInt parsers,
    normalizeSearchText/searchTokens, sortCollectionItemsByStockDesc.
    `GALLERY_SORT_FIELDS` giữ ở route (dùng type của components/SortMenu —
    lib không import components). +7 test.
iii. /san-pham (2225 → 2117) → `src/lib/product-facets.ts`
    parseCsv, FacetKey/BLANK_FILTER_VALUE/matchesFacet/addFacetCount/
    toFacetOption, ProductSort codec, compareProductCode, parseSort, priceOf.
    `PRODUCT_SORT_FIELDS` giữ ở route. +7 test.
iv. CustomerMappingDialog (1995 → 1946) → `src/lib/mapping-draft.ts`
    Draft/CustomProduct types + key/blankDraft/autoPriceFor.
    `basisLabel`/`PRICE_BASIS_OPTIONS`/`fileToDataUrl`/`move` GIỮ ở dialog —
    là glue UI-local, không phải domain. +4 test.

Result:
  3 route + 1 dialog nhỏ đi ~460 dòng tổng; các hàm này trở thành test được.
  Kiểm chứng: tsc 0, build PASS, smoke — dialog báo giá mở đúng, facet 599/68…
  giữ nguyên.

P1-02 — DONE (gộp facet engine)
/ui: `countFacet(rows, getter)` trong product-facets.ts; 4 memo
  (surface/texture/collection/supplier) còn 1 dòng mỗi cái.
  GIỮ nguyên color (tông + TONE_ORDER) và shape (sort alphabet) — là
  biến thể có chủ đích, không phải trùng lặp.
  Kiểm chứng: mở popover Nhà cung cấp, count y hệt trước refactor
  (Innomat 599, Hiệp Thủy 68, Á Châu 67, Kiệt Anh 54, Kim Hương 39).

P1-03 — DONE (tách crm.server)
/src/db/crm.server.ts 3205 → 2493 dòng. Tail 711 dòng (RECOVERED FUNCTIONS:
  product CRUD, flat media, bulk room-tag/kind) → `src/db/media.server.ts`.
  Export 2 helper dùng chung (loadProductImageRoomTags, normalizeRoomSlugs).
  Rewire 3 importer: api/functions.ts (6 dynamic + 1 type),
  product-import-export.server.ts (tách import), _app.luu-tru.tsx (type).
  0 chu trình (media → crm một chiều).

P2-01 — DONE (empty-state primitive)
`src/components/EmptyState.tsx`; 3 trang bare-empty (ghi-chu, leads, cong-no)
  chuyển sang. GIỮ: co-hoi (container card khác), thu-vien/luu-tru (icon/
  dashed), bao-gia `Empty` (có action) — biến thể thật.

P2-02 — DONE (luật error-signalling)
Đã ghi từ đợt trước trong CODE_ARCHITECTURE_GUIDE §11. Không sửa code.

P2-03 — DONE (trình sinh HTML ra khỏi tầng dữ liệu)
src/db/export-quote.server.ts (488) + export-mapping.server.ts (327)
  → `src/render/`. Sửa import tương đối (../db/*) + dynamic import trong
  api/functions.ts. Lưới import-protection vẫn phủ (pattern `**/*.server.*`).

P2-04 — DONE (đổi tên nowLocal → nowUtc)
9 file, 52 chỗ. Đổi TÊN, không đổi GIÁ TRỊ (hàm trả UTC). Việc sửa đúng múi
giờ (UTC+7) là đổi hành vi → để riêng, xem FOLLOW-UP.

P2-05 — DONE (registry localStorage key)
`src/lib/storage-keys.ts` — 8 key về một nơi. GIÁ TRỊ key giữ nguyên
(đổi = mất dữ liệu người dùng).

CHANGES
=======

Files added:
  src/lib/quote-calc.ts · gallery-sort.ts · product-facets.ts · mapping-draft.ts
  src/lib/storage-keys.ts · src/db/media.server.ts · src/components/EmptyState.tsx
  src/render/export-quote.server.ts · src/render/export-mapping.server.ts
  + 10 file test (*.test.ts)

Files modified:
  package.json · src/components/NewQuoteDialog.tsx · src/routes/_app.thu-vien.tsx
  src/routes/_app.san-pham.tsx · src/components/CustomerMappingDialog.tsx
  src/db/crm.server.ts · src/api/functions.ts
  src/db/product-import-export.server.ts · src/routes/_app.luu-tru.tsx
  src/routes/_app.ghi-chu.tsx · src/routes/_app.leads.tsx · src/routes/_app.cong-no.tsx
  src/routes/_app.co-hoi.tsx · src/routes/_app.khach-hang.index.tsx
  src/routes/_app.bao-gia.tsx · src/components/ExportQuoteDialog.tsx
  src/components/landing/useShortlistStorage.ts · src/lib/format.ts
  src/db/{auth,auth-public,crm,gallery,lp,media,users}.server.ts
  src/lib/format.test.ts

Files deleted: 0 (2 file đổi chỗ db → render)

Components moved: export-quote/export-mapping (db → render)
Components merged: 0 (P1-1 không merge component, chỉ tách hàm thuần)
Hooks changed: 0 (không tạo hook mới — không wrapper)

ARCHITECTURE IMPACT
===================

Before:
  routes → components → api → db(*) → driver → Postgres
  (*) db cũng chứa 815 dòng trình sinh HTML; crm.server.ts 3.205 dòng
  0 test tự động

After:
  routes → components → api → db/render → driver → Postgres
  crm.server 2.493 · media.server 722 (tách) · render/ đúng vai trò in ấn
  67 test (node --test) cho hàm thuần trong lib

Improvement:
  - file UI khổng lồ nhỏ đi ~460 dòng, phần logic test được
  - ranh giới tầng sạch hơn: render/ tách khỏi db
  - lưới test đầu tiên — nền cho mọi refactor lớn sau này

VALIDATION
==========

Lint:       FAIL — nền cũ (44.370/44.386 lỗi là CRLF trên Windows; file không
             bị đợt này chạm cũng cho 79 lỗi y hệt ở HEAD). Không chạy --fix.
Typecheck:  PASS — 0 lỗi (baseline cũ 29)
Tests:      PASS — 67/67 (node --test, 0 dependency mới)
Build:      PASS — vite build + nitro vercel + postbuild

OUT OF SCOPE FINDINGS
=====================

1. `SortDir` khai trùng ở 2 module lib mới (`gallery-sort.ts`, `product-facets.ts`),
   cùng union `"asc" | "desc"`. Nơi đúng là `src/lib/types.ts` (SortMenu cũng nên
   dùng chung) — nhưng đó là thay đổi lan toả (SortMenu + importers), ngoài scope
   item này. Gợi ý: lần sau khi chạm SortMenu hãy gộp.

2. `getPageNumbers(1, 50)` trả `[1, 2, "...", 50]` — cửa sổ trang 1 chỉ hiện 2 số.
   Đã khẳng định là HÀNH VI HIỆN TẠI (test đi kèm), nhưng nghi ngờ khoanh vùng
   `if (currentPage > 3)` + `start = max(2, page-1)` có thể không phải ý định gốc
   (kỳ vọng thông thường: `[1, 2, 3, "...", 50]`). Không sửa (đổi hành vi) —
   để bạn quyết.

3. `move()` và `fileToDataUrl()` trong CustomerMappingDialog là utility thuần
   dùng 1 nơi — không tách (rule: không tạo abstraction dùng 1 lần).
   Khi xuất hiện consumer thứ 2 thì gom vào lib.

4. `countFacet` KHÔNG áp cho color/shape của /san-pham — chúng có thứ tự riêng.
   Nếu sau này shape đổi sang sort theo count, chỉ cần bỏ 1 memo.

5. P2-6 (đưa filter /luu-tru + /khong-gian lên URL) — CHƯA làm: là thay đổi HÀNH VI
   (URL thay đổi, Back hoàn tác filter), cần bạn duyệt riêng.

6. `BLANK_FILTER_VALUE = "__blank__"` xuất hiện ở 2 module lib
   (`color-tones.ts:10` và `product-facets.ts`) — giá trị giống hệt, cả hai
   đều từ trước (san-pham vốn có bản riêng; đợt này chỉ lộ lên mức lib).
   Chưa gộp: nơi gọn nhất là `product-facets` (generic) nhưng `color-tones`
   đang export nó cho tone path — gộp sẽ chạm 2 hệ, lợi ích 1 dòng. Để khi
   chạm taxonomy màu thật sự.

FOLLOW-UP RECOMMENDATIONS
=========================

1. P2-6 — chuyển filter of /luu-tru + /khong-gian sang validateSearch (cần duyệt).
2. Múi giờ `nowUtc`: chuỗi UTC render thẳng ~15 chỗ UI + parse lại bằng
   `new Date(x.replace(" ","T"))` (hiểu là giờ địa phương). Với VN (UTC+7) không
   thể cùng đúng. Cần quyết: lưu/trả giờ địa phương hay UI tự đổi. Đây là thay đổi
   behavior — tách task riêng.
3. Gộp `SortDir` về lib/types (xem OOSF #1).
4. Cân nhắc `npm run typecheck` trong quy trình (AGENTS.md chỉ có `npm run build`).
5. Khi có nhu cầu, tách thêm `crm.server.ts` (mapping / quote nhóm) — đồ thị nội bộ
   là DAG, tách được từng phần.