# PROJECT_AUDIT — Innomat CRM

> Audit ngày **2026-09-19**, trên working tree tại nhánh `feature/lp-and-crm-rollout`.
> Mọi khẳng định đều kèm `path:line`. Không có mục nào suy đoán từ tên file.
> Phạm vi: toàn bộ repo (105 file `src/`, 9 script, 14 tài liệu, cấu hình build/deploy).
> Tài liệu này là **ảnh chụp TRƯỚC cleanup**; bản sau cleanup nằm ở
> [PROJECT_STRUCTURE](PROJECT_STRUCTURE.md) và [CLEANUP_REPORT](CLEANUP_REPORT.md).

---

## 1. Tech Stack

| Lớp | Công nghệ | Bằng chứng |
|---|---|---|
| Framework | **TanStack Start 1.168** (file-based routes + SSR) | `package.json:34`, `vite.config.ts:35` |
| Build tool | **Vite 8** + `@vitejs/plugin-react`, `lightningcss` | `vite.config.ts:54,68` |
| Deploy target | **Nitro preset `vercel`** (chỉ bật khi `command === "build"`) | `vite.config.ts:48-52`, `vercel.json:1` |
| Ngôn ngữ | **TypeScript 5.8** (`strict: true`) | `tsconfig.json:3,18` |
| UI | **React 19** + **Tailwind CSS 4** (`@tailwindcss/vite`) | `package.json:41-42`, `vite.config.ts:27` |
| UI primitives | **Radix UI** (`react-dialog`, `react-popover`) bọc theo shadcn | `src/components/ui/dialog.tsx:4`, `src/components/ui/popover.tsx` |
| Icons / toast | `lucide-react`, `sonner` | `src/components/AppSidebar.tsx:2`, `src/components/ui/sonner.tsx` |
| State — server | **TanStack Query** (chỉ 2 màn dùng) + route `loader` | `src/routes/_app.nguoi-dung.tsx:7`, `src/routes/_app.nhat-ky.tsx:2` |
| State — URL | `validateSearch` + `loaderDeps` + `navigate({search})` | `src/routes/_app.san-pham.tsx:388-416` |
| State — local | `useState` + 2 hook nội bộ | `src/hooks/useLocalStorageState.ts`, `src/hooks/useHistoryLayer.ts` |
| Drag & drop | `@dnd-kit/core` + `sortable` + `utilities` | `src/routes/_app.co-hoi.tsx:4-14` |
| Database | **PostgreSQL** qua `pg` (Pool), không ORM | `src/db/driver.ts:1`, `package.json:38` |
| Schema | 1 file SQL duy nhất, áp bằng 1 transaction | `src/db/schema-pg.sql`, `scripts/db-migrate.mjs:1` |
| Storage ảnh | **Supabase Storage** (`@supabase/storage-js`) + mirror local `public/images` | `src/lib/storage.ts:1`, `scripts/storage-backup.mjs:1` |
| Xử lý ảnh | `sharp` (server), canvas API (client) | `src/lib/image-upload.server.ts:6`, `src/lib/image-upload.ts:4` |
| Excel | `xlsx` (import/export sản phẩm, tồn kho) | `src/db/product-import-export.server.ts:717` |
| PDF | `pdfjs-dist` (đọc PDF trong hộp thoại mapping) | `src/components/CustomerMappingDialog.tsx:433` |
| Auth | Session cookie tự viết (scrypt hash) + Google OAuth qua Supabase | `src/db/auth.server.ts:177`, `src/db/auth-public.server.ts:1` |
| Validation | `inputValidator` của `createServerFn` (không dùng zod/yup) | `src/api/functions.ts:20` |
| Testing | **Không có** — 0 file `*.test.*` / `*.spec.*` / thư mục `test/` | glob `**/*.{test,spec}.*` → 0 kết quả |
| Lint / format | ESLint 9 (flat config) + Prettier 3 | `eslint.config.js:1`, `.prettierrc` |
| Package manager | npm (`package-lock.json`) | `package-lock.json` |

**Không dùng**: Next.js, Remix, Express, Prisma, Drizzle, zod, Redux, Zustand, react-hook-form,
Tailwind `tailwind.config.js` (Tailwind 4 dùng CSS-first qua `src/styles.css`).

