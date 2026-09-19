# REFACTOR_ROADMAP — Innomat CRM

> Lập ngày **2026-09-19** sau khi hoàn tất [ARCHITECTURE_RECOMMENDATIONS](ARCHITECTURE_RECOMMENDATIONS.md).
>
> Mỗi mục theo mẫu: ID / Title / Current Problem / Files / Evidence / Proposed Change /
> Risk / Effort / Expected Benefit / Dependencies / Validation.
>
> **Nguyên tắc lọc** (Phase 9): một thay đổi chỉ được vào roadmap nếu nó (1) giảm độ phức tạp
> thật, (2) bỏ trùng lặp thật, (3) cải thiện ranh giới, (4) dễ đọc hơn, (5) dễ test hơn,
> (6) dễ maintain hơn, hoặc (7) giảm bug tương lai. **Không** vào chỉ vì style/pattern/template.

---

## P0 — Critical

> Không còn mục nào ở mức P0. Hai vấn đề từng ở mức này **đã được xử lý trong đợt vừa rồi**:
>
> - **29 lỗi `tsc` tồn đọng** — type checking gần như **tắt** ở `_app.luu-tru.tsx` (2358 dòng)
>   vì thiếu hẳn 3 import type, cộng 3 tính năng bị vô type (sort media, gợi ý field sản phẩm,
>   tab kích thước ở sidebar). **Nay 0 lỗi.**
> - **Lưới `importProtection` vô hiệu** — client import `.server.ts` không bị chặn.
>   **Nay cưỡng chế, đã kiểm chứng 2 chiều.**
> - **Vi phạm tầng `lib → api`** do chính đợt cleanup trước gây ra. **Nay 0 vi phạm.**

---

## P1 — High Value

### P1-0. Dựng lưới test cho hàm thuần

```
ID:               P1-0
Title:            Test cho các hàm thuần (mở khoá mọi refactor lớn)

Current Problem:  Repo có 0 file test. Mọi refactor vào file lớn đều phải dựa vào đọc code
                  tay, nên P1-1..P1-3 đều bị chặn hoặc phải làm rất chậm.

Files:            src/lib/pricing.ts, src/lib/format.ts, src/lib/phone.ts,
                  src/lib/product-search.ts, src/lib/product-internal-codes.ts,
                  + các hàm thuần sẽ tách ở P1-1

Evidence:         glob **/*.{test,spec}.* → 0 kết quả; package.json không có script `test`

Proposed Change:  Thêm Vitest (hoặc `node --test` nếu muốn 0 dependency), viết test cho
                  các hàm thuần đang có. KHÔNG test component, KHÔNG cần DOM, KHÔNG cần mock DB.
                  Ưu tiên: calcUnit/tileAreaM2/ceilTiles (tiền + diện tích), unitPriceForProduct
                  (giá), normalizePhone/phonesMatch (trùng khách), buildExactCodeSet/matchSearchTokens
                  (tìm mã), parseInternalCodesList, getPageNumbers.

Risk:             LOW  (chỉ thêm file test, không sửa code chạy)
Effort:           MEDIUM
Expected Benefit: - mở khoá P1-1/P1-2/P1-3 (không có mục này thì 3 mục kia nên hoãn)
                  - lưới an toàn cho phần dễ sai nhất: tiền, VAT, diện tích
                  - bug trong tính giá/diện tích hiện không thể phát hiện

Dependencies:     không
Validation:       `npx vitest run` xanh; cố tình sửa 1 hàm cho sai để chắc test bắt được.
```

### P1-1. Tách hàm thuần khỏi 3 route lớn + 2 dialog

