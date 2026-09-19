# CLEANUP_REPORT — Innomat CRM

> Thực thi ngày **2026-09-19** theo [CLEANUP_PLAN](CLEANUP_PLAN.md).
> Mọi mục đều có bằng chứng; mục nào không đủ chắc chắn thì **không sửa** và nằm ở §NEEDS REVIEW.
>
> Phạm vi working tree hiện tại gồm **2 đợt** chưa commit:
> (1) quét dead code + database (xem [audit-2026-09-19](audit-2026-09-19.md) §G),
> (2) đợt cleanup này. Báo cáo dưới đây chỉ mô tả **đợt 2**.

---

## Tóm tắt

| Hạng mục | Số lượng |
|---|---|
| File xoá | **1** (`scripts/_tmp-verify-cols.mjs`) |
| File đổi tên | **1** (`src/lib/storage.ts` → `src/lib/storage.server.ts`) |
| File tạo mới | **3** (`lib/pagination.ts`, `lib/lp-route.ts`, `components/ProductFormFields.tsx`) |
| Import/biến/prop chết xoá | **49** |
| Từ khoá `export` thừa bỏ | **17** |
| Endpoint RPC chết xoá | **1** (`logoutPublicFn`) |
| Symbol chết xoá hẳn | **3** (`logoutPublicFn`, `Collection`, `normalizeUsername` re-export) |
| Hàm trùng lặp gộp | **8 nhóm** |
| Type trùng lặp gộp | **3 nhóm** (`CrmConcept*`, `CustomerMapping*`, `MappingPriceBasis`) |
| Component tách dùng chung | **2** (`FormSection`/`Field`, và 2 route landing) |
| Dependency xoá | **0** (không có dependency nào chết) |
| Cấu hình cũ dọn | **3** (`.vinxi` ở eslint/gitignore/prettierignore) |
| Cấu hình sửa lỗi | **1** (`vite.config.ts` — import-protection vô hiệu, xem §B15) |
| Tài liệu sửa kèm | **9** |

---

## Files Removed

```text
1. scripts/_tmp-verify-cols.mjs

Reason:
  Script dò cột DB tạm, do phiên làm việc trước tạo ra để kiểm tra migration.

Evidence:
  grep "_tmp-verify-cols" trên toàn repo (src/, scripts/, docs/, config) → 0 tham chiếu.
  Không nằm trong package.json scripts.

Replacement:
  Không cần — đây là công cụ một lần.
```

---

## Files Moved

```text
src/lib/storage.ts → src/lib/storage.server.ts

Reason:
  Module này import `node:fs`, `node:crypto`, `@supabase/storage-js` và ghi vào
  `public/images`, nhưng KHÔNG có hậu tố `.server.ts` như các sibling
  (`image-upload.server.ts`, `image-export.server.ts`, `brand-assets.server.ts`).

  Lưu ý quan trọng: ở thời điểm đổi tên, quy ước `*.server.ts` **chưa** được máy cưỡng chế
  — lưới `importProtection` khi đó khai `["**/server/**"]`, mà repo không có thư mục `server/`
  nào, nên nó vô hiệu. Việc đổi tên chỉ thật sự có nghĩa SAU KHI sửa luôn lưới đó (xem §B15
  bên dưới): nay `client.files = ["**/*.server.*"]` và client import module `.server.ts`
  là lỗi build thật.

Evidence:
  5 consumer, TẤT CẢ đều là module server:
    src/db/crm.server.ts:2, src/db/export-quote.server.ts:3,
    src/db/gallery.server.ts:4, src/lib/image-export.server.ts:1,
    src/lib/image-upload.server.ts:1

Consumers migrated:
  5 dòng import đã đổi sang `@/lib/storage.server`.
```

---

## Files Created

```text
1. src/lib/pagination.ts          — getPageNumbers() (gộp từ 2 bản sao)
2. src/lib/lp-route.ts            — lpHead() + loadLpHeroImage() (gộp từ 2 route)
3. src/components/ProductFormFields.tsx
                                  — FormSection, Field, SUGGEST_FIELDS, SuggestField
                                    (gộp từ NewProductDialog + EditProductDialog)
```

---

## Components Merged

```text
1. FormSection + Field  (EditProductDialog.tsx:667,678  +  NewProductDialog.tsx:629,640)
   → src/components/ProductFormFields.tsx

   Reason: hai bản sao GIỐNG HỆT TỪNG KÝ TỰ (đã đối chiếu thân hàm).
   Consumers migrated: 2 dialog sản phẩm.
   KHÔNG gộp hai dialog: khác nghiệp vụ (tạo vs sửa, có/không luồng xoá,
   có/không nút sửa ảnh, EditProductDialog có thêm field `is_public`).

2. Phần chung của `/` và `/lp/$slug`  (src/routes/index.tsx  vs  src/routes/lp.$slug.tsx)
   → src/lib/lp-route.ts

   Reason: hai file giống nhau 67% token. `head()` giống hệt từng ký tự;
   đuôi loader (fetchLpHeroImageFn + try/catch) giống hệt; hàm component giống hệt.
   Consumers migrated: 2 route.
   GIỮ 2 route riêng — chúng khác nhau ở xử lý slug (mặc định → redirect 301,
   slug lạ → 404) và đó là hành vi thật, có kiểm chứng (xem §Validation).

   Ghi chú: loader cũ trả thêm `variant` nhưng cả 2 consumer đều không đọc
   (`HomePageRoute` chỉ dùng `data?.heroImage`), nên helper trả về đúng
   `{ heroImage }`.
```

