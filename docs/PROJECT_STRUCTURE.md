# PROJECT_STRUCTURE — Innomat CRM

> Bản đồ kiến trúc để đọc repo mà không cần mở từng file.
> Số liệu đo ngày **2026-09-19** trên working tree `feature/lp-and-crm-rollout`.
> Đây là bản **SAU cleanup** (Phase 22 của quy trình); ảnh chụp trước cleanup nằm ở
> [PROJECT_AUDIT](PROJECT_AUDIT.md), nhật ký thay đổi ở [CLEANUP_REPORT](CLEANUP_REPORT.md).

---

## 1. Cây thư mục thực tế

```text
seapen/
│
├── src/
│   ├── start.ts                  ← entry point framework (middleware lỗi + CSRF)
│   ├── server.ts                 ← entry point SSR (bọc /public, chuẩn hoá 500)
│   ├── router.tsx                ← getRouter() — do routeTree.gen.ts nạp
│   ├── routeTree.gen.ts          ← SINH TỰ ĐỘNG, không sửa tay
│   ├── styles.css                ← Tailwind 4 + token CRM (CSS-first)
│   ├── styles-lp.css             ← design system riêng của landing (3.9k dòng)
│   │
│   ├── routes/                   ← 21 file → 18 URL (file-based routing)
│   │   ├── __root.tsx            ← khung HTML, Toaster, Error/NotFound
│   │   ├── index.tsx             ← `/`            (landing công khai)
│   │   ├── lp.$slug.tsx          ← `/lp/$slug`    (landing, biến thể)
│   │   ├── login.tsx             ← `/login`
│   │   ├── auth.callback.tsx     ← `/auth/callback`
│   │   ├── _app.tsx              ← LAYOUT có auth (beforeLoad → fetchMe)
│   │   ├── _app.tong-quan.tsx    ← `/tong-quan`   Dashboard KPI
│   │   ├── _app.khach-hang*.tsx  ← `/khach-hang`  (layout + index + $customerId)
│   │   ├── _app.co-hoi.tsx       ← `/co-hoi`      Kanban pipeline
│   │   ├── _app.bao-gia.tsx      ← `/bao-gia`     Báo giá & đơn hàng
│   │   ├── _app.cong-no.tsx      ← `/cong-no`     Công nợ & thanh toán
│   │   ├── _app.ghi-chu.tsx      ← `/ghi-chu`     Ghi chú
│   │   ├── _app.san-pham.tsx     ← `/san-pham`    Catalog + tồn kho
│   │   ├── _app.luu-tru.tsx      ← `/luu-tru`     Kho ảnh + thẻ phòng
│   │   ├── _app.thu-vien.tsx     ← `/thu-vien`    Thư viện bộ sưu tập
│   │   ├── _app.khong-gian.tsx   ← `/khong-gian`  Lookbook concept
│   │   ├── _app.leads.tsx        ← `/leads`       Hộp thư lead
│   │   ├── _app.nguoi-dung.tsx   ← `/nguoi-dung`  (admin)
│   │   ├── _app.nhat-ky.tsx      ← `/nhat-ky`     (admin)
│   │   └── -lp-route.ts          ← hỗ trợ `/` + `/lp/$slug` (tiền tố `-` = router bỏ qua)
│   │
│   ├── api/                      ← TRANSPORT: createServerFn (inputValidator + handler)
│   │   ├── functions.ts          ← 82 endpoint CRM + auth
│   │   └── lp.ts                 ← 18 endpoint landing/lead + 2 re-export auth
│   │
│   ├── db/                       ← NGHIỆP VỤ + SQL (chỉ nạp bằng dynamic import)
│   │   ├── driver.ts             ← Pool pg + query/run/tx, tự thêm RETURNING id
│   │   ├── index.server.ts       ← facade 1 dòng re-export getDb/SqlValue
│   │   ├── schema-pg.sql         ← NGUỒN SCHEMA DUY NHẤT (25 bảng), áp 1 transaction
│   │   ├── crm.server.ts         ← nghiệp vụ chính (Khách/BG/Đơn/Nợ/Map…, 2.493 dòng)
│   │   ├── media.server.ts       ← product CRUD + flat media + bulk tag (tách khỏi crm)
│   │   ├── lp.server.ts          ← catalog công khai, lead, hero, featured slot
│   │   ├── space-collections.server.ts ← lookbook concept
│   │   ├── gallery.server.ts     ← bộ sưu tập ảnh
│   │   ├── product-import-export.server.ts ← xlsx + tồn kho
│   │   ├── auth.server.ts        ← session CRM (scrypt)
│   │   ├── auth-public.server.ts ← session khách + Google OAuth
│   │   ├── users.server.ts / audit.server.ts
│   │
│   ├── render/                   ← TRÌNH SINH HTML in ấn (không phải tầng dữ liệu)
│   │   ├── export-quote.server.ts    ← báo giá → HTML
│   │   └── export-mapping.server.ts  ← đề xuất vật liệu → HTML
│   │
│   ├── components/               ← 39 file
│   │   ├── ui/                   ← primitive bọc Radix: dialog, popover, sonner (3)
│   │   ├── product-filter/       ← FilterChip, MultiSelectFilter (dùng cả CRM + landing) (2)
│   │   ├── landing/              ← 11 file giao diện landing công khai (11)
│   │   └── *.tsx                 ← 23 file: PageHeader/PageFilterBar/PaginationBar/
│   │                               ViewModeToggle/EmptyState + dialog nghiệp vụ
│   │
│   ├── lib/                      ← LỚP DÙNG CHUNG isomorphic (client + server)
│   │   ├── types.ts              ← domain model (Product, Customer, Quote…)
│   │   ├── lp-types.ts           ← type landing/lead (nguồn chuẩn của CrmConcept*)
│   │   ├── format.ts             ← formatVND + nowUtc/expiresAt/escapeHtml
│   │   ├── pricing.ts            ← VAT, giá theo nhóm, chiết khấu
│   │   ├── quote-calc.ts         ← toán dòng báo giá (m²/viên/đơn giá) — có test
│   │   ├── product-facets.ts     ← facet/sort codec của /san-pham — có test
│   │   ├── gallery-sort.ts       ← sort/codec việt hoá của /thu-vien — có test
│   │   ├── mapping-draft.ts      ← draft factory + giá tự động (mapping) — có test
│   │   ├── product-search.ts     ← token hoá + khớp mã sản phẩm
│   │   ├── product-categories.ts ← PRODUCT_GROUPS, slug ↔ category
│   │   ├── color-palette.ts / color-tones.ts / material-taxonomy.ts ← taxonomy facet
│   │   ├── storage.server.ts     ← Supabase + fs (chỉ server import)
│   │   ├── storage-keys.ts       ← registry localStorage key (8 key)
│   │   ├── image-upload.ts / *.server.ts ← canvas (client) và sharp (server)
│   │   ├── auth-types.ts / history-layer.ts / product-quick-sheet.ts / …
│   │
│   ├── hooks/                    ← 2 hook dùng chung
│   │   ├── useLocalStorageState.ts
│   │   └── useHistoryLayer.ts
│   │
│   └── data/
│       └── mockData.ts           ← dữ liệu tĩnh của landing (xem cảnh báo bên dưới)
│
├── scripts/                      ← 9 file .mjs (6 gắn npm script, 2 tool thủ công, 1 scratch)
├── docs/                         ← 12 tài liệu tính năng + 5 tài liệu audit này
├── public/                       ← 5 asset tĩnh (logo, favicon, con dấu)
├── tmp/                          ← GITIGNORED — scratch local, không tracked
├── em-ban-gach/                  ← GITIGNORED — tài liệu thiết kế gốc của người dùng
├── vite.config.ts                ← plugin chain + alias + nitro(vercel) khi build
├── vercel.json                   ← framework nitro, region sin1
├── eslint.config.js / tsconfig.json / .prettierrc / components.json
└── AGENTS.md                     ← NGUỒN LUẬT DUY NHẤT của repo
```

