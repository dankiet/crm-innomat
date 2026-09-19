# ARCHITECTURE_RECOMMENDATIONS — Innomat CRM

> Lập ngày **2026-09-19**, sau đợt audit + cleanup. Mọi kết luận đều đã **đối chiếu source**,
> không chép lại từ tài liệu. Những chỗ tài liệu nói khác code đều được ghi rõ ở §7.
>
> Phạm vi: toàn repo (107 file `src/`, 39.307 dòng). Đây là **đề xuất**, không phải kế hoạch
> thực thi — thứ tự ưu tiên nằm ở [REFACTOR_ROADMAP](REFACTOR_ROADMAP.md).

---

## 1. What Is Good — những thứ KHÔNG nên thay đổi

Đây là phần quan trọng nhất của tài liệu. Kiến trúc hiện tại **tốt hơn mức trung bình** cho
một repo cỡ này, và phần lớn nó nên được giữ nguyên.

| # | Đang tốt | Bằng chứng |
|---|---|---|
| G1 | **Ranh giới tầng sạch, có thể kiểm chứng bằng máy.** 0 vi phạm: `db` không trỏ lên trên, `lib` là lá, `components` chỉ gọi `api` (đúng thiết kế), 0 chu trình. | quét import tĩnh + `await import()` trên 107 file |
| G2 | **`src/db/*.server.ts` chỉ nạp bằng dynamic import** trong handler `createServerFn`. Code server không bao giờ rơi vào bundle client — và từ đợt cleanup, điều này được **cưỡng chế** bởi `importProtection` (đã kiểm chứng 2 chiều). | `vite.config.ts:45`, `src/api/functions.ts:20` |
| G3 | **Không có file mồ côi.** 107/107 file đều tới được từ route. | quét reachability (cả dynamic import) |
| G4 | **URL là nguồn sự thật cho filter ở các trang phức tạp nhất** (`/san-pham`, `/thu-vien`) — `validateSearch` + `loaderDeps` + `navigate({search})`. Chia sẻ link hoạt động đúng. | `_app.san-pham.tsx:388-416`, `_app.thu-vien.tsx:254-265` |
| G5 | **`src/lib/` là lớp isomorphic thật sự dùng chung** (pricing, product-search, phone, format, taxonomy) — không phải nơi chứa đồ vụn. 25 file, mỗi file một trách nhiệm rõ. | `src/lib/*` |
| G6 | **Đã có sẵn một lớp primitive dùng chung hợp lý**: `PageHeader` (13 route), `PageFilterBar`/`PageSearchInput` (5), `FilterChip` + `MultiSelectFilter` (4), `SortMenu` (2), `ProductImage` (8), `useLocalStorageState` (6). | `src/components/*` |
| G7 | **Error handling ở tầng db nhất quán kiểu `throw`** (~105 chỗ) — biên giới lỗi nằm ở `api`, không rải rác. | `src/db/**` |
| G8 | **Schema có đúng một nguồn**: `src/db/schema-pg.sql`, áp trong một transaction, idempotent. 25 bảng, 0 bảng mồ côi. | `scripts/db-migrate.mjs` |
| G9 | **`tsc` sạch (0 lỗi)** sau đợt này — trước đó là 29 lỗi tồn đọng, nghĩa là type checking gần như **tắt** ở file 2.3k dòng. | `npx tsc --noEmit` → 0 |

**Kết luận §1: GIỮ NGUYÊN kiến trúc tổng thể.** Không cần `features/` folders, không cần
service layer mới, không cần state library. Cấu trúc `routes / components / db / api / lib / hooks`
khớp với framework (TanStack Start file-routing), quy mô (107 file) và team (nhỏ).

---

## 2. Problems — 25 câu hỏi đánh giá hiện trạng