---

## Hooks Removed

```text
1. `addMaterials` trong src/components/landing/useShortlistStorage.ts

   Reason: chuỗi chết bậc hai. Consumer duy nhất là `addMultipleToShortlist`
   trong ArchitectLanding.tsx:111 — bản thân hàm này cũng chết (0 lời gọi).
   Xoá hàm → xoá luôn `addMaterials` khỏi hook (type + implementation + return).
   Consumers migrated: không có (đã xác minh 0 consumer trước khi xoá).

2. `useNavigate` import trong src/routes/auth.callback.tsx:2
   Reason: compiler xác nhận không dùng (TS6133).
```

---

## Services Removed

```text
1. `logoutPublicFn`  (src/api/functions.ts:107)  — endpoint RPC chết

   Reason:
     grep `logoutPublicFn` trên toàn repo (src/, scripts/, docs/, config) →
     chỉ có khai báo + re-export, KHÔNG có caller nào.
     Đây là endpoint RPC hoàn chỉnh không ai gọi.

   Evidence:
     grep trả về 0 hit trong mã nguồn; chỉ còn hit trong artifact build cũ
     `.vercel/output/functions/__server.func/_ssr/functions-*.mjs`.

2. re-export `logoutPublicFn` trong src/api/lp.ts:105  — chết theo (1).
3. re-export `authGoogleCallback` trong src/api/lp.ts:103
   Reason: consumer duy nhất (`auth.callback.tsx:3`) import thẳng từ
   `@/api/functions`, không đi qua lp.ts.
4. re-export `normalizeUsername` trong src/db/users.server.ts:195
   Reason: 0 importer bên ngoài; hàm gốc vẫn sống ở auth.server.ts:177.
   Xoá re-export kéo theo import `normalizeUsername` ở đầu file thành thừa.
```

> ⚠️ **`logoutPublicSession` (src/db/auth-public.server.ts:185) được GIỮ LẠI có chủ đích.**
> Sau khi xoá `logoutPublicFn`, hàm này không còn consumer. Nó là **khả năng kết thúc
> phiên khách** — xoá tiếp sẽ kéo theo `clearPublicSessionCookie` và import `deleteCookie`,
> tức là xoá sạch tính năng đăng xuất khách. Đây là quyết định về sản phẩm, không phải
> quyết định kỹ thuật → đưa vào NEEDS REVIEW thay vì tự xoá.

---

## Utils Removed / Consolidated

| Hàm | Bản sao | Nơi nhận | Ghi chú |
|---|---|---|---|
| `nowLocal()` | 6 (`auth`, `auth-public`, `crm`, `gallery`, `lp`, `users`) | `src/lib/format.ts` | Thân hàm giống hệt từng ký tự. Bản thứ 7 ở `space-collections.server.ts` đã chết → xoá hẳn |
| `expiresAt(days)` | 2 (`auth`, `auth-public`) | `src/lib/format.ts` | Khác nhau đúng hằng số mặc định → gọi `expiresAt(SESSION_DAYS)` / `expiresAt(PUBLIC_SESSION_DAYS)` |
| `escapeHtml()` | 2 (`product-quick-sheet`, `export-mapping.server`) | `src/lib/format.ts` | Bản server nhận `unknown` + `String(value ?? "")`; bản client nhận `string`. Bản chung dùng `unknown` — với input `string` hành vi y hệt |
| `basisToDiscountType()` | 2 (`CustomerMappingDialog`, `export-mapping.server`) | `src/lib/pricing.ts` | Thân hàm giống hệt |
| `getPageNumbers()` | 2 (`_app.luu-tru`, `_app.khong-gian`) | `src/lib/pagination.ts` | Thân hàm giống hệt từng ký tự |
| `inputCls` (chuỗi Tailwind) | 6 | `src/lib/utils.ts` (`inputCls`, `inputClsPlaceholder`) | 3 file dùng bản nền; 2 file dùng bản có placeholder; NewQuoteDialog = bản placeholder + `disabled:opacity-60`. `_app.cong-no.tsx:636` **giữ nguyên** vì khác thật (`mt-1`, không có `text-foreground`) |

---

## Types Removed / Consolidated

