# ARCHITECTURE_FINAL — Innomat CRM

> Đóng đợt tối ưu kiến trúc, **2026-09-19**. Bản trước: [ARCHITECTURE_RECOMMENDATIONS](ARCHITECTURE_RECOMMENDATIONS.md)
> (đề xuất) và [REFACTOR_ROADMAP](REFACTOR_ROADMAP.md) (kế hoạch).

---

## Before

```text
src/
├── routes/     21 file  14.330 dòng   3 route 2.3k–2.7k dòng
├── components/ 36 file  11.790 dòng   2 dialog ~2k dòng
├── db/         13 file   7.605 dòng   crm.server.ts 3.204 dòng
├── lib/        26 file   2.435 dòng   ← chứa lp-route.ts TRỎ LÊN api/ (vi phạm tầng)
├── api/         2 file   2.170 dòng
├── hooks/       2 file      63 dòng
└── data/        1 file     321 dòng
                ─────────────────
                105 file  39.380 dòng

tsc:  29 lỗi  ← type checking gần như TẮT ở _app.luu-tru.tsx (2.358 dòng)
lint: đỏ toàn repo (CRLF, nền cũ)
test: 0 file
import-protection: VÔ HIỆU (client import .server.ts không bị chặn)
```

---

## After

```text
src/
├── routes/     22 file  14.112 dòng   (+ -lp-route.ts, colocated đúng chỗ)
├── components/ 38 file  11.976 dòng   (+ PaginationBar, ViewModeToggle)
├── db/         13 file   7.611 dòng
├── lib/        25 file   2.387 dòng   ← đã là LÁ thật sự, 0 vi phạm
├── api/         2 file   2.171 dòng
├── hooks/       2 file      63 dòng
└── data/        1 file     321 dòng
                ─────────────────
                107 file  39.307 dòng

tsc:   0 lỗi
build: PASS
test:  0 file  ← vẫn là nút thắt (xem Remaining Technical Debt)
import-protection: ĐANG CƯỠNG CHẾ (kiểm chứng 2 chiều)
```

---

## Improvements — những gì THỰC SỰ được cải thiện

### I1. Xoá 29 lỗi `tsc` — khôi phục type checking ở file lớn nhất

**Trước:** `_app.luu-tru.tsx` (2.358 dòng) thiếu hẳn 3 `import type`, nên toàn bộ file chạy ở
chế độ gần như không kiểm kiểu. Cộng thêm 2 chỗ khác.

**Sau:** `npx tsc --noEmit` = **0**.

Điểm quan trọng: cả 29 lỗi đều là **thiếu khai báo type**, và **3 trong số đó che giấu tính năng
bị vô type thật**:

| Chỗ | Thực chất trước khi sửa |
|---|---|
| `listFlatMediaImages` thiếu `sort` trong type | Sort của `/luu-tru` chạy được lúc runtime nhưng **không ai kiểm kiểu** |
| `ProductSuggestField` không tồn tại | Gợi ý field sản phẩm chạy ở chế độ `any` |
| `AppSidebar` cast `{nhom?: string}` | Tab kích thước ở sidebar chạy không kiểu |

**Giá trị:** từ nay mọi refactor trong 3 route lớn đều được compiler bảo vệ — đây là điều kiện
tiên quyết cho P1-1/P1-3 trong roadmap.

### I2. Sửa vi phạm tầng `lib → api` (do chính đợt cleanup trước gây ra)

**Trước:** `src/lib/lp-route.ts` import `@/api/lp` → `lib` trỏ lên trên, phá vỡ vai trò "lá" của
`lib`. Đây là lỗi do đợt cleanup trước tạo ra khi tách phần chung của 2 route landing.

**Sau:** chuyển thành `src/routes/-lp-route.ts`. Tiền tố `-` khớp
`routeFileIgnorePrefix` (mặc định `-`) của TanStack Router, nên file được colocate cạnh đúng
2 consumer mà không sinh route. **`routeTree.gen.ts` không đổi** (đã kiểm).