| # | Câu hỏi | Trả lời | Bằng chứng |
|---|---|---|---|
| 1 | Architecture hợp lý? | **Có.** Xem §1. | — |
| 2 | Folder structure dễ hiểu? | **Có.** 6 thư mục, mỗi thư mục một vai trò. Không có thư mục "misc". | `docs/PROJECT_STRUCTURE.md` §2 |
| 3 | Responsibility giữa các layer rõ? | **Có, trừ 2 chỗ**: (a) ~216 dòng SQL/nghiệp vụ nằm trong `api/functions.ts`; (b) `db/export-{quote,mapping}.server.ts` (815 dòng) là **trình sinh HTML**, không phải tầng dữ liệu. | `functions.ts:1558-1749`, `lp.ts:94-97,210-231`; `export-quote.server.ts` 488 dòng |
| 4 | Page chứa quá nhiều logic? | **Có — đây là vấn đề lớn nhất.** 3 route 2.2k–2.7k dòng gánh facet engine, sort codec, phân trang, token hoá tìm kiếm inline. | `thu-vien` 2699, `luu-tru` 2270, `san-pham` 2224 |
| 5 | Component quá lớn? | **Có, 2 cái**: `CustomerMappingDialog` 1995, `NewQuoteDialog` 1743. | — |
| 6 | Component quá nhỏ / abstraction quá mức? | **Không đáng kể.** 38 component đều có ≥1 consumer; không có wrapper chỉ forward props. | quét component usage |
| 7 | Hook nào làm quá nhiều việc? | **Không.** Chỉ có 2 hook dùng chung (`useLocalStorageState`, `useHistoryLayer`), cả hai làm đúng một việc. Vấn đề ngược lại: **quá ít hook** — logic đáng ra là hook đang nằm trong route. | `src/hooks/` 63 dòng |
| 8 | Service chứa business logic sai chỗ? | **Có.** `crm.server.ts` 3204 dòng là một khối; 707 dòng cuối là tail không có banner (`RECOVERED FUNCTIONS`). | `crm.server.ts` |
| 9 | Duplicated data flow? | **Có, 1 chỗ thật**: `NewNoteDialog` tải 50 ghi chú toàn cục rồi lọc theo `customer_id` ở client, trong khi server đã có tham số lọc. | `NewNoteDialog.tsx` |
| 10 | Prop drilling đáng kể? | **Không.** `ProductCard`/`ProductListRow` nhận prop trực tiếp từ leaf; chỉ `CustomerMappingDialog` luồn 1 hằng style (`inputClass`) qua 2 tầng. | — |
| 11 | State đặt sai tầng? | **Có, nhẹ.** `/luu-tru` và `/khong-gian` giữ **toàn bộ** filter trong `useState`, trong khi `/san-pham` và `/thu-vien` giữ trong URL — cùng loại filter, hai mô hình. | `_app.luu-tru.tsx:507-515` vs `_app.san-pham.tsx:388-416` |
| 12 | Dependency direction sai? | **Đã sửa trong đợt này.** Trước đó `src/lib/lp-route.ts → src/api/lp.ts` (lib trỏ lên api) — do chính đợt cleanup trước gây ra. Nay file nằm ở `src/routes/-lp-route.ts`. | 0 vi phạm tầng |
| 13 | Circular dependency? | **Không.** 0 chu trình. | quét DFS |
| 14 | Feature coupling quá chặt? | **Không.** Chỉ 1 phụ thuộc liên-feature: `NewQuoteDialog → NewProductDialog` (một chiều, hợp lý). | đồ thị import |
| 15 | Shared components có thực sự nên shared? | **Có.** 9 primitive dùng chung đều generic và ổn định. Không có component nào bị "shared hoá" quá sớm. | §1 G6 |
| 16 | Folder "miscellaneous dumping ground"? | **Không.** `src/lib/` là chỗ dễ thành bãi rác nhất nhưng hiện vẫn mỗi file một việc. | `src/lib/*` |
| 17 | Naming nhất quán? | **Có**, với 2 ngoại lệ đã biết: `nowLocal()` trả **giờ UTC** (tên nói local), và `collectionOptions` từng bị đảo nghĩa (đã sửa ở đợt trước). | `src/lib/format.ts` |
| 18 | API/data fetching nhất quán? | **Không hoàn toàn.** 13 route dùng `loader` + `router.invalidate()`; 2 route admin dùng `useQuery`; 2 route tự fetch trong `useEffect`. | `nguoi-dung.tsx:36`, `nhat-ky.tsx:19` vs phần còn lại |
| 19 | Error handling nhất quán? | **Có ở tầng db** (`throw`), **không ở biên**: `loginFn` trả `{error}`, `submitLpLeadFn` trả `{ok:false,error}`, các mutation khác `throw`. | §3 P5 |
| 20 | Loading/empty/error nhất quán? | **Không.** Có 3 tầng empty-state (bare `<p>`, text+action, icon+title+CTA) và 2 helper `Empty` **khác chữ ký**. Loading thì mỗi trang tự xử. | 11 biến thể empty-state |
| 21 | Type/model/schema duplicate? | **Đã dọn phần lớn** ở đợt trước (`CrmConcept*`, `CustomerMapping*`, `MappingPriceBasis` về một nguồn). Còn lại: `ViewMode` khai riêng ở 3 file (union khác nhau — hợp lý). | 7 tên khai ở >1 file, đều là `Route`/re-export |
| 22 | Abstraction làm phức tạp thêm? | **Gần như không.** Xem §5. | — |
| 23 | Over-engineered? | **Không.** Ngược lại — xem §6. | — |
| 24 | Under-engineered? | **Có.** Xem §6: 3 route khổng lồ, facet engine lặp 6 lần, 2 dialog 2k dòng. | — |
| 25 | Technical debt đáng xử lý? | **Có, 3 nhóm**: (a) 3 route + 2 dialog quá lớn; (b) `crm.server.ts` một khối; (c) không có test tự động. | §3 |