| Nhóm | Trước | Sau | Bằng chứng |
|---|---|---|---|
| `CrmConceptTag` / `Item` / `Filter` / `Response` | khai 2 nơi: `db/space-collections.server.ts:249-295` và `lib/lp-types.ts:198-238` | nguồn chuẩn ở `lib/lp-types.ts`, server import lại | 3 type giống hệt; riêng `CrmConceptFilter` **đã trôi lệch** — bản db có thêm `category` + `color`, đúng thứ route `_app.khong-gian.tsx:308` gửi lên. Đây là **bug thật** được sửa |
| `CustomerMappingItem` / `CustomerMapping` | khai 2 nơi: `db/crm.server.ts:1077-1109` và `components/CustomerMappingDialog.tsx:71-128` | nguồn chuẩn ở `lib/types.ts` | `CustomerMappingItem` giống hệt; `CustomerMapping.linked_quotes[].status` bản client **hard-code** union trong khi server dùng `QuoteStatus` → gộp về `QuoteStatus` |
| `MappingPriceBasis` | khai 2 nơi: `db/crm.server.ts:1072` và `components/CustomerMappingDialog.tsx:91` | nguồn chuẩn ở `lib/types.ts` | Giống hệt |
| `Collection` | `data/mockData.ts:32` | xoá | grep `\bCollection\b` toàn repo → chỉ có khai báo này |
| `ImageRoomTagSource` | `lib/types.ts:27` | bỏ `export` (giữ symbol) | 0 tham chiếu ngoài file; vẫn dùng ở `:39` |
| 16 export khác | xem [CLEANUP_PLAN](CLEANUP_PLAN.md) §A3 | bỏ `export` | grep `\bSYMBOL\b` trên `src/`, `scripts/`, `docs/`, config → 0 tham chiếu ngoài |

---

## Dependencies Removed

**Không xoá dependency nào.** Đã kiểm từng gói trong `package.json`:

- Mọi `dependencies` đều có tham chiếu thật trong `src/`, `scripts/` hoặc config.
- `@types/node`, `@types/pg`, `@types/react`, `@types/react-dom` có 0 hit văn bản nhưng
  được `tsc` dùng ngầm → **giữ**.
- `eslint-config-prettier` có 0 hit trực tiếp nhưng được nạp qua
  `eslint-plugin-prettier/recommended` (`eslint.config.js:2`) → **giữ**.
- `lightningcss`, `nitro`, `vite-tsconfig-paths`, `@tanstack/devtools-vite`,
  `@tailwindcss/vite` chỉ xuất hiện trong `vite.config.ts` → **giữ** (build tooling).

---

## Dead Code Removed

### Import / biến / prop chết — 49 mục (compiler xác nhận)

Nguồn: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` → `TS6133`/`TS6196`.
Trước cleanup: **44** phát hiện. Sau cleanup: **0**.

| File | Symbol |
|---|---|
| `src/api/functions.ts:16` | `FlatMediaSort` |
| `src/routes/auth.callback.tsx:2` | `useNavigate` |
| `src/routes/_app.san-pham.tsx:61,62,63,67` | `Globe`, `Eye`, `EyeOff`, `Loader2` |
| `src/routes/_app.san-pham.tsx:1131,1150` | `bulkPublish`, `bulkUnpublish` (hàm chết) |
| `src/routes/_app.san-pham.tsx:2018,2154` | prop `onTogglePublic` (khai + truyền nhưng không đọc) |
| `src/routes/_app.san-pham.tsx:1112` | handler `onTogglePublic` (chết theo prop) |
| `src/routes/_app.san-pham.tsx:40,41` | import `updateProductFn`, `bulkSetProductsPublicFn` (chết bậc hai) |
| `src/routes/_app.luu-tru.tsx:11,17` | `Eye`, `Layers` |
| `src/routes/_app.luu-tru.tsx:235,1376` | `loadingSlots` (state chỉ ghi), `hasTag` |
| `src/routes/_app.khong-gian.tsx:16` | `useMemo` |
| `src/routes/_app.khong-gian.tsx:29,31,33,34` | `Check`, `SlidersHorizontal`, `Building2`, `CheckCircle2` |
| `src/db/space-collections.server.ts:10,12` | `LpMaterial`, `nowLocal` (hàm chết) |
| `src/components/AppSidebar.tsx:3,22` | `LayoutDashboard`, `Sparkles` |
| `src/components/BulkEditFieldDialog.tsx:7` | `Sparkles` |
| `src/components/EditProductDialog.tsx:213` | biến `syncedCodes` (gán mà không dùng) |
| `src/components/landing/ArchitectLanding.tsx:26,33` | `curatedMaterials`, `LineId` |
| `src/components/landing/ArchitectLanding.tsx:111` | `addMultipleToShortlist` |
| `src/components/landing/MaterialLibraryPage.tsx:7,8,9,17` | `Download`, `Box`, `FileText`, `X` |
| `src/components/landing/MaterialLibraryPage.tsx:25,39,73` | `CatalogFacetOption`, `UNLOCKED_STORAGE_KEY`, state `loading` (chỉ ghi) |
| `src/components/landing/MaterialModal.tsx:1,51` | `useRef`, state `imgNatural` (chỉ ghi) + khối `onLoad` chỉ để ghi nó |
| `src/components/landing/MoodboardDrawer.tsx:6,11` | `Download`, `FileText` |
| `src/components/landing/ProjectBriefForm.tsx:10,17` | `Send`, type `Material` |
| `src/components/landing/ProjectBriefForm.tsx:19,38` | prop `shortlistCount` (khai + truyền, không đọc) |
| `src/components/landing/SpaceLookbookSection.tsx:10,305` | `SlidersHorizontal`, tham số `index` |

**Ghi chú về `onTogglePublic`:** prop này được truyền vào 2 component
(`ProductCard`, `ProductListRow`) nhưng **không được đọc ở đâu**. Cùng lúc, 3 icon
`Globe`/`Eye`/`EyeOff` cũng thừa — dấu hiệu nút bật/tắt công khai theo từng dòng
đã bị gỡ khỏi UI từ trước nhưng phần dây nối còn sót. Đã xoá toàn bộ dây nối.
Nếu muốn có lại nút đó thì phải viết lại UI — xem NEEDS REVIEW #5.

### Code comment-out

Quét `^\s*//\s*(const|let|var|function|return|if|for|while|import|export|</|/>|\}|\{)` trên
toàn `src/` → **0 khối code bị comment**. Ba hit duy nhất là comment văn xuôi.
Không có gì để dọn.

