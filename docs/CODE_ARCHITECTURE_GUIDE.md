# CODE_ARCHITECTURE_GUIDE — Innomat CRM

> Quy ước **suy ra từ code đang chạy**, không phải từ template. Mỗi luật dưới đây đều có
> ví dụ thật trong repo. Ngày lập: **2026-09-19**.
>
> `AGENTS.md` là nguồn luật **bắt buộc** (deploy, UI conventions, docs). Tài liệu này bổ sung
> phần **kiến trúc code** — không lặp lại luật trong `AGENTS.md`.

---

## 1. Naming

| Loại | Quy ước | Ví dụ thật |
|---|---|---|
| Component | `PascalCase.tsx`, tên file = tên export | `PageHeader.tsx`, `NewQuoteDialog.tsx`, `ViewModeToggle.tsx` |
| Route | theo TanStack: `_app.<slug>.tsx` cho trang có auth; `__root` / `index` / `<name>` cho công khai | `_app.san-pham.tsx`, `lp.$slug.tsx` |
| File hỗ trợ cạnh route | tiền tố `-` để router bỏ qua | `src/routes/-lp-route.ts` |
| Module server | hậu tố `.server.ts` — **bị cưỡng chế ở build** | `crm.server.ts`, `storage.server.ts` |
| Hook | `useXxx.ts` trong `src/hooks/`; hook cục bộ đặt cùng thư mục feature | `useLocalStorageState.ts`, `components/landing/useShortlistStorage.ts` |
| Hàm | `camelCase`, động từ trước | `listFlatMediaImages`, `buildExactCodeSet`, `matchSearchTokens` |
| Hàm server trong db | `list*` / `get*` / `create*` / `update*` / `delete*` | `listProducts`, `getQuote`, `createOrderFromQuote` |
| RPC | hậu tố `Fn` | `fetchProducts`, `updateProductFn`, `deleteQuoteFn` |
| Type/Interface | `PascalCase`, **không** tiền tố `I` | `Product`, `FlatMediaItem`, `CrmConceptFilter` |
| Hằng số | `SCREAMING_SNAKE_CASE` | `PRODUCT_GROUPS`, `ALL_PRODUCTS_SLUG`, `IMAGE_ROOM_TAGS` |
| localStorage key | `<feature>.<field>` | `pipeline.viewMode`, `bao-gia.quoteStatusFilter` |

**Ngoại lệ đã biết:** `nowLocal()` trả **giờ UTC** (tên nói "local"). Giữ tên để không phá
call site, nhưng docblock đã ghi rõ `(UTC)` — xem REFACTOR_ROADMAP O9.

---

## 2. Folder Rules

```
src/
├── routes/          URL + loader + dựng trang. File `-` tiền tố = hỗ trợ, không phải route.
├── api/             createServerFn. Transport mỏng: validate input → gọi db → ghi audit.
├── db/              SQL + nghiệp vụ. *.server.ts. Không biết React.
├── components/      UI. ui/ = primitive Radix; product-filter/ = filter dùng chung;
│                    landing/ = landing công khai; còn lại = dialog/khối nghiệp vụ.
├── lib/             Lớp LÁ dùng chung cả client lẫn server. Hàm thuần, type, hằng số.
├── hooks/           Hook dùng chung (hiện 2).
└── data/            Dữ liệu tĩnh (mockData của landing).
```

| Đặt ở đâu | Khi nào |
|---|---|
| `components/ui/` | Primitive không biết nghiệp vụ, bọc Radix (dialog, popover, sonner) |
| `components/product-filter/` | Bộ lọc dùng cho cả CRM lẫn landing |
| `components/landing/` | Chỉ landing công khai |
| `components/*.tsx` | Dialog/khối nghiệp vụ CRM |
| `lib/` | Hàm thuần, không React, không `node:*`, dùng được cả 2 phía |
| `db/` | Chạm DB hoặc `node:*` hoặc secret |
| `routes/-*.ts` | Hỗ trợ riêng cho 1–2 route cùng thư mục |

**Không tạo thư mục mới** trừ khi có ≥3 file cùng một trách nhiệm mới.

---

## 3. Dependency Rules (đã kiểm chứng bằng máy)

```
routes ──┐
         ├──► api ──► (dynamic import) ──► db ──► driver ──► Postgres
components ──┘                                  ▲
                                                │
hooks ──────────────────────────────────────────┘ (không được)
lib  ◄── dùng bởi TẤT CẢ (lá, không trỏ lên)
```

**Luật cứng:**

| Từ | Được import | KHÔNG được import |
|---|---|---|
| `routes/` | `api`, `components`, `lib`, `hooks` | `db/*` (**trừ `import type`**) |
| `api/` | `db/*` (động), `lib` | `components`, `routes` |
| `db/` | `db/*`, `lib`, `node:*` | `components`, `routes`, `hooks`, `api` |
| `components/` | `api`, `lib`, `components/ui` | `db/*` (trừ `import type`), `routes` |
| `hooks/` | `lib` | `db`, `api`, `components`, `routes` |
| `lib/` | `lib` | **mọi thứ khác** — `lib` là lá |