---

## 2. Trách nhiệm từng thư mục

| Thư mục | Trách nhiệm | Được phép import | KHÔNG được làm |
|---|---|---|---|
| `src/routes/` | Khai báo URL, `validateSearch`, guard auth, `loader` gọi serverFn, dựng UI trang | `@/api/*`, `@/components/*`, `@/lib/*`, `@/hooks/*` | Import trực tiếp `@/db/*` (chỉ `import type`) |
| `src/api/` | **Transport mỏng**: khai `createServerFn`, validate input, gọi `await import("@/db/*.server")` | `@/db/*` (động), `@/lib/*` | Chứa SQL/nghiệp vụ dài (hiện còn vi phạm — xem PROJECT_AUDIT §10 R6) |
| `src/db/` | Nghiệp vụ + SQL, không biết gì về React | `@/db/*`, `@/lib/*`, `node:*` | Import React/component |
| `src/components/ui/` | Primitive không biết nghiệp vụ (dialog/popover/toast) | `@/lib/utils` | Import `@/api/*` |
| `src/components/product-filter/` | Bộ lọc dùng chung CRM + landing | `@/lib/*`, `@/components/ui/*` | — |
| `src/components/landing/` | Toàn bộ UI landing công khai | `@/api/lp`, `@/lib/*`, `@/data/mockData` | Import `@/db/*` |
| `src/components/*.tsx` | Dialog/khối nghiệp vụ dùng cho CRM | `@/api/*`, `@/lib/*`, `@/components/ui/*` | — |
| `src/lib/` | Lớp dùng chung **isomorphic** (type, format, tính toán thuần) | `@/lib/*` | Import `@/db/*`, `@/components/*` |
| `src/hooks/` | Hook dùng chung, không nghiệp vụ | `@/lib/*` | Import `@/api/*` |
| `src/data/` | Dữ liệu tĩnh của landing | — | — |
| `scripts/` | Tác vụ CLI (migrate, seed, backup, import ảnh AI) | `pg`, `node:*` | Import từ `src/` (trừ khi chạy qua Vite) |