---

## Architecture Improvements

1. **`src/lib/format.ts` trở thành nơi duy nhất sinh timestamp DB.** Trước đây 6 module
   `src/db/*.server.ts` tự khai bản sao `nowLocal()` — mọi thay đổi định dạng thời gian
   phải sửa 6 chỗ. Nay 1 chỗ.
2. **`src/lib/utils.ts` giữ class input dùng chung**, thay vì 6 chuỗi Tailwind chép tay
   trong 6 dialog (đã trôi thành 3 biến thể).
3. **Type dùng chung client↔server về một nguồn.** `CrmConcept*`, `CustomerMapping*`,
   `MappingPriceBasis` trước đây bị "mirror" thủ công ở phía client và **đã trôi lệch thật**
   (`CrmConceptFilter` thiếu `category`/`color`; `CustomerMapping.status` hard-code thay vì
   dùng `QuoteStatus`). Nay client và server import cùng một khai báo.
4. **`src/lib/storage.server.ts` khôi phục quy ước `*.server.ts`** cho module nặng nhất
   về fs/secret — đây là module mà việc lọt vào bundle client sẽ gây lỗi build.
5. **Hai route landing không còn là bản sao của nhau.** `head()` và loader giờ nằm ở
   `src/lib/lp-route.ts`; sửa meta/CSS/font chỉ cần sửa 1 chỗ.
6. **Cấu hình thời Vinxi đã dọn**: `.vinxi` xuất hiện ở `eslint.config.js`, `.gitignore`,
   `.prettierignore` dù repo không còn dependency `vinxi` (TanStack Start 1.x chạy trên Vite thuần).

---

## Bổ sung sau khi rà soát lại (đợt 2b)

Sau khi commit `f0c2fc5`, tôi rà lại từng khẳng định trong báo cáo và **tự kiểm chứng** các
điểm còn nghi ngờ. Bốn việc phát sinh, hai trong số đó là **lỗi thật do chính đợt cleanup gây ra**:

### B15. `vite.config.ts` — lưới import-protection bị hạ cấp thành vô hiệu (⚠️ sửa lỗi thật)

`importProtection.client.files` được khai là `["**/server/**"]`. Nhưng:

- Repo **không có thư mục `server/`** nào (`find -type d -name server` → chỉ có trong `node_modules`).
- Không file nào import specifier `server-only`.
- Framework mặc định (`@tanstack/start-plugin-core/dist/esm/import-protection/defaults.js`)
  là `files: ["**/*.server.*"]`, và config người dùng **ghi đè** chứ không merge:
  `pick(user, fallback) = user ? [...user] : [...fallback]` (`plugin.js:785`).

→ Bản cũ là một bước **hạ cấp** so với mặc định, khiến lưới **vô hiệu hoàn toàn**: client lỡ
import `@/lib/storage.server` sẽ kéo `node:fs`/`pg` vào bundle mà build vẫn xanh. Đây là rủi ro
thật, không phải chuyện đặt tên.

**Sửa:** trả `client.files` về đúng mặc định `["**/*.server.*"]` (phủ `.ts`/`.js`/`.mjs`) thay vì
tự thu hẹp thành `*.server.ts`.

> Ghi chú: `specifiers` thì **được merge** với mặc định
> (`dedupePatterns([...defaults.client.specifiers, ...user…])`), nên các marker
> `@tanstack/react-start/server-only` chưa bao giờ mất. Chỉ `files` và `excludeFiles` bị ghi đè.

**Kiểm chứng HAI CHIỀU** (không chỉ "build vẫn xanh"):

| Chiều | Cách làm | Kết quả |
|---|---|---|
| **Có chặn** (không false negative) | Thêm `import { readImageBytes } from "@/lib/storage.server"` vào `src/routes/_app.ghi-chu.tsx` và **dùng thật** giá trị (`${typeof readImageBytes}` trong JSX) | **FAIL, `exit=1`**<br>`[import-protection] Import denied in client environment`<br>`Denied by file pattern: **/*.server.*`<br>`Importer: src/routes/_app.ghi-chu.tsx`<br>`Resolved: src/lib/storage.server.ts` |
| **Không chặn nhầm** (không false positive) | Gỡ import, build lại toàn repo | `✓ built` ×3 — xanh; `git diff` trên file test rỗng |

⚠️ **Bẫy khi test:** lần thử đầu tôi chỉ thêm import mà **không dùng** → esbuild elide nó trước
khi plugin kịp thấy → build xanh và **test không kết luận được gì**. Phải tham chiếu giá trị
thật thì mới là test hợp lệ.