---

## 2. Architecture

Kiến trúc thực tế (đã đối chiếu source, không suy từ tên thư mục):

```text
Browser
   │
   ├── TanStack Router (file routes trong src/routes/)
   │      ├── __root.tsx ── khung HTML, Toaster, ErrorComponent, notFound
   │      ├── index.tsx / lp.$slug.tsx ── landing công khai (ArchitectLanding)
   │      ├── login.tsx / auth.callback.tsx ── công khai
   │      └── _app.tsx ── layout có auth (beforeLoad → fetchMe → /login)
   │             └── 15 route nghiệp vụ (_app.*.tsx)
   │
   ├── Route loader  ──►  createServerFn (src/api/functions.ts, src/api/lp.ts)
   │                            │  (transport mỏng: inputValidator + handler)
   │                            ▼
   │                      await import("@/db/<x>.server")   ← dynamic import
   │                            │
   │                            ▼
   │                      src/db/*.server.ts   (nghiệp vụ + SQL)
   │                            │
   │                            ▼
   │                      src/db/driver.ts     (Pool + query/run/tx, RETURNING id)
   │                            │
   │                            ▼
   │                      PostgreSQL (25 bảng public)
   │
   └── src/lib/**  ── lớp dùng chung isomorphic (types, format, pricing,
                      product-search, taxonomy, product-categories)
```

**Điểm cốt lõi cần biết:**

1. **Server chỉ chạm được qua `createServerFn`.** Không route/component nào import trực tiếp
   `src/db/**` (chỉ có `import type` ở `src/routes/_app.luu-tru.tsx:48,53`). Vite chặn client
   import module `.server.ts` (`importProtection.client.files = ["**/*.server.*"]`,
   `vite.config.ts:38-54`) — xem [PROJECT_STRUCTURE](PROJECT_STRUCTURE.md) §4.
2. **`src/db/*.server.ts` được nạp bằng dynamic import** bên trong handler
   (`src/api/functions.ts:20`). Đây là lý do mọi phân tích import tĩnh phải quét thêm
   `await import(...)`, nếu không sẽ kết luận sai là "file chết".
3. **Hai tầng "server state" song song**: 15 route dùng route `loader` + `router.invalidate()`;
   2 route (`/nguoi-dung`, `/nhat-ky`) dùng `useQuery` của TanStack Query. Không có quy ước
   thống nhất.
4. **`src/lib` là lớp chia sẻ hai chiều**: `pricing.ts`, `product-search.ts`, `phone.ts`,
   `color-palette.ts` được **cả** client và server import.

---

## 3. Entry Points

| Entry point | File:line | Ai nạp | Ghi chú |
|---|---|---|---|
| `startInstance` | `src/start.ts:23` | `vite.config.ts:41` (`server.entry = "server"`) | Middleware lỗi + CSRF cho request |
| default export `{ fetch }` | `src/server.ts:106` | cùng `server.entry` | Bọc SSR, tự phục vụ `/public`, chuẩn hoá 500 |
| `getRouter` | `src/router.tsx:5` | `src/routeTree.gen.ts` (file sinh tự động) | 0 tham chiếu trực tiếp trong `src/` |
| `routeTree.gen.ts` | `src/routeTree.gen.ts:1` | TanStack Start plugin | **File sinh tự động — không sửa tay** |
| 21 file route | `src/routes/*.tsx` | Router quét thư mục | Xem §4 |

Ba entry point đầu **bắt buộc giữ** dù grep tĩnh cho 0 tham chiếu.

---

## 4. Routes / Pages

21 file route → 18 URL. `search` = có `validateSearch`; `guard` = có `beforeLoad`.