---

## 3. Problems — chi tiết từng vấn đề thật

Định dạng theo yêu cầu: Problem / Evidence / Impact / Suggested direction.

### P1. Ba route gánh nghiệp vụ client (CAO)

```
Problem:  /thu-vien, /luu-tru, /san-pham mỗi file 2.2k–2.7k dòng, trộn 4 loại trách nhiệm:
          sort codec, facet counting, phân trang, token hoá tìm kiếm, DnD, history layering,
          và render. /luu-tru một mình có 47 useState.
Evidence: _app.thu-vien.tsx 2699 dòng (34 trách nhiệm đánh số được)
          _app.luu-tru.tsx  2270 dòng (28 trách nhiệm, 47 useState)
          _app.san-pham.tsx 2224 dòng (29 trách nhiệm, 18 useState)
          — đo bằng đọc source + đếm hook, không lấy từ docs
Impact:   Không thể test từng phần; sửa 1 filter phải đọc 2k dòng; onboarding chậm;
          mọi refactor đều HIGH risk vì không có lưới test.
Suggested: Tách **hàm thuần trước, state sau**. Hàm thuần (sort codec, facet primitives,
          quote math) có 0 closure lên state → di chuyển là thay đổi LOW risk, không đổi hành vi.
          Việc tách state thành hook là MEDIUM và **chỉ nên làm sau khi có test**.
```

### P2. `crm.server.ts` là một khối 3204 dòng (TRUNG BÌNH)

```
Problem:  10 domain (products, customers, quotes, orders, payments, notes, mappings,
          images, dashboard, audit) nằm chung một file, cộng thêm 707 dòng cuối
          không có banner ("// --- RECOVERED FUNCTIONS ---").
Evidence: src/db/crm.server.ts — ~60 export, 10 banner `// ───`
Impact:   Tìm hàm phải grep; merge conflict thường xuyên khi nhiều người sửa;
          không rõ domain nào sở hữu hàm nào.