### B16. `useShortlistStorage` — prune API chết (⚠️ lỗ hổng của phương pháp)

Hook có **đúng 1 consumer** (`ArchitectLanding.tsx:46`) và consumer đó chỉ destructure 3 thành
viên. `setShortlistIds` và `isHydrated` có **0 tham chiếu** ngoài file hook.

Đã prune cả hai (type + implementation + return). `persistToStorage` vẫn sống qua
`toggleMaterial` và `clearShortlist`.

> **Lỗ hổng phương pháp — ghi lại để không lặp lại:** tầng SAFE của đợt này dựa vào
> `tsc --noUnusedLocals`, mà compiler **không** báo thuộc tính thừa trong object literal được
> `return`. Quét export của tôi cũng bỏ qua chúng vì loại trừ file định nghĩa. Nghĩa là:
> **tầng SAFE không bao giờ nhìn thấy dead code nằm trong object trả về.** Hai thành viên này
> chỉ lộ ra khi kiểm bằng tay. Vì vậy báo cáo **không** claim "đã quét sạch mọi dead code" —
> chỉ claim chính xác những gì compiler và grep xác nhận.

### B17. Sửa 5 chỗ tài liệu mâu thuẫn với code

| File | Vấn đề | Sửa |
|---|---|---|
| `docs/PROJECT_STRUCTURE.md:76` | Cây thư mục còn ghi `storage.ts` | → `storage.server.ts` |
| `docs/PROJECT_STRUCTURE.md:178` | Bảng quy ước ghi `lib/storage.ts` = "**Phá quy ước**" — tự mâu thuẫn với chính đợt cleanup vừa sửa nó | → ✔ "Đúng quy ước" |
| `docs/tong-quan-tinh-nang.md:47` | Ghi `/` là "(chỉ redirect)" — sai: `/` render `ArchitectLanding` (`index.tsx:58`) | → mô tả đúng |
| `docs/san-pham-ton-kho-import.md:26-27` | Bảng "Cột `products` dễ nhầm" **đảo ngược**: ghi `supplier` = "Bộ sưu tập", `collections` = "Hiệu ứng vân / mặt gạch" | → sửa theo code: `supplier` = **Nhà cung cấp**, `collections` = **Bộ sưu tập**, `texture` = Hiệu ứng vân |
| `docs/audit-2026-09-19.md:25,295,333` | Ba dòng còn nói param `supplier` "không có đường vào từ UI"; dòng 333 trỏ sai sang §G4 (là mục comment/nhãn, không nhắc chip) | → đánh dấu đã xử lý, trỏ đúng §E2c + CLEANUP_REPORT |

Bảng `supplier`/`collections` được xác minh trực tiếp từ code: `collectionOptions` đọc
`matchIndexed("collection")` → `p.collections`, chip nhãn `"Bộ sưu tập"`; `supplierOptions`
đọc `matchIndexed("supplier")` → `p.supplier`, chip nhãn `"Nhà cung cấp"`
(`_app.san-pham.tsx:1288-1343`).

### B18. Sửa một khẳng định SAI trong chính báo cáo này

Mục **R1** của [PROJECT_AUDIT](PROJECT_AUDIT.md) (và bản đầu của báo cáo này) mô tả catch chuỗi
SQLite là **"lỗi thật, mức CAO"**, cho rằng "1 `product_code` sai làm hỏng cả lần import".
**Sai.** Đã đọc lại câu lệnh:

```sql
INSERT OR IGNORE INTO product_internal_codes (product_id, internal_code)
SELECT id, ? FROM products WHERE code = ?
```

`product_code` sai → `SELECT` trả **0 dòng** → chèn 0 dòng, **không sinh lỗi FK**.
`product_id` lấy từ `products.id` nên FK `product_id → products(id)` luôn thoả.
`INSERT OR IGNORE` nuốt luôn vi phạm UNIQUE. Vậy nhánh `catch` là **code không tới được**.

→ Đã hạ mức xuống **Thấp** và mô tả đúng: đây là **mùi bắt sai dialect**, rủi ro thật là nếu
câu lệnh đổi dạng thì `catch` sẽ **nuốt nhầm lỗi khác**. Không sửa code (sửa là đổi hành vi).

### B19. Kiểm chứng lại `scripts/vision-batch-runner.mjs`

Nghi ngờ: `'accepted'` còn sót trong `SELECT` → 8 cột vs 9 giá trị → lỗi runtime
"INSERT has more expressions than target columns". **Đã kiểm: không có vấn đề.**

- Cột (`:587`): `product_image_id, room_slug, source, confidence, model, model_version, created_at, updated_at` = **8**
- Giá trị (`:588-596`): `u.image_id, u.room_slug, 'vision', u.confidence, u.model, u.model_version, NOW()::text, NOW()::text` = **8**
- `DO UPDATE SET` (`:598-605`) không còn `review_status`; `'accepted'` không xuất hiện ở đâu
  trong file (`grep accepted` → 0).

### B20. Ghi nhận: `nowLocal` là tên gây nhầm (KHÔNG sửa)

