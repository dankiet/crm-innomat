# CLEANUP_PLAN — Innomat CRM

> Lập ngày **2026-09-19** sau khi hoàn tất [PROJECT_AUDIT](PROJECT_AUDIT.md),
> [PROJECT_STRUCTURE](PROJECT_STRUCTURE.md), [PAGE_COMPONENT_MAP](PAGE_COMPONENT_MAP.md).
>
> **Nguyên tắc áp dụng** (theo yêu cầu): không xoá chỉ vì "nhìn có vẻ không dùng";
> mọi mục đều có bằng chứng grep/compiler; ưu tiên thay đổi nhỏ, rõ, dễ review;
> không đổi business logic / UI behavior / API contract / routing.
>
> Cột **Trạng thái** được cập nhật khi thực thi: `✅ xong` / `⏭ bỏ qua` / `🔍 chờ review`.

---

## A. SAFE — xoá/đổi được ngay, đã chứng minh bằng compiler hoặc grep

### A1. Xoá file scratch

| # | Việc | Bằng chứng | Trạng thái |
|---|---|---|---|
| A1.1 | Xoá `scripts/_tmp-verify-cols.mjs` | 0 tham chiếu ở mọi nơi (grep toàn repo); là script dò cột tạm do chính phiên làm việc trước tạo ra | ✅ |

### A2. Import / biến / prop không dùng — **44 mục, compiler xác nhận**