Suggested: **Không tách theo domain** (10 file nhỏ sẽ tạo import chéo phức tạp).
          Tách 2–3 khối theo độc lập thật: (a) tail flat-media + product CRUD 707 dòng,
          (b) nhóm mapping. Đồ thị gọi nội bộ là DAG không đệ quy → mọi phần đều tách được.
          Risk MEDIUM. Đây là việc P1, không phải P0.
```

### P3. Trình sinh HTML nằm trong tầng dữ liệu (THẤP)

```
Problem:  export-quote.server.ts (488 dòng) và export-mapping.server.ts (327 dòng) nằm trong
          src/db/ nhưng nội dung là template HTML + CSS + nhúng ảnh, không phải truy vấn dữ liệu.
Evidence: src/db/export-quote.server.ts, src/db/export-mapping.server.ts
Impact:   `src/db/` mang tiếng là tầng dữ liệu nhưng chứa presentation; đọc file để tìm SQL sẽ lạc.
Suggested: Đổi tên/thư mục để phản ánh đúng (VD `src/render/`), KHÔNG đổi nội dung.
          Đây là việc đặt tên, không phải refactor. Risk LOW, benefit thấp → P2.
```

### P4. Ba mô hình server-state cùng tồn tại (TRUNG BÌNH)

```
Problem:  13 route dùng loader + router.invalidate(); 2 route admin dùng useQuery;
          2 route tự fetch trong useEffect rồi giữ trong useState.
Evidence: loader: bao-gia:46, co-hoi:27, cong-no:25, ghi-chu:8, khach-hang.index:40,
          khach-hang.$customerId:112, khong-gian:224, leads:28, san-pham:387,
          thu-vien:253, tong-quan:19
          useQuery: nguoi-dung.tsx:36, nhat-ky.tsx:19
          useEffect-fetch: luu-tru.tsx:635, khong-gian.tsx:276
Impact:   Người mới phải học 3 mô hình; bug "quên invalidate" chỉ xảy ra ở nhóm loader;
          nhóm useQuery không bị.
Suggested: KHÔNG hợp nhất. Loader là mặc định đúng cho route; useQuery hợp lý cho 2 trang
          admin (bảng có filter/polling cục bộ). Việc đáng làm là **ghi thành luật**
          (xem CODE_ARCHITECTURE_GUIDE §4) để không phát sinh mô hình thứ tư.
```

### P5. Biên error-signalling không nhất quán (THẤP)

```
Problem:  Tầng db dùng `throw` (~105 chỗ) rất nhất quán, nhưng ở biên RPC có 3 kiểu:
          `loginFn` trả {error}; `submitLpLeadFn` trả {ok:false,error};
          các mutation khác `throw`. Caller phải nhớ từng hàm.
Evidence: functions.ts:37 (loginFn), lp.ts:130 (submitLpLeadFn),
          functions.ts:1201 (deleteQuoteFn throws)
Impact:   Dễ quên nhánh {error} → hiện toast sai hoặc im lặng.
Suggested: Ghi luật: **mutation throw, chỉ endpoint "dự đoán được thất bại" mới trả object**
          (đăng nhập sai, rate-limit). Không sửa code — chỉ chốt luật. Risk LOW.
```

### P6. `/luu-tru` và `/khong-gian` giữ filter trong state, không ở URL (TRUNG BÌNH)

```
Problem:  Hai trang này có bộ filter tương đương /san-pham nhưng giữ trong useState,
          nên không share link được và Back không hoàn tác filter.
Evidence: _app.luu-tru.tsx:507-515 (9 state filter)
          _app.khong-gian.tsx (activeCategory/activeRoom/activeStatus/activeColor)
          vs _app.san-pham.tsx:388-416 (validateSearch)
Impact:   Trải nghiệm không nhất quán giữa các trang cùng loại; không share được link filter.
Suggested: Chuyển sang `validateSearch` — nhưng đây là **thay đổi hành vi** (URL thay đổi),
          phải tách thành task riêng và cần bạn duyệt. Risk MEDIUM.