Cả 7 bản sao (nay còn 1) trả `new Date().toISOString().slice(0,19).replace("T"," ")` —
tức là **giờ UTC**, không phải giờ địa phương, dù tên là `nowLocal`.

Hệ quả tiềm ẩn: chuỗi này được render thẳng ở ~15 chỗ UI (coi như giờ tường) và được parse lại
bằng `new Date(x.replace(" ", "T"))` (cũng hiểu là giờ địa phương) ở
`export-quote.server.ts:169` và `export-mapping.server.ts:287`. Với deployment VN (UTC+7) thì
ba cách hiểu đó không thể cùng đúng.

**Không sửa** trong đợt này: đổi ngữ nghĩa thời gian là **thay đổi hành vi** và có thể lệch
dữ liệu hiển thị. Đã ghi vào NEEDS REVIEW. Việc gộp 7 bản sao về 1 helper là **trung tính về
hành vi** — docblock của helper ghi rõ `(UTC)` để không lặp lại cái tên gây nhầm.

### B21. Trạng thái deploy Vercel — KHÔNG kiểm được từ môi trường này

`npx vercel ls` trả `Error: No existing credentials found`. Repo cũng không còn
`.vercel/project.json` (thư mục `.vercel/` chỉ có `output/`, và `.vercel/` bị gitignore).
Vậy **không thể xác nhận từ đây** rằng build production đã xanh.

Cần bạn kiểm trên dashboard Vercel cho commit `f0c2fc5`. Đây là điểm chưa đóng của báo cáo —
push này nhằm vá lỗi production (xem §Validation), nên trạng thái build production là thông tin
quan trọng.

---

## Remaining Suspicious Files

| File / vị trí | Vấn đề | Vì sao chưa xử lý |
|---|---|---|
| `src/api/functions.ts:1574` | Bắt chuỗi lỗi **SQLite** (`"FOREIGN KEY constraint failed"`) trong codebase **PostgreSQL** (`src/db/driver.ts:1` dùng `pg`). Trên PG message là `violates foreign key constraint` → nhánh bỏ qua dòng lỗi không bao giờ chạy, 1 `product_code` sai làm hỏng cả lần import | Sửa = **đổi hành vi import**. Cần người quyết định |
| `src/data/mockData.ts:117` (`curatedMaterials`) + `ProjectBriefForm.tsx:60-62` | Consumer duy nhất lọc theo id `"m1".."m12"` trong khi id từ server là số (`ArchitectLanding.tsx:75`) → **không bao giờ khớp**, UI xem trước shortlist không bao giờ render | Xoá là **thay đổi UI**; có thể là tính năng đang chờ nối dây |
| `src/data/mockData.ts` — 10 hằng ảnh | Chỉ phục vụ `curatedMaterials` | Phụ thuộc quyết định trên |
| `src/routes/_app.luu-tru.tsx` | **29 lỗi TS tồn đọng**; riêng file này thiếu hẳn import 3 type (`ImageRoomTagSlug`, `ProductImageKind`, `ProductImageRow`) | Nằm ngoài phạm vi cleanup; baseline repo là 29 lỗi |
| `src/lib/color-tones.ts` vs `src/lib/color-palette.ts` | 2 taxonomy màu song song (8 nhóm vs 11 nhóm) cùng map từ `products.color` | Là quyết định nghiệp vụ, không phải trùng lặp kỹ thuật |
| `src/db/index.server.ts` | Facade 1 dòng re-export `getDb`/`SqlValue`; 12 file dùng nó nhưng `gallery.server.ts:1` đi thẳng `./driver` | Không sai, chỉ không nhất quán |
| `src/db/driver.ts:80-101,265-270` | Quyết định thêm `RETURNING id` theo danh sách bảng hard-code; bảng mới quên khai sẽ trả `lastInsertRowid: null` âm thầm | Sửa cần thiết kế lại |
| `public/favicon.ico` | 0 tham chiếu (chỉ `favicon.png` / `favicon-ebg.svg` được khai) | Trình duyệt tự gọi `/favicon.ico`; xoá sẽ tạo 404 |
| `src/routes/_app.co-hoi.tsx:169` | `React.CSSProperties` dùng không import (dựa vào UMD global) | Nợ type nhỏ |

---

## NEEDS REVIEW