```
ID:               P1-1
Title:            Rút hàm thuần ra khỏi file UI khổng lồ

Current Problem:  5 file UI 1.7k–2.7k dòng trộn hàm thuần với render. Hàm thuần không
                  export được nên không test được, và bị chôn giữa JSX.

Files:            src/routes/_app.thu-vien.tsx (2699)
                  src/routes/_app.luu-tru.tsx (2270)
                  src/routes/_app.san-pham.tsx (2224)
                  src/components/CustomerMappingDialog.tsx (1995)
                  src/components/NewQuoteDialog.tsx (1743)

Evidence:         Hàm thuần đã xác minh (0 closure lên state), theo thứ tự giá trị:
                  - NewQuoteDialog:107-171,407-418 — sanitizeQuantityInput, parseQuantityInput,
                    tileAreaM2, ceilTiles, formatSqm, calcUnit, applyDiscountType  → src/lib/quote-calc.ts
                  - thu-vien:146-252,314-326,349-411 — decode/encodeGallerySort, parseGallerySort,
                    parseLibraryCategory, parsePositiveInt, parseViewerIndex, compareCollectionName,
                    timeMs, normalizeSearchText, searchTokens, sortCollectionItemsByStockDesc
                    → src/lib/gallery-sort.ts
                  - san-pham:137-162,233-286,336-356 — parseCsv, matchesFacet, addFacetCount,
                    toFacetOption, FacetKey, BLANK_FILTER_VALUE, decode/encodeProductSort,
                    compareProductCode, parseSort, priceOf → src/lib/product-facets.ts
                  - CustomerMappingDialog:77-90,133-168 — basisLabel, autoPriceFor, key,
                    blankDraft, fileToDataUrl, move → src/lib/mapping-draft.ts

Proposed Change:  Di chuyển từng nhóm vào src/lib/, cập nhật import. **Không đổi một dòng
                  logic nào.** Mỗi file một commit riêng, chạy tsc + build sau mỗi lần.

Risk:             LOW  (hàm thuần, không closure; compiler bắt mọi import sai)
Effort:           MEDIUM (khoảng 5 lần di chuyển cơ học)
Expected Benefit: - 3 route + 2 dialog nhỏ đi ~300 dòng tổng
                  - các hàm này trở thành test được (dùng luôn cho P1-0)
                  - giảm nguy cơ trôi lệch khi 2 file cùng cần 1 codec

Dependencies:     P1-0 (nên có test trước, nhưng không bắt buộc vì compiler che)
Validation:       npx tsc --noEmit = 0 · npm run build PASS · smoke test 5 route/dialog liên quan
```

### P1-2. Gộp facet engine 6 memo thành một hàm

```
ID:               P1-2
Title:            Một hàm countFacet thay cho 6 memo gần giống hệt

Current Problem:  /san-pham có 6 memo facet cùng khuôn (matchIndexed → addFacetCount →
                  sort desc → toFacetOption), chỉ khác field và getter.

Files:            src/routes/_app.san-pham.tsx:744-814

Evidence:         colorOptions/surfaceOptions/shapeOptions/textureOptions/collectionOptions/
                  supplierOptions — 6 khối ~12 dòng, khác nhau đúng 2 tham số

Proposed Change:  Thêm một hàm thuần (đặt cùng P1-1 hoặc trong file):
                    countFacet(matchIndexed, key, getter)
                  rồi 6 memo còn 1 dòng mỗi cái. **Derives only — không chuyển state.**

Risk:             MEDIUM (chạm đường đi của facet; facet count sai thì filter hiển thị sai số)
Effort:           SMALL
Expected Benefit: - bỏ ~60 dòng lặp
                  - thêm facet mới = 1 dòng thay vì copy-paste 12 dòng
                  - hết nguy cơ quên sort hoặc quên BLANK_FILTER_VALUE ở một facet

Dependencies:     P1-1 (nên tách primitives trước cho dễ đọc diff)
Validation:       mở /san-pham, so số trên badge của cả 6 chip với trước khi sửa
                  (Innomat 599 / Hiệp Thủy 68 / Á Châu 67 …)
```

### P1-3. Tách `crm.server.ts` thành 2–3 khối