| URL | File | `search` | `loader` | Guard | Component |
|---|---|---|---|---|---|
| `/` | `src/routes/index.tsx:13` | — | ✔ `fetchLpHeroImageFn` | — | `HomePageRoute` |
| `/lp/$slug` | `src/routes/lp.$slug.tsx:13` | — | ✔ `fetchLpHeroImageFn` | redirect slug mặc định → `/` | `LandingPageRoute` |
| `/login` | `src/routes/login.tsx:5` | — | — | đã đăng nhập → `/tong-quan` | `LoginPage` |
| `/auth/callback` | `src/routes/auth.callback.tsx:5` | — | — | — | `AuthCallbackPage` |
| `/tong-quan` | `src/routes/_app.tong-quan.tsx:19` | — | ✔ `fetchDashboard` | `_app` | `DashboardPage` |
| `/khach-hang` | `src/routes/_app.khach-hang.tsx:7` | — | — | `_app` | layout `<Outlet/>` |
| `/khach-hang/` | `src/routes/_app.khach-hang.index.tsx:40` | `q` | ✔ 3 serverFn | `_app` | `CustomersPage` |
| `/khach-hang/$customerId` | `src/routes/_app.khach-hang.$customerId.tsx:112` | — | ✔ `fetchCustomerDetail` | `_app` | `CustomerDetailPage` |
| `/co-hoi` | `src/routes/_app.co-hoi.tsx:27` | `q` | ✔ `fetchCustomers` | `_app` | `PipelinePage` |
| `/bao-gia` | `src/routes/_app.bao-gia.tsx:46` | `q,tab` | ✔ `fetchQuotes`+`fetchOrders` | `_app` | `QuotesPage` |
| `/cong-no` | `src/routes/_app.cong-no.tsx:25` | — | ✔ `fetchCustomerDebts` | `_app` | `DebtPage` |
| `/ghi-chu` | `src/routes/_app.ghi-chu.tsx:8` | — | ✔ `fetchNotes` | `_app` | `NotesPage` |
| `/san-pham` | `src/routes/_app.san-pham.tsx:387` | `nhom,q,colors,surfaces,sizes,shapes,textures,collections,supplier,hot,web,view,stockLocation,sort` | ✔ `fetchProducts` | `_app` + redirect nếu thiếu `nhom` | `ProductsPage` |
| `/luu-tru` | `src/routes/_app.luu-tru.tsx:61` | — (state local) | — | `_app` | `MediaStoragePage` |
| `/thu-vien` | `src/routes/_app.thu-vien.tsx:253` | `sort,cat,q,c,v` | ✔ 2 serverFn | `_app` + user | `GalleryPage` |
| `/khong-gian` | `src/routes/_app.khong-gian.tsx:224` | — (state local) | ✔ `fetchCrmConceptImagesFn` | `_app` | `ConceptHubPage` |
| `/leads` | `src/routes/_app.leads.tsx:28` | `status,q` | ✔ `fetchLpLeadsFn` | `_app` | `LeadsPage` |
| `/nguoi-dung` | `src/routes/_app.nguoi-dung.tsx:19` | — | — (`useQuery`) | `_app` + **admin** | `UsersPage` |
| `/nhat-ky` | `src/routes/_app.nhat-ky.tsx:7` | — | — (`useQuery`) | `_app` + **admin** | `AuditPage` |

**Route không dùng**: không có. Cả 18 URL đều là tính năng đang chạy
(xem [tong-quan-tinh-nang](tong-quan-tinh-nang.md) §1).

---

## 5. Layouts

| Layout | File | Áp cho | Nội dung |
|---|---|---|---|
| Root | `src/routes/__root.tsx:73` | mọi route | `<html>`, meta, favicon, `Toaster`, `ErrorComponent`, `NotFoundComponent` |
| Public landing | không có file layout riêng | `/`, `/lp/$slug` | `styles-lp.css` nạp qua `head().links` (`src/routes/index.tsx:31`) |
| App shell | `src/routes/_app.tsx:9` | 15 route `_app.*` | `beforeLoad` auth → `AppSidebar` + `TopBar` + `<Outlet/>` |
| Khách hàng | `src/routes/_app.khach-hang.tsx:7` | 2 route con | chỉ `<Outlet/>`, giữ phân cấp URL |

---

## 6. Components

38 file trong `src/components/` (không tính `landing/`). Phân loại theo số consumer thực tế:

### UI primitives (bọc Radix)
`ui/dialog.tsx` (17 consumer), `ui/popover.tsx` (6), `ui/sonner.tsx` (1).