```text
1. src/db/auth-public.server.ts:185 — logoutPublicSession()
   Reason: mất consumer sau khi xoá endpoint logoutPublicFn. Là khả năng
           KẾT THÚC PHIÊN KHÁCH; xoá tiếp sẽ kéo theo clearPublicSessionCookie
           và import deleteCookie (chuỗi 3 tầng).
   Cần quyết định: nối dây thành nút "Đăng xuất" ở landing, hay xoá cả chuỗi.

2. src/api/functions.ts:1574 — chuỗi lỗi SQLite trong codebase PostgreSQL
   Reason: bug thật nhưng sửa sẽ đổi hành vi import sản phẩm.

3. src/data/mockData.ts curatedMaterials + UI shortlist preview trong ProjectBriefForm
   Reason: scaffolding chết (id không bao giờ khớp) nhưng xoá là thay đổi UI.

4. src/lib/lp-content.ts LP_VARIANTS — chỉ .eyebrow được đọc
   Reason: 6 field nội dung (headline/sub/offer/formTitle/formNote/faq) không render.
           Có thể là nội dung đang chờ dùng lại.

5. _app.san-pham.tsx — nút bật/tắt công khai theo từng dòng đã bị gỡ
   Reason: đã xoá dây nối chết (prop onTogglePublic + handler + 3 icon).
           Tính năng "hiện/ẩn mã trên Thư viện web" hiện chỉ còn ở /luu-tru.

6. src/lib/color-tones.ts vs src/lib/color-palette.ts — 2 taxonomy màu
   Reason: cùng map products.color nhưng khác số nhóm; gộp là quyết định nghiệp vụ.

7. src/db/index.server.ts — facade getDb
   Reason: 12 file dùng, 1 file đi thẳng driver. Gộp hay không là sở thích kiến trúc.

8. src/db/driver.ts ID_TABLES/TABLES_WITHOUT_ID
   Reason: thêm bảng mới mà quên khai → lastInsertRowid null âm thầm.

9. 29 lỗi TypeScript tồn đọng (đặc biệt _app.luu-tru.tsx thiếu import type)
   Reason: baseline của repo; sửa nằm ngoài phạm vi cleanup này.

10. 3 route 2.3k–2.7k dòng (_app.thu-vien, _app.luu-tru, _app.san-pham)
    Reason: chứa facet/sort codec/pagination/token hoá inline. Tách hook là
            refactor lớn, repo KHÔNG có test tự động làm lưới an toàn.

11. SQL/nghiệp vụ trong tầng API (functions.ts:1558-1749, lp.ts:94-97,210-231)
    Reason: di chuyển xuống db/*.server.ts là refactor lớn.

12. src/db/auth-public.server.ts:289-330 — module auth ghi thẳng lp_leads
    Reason: sai tầng nhưng đang chạy đúng.

13. public/favicon.ico không được tham chiếu
    Reason: xoá sẽ tạo 404 khi trình duyệt tự gọi.

14. docs: số liệu quy mô đã cũ ở nhiều chỗ
    Reason: AGENTS.md cấm chép số liệu tay; đã sửa các chỗ phát hiện được
            (README, cai-dat-va-moi-truong, kien-truc, tong-quan §16) và trỏ
            về tong-quan-tinh-nang.md §16 làm nguồn duy nhất.

15. nowLocal() — tên nói "local" nhưng trả GIỜ UTC
    Reason: chuỗi `YYYY-MM-DD HH:mm:ss` được render thẳng ở ~15 chỗ UI (hiểu là giờ tường)
            và parse lại bằng `new Date(x.replace(" ","T"))` (hiểu là giờ địa phương) ở
            export-quote.server.ts:169 + export-mapping.server.ts:287. Với VN (UTC+7) ba
            cách hiểu này không thể cùng đúng. Sửa = đổi hành vi + có thể lệch dữ liệu hiển thị.
    Đã gộp 7 bản sao về 1 helper (trung tính hành vi) và ghi rõ "(UTC)" trong docblock.

16. vite.config.ts import-protection — đã bật lại, nhưng cần biết là nó CHƯA từng chạy
    Reason: từ nay client import `*.server.ts` là lỗi build. Nếu có ai đó (hoặc một agent)
    đang dựa vào việc import type từ `*.server.ts` mà không dùng `import type`, build sẽ đỏ.
    Đây là chủ ý, nhưng là thay đổi hành vi build cần biết.
```

---

## Things NOT Changed

| Thứ | Vì sao cố tình không sửa |
|---|---|
| `src/routeTree.gen.ts` | File sinh tự động — sửa tay sẽ bị ghi đè |
| `src/start.ts`, `src/server.ts`, `src/router.tsx` | Entry point framework (`vite.config.ts:41` trỏ `server.entry = "server"`). Grep tĩnh cho 0 tham chiếu là bình thường |
| `src/db/schema-pg.sql` | Nguồn schema duy nhất; đợt này không đổi bảng/cột nào |
| `AGENTS.md` | Nguồn luật duy nhất của repo |
| `em-ban-gach/`, `tmp/`, `.env*` | Gitignored / dữ liệu local của người dùng |
| `public/favicon.ico` | Xem NEEDS REVIEW #13 |
| Mọi dependency trong `package.json` | Tất cả đều đang được dùng (kể cả `@types/*` và `eslint-config-prettier` — dùng ngầm) |
| `src/routes/_app.cong-no.tsx:636` `inputCls` | Khác thật (`mt-1`, không có `text-foreground`) — không phải bản sao |
| `Stat` ở `_app.cong-no.tsx:617` và `_app.khach-hang.$customerId.tsx:1221` | Máy dò trùng lặp báo giống nhau 1.00, nhưng **đọc kỹ thì khác**: `rounded-lg ring-1 ring-black/5 p-3 bg-surface-strong/30` vs `rounded-xl bg-card ring-1 ring-black/5 px-3 py-2.5`; prop `accent: string` vs `accent?: boolean`. Gộp sẽ **đổi giao diện** một trong hai trang |
| `eslint.config.js` rule `@typescript-eslint/no-unused-vars: "off"` | Đây là lý do 49 import chết tồn tại lâu. Bật lại sẽ tạo hàng trăm lỗi lint trên code hiện tại — cần một đợt riêng. Đã dùng `tsc --noUnusedLocals` làm lưới thay thế trong đợt này |