```
ID:               P1-3
Title:            Chia crm.server.ts 3204 dòng theo độc lập thật

Current Problem:  10 domain chung một file, cộng 707 dòng cuối không có banner.
                  Tìm hàm phải grep; conflict thường xuyên.

Files:            src/db/crm.server.ts (3204)

Evidence:         10 banner `// ───`; đồ thị gọi nội bộ là DAG không đệ quy (đã kiểm),
                  các leaf getter getCustomer/getProduct/getQuote là hub.
                  Tail 707 dòng = flat-media + product CRUD, không banner.

Proposed Change:  **KHÔNG tách theo 10 domain** (sẽ tạo import chéo rối).
                  Tách 2–3 khối độc lập trước: (a) tail flat-media + product CRUD,
                  (b) nhóm customer-mapping. Giữ `crm.server.ts` làm mặt tiền re-export
                  để không phải sửa ~60 call site.

Risk:             MEDIUM (file nghiệp vụ lõi; không có test)
Effort:           MEDIUM
Expected Benefit: - file dễ điều hướng, giảm conflict
                  - ranh giới domain rõ hơn

Dependencies:     P1-0 (khuyến nghị mạnh — đây là file rủi ro nhất repo)
Validation:       npx tsc --noEmit = 0 · build PASS · smoke test các trang dùng
                  sản phẩm/khách hàng/báo giá/mapping
```

---

## P2 — Nice to Have

### P2-1. Chuẩn hoá empty-state

```
ID: P2-1 · Title: Một primitive EmptyState cho tầng bare-<p>
Current Problem: 11 biến thể empty-state; 2 helper `Empty` đã định nghĩa với chữ ký KHÁC nhau.
Files:           _app.bao-gia.tsx:960, _app.khach-hang.$customerId.tsx:1248, _app.ghi-chu.tsx:42,
                 _app.leads.tsx:156, _app.cong-no.tsx:258, _app.co-hoi.tsx:515, _app.luu-tru.tsx:1343,
                 _app.thu-vien.tsx:2616,2672, _app.tong-quan.tsx:71
Evidence:        ~5 chỗ là `<p className="p-12 text-center text-sm text-muted-foreground">` verbatim;
                 2 helper `Empty` khác chữ ký ({text,action,actionLabel} vs {text})
Proposed Change: Thêm `<EmptyState text>` (+ slot action tuỳ chọn); migrate tầng bare-<p>.
                 KHÔNG gộp tầng icon+title+CTA (là component khác).
Risk: LOW · Effort: SMALL
Expected Benefit: bỏ ~5 bản sao; nhất quán khoảng đệm
Dependencies: none
Validation: kiểm 6 trang liên quan vẫn hiện đúng empty state
```

### P2-2. Chốt luật error-signalling ở biên RPC

```
ID: P2-2 · Title: Ghi luật, không sửa code
Current Problem: 3 kiểu trả lỗi ở biên RPC; caller phải nhớ từng hàm.
Files:           src/api/functions.ts:37, src/api/lp.ts:130
Evidence:        loginFn → {error}; submitLpLeadFn → {ok:false,error}; các mutation khác → throw
Proposed Change: Đã ghi luật vào CODE_ARCHITECTURE_GUIDE §11. Không sửa code.
Risk: LOW · Effort: SMALL
Expected Benefit: ngăn mô hình thứ tư xuất hiện
Dependencies: none · Validation: không áp dụng (thay đổi tài liệu)
```

### P2-3. Đưa trình sinh HTML ra khỏi tầng dữ liệu

```
ID: P2-3 · Title: Đổi chỗ (không đổi nội dung) export-*.server.ts
Current Problem: src/db/ chứa 815 dòng template HTML/CSS — không phải tầng dữ liệu.
Files:           src/db/export-quote.server.ts (488), src/db/export-mapping.server.ts (327)
Evidence:        nội dung là template + nhúng ảnh, không phải truy vấn
Proposed Change: Chuyển sang thư mục phản ánh đúng vai trò (VD src/render/), cập nhật import.
                 Đây là thay đổi **vị trí**, không phải refactor.