### Shared (≥2 route)
| Component | Consumer | Vai trò |
|---|---|---|
| `PageHeader.tsx` | 13 route | Tiêu đề trang + slot hành động |
| `PageFilterBar.tsx` | 4 route | Thanh lọc + ô tìm kiếm |
| `ProductImage.tsx` | 4 route + 4 dialog | Ảnh sản phẩm có fallback |
| `NewQuoteDialog.tsx` | 5 route + TopBar | Tạo/sửa báo giá |
| `NewCustomerDialog.tsx` | 3 route + TopBar | Tạo/sửa khách hàng |
| `CustomerMappingDialog.tsx` | TopBar + 1 route | Trình đề xuất vật liệu |
| `ExportQuoteDialog.tsx` | 2 route | Xuất báo giá |
| `SortMenu.tsx` | 2 route | Menu sắp xếp |
| `product-filter/FilterChip.tsx` | 3 route + landing | Chip lọc mở popover |
| `product-filter/MultiSelectFilter.tsx` | 3 route + landing | Danh sách chọn nhiều |
| `ImageRoomTagPicker.tsx` | 1 route + 1 dialog | Chọn thẻ phòng |

### Feature-specific
`NewProductDialog.tsx` (route + NewQuoteDialog), `ProductSuggestionField.tsx` (3 dialog sản phẩm).

### Page-specific (đúng 1 route)
`AppSidebar`, `TopBar`, `CustomerCard`, `NewNoteDialog`, `EditProductDialog`,
`EditProductImagesDialog`, `BulkEditFieldDialog`, `ImportExportProductsDialog`, `ImportStockDialog`.

### Landing (`src/components/landing/`, 11 file)
`ArchitectLanding` (gốc, 2 route), `MaterialLibraryPage`, `SpaceLookbookSection`,
`ProjectBriefForm`, `MaterialCard`, `MaterialModal`, `MoodboardDrawer`, `BrandMark`,
`ChatWidget`, `useShortlistStorage`.

**ORPHAN: 0.** Mọi component đều có ≥1 consumer tĩnh; không có `import()` động nào trỏ tới
component (chỉ `pdfjs-dist` ở `CustomerMappingDialog.tsx:433`).

---

## 7. Hooks

| Hook | File:line | Consumer | Trách nhiệm |
|---|---|---|---|
| `useLocalStorageState` | `src/hooks/useLocalStorageState.ts:9` | `ExportQuoteDialog:9`, `_app.bao-gia:12`, `_app.co-hoi:20`, `_app.khach-hang.index:15` | State đồng bộ `localStorage`, SSR-safe |
| `useHistoryLayer` | `src/hooks/useHistoryLayer.ts:11` | `AppSidebar:29`, `ui/dialog:8`, `_app.cong-no:23` | Đẩy 1 entry history khi overlay mở để nút Back đóng overlay |
| `useShortlistStorage` | `src/components/landing/useShortlistStorage.ts:9` | `ArchitectLanding:47` | Shortlist vật liệu của landing |

Ngoài ra các "hook ngầm" nằm rải trong route (không tách file): logic debounce tìm kiếm 220ms
lặp ở 3 route, logic facet/pagination nằm trong `_app.san-pham.tsx`, `_app.thu-vien.tsx`,
`_app.luu-tru.tsx`.

---

## 8. Services / APIs

**84 endpoint `createServerFn`** — 66 ở `src/api/functions.ts`, 18 ở `src/api/lp.ts`
(cộng 4 re-export auth ở `src/api/lp.ts:101-106`).

| Nhóm | File | Số endpoint | Nghiệp vụ |
|---|---|---|---|
| Auth & người dùng | `functions.ts:19-218` | 10 | đăng nhập, session, Google OAuth, CRUD user |
| Sản phẩm | `functions.ts:243-586` | 17 | CRUD sản phẩm, ảnh sản phẩm, thẻ phòng |
| Thư viện ảnh | `functions.ts:588-757` | 10 | bộ sưu tập, DnD, upload |
| Khách hàng | `functions.ts:759-1075` | 18 | CRUD, mapping, đề xuất vật liệu |
| Báo giá / đơn | `functions.ts:1077-1317` | 10 | quote, order, chuyển đổi |
| Công nợ | `functions.ts:1319-1414` | 5 | sổ nợ, thanh toán |
| Ghi chú / dashboard | `functions.ts:1416-1460` | 3 | note, KPI |
| Import/Export | `functions.ts:1462-1749` | 7 | xlsx, tồn kho, mã nội bộ |
| Media nâng cao | `functions.ts:1751-1844` | 4 | ảnh phẳng, bulk tag |
| Landing công khai | `lp.ts:9-145` | 6 | catalog, lookbook, hero, lead |
| CRM: lead & concept | `lp.ts:146-336` | 12 | lead inbox, tuyển chọn, hero slot |