---

## Validation

```text
Lint:              FAIL (pre-existing, không do cleanup)
Typecheck:         PASS (29 lỗi = đúng baseline trước cleanup, không tăng)
Unused code:       PASS (44 → 0 phát hiện TS6133/TS6196)
Unit Tests:        N/A  (repo không có test tự động — 0 file *.test.* / *.spec.*)
Integration Tests: N/A
E2E Tests:         N/A
Build:             PASS (vite build + nitro vercel preset + postbuild)
```

### Chi tiết

**Typecheck** — `npx tsc --noEmit`:
- Trước cleanup: **29** lỗi.
- Sau cleanup: **29** lỗi, **cùng danh sách** (`_app.luu-tru.tsx` 23, `crm.server.ts` 4,
  `AppSidebar.tsx` 2). Đã đối chiếu từng dòng — không có lỗi mới, không mất lỗi cũ.
- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` → 44 phát hiện trước, **0** sau.

**Import-protection (đợt 2b)** — kiểm chứng bằng **test âm**, không chỉ bằng build xanh:
thêm một import `.server.ts` **có dùng thật** vào một route → `npm run build` **FAIL** với
`[import-protection] Import denied in client environment`; gỡ ra → xanh lại. Chi tiết §B15.

**Lint** — `npm run lint` → 44.386 lỗi, nhưng:
- **44.370 lỗi là `Delete ␍` (CRLF)** do Prettier cấu hình LF còn file trên Windows dùng CRLF.
  Đã kiểm chứng là **có từ trước**: file không hề bị cleanup chạm (`src/routes/_app.ghi-chu.tsx`)
  cũng cho **79 lỗi y hệt** ở trạng thái HEAD.
- Số còn lại là nợ cũ (`no-explicit-any`, `ban-ts-comment`, `no-empty`, 1 lỗi parse) — không
  phát sinh từ cleanup.
- **Kết luận: cleanup không thêm lỗi lint nào.**

**Build** — `npm run build` → PASS (`✓ built`, nitro sinh `.vercel/output`, `postbuild`
`prune-deploy-backup.mjs` chạy xong).

**Smoke test** (dev server `http://localhost:8080`, đã đăng nhập admin):

| Kiểm | Kết quả |
|---|---|
| `/` trả 200 và render landing | ✅ `Em bán gạch` có trong HTML |
| `/lp/gach-trang-tri` (slug mặc định) | ✅ **301** → `/` |
| `/lp/khong-ton-tai-xyz` | ✅ **404** |
| 13 route CRM (`/tong-quan`, `/khach-hang`, `/co-hoi`, `/bao-gia`, `/cong-no`, `/ghi-chu`, `/san-pham`, `/luu-tru`, `/thu-vien`, `/khong-gian`, `/leads`, `/nguoi-dung`, `/nhat-ky`) | ✅ tất cả render, **0** trang lỗi |
| `/san-pham?nhom=tat-ca` | ✅ 963 sản phẩm |
| Dialog **Sửa sản phẩm** | ✅ mở, **4** `<section>` (FormSection dùng chung) + **19** `<label>` (Field dùng chung) + 12 input (class dùng chung) |
| Dialog **Tạo sản phẩm** | ✅ mở, 4 section + 19 label — cùng bộ primitive dùng chung |
| `/khach-hang/19` | ✅ render hồ sơ + "Đề xuất vật liệu (6)" khớp DB |
| Dialog **Tạo đề xuất vật liệu** | ✅ mở, select khách hàng nạp đủ danh sách |
| `/cong-no`, `/nguoi-dung` | ✅ nạp dữ liệu thật sau khi `useQuery` xong |

**Re-scan sau cleanup** (bắt buộc theo quy trình — một deletion có thể sinh dead code mới):

| Hạng mục | Trước | Sau |
|---|---|---|
| File không tới được từ route | 0 / 105 | **0 / 104** |
| Export 0 tham chiếu ngoài | 49 | **28** (toàn bộ là type chỉ dùng nội bộ file, `LP_VARIANTS`, hằng ảnh mockData, `logoutPublicSession` — đều đã phân loại ở trên) |
| Tên khai ở >1 file | 14 | **7** (`Route` ×21 là quy ước framework; `getDb` là re-export; `authGoogleStart`/`fetchPublicMeFn` là re-export có chủ đích) |
| Import/biến chết (tsc) | 44 | **0** |
| Chu trình phụ thuộc | 0 | **0** |

### Điều kiện dừng đã định trước

CLEANUP_PLAN §F quy định revert nếu một mục làm tăng lỗi `tsc`, làm build fail, hoặc không
chứng minh được tương đương hành vi. **Không mục nào phải revert.** Hai mục bị hạ cấp sang
NEEDS REVIEW vì không chứng minh được tương đương hành vi:
- **B10 `Stat`** — hai bản khác nhau về markup và kiểu prop (xem §Things NOT Changed).
- **B6 một phần** — `inputCls` của `_app.cong-no.tsx` khác thật nên giữ nguyên.