Risk: LOW · Effort: SMALL
Expected Benefit: src/db/ đúng nghĩa tầng dữ liệu; tìm SQL không bị lạc
Dependencies: none
Validation: tsc 0 · build PASS · xuất thử 1 báo giá + 1 đề xuất vật liệu
```

### P2-4. Đổi tên `nowLocal` → `nowUtc`

```
ID: P2-4 · Title: Tên hàm không nói dối về múi giờ
Current Problem: nowLocal() trả giờ UTC nhưng tên nói local. Chuỗi này render thẳng ở ~15 chỗ
                 UI (coi như giờ tường) và parse lại bằng new Date(x.replace(" ","T")) ở 2 chỗ
                 (hiểu là giờ địa phương) → với VN (UTC+7) ba cách hiểu không thể cùng đúng.
Files:           src/lib/format.ts, + ~15 chỗ render, export-quote.server.ts:169,
                 export-mapping.server.ts:287
Evidence:        new Date().toISOString().slice(0,19).replace("T"," ")
Proposed Change: **Đổi tên thôi** (nowUtc) — KHÔNG đổi giá trị, vì đổi giá trị là thay đổi
                 hành vi hiển thị. Việc sửa đúng múi giờ phải là task riêng có duyệt.
Risk: LOW (rename cơ học) · Effort: SMALL
Expected Benefit: tên đúng; ngăn người sau tưởng là giờ địa phương
Dependencies: none
Validation: tsc 0 · build PASS · mở /bao-gia xem ngày hiển thị không đổi
```

### P2-5. Registry cho localStorage key

```
ID: P2-5 · Title: Một nơi liệt kê key
Current Problem: 8 key rải rác, không nơi nào liệt kê; ExportQuoteDialog chạm 1 key qua 2 đường.
Files:           hooks/useLocalStorageState.ts, components/landing/useShortlistStorage.ts,
                 ExportQuoteDialog.tsx
Evidence:        pipeline.viewMode, khach-hang.viewMode, bao-gia.quoteStatusFilter,
                 quote-export-project-site, ebg_architect_shortlist_ids_v1, …
Proposed Change: Gom key vào một object hằng (src/lib/storage-keys.ts). Không đổi giá trị key
                 (đổi sẽ mất dữ liệu người dùng).
Risk: LOW · Effort: SMALL
Expected Benefit: hết nguy cơ trùng key; grep 1 chỗ là thấy hết
Dependencies: none · Validation: tsc 0 · kiểm view mode vẫn nhớ sau reload
```

### P2-6. `/luu-tru` + `/khong-gian`: đưa filter lên URL

```
ID: P2-6 · Title: Nhất quán mô hình filter
Current Problem: 2 trang giữ filter trong useState trong khi 2 trang cùng loại dùng URL.
Files:           src/routes/_app.luu-tru.tsx:507-515, src/routes/_app.khong-gian.tsx
Evidence:        san-pham:388-416 và thu-vien:254-265 dùng validateSearch; 2 trang kia thì không
Proposed Change: Chuyển sang validateSearch.
⚠️ ĐÂY LÀ THAY ĐỔI HÀNH VI (URL thay đổi, Back sẽ hoàn tác filter).
                 Phải tách thành task riêng và **cần bạn duyệt trước**.