---

## 3. Luồng phụ thuộc (dependency graph)

```text
                        ┌──────────────────────────────┐
                        │  routes/*.tsx  (18 URL)      │
                        └──────────────┬───────────────┘
                                       │ loader / sự kiện
                        ┌──────────────▼───────────────┐
                        │  components/*  (38 file)     │
                        └──────────────┬───────────────┘
                                       │
                        ┌──────────────▼───────────────┐
                        │  api/functions.ts │ api/lp.ts│   ← createServerFn
                        └──────────────┬───────────────┘
                                       │ await import(...)   (RANH GIỚI SERVER)
                        ┌──────────────▼───────────────┐
                        │  db/*.server.ts  (13 module) │
                        └──────────────┬───────────────┘
                                       │
                        ┌──────────────▼───────────────┐
                        │  db/driver.ts  →  PostgreSQL │
                        └──────────────────────────────┘

        src/lib/**  ←── dùng bởi CẢ HAI phía (client và server)
        src/hooks/** ←── chỉ client
```

**Kiểm tra sức khoẻ đồ thị (đo trên import tĩnh + `await import()`):**

| Hạng mục | Kết quả |
|---|---|
| File mồ côi (không tới được từ route nào) | **0** / 105 |
| Chu trình phụ thuộc (circular) | **0** — `api/lp.ts → api/functions.ts` chỉ một chiều |
| `db → components` (vi phạm tầng) | **0** |
| `lib → db` (vi phạm tầng) | **0** |
| `components → db` (vi phạm tầng) | **0** |
| `routes → db` tĩnh (vi phạm tầng) | **0** (chỉ `import type`) |
| Feature → feature coupling | có: `NewQuoteDialog` → `NewProductDialog` (1 chiều, hợp lý) |
| Entry point 0 tham chiếu tĩnh | 3 (`getRouter`, `startInstance`, `server.ts`) — framework nạp, **phải giữ** |

---

## 4. Ranh giới client / server

Cơ chế bảo vệ (`vite.config.ts:38-54`):

```ts
importProtection: {
  behavior: "error",
  client: { files: ["**/*.server.*"], specifiers: ["server-only"] },
}
```

✅ Lưới này **đang cưỡng chế** quy ước `*.server.ts`: client import một module `.server.ts`
là **lỗi build** (`exit 1`), không phải cảnh báo.

> **Lịch sử (đã sửa trong cleanup 2026-09-19):** trước đó `client.files` là
> `["**/server/**"]`. Repo **không có thư mục `server/`** nào, và framework mặc định
> (`@tanstack/start-plugin-core` → `import-protection/defaults.js`: `files: ["**/*.server.*"]`)
> bị **ghi đè** chứ không merge — `pick(user, fallback) = user ? [...user] : [...fallback]`
> (`plugin.js:785`). Nên bản cũ là một bước **hạ cấp**: lưới **vô hiệu hoàn toàn**, client lỡ
> import `@/lib/storage.server` sẽ kéo `node:fs`/`pg` vào bundle mà build vẫn xanh.
> (`specifiers` thì ngược lại — được **merge** với mặc định, nên các marker
> `@tanstack/react-start/server-only` chưa bao giờ mất.)