**Giá trị:** quét lại toàn repo → **0 vi phạm tầng, 0 chu trình**.

### I3. Gộp thanh phân trang (~100 dòng verbatim ở 2 nơi)

**Trước:** khối phân trang chép nguyên văn ở `/luu-tru` và `/khong-gian`, **đã bắt đầu trôi**
(một bên có bộ chọn số dòng/trang, một bên không).

**Sau:** `src/components/PaginationBar.tsx`. Ngoài việc bỏ trùng lặp, việc tách còn **xoá state
khỏi cả hai route**: `jumpPageInput` (state chỉ phục vụ ô "Đến: … Đi") nay nằm trong component,
cùng với `pageNumbers`. Mỗi route bỏ được: 1 `useState`, 1 phép suy diễn, 2 import icon,
1 import `getPageNumbers`.

**Kiểm chứng:** bấm sang trang 2 ở cả hai route →
`/khong-gian`: "Hiển thị 25 – 48 trên tổng số 1.250 bối cảnh" ✓
`/luu-tru`: "Hiển thị 25 – 48 trên tổng số 3.654 ảnh" ✓

### I4. Gộp nút gạt kiểu hiển thị (3 nơi)

**Trước:** container + class của nút **giống hệt** ở `/co-hoi`, `/khach-hang`, `/san-pham`,
chỉ khác icon/nhãn/tooltip — và đã trôi kỹ thuật (`cn()` ở 2 chỗ, ternary inline ở chỗ thứ ba).

**Sau:** `src/components/ViewModeToggle.tsx`, generic theo union để giữ type-safety
(`/co-hoi` dùng `"board" | "list"`, hai trang kia `"grid" | "list"`).

**Kiểm chứng:** cả 3 route render đúng nhãn + tooltip + `aria-pressed`; bấm "List" ở
`/khach-hang` → `aria-pressed` đảo `[true,false] → [false,true]` và view đổi từ card sang
`<table>` ✓

### I5. Khôi phục và cưỡng chế lưới `import-protection`

**Trước:** `client.files: ["**/server/**"]` — repo **không có thư mục `server/`** nào, và khai
`client.files` sẽ **ghi đè** mặc định `["**/*.server.*"]` của framework. Nên lưới vô hiệu: client
import `.server.ts` vẫn build xanh, kéo `node:fs`/`pg` vào bundle.

**Sau:** trả về đúng `["**/*.server.*"]`. **Kiểm chứng hai chiều** (không chỉ "build vẫn xanh"):

| Chiều | Cách làm | Kết quả |
|---|---|---|
| Có chặn | import `.server.ts` **dùng thật** vào 1 route | `exit=1`, `Denied by file pattern: **/*.server.*` |
| Không chặn nhầm | gỡ ra, build lại | `✓ built` ×3 |

### I6. Tổng hợp thay đổi

| Hạng mục | Trước | Sau |
|---|---|---|
| `tsc` errors | 29 | **0** |
| Vi phạm tầng | 1 (`lib → api`) | **0** |
| Chu trình | 0 | 0 |
| File mồ côi | 0 | 0 |
| `import-protection` | vô hiệu | **cưỡng chế** |
| Trùng lặp đã gộp | — | 2 component dùng chung (~135 dòng verbatim) |
| State xoá khỏi route | — | 2 `useState` + 2 phép suy diễn |
| Component dùng chung | 9 | **11** |
| File | 105 | 107 |
| Dòng | 39.380 | 39.307 |

---

## Remaining Technical Debt — những gì CHƯA nên động vào