Risk: MEDIUM · Effort: MEDIUM
Expected Benefit: share link được; trải nghiệm nhất quán; Back hoạt động đúng
Dependencies: P1-0 · Validation: kiểm sâu từng filter + Back/Forward + reload
```

---

## DO NOT REFACTOR

Những thứ **đang ổn và không đáng động vào**. Mỗi mục kèm lý do phản biện thật.

| # | Thứ | Vì sao KHÔNG động |
|---|---|---|
| D1 | **25 chỗ xác nhận xoá 2 bước** | Có **≥5 biến thể thật** (nhãn `Xóa vĩnh viễn`/`Xóa`/`Xác nhận xóa`; huỷ `Không xóa`/`Hủy`/icon X; 5 kiểu container; thứ tự nút đảo). Một `ConfirmDeleteInline` sẽ cần ~8 prop — **nhiều hơn phần JSX nó thay thế** — và phải luồn vào header dialog, ô bảng, thanh nổi, overlay card. 25 call site × 15 file, không test. **Lợi ích âm.** |
| D2 | **6 nhóm segmented pill** | Màu active khác nhau **có chủ đích** (`/luu-tru` mã hoá loại tab: map=indigo, concept=amber). Gộp = thêm prop `variant`, không phải dedup. |
| D3 | **4 thiết kế `Stat`/KPI tile** | 4 hợp đồng thị giác khác nhau (kể cả `accent: string` vs `accent?: boolean`). Đã kiểm: gộp sẽ **đổi giao diện** một trang. |
| D4 | **card vs row của cùng entity** | Cố ý khác nhau (card có ảnh + khối giá; row có cột checkbox + ô nén). Đây là thiết kế đúng. |
| D5 | **`src/db/index.server.ts`** | Facade 1 dòng trông thừa, nhưng 12 file dùng và nó là điểm đổi driver. |
| D6 | **`src/lib/history-layer.ts`** | 135 dòng cho việc "Back đóng dialog" trông phức tạp, nhưng docblock giải thích nó tồn tại để né việc TanStack Router coi `pushState` là navigation. Bỏ đi sẽ tái hiện bug cũ. |
| D7 | **`_app.cong-no.tsx:636` `inputCls`** | Khác bản chuẩn thật (`mt-1` + **không có** `text-foreground`). Gộp về chuẩn sẽ **đổi màu chữ input** — đã cân nhắc và quyết định giữ. |
| D8 | **Hai mô hình server-state (loader + useQuery)** | Loader đúng cho route; `useQuery` hợp lý cho 2 trang admin. Hợp nhất là thay đổi lớn, lợi ích mờ. Chỉ cần **ghi luật** để không sinh mô hình thứ tư (đã ghi). |
| D9 | **`src/data/mockData.ts`** | Phần lớn là nội dung biên tập tĩnh của landing (không có nguồn DB). Riêng `curatedMaterials` là scaffolding chết — xem NEEDS REVIEW ở CLEANUP_REPORT, cần bạn quyết vì xoá là đổi UI. |
| D10 | **`src/routes/_app.thu-vien.tsx` history/DnD orchestration** | Phần monolith còn lại là điều phối history layer + DnD + nạp chi tiết — thuộc về một chỗ. Tách ra sẽ rủi ro đúng cái invariant tinh tế nhất của trang (Back semantics) mà không có test. |
| D11 | **`AGENTS.md` / `CLAUDE.md`** | `AGENTS.md` là nguồn luật; `CLAUDE.md` bị gitignore (gitnexus tự sinh). Không track. |

---

## Thứ tự thực thi đề xuất

```
P1-0 (test hàm thuần)      ← làm trước, mở khoá phần còn lại
   ↓
P1-1 (tách hàm thuần)      ← LOW risk, làm được ngay cả khi chưa có P1-0
   ↓
P1-2 (gộp facet engine)    ← SMALL, cần P1-1 cho diff sạch
   ↓
P1-3 (tách crm.server)     ← chỉ làm SAU khi P1-0 xong
   ↓
P2-* (dọn nhỏ, độc lập)    ← làm bất cứ lúc nào
```

**Điều kiện dừng:** mỗi mục phải giữ `tsc` = 0 và `build` PASS. Nếu một mục làm tăng lỗi
type hoặc đổi hành vi quan sát được → **revert mục đó**, ghi lại, chuyển sang NEEDS REVIEW.