Nguồn: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` → `TS6133`/`TS6196`.
Đây là bằng chứng mạnh nhất có thể có: TypeScript tự khẳng định không có tham chiếu nào.

| File | Dòng | Symbol | Trạng thái |
|---|---|---|---|
| `src/api/functions.ts` | 16 | `FlatMediaSort` (type) | ✅ |
| `src/routes/auth.callback.tsx` | 2 | `useNavigate` | ✅ |
| `src/routes/_app.san-pham.tsx` | 61,62,63,67 | `Globe`, `Eye`, `EyeOff`, `Loader2` | ✅ |
| `src/routes/_app.san-pham.tsx` | 1135,1154 | `bulkPublish`, `bulkUnpublish` (hàm chết) | ✅ |
| `src/routes/_app.san-pham.tsx` | 2022,2158 | prop `onTogglePublic` (khai nhưng không đọc) | ✅ |
| `src/routes/_app.luu-tru.tsx` | 11,17 | `Eye`, `Layers` | ✅ |
| `src/routes/_app.luu-tru.tsx` | 237,1381 | `loadingSlots`, `hasTag` | ✅ |
| `src/routes/_app.khong-gian.tsx` | 16 | `useMemo` | ✅ |
| `src/routes/_app.khong-gian.tsx` | 29,31,33,34 | `Check`, `SlidersHorizontal`, `Building2`, `CheckCircle2` | ✅ |
| `src/db/space-collections.server.ts` | 10,12 | `LpMaterial`, `nowLocal` (hàm chết) | ✅ |
| `src/components/AppSidebar.tsx` | 3,22 | `LayoutDashboard`, `Sparkles` | ✅ |
| `src/components/BulkEditFieldDialog.tsx` | 7 | `Sparkles` | ✅ |
| `src/components/EditProductDialog.tsx` | 213 | `syncedCodes` | ✅ |
| `src/components/landing/ArchitectLanding.tsx` | 26,33 | `curatedMaterials`, `LineId` | ✅ |
| `src/components/landing/ArchitectLanding.tsx` | 111 | `addMultipleToShortlist` (hàm chết) | ✅ |
| `src/components/landing/MaterialLibraryPage.tsx` | 7,8,9,17 | `Download`, `Box`, `FileText`, `X` | ✅ |
| `src/components/landing/MaterialLibraryPage.tsx` | 25,43,77 | `CatalogFacetOption`, `UNLOCKED_STORAGE_KEY`, `loading` | ✅ |
| `src/components/landing/MaterialModal.tsx` | 1,51 | `useRef`, `imgNatural` (state chỉ ghi, không đọc) | ✅ |
| `src/components/landing/MoodboardDrawer.tsx` | 6,11 | `Download`, `FileText` | ✅ |
| `src/components/landing/ProjectBriefForm.tsx` | 10,17 | `Send`, `Material` | ✅ |
| `src/components/landing/ProjectBriefForm.tsx` | 19,38 | prop `shortlistCount` (khai + truyền, không đọc) | ✅ |
| `src/components/landing/SpaceLookbookSection.tsx` | 10,305 | `SlidersHorizontal`, tham số `index` | ✅ |

### A3. Export không có consumer — **19 mục, chỉ bỏ từ khoá `export`**

Đã grep `\bSYMBOL\b` trên `src/`, `scripts/`, `docs/`, `README.md`, `AGENTS.md` và mọi file
cấu hình. Tất cả **vẫn sống trong file của nó**; chỉ từ khoá `export` là thừa.

| Symbol | File:line | Dùng nội bộ ở | Trạng thái |
|---|---|---|---|
| `EXPORT_JPEG_QUALITY` | `src/lib/image-export.server.ts:18` | :65 | ✅ |
| `EXPORT_STAMP_MAX_SIDE` | `src/lib/image-export.server.ts:20` | :121 | ✅ |
| `ExportImagePool` | `src/lib/image-export.server.ts:75` | :84 (kiểu trả về) | ✅ |
| `resizeForExport` | `src/lib/image-export.server.ts:50` | :95 | ✅ |
| `LeadResult` | `src/db/lp.server.ts:473` | :481 | ✅ |
| `getLpSetting` / `setLpSetting` | `src/db/lp.server.ts:786,794` | :809,813 | ✅ |
| `PUBLIC_SESSION_COOKIE` | `src/db/auth-public.server.ts:12` | :35,43,57 | ✅ |
| `PublicUser` | `src/db/auth-public.server.ts:15` | :104,119,158,170,225,342 | ✅ |
| `clearPublicSessionCookie` | `src/db/auth-public.server.ts:55` | :192 | ✅ |
| `createPublicSession` | `src/db/auth-public.server.ts:136` | :287 | ✅ |
| `getPublicSessionToken` | `src/db/auth-public.server.ts:33` | :159,186 | ✅ |
| `setPublicSessionCookie` | `src/db/auth-public.server.ts:41` | :151 | ✅ |
| `upsertPublicUser` | `src/db/auth-public.server.ts:100` | :286 | ✅ |
| `TransactionRunner` / `makeTxCallable` | `src/db/driver.ts:35,37` | :70,288,324 / :289,326 | ✅ |
| `ListPublicSpaceCollectionsOptions` | `src/db/space-collections.server.ts:99` | :105 | ✅ |
| `PublicSpaceCollection` | `src/db/space-collections.server.ts:20` | :106 | ✅ |
| `ImageRoomTagSource` | `src/lib/types.ts:27` | :39 | ✅ |
| `LpEvent` | `src/lib/lp-tracking.ts:18` | :20,28 | ⏭ giữ — là kiểu tham số của `trackEvent` đã export |
| `SPACE_TYPES` | `src/lib/types.ts:16` | :25,30 | ⏭ giữ — `audit-2026-09-19.md` §G5 đã chốt giữ |

### A4. Symbol chết hoàn toàn (xoá hẳn, không chỉ bỏ `export`)

| # | Symbol | File:line | Bằng chứng | Trạng thái |
|---|---|---|---|---|
| A4.1 | `logoutPublicFn` (endpoint) | `src/api/functions.ts:107` | 0 caller trên toàn repo (grep `logoutPublicFn` → chỉ có khai báo + re-export) | ✅ |
| A4.2 | re-export `logoutPublicFn` | `src/api/lp.ts:105` | re-export của symbol chết ở A4.1 | ✅ |
| A4.3 | type `Collection` | `src/data/mockData.ts:32` | grep `\bCollection\b` → chỉ có khai báo này (các hit khác là `gallery_collections`, comment, docs) | ✅ |

### A5. Cấu hình cũ thời Vinxi

| # | Việc | Bằng chứng | Trạng thái |
|---|---|---|---|
| A5.1 | Bỏ `.vinxi` khỏi `eslint.config.js:9` | Repo không còn dependency `vinxi`; TanStack Start 1.x chạy trên Vite thuần | ✅ |
| A5.2 | Bỏ `.vinxi` khỏi `.gitignore:14` | Không có gì sinh ra thư mục này | ✅ |
| A5.3 | Bỏ `.vinxi` khỏi `.prettierignore:4` | như trên | ✅ |

---

## B. LOW RISK — hợp nhất trùng lặp đã xác nhận, behavior tương đương

Mỗi mục dưới đây đã đối chiếu **thân hàm** (không chỉ tên) và xác nhận tương đương.

### B1. `nowLocal()` — 6 bản sao y hệt trong `src/db/`

```
auth.server.ts:12      auth-public.server.ts:23   crm.server.ts:30
gallery.server.ts:10   lp.server.ts:28            users.server.ts:12
(+ space-collections.server.ts:12 — đã chết, xoá ở A2)
```

→ Gộp về một helper dùng chung trong `src/lib/format.ts`, 6 module import lại.
Bằng chứng tương đương: cả 6 thân hàm giống hệt từng ký tự sau khi chuẩn hoá khoảng trắng.

### B2. `expiresAt(days)` — 2 bản sao, khác nhau đúng hằng số mặc định

`auth.server.ts:16` (mặc định `SESSION_DAYS`) và `auth-public.server.ts:27` (mặc định
`PUBLIC_SESSION_DAYS`). → Gộp phần tính toán về `src/lib/format.ts`, mỗi module truyền hằng
số của mình.

### B3. `getPageNumbers()` — 2 bản sao y hệt

`src/routes/_app.luu-tru.tsx:88` và `src/routes/_app.khong-gian.tsx:63`. → Gộp về
`src/lib/pagination.ts`.

### B4. `basisToDiscountType()` — 2 bản sao y hệt

`src/components/CustomerMappingDialog.tsx:99` và `src/db/export-mapping.server.ts:28`
(cùng là `basis === "tp" ? "tp" : basis === "b2b" ? "b2b" : "none"`).
→ Gộp về `src/lib/pricing.ts` (đã là nơi giữ quy tắc giá/chiết khấu).

### B5. `escapeHtml()` — 2 bản sao

`src/lib/product-quick-sheet.ts:52` và `src/db/export-mapping.server.ts:32`.
→ Gộp về `src/lib/format.ts`.

### B6. `inputCls` — 1 chuỗi Tailwind lặp 6 lần

`EditProductDialog.tsx:695`, `EditProductImagesDialog.tsx:427`, `NewCustomerDialog.tsx:556`,
`NewNoteDialog.tsx:214`, `NewProductDialog.tsx:657`, `NewQuoteDialog.tsx:1743`.
→ Gộp về `src/lib/utils.ts` cạnh `cn`.

### B7. Phần chung của `/` và `/lp/$slug` — 67% token trùng

`src/routes/index.tsx` (59 dòng) vs `src/routes/lp.$slug.tsx` (66 dòng): `head()` **giống hệt
từng ký tự**, đuôi `loader` (gọi `fetchLpHeroImageFn` + try/catch) giống hệt, hàm component
giống hệt. → Tách `lpHead(title)` + `loadLpHero()` vào `src/lib/lp-route.ts`.
**Giữ nguyên 2 route** (khác nhau ở redirect slug mặc định / 404 — đó là hành vi thật).

### B8. Type `CrmConcept*` khai 2 nơi và đã **trôi lệch** — sửa luôn bug

`src/lib/lp-types.ts:198-238` vs `src/db/space-collections.server.ts:249-295`.
Ba type giống hệt; riêng `CrmConceptFilter` **khác thật**: bản trong `db` có thêm
`category` và `color` (`space-collections.server.ts:274,276`) — đúng thứ route
`_app.khong-gian.tsx:308` gửi lên. → Đưa bản **đầy đủ** vào `src/lib/lp-types.ts` (module type
dùng chung, client-safe), `space-collections.server.ts` import lại. Xoá bản trùng.

### B9. `FormSection` / `Field` / `SUGGEST_FIELDS` — dùng chung giữa 2 dialog sản phẩm

`EditProductDialog.tsx:667,678` vs `NewProductDialog.tsx:629,640` (giống hệt) và hằng
`SUGGEST_FIELDS` + type `SuggestField` khai 2 lần.
→ Tách vào `src/components/ProductFormFields.tsx`.
**Không gộp 2 dialog** — chúng khác nghiệp vụ (tạo vs sửa, có/không luồng xoá, có/không nút ảnh).

### B10. `Stat` — 2 bản sao y hệt

`src/routes/_app.cong-no.tsx:617` và `src/routes/_app.khach-hang.$customerId.tsx:1221`.
→ Tách vào `src/components/Stat.tsx`.

### B11. Đổi tên `src/lib/storage.ts` → `src/lib/storage.server.ts`

Module này import `node:fs`, `node:crypto`, ghi `public/images` nhưng **không** có hậu tố
`.server.ts` như các sibling (`image-upload.server.ts`, `image-export.server.ts`,
`brand-assets.server.ts`). 5 consumer, **tất cả đều là module server**.
→ Đổi tên + cập nhật 5 dòng import. Không đổi hành vi, chỉ khôi phục quy ước.

### B — kết quả thực thi

| Mục | Kết quả |
|---|---|
| B1 `nowLocal` | ✅ gộp 6 bản sao về `src/lib/format.ts` |
| B2 `expiresAt` | ✅ gộp về `src/lib/format.ts`, mỗi module truyền hằng số của mình |
| B3 `getPageNumbers` | ✅ gộp về `src/lib/pagination.ts` |
| B4 `basisToDiscountType` | ✅ gộp về `src/lib/pricing.ts` (kèm đưa `MappingPriceBasis` về `lib/types.ts`) |
| B5 `escapeHtml` | ✅ gộp về `src/lib/format.ts` |
| B6 `inputCls` | ✅ gộp 5/6 chỗ về `src/lib/utils.ts`. `_app.cong-no.tsx` **giữ nguyên** — khác thật (`mt-1`, không có `text-foreground`) |
| B7 phần chung `/` và `/lp/$slug` | ✅ tách vào `src/lib/lp-route.ts`, giữ nguyên 2 route |
| B8 type `CrmConcept*` | ✅ nguồn chuẩn ở `lib/lp-types.ts`; sửa luôn bug trôi lệch `CrmConceptFilter` |
| B9 `FormSection`/`Field`/`SUGGEST_FIELDS` | ✅ tách vào `src/components/ProductFormFields.tsx` |
| B10 `Stat` | ⏭ **KHÔNG gộp** — đọc kỹ thì hai bản khác nhau về markup và kiểu prop (`accent: string` vs `accent?: boolean`); gộp sẽ đổi giao diện một trang. Máy dò trùng lặp báo 1.00 nhưng đó là dương tính giả |
| B11 đổi tên `storage.ts` | ✅ `src/lib/storage.server.ts` + 5 import |

**Phát sinh ngoài kế hoạch (cùng loại bằng chứng, đã làm):**

- B12 — gộp `CustomerMapping` + `CustomerMappingItem` (khai 2 nơi, `linked_quotes[].status`
  bản client hard-code thay vì dùng `QuoteStatus`) về `src/lib/types.ts`.
- B13 — xoá re-export chết: `authGoogleCallback` (`api/lp.ts`), `normalizeUsername`
  (`users.server.ts`), và import `normalizeUsername` đi kèm.
- B14 — xoá chuỗi chết bậc hai: `addMaterials` trong `useShortlistStorage` (consumer duy nhất
  là `addMultipleToShortlist` vừa chết).

**Đợt 2b — rà soát lại sau commit (7 việc, 2 là lỗi thật):**

- B15 — ⚠️ **`vite.config.ts`: lưới import-protection bị hạ cấp thành vô hiệu.** `client.files`
  khai `["**/server/**"]` (repo không có thư mục `server/`), trong khi framework mặc định là
  `["**/*.server.*"]` và config người dùng **ghi đè** chứ không merge. Đã trả về đúng
  `["**/*.server.*"]` (KHÔNG tự thu hẹp thành `*.server.ts` — làm vậy là lặp lại đúng kiểu lỗi
  đang sửa) và **kiểm chứng hai chiều**: import `.server.ts` dùng thật → build FAIL `exit=1`
  (`Denied by file pattern: **/*.server.*`); gỡ ra → xanh. Đây là thứ làm cho việc đổi tên B11
  mới thật sự có nghĩa.
- B16 — ⚠️ **`useShortlistStorage`: prune `setShortlistIds` + `isHydrated`** (0 tham chiếu
  ngoài hook, consumer duy nhất chỉ dùng 3/5 thành viên). Đây là lỗ hổng của phương pháp:
  `tsc --noUnusedLocals` **không** thấy thuộc tính thừa trong object literal được `return`.
- B17 — sửa 5 chỗ tài liệu mâu thuẫn với code (2 trong `PROJECT_STRUCTURE.md` do chính đợt này
  gây ra, 1 ở `tong-quan-tinh-nang.md`, 1 bảng đảo ngược ở `san-pham-ton-kho-import.md`,
  3 dòng ở `audit-2026-09-19.md`).
- B18 — sửa một khẳng định **sai** của chính báo cáo: catch chuỗi SQLite bị thổi lên mức CAO;
  thực tế **không tới được** (xem CLEANUP_REPORT §B18).
- B19 — kiểm chứng lại `vision-batch-runner.mjs`: 8 cột = 8 giá trị, `'accepted'` đã sạch.
- B20 — ghi nhận `nowLocal` trả giờ UTC dù tên là "local" (không sửa — đổi hành vi).
- B21 — **không kiểm được** trạng thái deploy Vercel từ môi trường này (CLI không có credentials).

**Kết quả kiểm chứng:** `tsc` 29 lỗi (đúng baseline, không tăng), 0 phát hiện unused,
`npm run build` PASS, 13/13 route render không lỗi, 2 dialog sản phẩm + dialog đề xuất vật liệu
mở đúng, 3 route landing trả đúng 200/301/404. Chi tiết: [CLEANUP_REPORT](CLEANUP_REPORT.md).

---

## C. NEEDS REVIEW — có bằng chứng nhưng **không tự xử lý**

| # | Vấn đề | Bằng chứng | Vì sao không tự xử lý |
|---|---|---|---|
| C1 | **Chuỗi lỗi SQLite trong code PostgreSQL** | `src/api/functions.ts:1574` bắt `"FOREIGN KEY constraint failed"`; driver là `pg` (`src/db/driver.ts:1`) → nhánh bỏ qua không bao giờ chạy, 1 `product_code` sai làm hỏng cả lần import | Sửa = **đổi hành vi import**. Cần người quyết định |
| C2 | **`curatedMaterials` + UI xem trước shortlist là scaffolding chết** | `mockData.ts:117-119` id `"m1".."m12"`; consumer `ProjectBriefForm.tsx:60-62` lọc theo id số từ server (`ArchitectLanding.tsx:75`) → không bao giờ khớp; UI ở `ProjectBriefForm.tsx:205-238,290-330` không bao giờ render | Xoá là **thay đổi UI**. Có thể là tính năng đang chờ nối dây |
| C3 | 10 hằng ảnh trong `mockData.ts` chỉ phục vụ `curatedMaterials` | `mineralGreenSurfaceImage:68`, `sandMatteSurfaceImage:69`, `oliveTileSurfaceImage:70`, `rippleAmberSurfaceImage:71`, `fishScaleMosaicSurface:74`, `crackleSquareMosaicSurface:75`, `hexSandMosaicSurface:76`, `terrazzoSurfaceImage:80`, `courtyardCollectionImage:62`, `hospitalityCollectionImage:64` | Phụ thuộc quyết định C2 |
| C4 | `LP_VARIANTS` chỉ dùng `.eyebrow`; 6 field khác không render | `src/lib/lp-content.ts:33-85` vs `index.tsx:16`, `lp.$slug.tsx:16` | Có thể là nội dung đang chờ dùng lại |
| C5 | `logoutPublicFn` bị xoá ở A4.1 — nhưng **UI đăng xuất khách chưa từng có** | 0 caller | Nếu người dùng muốn thêm nút đăng xuất khách thì phải viết lại endpoint. Đã ghi vào CLEANUP_REPORT |
| C6 | 29 lỗi TypeScript tồn đọng; `_app.luu-tru.tsx` **thiếu hẳn import** 3 type (`ImageRoomTagSlug`, `ProductImageKind`, `ProductImageRow`) | `npx tsc --noEmit` | Sửa được nhưng nằm ngoài phạm vi cleanup; baseline repo là 29 |
| C7 | SQL/nghiệp vụ nằm trong tầng API | `functions.ts:1558-1749`, `lp.ts:94-97,210-231` | Di chuyển = refactor lớn, rủi ro cao |
| C8 | 3 route 2.3k–2.7k dòng | `_app.thu-vien.tsx`, `_app.luu-tru.tsx`, `_app.san-pham.tsx` | Tách hook là refactor lớn; không có test lưới an toàn |
| C9 | 2 taxonomy màu song song | `src/lib/color-tones.ts:21` (8 nhóm) vs `src/lib/color-palette.ts:18` (11 nhóm) | Là quyết định nghiệp vụ, không phải trùng lặp kỹ thuật |
| C10 | `src/db/index.server.ts` — facade 1 dòng, 12 file dùng nhưng `gallery.server.ts` đi thẳng `./driver` | `index.server.ts:6`, `gallery.server.ts:1` | Không sai, chỉ không nhất quán. Gộp hay không là sở thích kiến trúc |
| C11 | `driver.ts` hard-code danh sách bảng để thêm `RETURNING id` | `driver.ts:80-101,265-270` | Thêm bảng mới mà quên khai sẽ trả `lastInsertRowid: null` âm thầm — sửa cần thiết kế lại |
| C12 | Module `auth` ghi thẳng `lp_leads` + chứa copy tiếng Việt | `src/db/auth-public.server.ts:289-330` | Sai tầng nhưng đang chạy đúng; di chuyển = rủi ro |
| C13 | `React.CSSProperties` dùng không import; `row as any[]`; `previewData?: any[]` | `_app.co-hoi.tsx:169`, `_app.san-pham.tsx:473`, `ImportStockDialog.tsx:14` | Nợ type nhỏ, sửa lẻ tẻ không đáng một lượt review |
| C14 | Xác nhận xoá 2 bước lặp ~15 lần, chưa có component chung | nhiều file (xem PAGE_COMPONENT_MAP) | Tạo abstraction mới cho 15 chỗ là refactor UI — cần review kỹ |
| C15 | `public/favicon.ico` không được tham chiếu | `public/favicon.ico`; chỉ `favicon.png`/`favicon-ebg.svg` được khai | Trình duyệt tự gọi `/favicon.ico`; xoá sẽ tạo 404 |
| C16 | `loadDotEnvFile` lặp ở `scripts/db-migrate.mjs:15` và `scripts/enable-rls.mjs:20` | 2 bản giống hệt | Script chạy độc lập, gộp cần thêm module dùng chung cho `scripts/` |
| C17 | `tmp/` chứa ~30 mục scratch (gồm `catalog.xlsx` 53.5 MB) | `.gitignore:51` — **không tracked** | Là dữ liệu local của người dùng, không phải repo |
| C18 | README/docs ghi "19 bảng" (thực tế 25) và số endpoint lệch | `README.md:17`, `docs/cai-dat-va-moi-truong.md:22` | Sửa được, nhưng AGENTS.md cấm chép số liệu tay → nên trỏ về nguồn |

---

## D. DO NOT TOUCH

| # | Thứ | Vì sao |
|---|---|---|
| D1 | `src/routeTree.gen.ts` | File sinh tự động; sửa tay sẽ bị ghi đè |
| D2 | `src/start.ts`, `src/server.ts`, `src/router.tsx` | Entry point framework (`vite.config.ts:41` trỏ `server.entry = "server"`). Grep tĩnh cho 0 tham chiếu là **bình thường** |
| D3 | `src/db/schema-pg.sql` | Nguồn schema duy nhất; mọi thay đổi bảng phải qua file này |
| D4 | `AGENTS.md` | Nguồn luật duy nhất của repo |
| D5 | `em-ban-gach/` | Gitignored, 0 file tracked, là tài liệu thiết kế gốc của người dùng |
| D6 | `tmp/` | Gitignored, dữ liệu local |
| D7 | `.env`, `.env.*` | Gitignored, chứa secret |
| D8 | `docs/audit-2026-09-19.md` §G và 4 tài liệu audit mới | Là bằng chứng của chính quy trình này |
| D9 | Mọi dependency trong `package.json` | Đã kiểm: tất cả đều được dùng (kể cả `@types/*` — dùng ngầm bởi tsc, và `eslint-config-prettier` — nạp qua `eslint-plugin-prettier/recommended` ở `eslint.config.js:2`) |
| D10 | `public/favicon.ico` | Trình duyệt tự gọi; xoá gây 404 (xem C15) |

---

## E. Thứ tự thực thi

1. **A** (SAFE) — rủi ro bằng 0, làm trước để thu hẹp bề mặt.
2. **B** (LOW RISK) — từng mục một, mỗi mục chạy `tsc` + `build` sau khi xong.
3. **Re-scan** toàn bộ sau khi A+B xong (một deletion có thể sinh dead code mới).
4. **C** — chỉ ghi nhận vào CLEANUP_REPORT, không sửa.
5. **Validation** cuối: `npx tsc --noEmit` (phải ≤ 29 lỗi), `npm run build`, `npm run lint`.
6. **CLEANUP_REPORT** + cập nhật lại PROJECT_STRUCTURE / PAGE_COMPONENT_MAP.

## F. Điều kiện dừng (revert)

Bất kỳ mục nào trong A/B mà:
- làm `tsc` tăng số lỗi, hoặc
- làm `npm run build` fail, hoặc
- không chứng minh được tương đương hành vi

→ **revert mục đó**, ghi vào CLEANUP_REPORT, chuyển sang NEEDS_REVIEW.