**`src/db/*.server.ts`** (14 module): `crm.server.ts` (3237 dòng, nghiệp vụ chính),
`lp.server.ts`, `space-collections.server.ts`, `gallery.server.ts`, `product-import-export.server.ts`,
`export-quote.server.ts`, `export-mapping.server.ts`, `auth.server.ts`, `auth-public.server.ts`,
`users.server.ts`, `audit.server.ts`, `driver.ts`, `index.server.ts` + `schema-pg.sql`.

---

## 9. State

| Loại | Ở đâu | Ghi chú |
|---|---|---|
| URL state | `validateSearch` của 8 route | Filter/sort/search của `/san-pham`, `/thu-vien`, `/bao-gia`, `/leads`, `/co-hoi`, `/khach-hang/` |
| Route loader data | 15 route | `Route.useLoaderData()`, làm mới bằng `router.invalidate()` |
| Server cache | `useQuery` ở `/nguoi-dung`, `/nhat-ky` | Mô hình thứ hai, không thống nhất với loader |
| Local `useState` | mọi route | Có route giữ ~20 state (`_app.khach-hang.$customerId.tsx:129-161`) |
| `localStorage` | `useLocalStorageState` + `useShortlistStorage` | Key rải rác, không có registry (`bao-gia.quoteStatusFilter`, `pipeline.viewMode`, `khach-hang.viewMode`, `quote-export-project-site`) |
| History layer | `src/lib/history-layer.ts` | Stack overlay để Back đóng dialog |
| Global context | chỉ router context (`__root.tsx`) | Không Redux/Zustand/Context nghiệp vụ |

---

## 10. Major Risks

Xếp theo mức độ. Cột "Xử lý" ghi rõ việc nào thuộc phạm vi cleanup này.