```

### P7. Facet engine lặp 6 lần gần như y hệt (TRUNG BÌNH)

```
Problem:  /san-pham có 6 memo facet (color/surface/shape/texture/collection/supplier)
          cùng khuôn matchIndexed → addFacetCount → sort → toFacetOption.
Evidence: _app.san-pham.tsx:744-814
Impact:   Thêm 1 facet mới phải copy-paste 12 dòng; dễ quên sort hoặc quên BLANK_FILTER_VALUE.
Suggested: Một hàm `countFacet(matchIndexed, key, getter)` — derives only, **không chuyển state**,
          nên là MEDIUM risk chứ không HIGH. Đây là seam tốt nhất trong san-pham.
```

### P8. Không có test tự động (CAO — nhưng không sửa được bằng refactor)

```
Problem:  0 file test. Mọi refactor trong repo này đều phải dựa vào đọc code + smoke test tay.
Evidence: glob **/*.{test,spec}.* → 0; package.json không có script `test`
Impact:   Đây là **lý do gốc** khiến P1/P2 vẫn nằm trong roadmap thay vì được làm ngay.
Suggested: Bắt đầu bằng test cho **hàm thuần** (sort codec, quote math, pricing, phone) —
          không cần DOM, không cần mock. Đó là cách rẻ nhất để có lưới an toàn trước khi
          động vào state. Xem REFACTOR_ROADMAP P1-0.
```

---

## 4. Improvement Opportunities

Xếp theo giá trị ÷ rủi ro. Chi tiết + acceptance nằm ở [REFACTOR_ROADMAP](REFACTOR_ROADMAP.md).

| # | Cơ hội | Risk | Effort | Benefit |
|---|---|---|---|---|
| O1 | Dựng lưới test cho hàm thuần (sort codec, quote math, pricing, phone, facet) | LOW | MEDIUM | Mở khoá mọi refactor lớn sau này |
| O2 | Tách hàm thuần khỏi 3 route lớn + 2 dialog | LOW | MEDIUM | File nhỏ hơn, hàm test được, không đổi hành vi |
| O3 | Gộp facet engine 6 memo thành 1 hàm | MEDIUM | SMALL | Bỏ ~70 dòng lặp, thêm facet chỉ 1 dòng |
| O4 | Tách `crm.server.ts` 2–3 khối | MEDIUM | MEDIUM | File dễ điều hướng, giảm conflict |
| O5 | Đưa filter của `/luu-tru` + `/khong-gian` lên URL | MEDIUM | MEDIUM | Nhất quán + share link được (**đổi hành vi**) |
| O6 | Chuẩn hoá empty-state (1 primitive + 3 biến thể) | LOW | SMALL | Bỏ ~5 bản sao, nhất quán |
| O7 | Chốt luật error-signalling ở biên RPC | LOW | SMALL | Ngăn mô hình thứ tư xuất hiện |
| O8 | Đổi chỗ trình sinh HTML ra khỏi `src/db/` | LOW | SMALL | Tầng dữ liệu đúng nghĩa |
| O9 | Đổi tên `nowLocal` → `nowUtc` | LOW | SMALL | Tên không còn nói dối (**đổi API nội bộ**) |

---

## 5. Over-engineering Found

Kết quả: **gần như không có.** Đây là điểm mạnh của repo.

| Kiểm tra | Kết quả |
|---|---|
| Abstraction chỉ dùng 1 lần | 0 |
| Wrapper chỉ forward props | 0 |
| Factory / adapter / provider không cần thiết | 0 |
| Context không cần thiết | 0 (không có Context nghiệp vụ nào) |
| State library không cần thiết | 0 (không Redux/Zustand) |
| Utility bọc 1 hàm đơn giản | 0 |
| Type indirection quá mức | 0 |
| Folder nesting quá sâu | 0 (sâu nhất 2 tầng) |

Hai thứ **suýt** là over-engineering nhưng không phải:

- `src/db/index.server.ts` — facade 1 dòng re-export `getDb`. Trông thừa, nhưng 12 file dùng nó
  và nó là điểm đổi driver nếu sau này cần. **Giữ.**
- `src/lib/history-layer.ts` (135 dòng) — trông phức tạp cho việc "Back đóng dialog", nhưng
  docblock giải thích rõ nó tồn tại để né việc TanStack Router coi `pushState` là navigation.
  **Giữ.**

---

## 6. Under-engineering Found

Đây mới là vấn đề thật của repo: **thiếu abstraction ở đúng chỗ**, không phải thừa.

| # | Dấu hiệu | Bằng chứng |
|---|---|---|
| U1 | Page chứa business logic | 3 route 2.2k–2.7k dòng |
| U2 | Logic lặp không có abstraction | facet engine ×6, sort codec ×2, debounce ×6 |
| U3 | Không có tầng test | 0 file test |
| U4 | Hàm thuần bị nhốt trong component | `applyDiscountType` (NewQuoteDialog:407), `sortCollectionItemsByStockDesc` (thu-vien:349) — thuần nhưng không export được |
| U5 | Empty/loading state xử lý ad-hoc | 11 biến thể empty-state, 2 helper `Empty` khác chữ ký |
| U6 | Không có registry cho localStorage key | 8 key rải rác, không nơi nào liệt kê |

**Nguyên tắc đề xuất:** chỉ thêm abstraction khi có **độ phức tạp lặp lại thật** (≥3 chỗ giống
nhau về bản chất). Không thêm vì "best practice".

---

## 7. Tài liệu nói khác code (đã sửa trong đợt này)

Đối chiếu docs ↔ source theo yêu cầu, tìm được các chỗ lệch:

| File | Nói gì | Thực tế | Xử lý |
|---|---|---|---|
| `PAGE_COMPONENT_MAP.md:29` | `/thu-vien` có local component `CollectionCard`, `CollectionPicker` | **Không tồn tại.** Thực tế là `SortableGalleryCard`, `GalleryViewerDialog`, `CollectionFormDialog`, `ImagePickerDialog`, `QuickSelect`, `EmptyCollection` | ✅ sửa |
| `PROJECT_AUDIT.md:250` | `luu-tru` 2386 dòng | 2270 | ✅ sửa |
| `audit-2026-09-19.md:144-146` | `san-pham` 2322, `CustomerMappingDialog` 2040 | 2224, 1995 | ✅ sửa |
| `PAGE_COMPONENT_MAP.md:265` | `/luu-tru` filter state bắt đầu `:533` | `:507` | ✅ sửa |
| `PROJECT_STRUCTURE.md` §1 | cây thư mục thiếu `-lp-route.ts`, `PaginationBar.tsx`, `ViewModeToggle.tsx` | đã thêm | ✅ sửa |
| `tong-quan-tinh-nang.md` §16 | bảng quy mô | số mới | ✅ cập nhật |

Ngoài ra `audit-2026-09-19.md` §E1 ghi "29 lỗi tsc tồn đọng" — nay **0**. Đã cập nhật.

---

## 8. Kết luận

1. **Giữ nguyên kiến trúc.** Không rewrite, không đổi folder, không thêm layer.
2. **Vấn đề thật duy nhất ở quy mô lớn là 5 file UI quá to** — và cách sửa an toàn nhất là
   tách **hàm thuần** trước, không phải tách state.
3. **Nút thắt thật sự là không có test.** Mọi refactor lớn đều bị chặn ở đây. Dựng test cho
   hàm thuần là việc rẻ nhất, mở khoá nhiều nhất.
4. **Đừng dedup 25 chỗ xác nhận xoá 2 bước** — chúng có ≥5 biến thể thật; một primitive sẽ cần
   ~8 prop, nhiều hơn phần JSX nó thay thế. Đã ghi vào DO NOT REFACTOR.