**Trạng thái hiện tại: 0 vi phạm, 0 chu trình.** Kiểm bằng script quét `from "…"` + `await import("…")`.

**Ranh giới `db` — đã kiểm chứng chính xác (2026-09-19):**

- **Mọi** `await import("@/db/*.server")` từ ngoài `src/db/` đều nằm **trong `createServerFn`
  handler** (170 chỗ ở `api/functions.ts` + `api/lp.ts`, đã kiểm từng chỗ).
- Ngoài handler, chỉ có **`import type`** chạm tới `src/db/` — 3 chỗ, tất cả đều bị xoá khi build:
  `api/functions.ts:16`, `_app.luu-tru.tsx:44,56`.
- **Không có** static value import nào từ `routes/` hay `components/` tới `src/db/`.

Đây là ranh giới thật sự quan trọng — không phải "component gọi `api`", vì `api` **chính là**
ranh giới client↔server được thiết kế (`kien-truc.md`: "Client chỉ gọi các hàm ở đây").

**`import type` là ngoại lệ hợp lệ**: bị xoá hoàn toàn khi build nên không tạo phụ thuộc runtime.
Ví dụ: `_app.luu-tru.tsx:44,56` import type từ `db/*.server.ts`.

---

## 4. Data Fetching Rules

| Tình huống | Dùng | Vì sao |
|---|---|---|
| **Mặc định cho mọi route** | `loader` + `Route.useLoaderData()` + `router.invalidate()` | SSR được, dữ liệu có trước khi render |
| Trang admin có bảng + filter cục bộ | `useQuery` | Refetch không cần đổi route |
| Dialog cần options riêng | gọi serverFn trong `useEffect` của dialog | Dữ liệu chỉ sống trong dialog |
| **KHÔNG dùng** | fetch trong `useEffect` rồi giữ trong `useState` ở cấp trang | Trùng lặp mô hình; khó invalidate |

**Hiện trạng:** 13 route loader · 2 route `useQuery` (`/nguoi-dung`, `/nhat-ky`) · 2 route
useEffect-fetch (`/luu-tru`, `/khong-gian`). Không thêm mô hình thứ tư.

**Luật filter:** trang có filter phức tạp → đưa lên URL (`validateSearch` + `loaderDeps`).
`/san-pham` và `/thu-vien` làm đúng. `/luu-tru` và `/khong-gian` chưa — xem roadmap O5.

---

## 5. Component Rules

**Tạo component mới khi:**
- Khối JSX đó xuất hiện ở **≥2 nơi với cùng hợp đồng thị giác** (không chỉ cùng tên), **hoặc**
- Khối đó dài >150 dòng và có state riêng, **hoặc**
- Nó là primitive không biết nghiệp vụ.

**KHÔNG tạo component khi:**
- Chỉ dùng 1 lần và không có state riêng → để inline.
- Các bản sao **khác nhau về thị giác** (nhãn, container, thứ tự nút). Ví dụ: xác nhận xoá
  2 bước có **25 chỗ, ≥5 biến thể** → gộp sẽ cần ~8 prop, tệ hơn JSX gốc. **Đã chốt: không gộp.**
- Mục đích chỉ là "cho gọn file".

**Prop:**
- Component lá nhận prop trực tiếp, không nhận cả object rồi tự bóc.
- Nếu một prop chỉ để truyền tiếp qua ≥2 tầng mà không ai dùng → xét lại thiết kế.
- Slot (`ReactNode`) tốt hơn cờ boolean khi có ≥3 biến thể.

**Ví dụ chuẩn:** `ViewModeToggle` (3 nơi, container + class giống hệt, generic theo union),
`PaginationBar` (2 nơi, ~100 dòng verbatim, đã trôi).

---

## 6. Hook Rules

**Tạo hook khi:**
- ≥3 `useState`/`useEffect` cùng phục vụ **một** khái niệm, **và** khái niệm đó tái sử dụng
  hoặc đủ lớn để cô lập, **hoặc**
- Logic đó cần test mà không render.

**KHÔNG tạo hook khi:**
- Nó chỉ gọi 1 hàm khác.
- Nó chỉ đổi tên một `useState` có sẵn.
- Nó chuyển state ra khỏi component mà không giảm số khái niệm — chỉ di chuyển độ phức tạp.

**Hiện trạng:** chỉ 2 hook dùng chung. Repo **thiếu hook**, không thừa — nhưng đừng tạo hook
để "cho đẹp": `/luu-tru` có 47 `useState` nhưng thực chất chỉ **8 khái niệm**, và ~9 state
là **suy ra được** chứ không cần lưu.

**Ưu tiên:** gộp state suy diễn trước, tách hook sau.

---

## 7. Utility Rules

**Vào `src/lib/` khi:** hàm thuần, không React, không `node:*`, và **≥2 nơi** cần (hoặc sẽ cần
từ server).

**Không vào `lib/` khi:** chỉ 1 nơi dùng → để cạnh nơi dùng. Trừ khi nó là hàm thuần rõ ràng
có thể test được (khi đó `lib/` vẫn hợp lý vì lợi ích testability).