| # | Rủi ro | Bằng chứng | Mức | Xử lý |
|---|---|---|---|---|
| R1 | **Bắt sai dialect (mùi code, KHÔNG phải bug đang chạy)**: `catch` so chuỗi lỗi **SQLite** trong codebase **PostgreSQL**. Đã kiểm lại: nhánh này **không bao giờ chạy được** vì câu lệnh là `INSERT OR IGNORE … SELECT id, ? FROM products WHERE code = ?` — `product_code` sai chỉ chèn **0 dòng**, không sinh lỗi FK; còn `product_id` lấy từ `products.id` nên FK luôn thoả. Rủi ro thật là nếu câu lệnh đổi dạng thì `catch` sẽ **nuốt nhầm lỗi khác** | `src/api/functions.ts:1570-1579` vs `src/db/driver.ts:1` (`pg`) | Thấp | Chỉ báo cáo — sửa sẽ **đổi hành vi** import |
| R2 | **`curatedMaterials` là scaffolding chết**: id `"m1".."m12"` không bao giờ khớp id số từ server, nên UI xem trước shortlist trong form brief không bao giờ render | `src/data/mockData.ts:117-119` vs `ArchitectLanding.tsx:75`, `ProjectBriefForm.tsx:60-62` | **CAO** | Báo cáo (NEEDS_REVIEW) — xoá là thay đổi UI |
| R3 | **Type drift thật**: `CrmConceptFilter` khai 2 nơi, bản trong `lp-types` thiếu `category`/`color` mà server nhận và route gửi | `src/lib/lp-types.ts:224` vs `src/db/space-collections.server.ts:274,276`; `_app.khong-gian.tsx:308` | **CAO** | ✅ Hợp nhất trong cleanup |
| R4 | **Route khổng lồ**: 3 file 2.2k–2.7k dòng chứa facet, sort codec, phân trang, token hoá tìm kiếm | `_app.thu-vien.tsx` (2699), `_app.luu-tru.tsx` (2270), `_app.san-pham.tsx` (2224) | **CAO** | Báo cáo (NEEDS_REVIEW) — tách hook là refactor lớn |
| R5 | **29 lỗi TypeScript tồn đọng** — type checking gần như tắt ở `_app.luu-tru.tsx` vì thiếu hẳn import 3 type, cộng 3 tính năng bị vô type (sort media, gợi ý field sản phẩm, tab kích thước sidebar) | `npx tsc --noEmit` | Trung bình | ✅ **Đã sửa: nay 0 lỗi** (xem ARCHITECTURE_FINAL) |
| R6 | **Business logic nằm trong tầng API**: SQL thô + nghiệp vụ kho trong handler | `functions.ts:1558-1749`, `lp.ts:94-97,210-231` | Trung bình | Báo cáo |
| R7 | **Lưới import-protection bị hạ cấp thành vô hiệu** (nặng hơn tên file): `vite.config.ts` khai `client.files: ["**/server/**"]`, trong khi repo **không có thư mục `server/`** nào → **ghi đè** mất luật mặc định của framework (`**/*.server.*`). Hệ quả: `src/lib/storage.ts` (import `node:fs`, ghi `public/images`) không có hậu tố `.server.ts` và cũng **không** bị chặn | `vite.config.ts:38-44` (cũ) vs `defaults.js` của `@tanstack/start-plugin-core` (`files: ["**/*.server.*"]`) | Trung bình | ✅ Sửa trong cleanup: trả `client.files` về đúng `["**/*.server.*"]` + đổi tên `storage.ts` → `storage.server.ts`. **Kiểm chứng hai chiều**: import `.server.ts` có dùng thật → build FAIL `exit=1` (`Denied by file pattern: **/*.server.*`); gỡ ra → xanh |
| R8 | **Sai tầng dữ liệu**: module `auth` ghi thẳng vào `lp_leads` (domain marketing) kèm copy tiếng Việt | `src/db/auth-public.server.ts:289-330` | Trung bình | Báo cáo |
| R9 | **Phụ thuộc ngầm khi thêm bảng**: `driver.ts` quyết định thêm `RETURNING id` theo danh sách bảng hard-code | `src/db/driver.ts:80-101,265-270` | Trung bình | Báo cáo |
| R10 | **2 taxonomy màu song song** (`color-tones` 8 nhóm vs `color-palette` 11 nhóm) cùng map từ `products.color`, sẽ trôi lệch | `src/lib/color-tones.ts:21` vs `src/lib/color-palette.ts:18` | Trung bình | Báo cáo — tách là quyết định nghiệp vụ |
| R11 | **Nợ type trong tầng UI**: `React.CSSProperties` dùng không import; `row as any[]`; `previewData?: any[]` | `_app.co-hoi.tsx:169`, `_app.san-pham.tsx:473`, `ImportStockDialog.tsx:14` | Thấp | Báo cáo |
| R12 | **Cấu hình cũ thời Vinxi** còn sót | `eslint.config.js:9`, `.gitignore:14`, `.prettierignore:4` | Thấp | ✅ Dọn trong cleanup |
| R13 | **Không có test tự động** — không có lưới an toàn nào cho refactor | glob `**/*.{test,spec}.*` → 0 | Trung bình | Báo cáo (nằm ngoài phạm vi) |
| R14 | **`/lp/$slug` gần trùng `/`**: 67% token giống nhau, chỉ khác redirect slug mặc định | `src/routes/index.tsx` vs `src/routes/lp.$slug.tsx` | Thấp | ✅ Gộp phần chung trong cleanup |

### Ghi chú về những gì **không** phải rủi ro

- **Không có file mồ côi**: cả 105 file `src/` đều reachable từ route (đã quét **cả**
  dynamic import).
- **Không có bảng DB chết**: 25/25 bảng đều đang dùng
  ([audit-2026-09-19](audit-2026-09-19.md) §G0).
- **Không có code bị comment-out**: quét `^\s*//\s*(const|let|function|return|if|import|{)`
  → 0 kết quả (3 hit duy nhất là comment văn xuôi).
- **Không có link markdown hỏng** trong `docs/`, `README.md`, `AGENTS.md`.