| # | Nợ | Vì sao chưa làm |
|---|---|---|
| T1 | **3 route 2.2k–2.7k dòng** (`thu-vien` 2699, `luu-tru` 2270, `san-pham` 2224) | Tách hook là MEDIUM risk và **repo không có test**. Đã có kế hoạch cụ thể (roadmap P1-1) nhưng phải làm sau khi có lưới test. |
| T2 | **2 dialog ~2k dòng** (`CustomerMappingDialog` 1995, `NewQuoteDialog` 1743) | Như T1. Hàm thuần đã được định vị chính xác để tách trước. |
| T3 | **`crm.server.ts` 3204 dòng** | Tách được (đồ thị nội bộ là DAG), nhưng đây là file nghiệp vụ lõi — rủi ro cao nhất repo. Roadmap P1-3, sau P1-0. |
| T4 | **Không có test tự động** | Nút thắt thật sự. Roadmap P1-0. |
| T5 | **~216 dòng SQL/nghiệp vụ trong tầng `api`** | Di chuyển là refactor lớn; hiện đang chạy đúng. Roadmap O4. |
| T6 | **`nowLocal()` trả UTC nhưng tên nói local** | Sửa múi giờ là **đổi hành vi hiển thị** → cần bạn duyệt. Roadmap P2-4 (chỉ đổi tên). |
| T7 | **Filter của `/luu-tru` + `/khong-gian` nằm trong state, không ở URL** | Chuyển lên URL là **thay đổi hành vi**. Roadmap P2-6, cần duyệt. |
| T8 | **`curatedMaterials` + UI shortlist preview không bao giờ render** | Xoá là **thay đổi UI**. Chờ bạn quyết (CLEANUP_REPORT NEEDS REVIEW #3). |
| T9 | **`logoutPublicSession` mất consumer** | Là khả năng kết thúc phiên khách — quyết định sản phẩm (CLEANUP_REPORT NEEDS REVIEW #1). |
| T10 | **`loginFn` / `submitLpLeadFn` trả object lỗi, mutation khác throw** | Đã chốt luật trong CODE_ARCHITECTURE_GUIDE §11; không sửa code. |
| T11 | **Lint đỏ toàn repo (CRLF)** | Nền cũ trên Windows; **không chạy `--fix`** (sẽ ghi lại line-ending toàn repo). |
| T12 | **Nợ type rải rác** (`row as any[]`, `React.CSSProperties` không import) | Nhỏ, lẻ tẻ; sửa không đáng một lượt review riêng. |

---

## Future Recommendations — việc có thể làm sau, chưa cần ngay

1. **Thêm `npm run typecheck` vào quy trình** để 29 lỗi không quay lại. Rẻ, giá trị cao.
2. **Bật lại `@typescript-eslint/no-unused-vars`** — hiện đang `"off"`, chính là lý do 49 import
   chết tồn tại lâu. Cần một đợt riêng vì sẽ tạo nhiều cảnh báo trên code hiện tại.
3. **Đo lại `docs/`** — AGENTS.md đã có quy ước chống chép số liệu tay; §16 của
   `tong-quan-tinh-nang.md` là nơi duy nhất giữ số quy mô, nên mọi tài liệu khác chỉ nên trỏ về.
4. **Xét `src/render/`** cho 2 module sinh HTML (815 dòng) đang nằm trong `src/db/` (roadmap P2-3).
5. **`/luu-tru` có 47 `useState` nhưng thực chất chỉ 8 khái niệm**, và ~9 state là **suy ra được**.
   Khi có test, đây là chỗ gộp state cho lợi ích lớn nhất trong toàn repo.

---

## Validation

```text
Lint:      FAIL  (nền cũ: 44.370/44.386 lỗi là CRLF trên Windows;
                  file KHÔNG bị chạm cũng cho 79 lỗi y hệt ở HEAD — không do đợt này)
Typecheck: PASS  (0 lỗi; baseline cũ 29)
Tests:     N/A   (repo không có test suite — xem T4)
Build:     PASS  (vite build + nitro vercel + postbuild)
```

---

## Completed Refactors (đợt được duyệt, 2026-09-19)

1. **P1-0** — Lưới test đầu tiên: `node --test` (0 dependency mới, Node 24 type-strips TS).
   10 file test trong `src/lib/`, script `npm test`. **67 test pass**.
2. **P1-1** — Rút 4 nhóm hàm thuần khỏi các file khổng lồ:
   - NewQuoteDialog (1743) → `lib/quote-calc.ts` (Line + 7 hàm toán BG) + 10 test
   - `/thu-vien` (2699) → `lib/gallery-sort.ts` (codec sort + việt hoá + stock sort) + 7 test
   - `/san-pham` (2225) → `lib/product-facets.ts` (facet primitives + sort codec) + 7 test
   - `CustomerMappingDialog` (1995) → `lib/mapping-draft.ts` (Draft + blankDraft + autoPriceFor) + 4 test
3. **P1-2** — Gộp 4 memo facet cùng khuôn của `/san-pham` vào `countFacet()`.
   Giữ 2 biến thể có chủ đích (color: tông + thứ tự riêng; shape: sort alphabet).
4. **P1-3** — Tách tail 711 dòng của `crm.server.ts` (3205 → 2493) ra `db/media.server.ts`
   (product CRUD + flat media + bulk tag). Rewire 3 importer. 0 chu trình.
5. **P2-1** — `EmptyState` dùng chung cho 3 trang bare-empty; giữ biến thể icon/CTA.
6. **P2-2** — luật error-signalling đã ghi vào CODE_ARCHITECTURE_GUIDE §11 (mutation throw;
   chỉ endpoint dự đoán được mới trả object).
7. **P2-3** — 2 trình sinh HTML (export-quote 488 + export-mapping 327) chuyển khỏi `src/db/`
   sang `src/render/`.
8. **P2-4** — `nowLocal()` → `nowUtc()` (9 file; đổi tên, KHÔNG đổi giá trị — đổi múi giờ là
   đổi hành vi, để riêng).
9. **P2-5** — Registry `STORAGE_KEYS` cho 8 key localStorage (giá trị giữ nguyên).

## Architecture Changes (Before → After)

```text
Before:                              After:
src/db/crm.server.ts   3.205 dòng   src/db/crm.server.ts   2.493 dòng
                                     src/db/media.server.ts   722 dòng (mới)
src/db/export-*.server  815 dòng     src/render/export-*.server  815 dòng (đổi chỗ)
src/lib (source)         24 file     src/lib (source)         30 file (+5 domain lib)
                                      (+10 file test — test đầu tiên trong repo)
0 test                                67 test (node --test)
nowLocal (tên nói dối UTC)           nowUtc (tên đúng)
8 localStorage key rải rác           STORAGE_KEYS registry
```

**Cải thiện cốt lõi:** lần đầu tiên repo có một **lưới kiểm chứng tự động** cho các hàm tính
toán dễ sai nhất (tiền, m²/viên, trùng SĐT, mã nội bộ, facet count). Ba file UI khổng lồ nhỏ
đi ~300 dòng tổng và phần logic của chúng giờ test được. Cấu trúc tầng sau cùng:
`routes → components → api → db/render → driver → Postgres`, `lib` là lá thuần.

**Smoke test sau thay đổi:**

| Kiểm | Kết quả |
|---|---|
| 11 route render, 0 trang lỗi | ✅ |
| `/khong-gian` phân trang → trang 2 | ✅ "25 – 48 trên 1.250 bối cảnh" |
| `/luu-tru` phân trang → trang 2 | ✅ "25 – 48 trên 3.654 ảnh" |
| 3 nút gạt kiểu hiển thị render đúng nhãn/tooltip/`aria-pressed` | ✅ |
| Bấm "List" ở `/khach-hang` đổi view card → table | ✅ |
| `routeTree.gen.ts` không đổi sau khi thêm `-lp-route.ts` | ✅ |
| Import-protection chặn client import `.server.ts` (test âm) | ✅ `exit=1` |
| 72 link markdown trong `docs/` + `README` + `AGENTS.md` | ✅ 0 hỏng |