**Đã kiểm chứng cả hai chiều**, không chỉ "build vẫn xanh":

| Chiều | Cách làm | Kết quả |
|---|---|---|
| **Có chặn** (không false negative) | Thêm `import { readImageBytes } from "@/lib/storage.server"` vào `src/routes/_app.ghi-chu.tsx` và **dùng thật** giá trị trong JSX (import không dùng sẽ bị elide trước khi plugin thấy) | **FAIL, `exit=1`**: `Denied by file pattern: **/*.server.*` / `Importer: src/routes/_app.ghi-chu.tsx` / `Resolved: src/lib/storage.server.ts` |
| **Không chặn nhầm** (không false positive) | Gỡ import, build lại trên toàn repo | `✓ built` ×3, xanh; `git diff` trên file test rỗng |

| Module | Hậu tố `.server` | Chạm `node:fs`/`node:crypto`/secret | Ghi chú |
|---|---|---|---|
| `db/*.server.ts` (13) | ✔ | ✔ | Đúng quy ước — bị chặn ở client |
| `lib/image-upload.server.ts`, `lib/image-export.server.ts`, `lib/brand-assets.server.ts` | ✔ | ✔ | Đúng quy ước — bị chặn ở client |
| `lib/storage.server.ts` | ✔ | ✔ | Đúng quy ước (đổi tên trong cleanup — xem CLEANUP_REPORT §Files Moved) |
| `lib/*.ts` còn lại | ✖ | ✖ | Isomorphic, đúng |

**Ngoại lệ hợp lệ:** route/component được phép `import type` từ module `.server.ts`
(2 chỗ: `_app.luu-tru.tsx:46,51`). `import type` bị xoá hoàn toàn khi build nên không
tạo import runtime — lưới chỉ chặn import **có giá trị**. Build xanh hiện tại là bằng chứng
cho điều này.

---

## 5. Nguồn sự thật (single source of truth)

| Thứ | Ở đâu | Ghi chú |
|---|---|---|
| Schema DB | `src/db/schema-pg.sql` | 25 bảng; `npm run db:migrate` áp cả file trong 1 transaction |
| Domain model | `src/lib/types.ts` | Product, Customer, Quote, Order, Payment, Note… |
| Type landing/lead | `src/lib/lp-types.ts` | Nguồn chuẩn của `CrmConcept*` sau cleanup |
| Luật của repo | `AGENTS.md` | `CLAUDE.md` bị gitignore, không được track |
| Bản đồ tính năng | `docs/tong-quan-tinh-nang.md` | Điểm vào của bộ tài liệu tính năng |
| Quy mô (số file/dòng) | `docs/tong-quan-tinh-nang.md` §16 | Nơi **duy nhất** giữ số liệu quy mô |
| Số dòng từng bảng | `docs/audit-2026-09-19.md` §G0b | Nơi **duy nhất** giữ số liệu row count |
| Danh sách endpoint | `docs/api-server-functions.md` | Sinh bằng tay, có thể trôi — kiểm lại khi sửa |

---

## 6. Cảnh báo khi đọc repo

1. **`src/data/mockData.ts` không phải toàn bộ là fallback.** `heroImage` là fallback thật;
   `tileLines`/`deliverables`/`fnbCollectionImage` là nội dung biên tập tĩnh không có nguồn DB;
   `curatedMaterials` là scaffolding còn sót — consumer duy nhất lọc theo id `"m1".."m12"` nên
   **không bao giờ khớp** id số từ server (PROJECT_AUDIT §10 R2).
2. **`src/db/*.server.ts` chỉ nạp bằng dynamic import.** Mọi phân tích "file chết" phải quét
   `await import(...)`, nếu không sẽ kết luận sai.
3. **`src/routes/_app.san-pham.tsx` có `beforeLoad` redirect** khi thiếu `nhom`; redirect này
   **xoá mọi search param khác**. Khi thử filter bằng URL phải kèm `nhom=...`.
4. **`routeTree.gen.ts` sinh tự động** — sửa tay sẽ bị ghi đè.
5. **3 route khổng lồ** (2.3k–2.7k dòng) chứa logic nghiệp vụ client; đọc theo mục lục
   `// ───` trong file thay vì đọc tuần tự.