**Đã gộp trong các đợt gần đây** (ví dụ về ngưỡng đúng): `nowLocal`×6, `escapeHtml`×2,
`getPageNumbers`×2, `basisToDiscountType`×2, `inputCls`×6 → một nguồn mỗi thứ.

---

## 8. Shared Code Rules

> **Không đưa code vào shared chỉ vì hiện tại nó được dùng ở 2 nơi.**

Điều kiện **cần và đủ**: trách nhiệm **generic** *và* **ổn định** (không phải nội dung riêng
của một trang).

| Đã shared — đúng | Lý do |
|---|---|
| `PageHeader`, `PageFilterBar` | Bố cục trang, mọi trang đều giống |
| `FilterChip`, `MultiSelectFilter` | Hợp đồng tương tác giống hệt |
| `PaginationBar`, `ViewModeToggle` | Hình dạng đã "giải xong"; bản sao đã trôi |
| `lib/pricing`, `lib/format`, `lib/product-search` | Thuần, dùng cả 2 phía |

| KHÔNG shared — đúng | Lý do |
|---|---|
| 25 chỗ xác nhận xoá 2 bước | ≥5 biến thể thật về nhãn/container/thứ tự |
| 6 nhóm pill segmented | Màu active khác nhau theo ngữ nghĩa |
| `Stat` tiles (4 thiết kế) | 4 hợp đồng thị giác khác nhau |
| card vs row của cùng entity | Cố ý khác nhau |

---

## 9. Type Rules

- Domain type ở `src/lib/types.ts`; type landing/lead ở `src/lib/lp-types.ts`.
- **Một type, một nơi.** Nếu client cần type mà server cũng cần → đặt ở `src/lib/`, server
  import lại. **Không** mirror thủ công (đã từng gây trôi lệch thật ở `CrmConceptFilter`).
- Union của chuỗi hằng: `const X = [...] as const; type T = (typeof X)[number];`
  (ví dụ `PRODUCT_SUGGEST_FIELDS` → `ProductSuggestField`).
- **Cấm `any`** ở code mới. Nếu buộc phải dùng, ghi lý do ngay trên dòng đó.
- Type dùng cho option của component dùng chung: export kèm component
  (`ViewModeOption` đi cùng `ViewModeToggle`).

---

## 10. Route Rules

- Mọi route `_app.*` được bảo vệ bởi `_app.tsx` (`beforeLoad` → `fetchMe`).
- Route admin thêm `beforeLoad` kiểm `role` (xem `_app.nguoi-dung.tsx`, `_app.nhat-ky.tsx`).
- **Cảnh báo đã từng gây bug:** `_app.san-pham.tsx:418-434` redirect khi thiếu `nhom` và
  redirect đó **xoá mọi search param khác**. Khi thêm redirect cho route khác, phải giữ lại
  search hiện có.
- File hỗ trợ cạnh route dùng tiền tố `-` (`src/routes/-lp-route.ts`) — router bỏ qua theo
  `routeFileIgnorePrefix` (mặc định `-`).
- `src/routeTree.gen.ts` là file sinh tự động — **không sửa tay**.

---

## 11. Server Module Rules

- Mọi module chạm DB/secret/`node:*` **phải** có hậu tố `.server.ts`. Từ đợt cleanup,
  việc này được **cưỡng chế ở build**: client import `.server.ts` → `exit 1`.
- Handler `createServerFn` chỉ được: validate input → gọi `*.server.ts` → ghi audit.
  **Không viết SQL trong handler** (hiện còn 6 handler vi phạm — xem roadmap O4).
- Luật error ở biên: **mutation `throw`**; chỉ endpoint "thất bại dự đoán được" mới trả object
  (`loginFn` trả `{error}`, `submitLpLeadFn` trả `{ok:false,error}`).
- Mọi mutation phải `requireUser()`/`requireAdmin()` trước khi chạm dữ liệu.

---

## 12. Style Rules

- Tailwind inline; class dùng chung đặt ở `src/lib/utils.ts` (`inputCls`, `inputClsPlaceholder`).
- **Chỉ gộp class khi chuỗi giống hệt.** Biến thể khác thật (khác `text-foreground`,
  khác `mt-1`) thì để riêng — ví dụ `_app.cong-no.tsx:636` giữ nguyên có chủ đích.
- CSS riêng chỉ cho landing (`src/styles-lp.css`) — hệ design riêng, không trộn với CRM.
- Token màu khai ở `src/styles.css` (Tailwind 4 CSS-first), không có `tailwind.config.js`.

---

## 13. Checklist trước khi commit

```bash
npx tsc --noEmit        # phải là 0 (baseline cũ 29 đã được xoá)
npm run build           # Vercel deploy bằng vite build
```

- `npm run lint` hiện **đỏ toàn repo** vì CRLF/Prettier trên Windows — đây là nền cũ, không
  phải do thay đổi của bạn. **Không chạy `eslint --fix`** (sẽ ghi lại line-ending toàn repo).
- Sửa docs trong **cùng commit** với code (luật `AGENTS.md`).
