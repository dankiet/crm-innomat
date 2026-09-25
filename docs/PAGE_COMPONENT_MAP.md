# PAGE_COMPONENT_MAP — Innomat CRM

> Với **mỗi** URL: page, layout, component, hook, service, API và luồng dữ liệu.
> Mọi dòng đều trace từ source (số dòng là số dòng import/render thật).
> Đo ngày **2026-09-24** (cập nhật sau khi gỡ `/thu-vien` + tầng registry/GC ảnh).

Ký hiệu: `SF` = `createServerFn`; `DB` = module `src/db/*.server.ts` được nạp động.

---

## 0. Ma trận tổng hợp

| URL | Layout | Page component | Feature components | Shared components | Hooks | Server functions | DB module |
|---|---|---|---|---|---|---|---|
| `/` | root + LP css | `HomePageRoute` | `ArchitectLanding` | — | `useShortlistStorage` | `fetchLpHeroImageFn` | `lp.server` |
| `/lp/$slug` | root + LP css | `LandingPageRoute` | `ArchitectLanding` | — | `useShortlistStorage` | `fetchLpHeroImageFn` | `lp.server` |
| `/login` | root | `LoginPage` | — | — | — | `fetchMe`, `loginFn` | `auth.server` |
| `/auth/callback` | root | `AuthCallbackPage` | — | — | — | `authGoogleCallback` | `auth-public.server` |
| `/tong-quan` | `_app` | `DashboardPage` | `Shortcut`, `StickyNoteIcon` (local) | `PageHeader` | — | `fetchDashboard` | `crm.server` |
| `/khach-hang` | `_app` | layout `<Outlet/>` | — | — | — | — | — |
| `/khach-hang/` | `_app` + khach-hang | `CustomersPage` | `IconBtn` (local) | `PageHeader`, `PageFilterBar`, `CustomerCard`, `NewCustomerDialog`, `NewQuoteDialog` | `useLocalStorageState` | `fetchCustomers`, `fetchCustomerDebts`, `fetchNotes` | `crm.server` |
| `/khach-hang/$customerId` | `_app` + khach-hang | `CustomerDetailPage` | `Stat`, `Empty`, `SmallBtn` (local) | `NewCustomerDialog`, `NewQuoteDialog`, `CustomerMappingDialog`, `ExportQuoteDialog`, `ProductImage`, `ui/dialog` | — | 17 SF (xem §7) | `crm.server`, `export-*.server` |
| `/co-hoi` | `_app` | `PipelinePage` | `DealCard`, `MiniBtn`, `DraggableDealCard`, `DroppableStageColumn` | `PageHeader`, `PageFilterBar`, `NewCustomerDialog`, `NewQuoteDialog` | `useLocalStorageState` | `fetchCustomers`, `setCustomerStatus` | `crm.server` |
| `/bao-gia` | `_app` | `QuotesPage` | `QuoteCard`, `QuoteRow`, `OrderStatusSelect`, `OrderCard`, `OrderRow`, `Empty` | `PageHeader`, `PageFilterBar`, `NewQuoteDialog`, `ExportQuoteDialog`, `FilterChip`, `MultiSelectFilter` | `useLocalStorageState` | 7 SF (xem §10) | `crm.server`, `export-quote.server` |
| `/cong-no` | `_app` | `DebtPage` | `Stat` (local) | `PageHeader`, `PageFilterBar`, `ui/dialog` | `useHistoryLayer` | 5 SF (xem §11) | `crm.server` |
| `/ghi-chu` | `_app` | `NotesPage` | — | `PageHeader`, `NewNoteDialog` | — | `fetchNotes` | `crm.server` |
| `/san-pham` | `_app` | `ProductsPage` | `ImportExportProductsDialog`, `ImportStockDialog`, `EditProductDialog`, `EditProductImagesDialog`, `NewProductDialog`, `BulkEditFieldDialog`, `NewQuoteDialog`, `ProductCheck`, `FilterSection`, `ActiveTag` | `PageHeader`, `ProductImage`, `SortMenu`, `FilterChip`, `MultiSelectFilter`, `ui/popover`, `ui/dialog` | — | 6 SF | `crm.server`, `product-import-export.server` |
| `/luu-tru` | `_app` | `MediaStoragePage` | `QuickRoomTagPopover`, `QuickFeaturedRankPopover`, `BulkRoomTagPopover`, `ProductGalleryDialog` | `PageHeader`, `ProductImage`, `ImageRoomTagPicker`, `AssetUsageDialog`, `FilterChip`, `MultiSelectFilter`, `PaginationBar`, `ui/dialog`, `ui/popover` | — | 19 SF | `crm.server`, `lp.server`, `media.server`, `image-references.server` |
| `/khong-gian` | `_app` | `ConceptHubPage` | `QuickConceptRoomTagPopover` | `PageHeader`, `ui/dialog`, `ui/popover` | — | 5 SF | `space-collections.server`, `crm.server` |
| `/leads` | `_app` | `LeadsPage` | `STATUS_TABS`, hai bước xoá inline | `PageHeader` | — | 4 SF | `lp.server` |
| `/nguoi-dung` | `_app` | `UsersPage` | `Field` (local) | `PageHeader` | `useQuery` (react-query) | 4 SF | `users.server`, `audit.server` |
| `/nhat-ky` | `_app` | `AuditPage` | — | `PageHeader` | `useQuery` (react-query) | `fetchAuditLogs` | `audit.server` |

---

## 1. `/` — Trang chủ landing

```text
/  (src/routes/index.tsx:13)
│
├── Layout: __root.tsx (khung HTML) + styles-lp.css nạp qua head().links:31
├── Page:   HomePageRoute (index.tsx:56)
│
├── loader (index.tsx:44-53)
│     └── fetchLpHeroImageFn  →  DB: lp.server.getHeroImageSetting  →  bảng lp_settings
│
├── Feature components
│     └── ArchitectLanding (index.tsx:58)
│           ├── MaterialLibraryPage      ← khi người dùng mở "Thư viện"
│           ├── SpaceLookbookSection
│           ├── ProjectBriefForm
│           ├── MaterialCard / MaterialModal / MoodboardDrawer
│           ├── BrandMark, ChatWidget
│           └── useShortlistStorage (localStorage)
│
└── API dùng trong landing
      ├── fetchLpMaterialsFn           → lp.server.listPublicMaterials
      ├── fetchPublicCatalogFn         → lp.server.listPublicCatalog
      ├── fetchPublicSpaceCollectionsFn→ space-collections.server
      ├── submitLpLeadFn               → lp.server.createLpLead (+rate limit)
      ├── fetchPublicMeFn              → auth-public.server.getCurrentPublicUser
      └── authGoogleStart              → auth-public.server.getGoogleOAuthUrl
```

**Luồng dữ liệu**: `loader` lấy `heroImage` từ DB → truyền xuống `ArchitectLanding` làm
`customHeroImage`; fallback về `mockData.heroImage` khi DB trống (`ArchitectLanding.tsx:42`).
Danh mục vật liệu tải **sau** khi mount bằng `fetchLpMaterialsFn` (12 mục).

---

## 2. `/lp/$slug` — Landing biến thể

Giống `/` về mọi mặt, khác duy nhất ở `loader` (`lp.$slug.tsx:44-58`):

- slug mặc định → `redirect({ to: "/", statusCode: 301 })`
- slug lạ → `notFound()`
- slug hợp lệ → nạp `heroImage` như `/`

Biến thể chỉ ảnh hưởng `<head>` (lấy `.eyebrow` của `LP_VARIANTS`) — **thân trang không đổi**.
Phần chung (`head()` + loader) được tách vào `src/lib/lp-route.tsx` trong cleanup.

---

## 3. `/login`

```text
/login (login.tsx:5)
├── beforeLoad: fetchMe() → nếu đã đăng nhập thì redirect /tong-quan   (login.tsx:6-10)
├── Page: LoginPage
└── Submit: loginFn  →  DB: auth.server.loginWithPassword  →  bảng users, sessions
                └── trả { error } khi sai mật khẩu (không throw) — xem PROJECT_AUDIT §10 R6
```

---

## 4. `/auth/callback`

```text
/auth/callback (auth.callback.tsx:5)
├── Page: AuthCallbackPage
└── authGoogleCallback → DB: auth-public.server.handleSupabaseCallback
                              ├── upsert public_users, public_sessions
                              └── ghi lp_leads  ← vi phạm tầng (PROJECT_AUDIT §10 R8)
```

---

## 5. `/tong-quan`

```text
/tong-quan (_app.tong-quan.tsx:19)
├── Layout: _app.tsx  (beforeLoad fetchMe → /login)
├── loader:21 → fetchDashboard → crm.server.getDashboardStats
├── Page: DashboardPage (82 dòng — trang nhỏ nhất)
└── Shared: PageHeader
```

---

## 6. `/khach-hang` (3 file route)

```text
/khach-hang (_app.khach-hang.tsx:7)      ← chỉ <Outlet/>, giữ phân cấp URL
│
├── /khach-hang/ (_app.khach-hang.index.tsx:40)
│     ├── search: { q }                    (:44-46)
│     ├── loaderDeps: q                    (:47-49)
│     ├── loader: fetchCustomers + fetchCustomerDebts + fetchNotes  (:50-…)
│     ├── Page: CustomersPage
│     ├── Feature: IconBtn (local :450)
│     ├── Shared: PageHeader, PageFilterBar, CustomerCard, NewCustomerDialog, NewQuoteDialog
│     └── Hook: useLocalStorageState (viewMode)
│
└── /khach-hang/$customerId (_app.khach-hang.$customerId.tsx:112)
      ├── loader: params.id → fetchCustomerDetail   (:116-…)
      ├── Page: CustomerDetailPage
      ├── Feature: Stat(:1221), Empty(:1248), SmallBtn(:1254)
      ├── Shared: NewCustomerDialog, NewQuoteDialog, CustomerMappingDialog,
      │           ExportQuoteDialog, ProductImage, ui/dialog
      ├── State: ~20 useState (:129-161) — tab, dialog nào đang mở, xác nhận xoá…
      └── 17 serverFn (xem §7)
```

---

## 7. Server functions của `/khach-hang/$customerId`

| Nhóm | Server function | DB |
|---|---|---|
| Hồ sơ | `fetchCustomerDetail`, `updateCustomerFn`, `deleteCustomerFn`, `setCustomerStatus` | `crm.server` |
| Vật liệu đã gửi | `addManualCustomerProductFn`, `setCustomerProductSampleSentFn`, `deleteCustomerProductSampleFn` | `crm.server` |
| Đề xuất vật liệu (mapping) | `fetchCustomerMappings`, `saveCustomerMappingFn`, `deleteCustomerMappingFn`, `uploadMappingImageFn`, `exportMappingPrintFn`, `createQuoteFromMappingFn` | `crm.server`, `export-mapping.server` |
| Báo giá / đơn | `fetchQuotes`, `saveQuote`, `updateQuoteFn`, `deleteQuoteFn`, `convertQuoteToOrder`, `deleteOrderFn`, `setOrderStatusFn`, `exportQuotePrintFn` | `crm.server`, `export-quote.server` |
| Ghi chú | `saveNote` | `crm.server` |

---

## 8. `/co-hoi`

```text
/co-hoi (_app.co-hoi.tsx:27)
├── search { q } (:31-33) → loaderDeps (:34-36) → loader fetchCustomers (:37-41)
├── Page: PipelinePage
├── Feature: DealCard(:64), MiniBtn(:132), DraggableDealCard(:154), DroppableStageColumn(:189)
├── Shared: PageHeader, PageFilterBar, NewCustomerDialog, NewQuoteDialog
├── Hook: useLocalStorageState (pipeline.viewMode :281)
├── DnD: @dnd-kit (kéo thẻ giữa các cột stage)
└── setCustomerStatus → crm.server.updateCustomerStatus
```

---

## 9. `/bao-gia`

```text
/bao-gia (_app.bao-gia.tsx:46)
├── search { q, tab } (:50-53) → loaderDeps q (:54-56)
├── loader: fetchQuotes + fetchOrders (:57-…)
├── Page: QuotesPage
├── Feature: QuoteCard(:493), QuoteRow(:616), OrderStatusSelect(:753),
│            OrderCard(:780), OrderRow(:865), Empty(:960)
├── Shared: PageHeader, PageFilterBar, NewQuoteDialog, ExportQuoteDialog,
│           FilterChip, MultiSelectFilter
├── Hook: useLocalStorageState (bao-gia.quoteStatusFilter :96)
└── 7 serverFn: fetchQuotes, fetchOrders, convertQuoteToOrder, deleteOrderFn,
                deleteQuoteFn, exportQuotePrintFn, setOrderStatusFn
```

---

## 10. `/cong-no`

```text
/cong-no (_app.cong-no.tsx:25)
├── loader: fetchCustomerDebts (:29-32)
├── Page: DebtPage
├── Feature: Stat (local :617)
├── Shared: PageHeader, PageFilterBar, ui/dialog
├── Hook: useHistoryLayer (:23) — Back đóng dialog thanh toán
└── 5 serverFn: fetchCustomerDebts, fetchCustomerDebtDetail, savePayment,
                updatePaymentFn, deletePaymentFn
```

---

## 11. `/ghi-chu`

```text
/ghi-chu (_app.ghi-chu.tsx:8)
├── loader: fetchNotes({ limit: 100 }) (:12-15)
├── Page: NotesPage (89 dòng)
└── Shared: PageHeader, NewNoteDialog
```

---

## 12. `/san-pham` — route lớn nhất về số tính năng

```text
/san-pham (_app.san-pham.tsx:387)                      2.3k dòng
│
├── beforeLoad (:418-434): thiếu `nhom` → redirect({ search: { nhom: ALL_PRODUCTS_SLUG } })
│                          ⚠️ redirect này XOÁ mọi search param khác
├── validateSearch (:388-416): nhom,q,colors,surfaces,sizes,shapes,textures,
│                              collections,supplier,hot,web,view,stockLocation,sort
├── loaderDeps (:440): stockLocation
├── loader (:441-449): fetchProducts
│
├── Page: ProductsPage
│
├── Feature components
│     ├── ImportExportProductsDialog (:16)  → xlsx
│     ├── ImportStockDialog (:17)           → tồn kho
│     ├── EditProductDialog (:29)           → sửa sản phẩm
│     ├── EditProductImagesDialog (:30)     → ảnh sản phẩm
│     ├── NewProductDialog (:31)            → tạo sản phẩm
│     ├── BulkEditFieldDialog (:32)         → sửa hàng loạt
│     ├── NewQuoteDialog (:85)              → báo giá từ lựa chọn
│     └── local: ProductCheck(:91), FilterSection(:293), ActiveTag(:1926)
│
├── Shared: PageHeader, ProductImage, SortMenu, FilterChip, MultiSelectFilter,
│           ui/popover, ui/dialog
│
├── State (local): filtersDraft, moreFiltersOpen, searchDraft, selectedIds,
│                  importExportOpen, createProductOpen, importStockOpen,
│                  editProduct, imagesProduct, quoteFromSelection, bulkBusy,
│                  pendingBulkDelete, stockPreviewData
│
└── 6 serverFn: fetchProducts, updateProductFn, deleteProductFn,
                bulkSetProductsPublicFn, + trong dialog con
```

**Luồng dữ liệu facet**: `matchIndexed(field)` lọc tập sản phẩm theo các filter đang bật →
`addFacetCount` đếm → `toFacetOption` sinh option cho `MultiSelectFilter`. Facet "Nhà cung cấp"
thêm trong cleanup này dùng đúng khuôn đó.

---

## 13. `/luu-tru`

```text
/luu-tru (_app.luu-tru.tsx:122)                         2.9k dòng
│
├── validateSearch (:123-147): tab, category, roomSlug, publicFilter, colors,
│                              surfaces, shapes, textures, collections, q, sort,
│                              page, pageSize, usage, selected
│                              — toàn bộ filter lấy từ URL, không còn state local
├── errorComponent tuỳ biến (:148)
├── Page: MediaStoragePage (:597)
│
├── Feature: QuickRoomTagPopover(:175), QuickFeaturedRankPopover(:294),
│            BulkRoomTagPopover(:486), ProductGalleryDialog(:2682)
├── Shared: PageHeader, ProductImage, ImageRoomTagPicker, AssetUsageDialog,
│           FilterChip, MultiSelectFilter, PaginationBar, ui/dialog, ui/popover
│
├── State (local, không lên URL): items, counts, loading, selectedIds,
│          usageMap, usageDialogKey, previewItem, confirmDeleteId, deletingId,
│          busyBulk, bulkRoomPopoverOpen, bulkPublicConfirmOpen,
│          bulkDeleteConfirmOpen, currentHeroImage, và các state dialog con
│
└── 19 serverFn
      ├── Ảnh phẳng: fetchFlatMediaImagesFn, fetchProductImages
      ├── Thẻ phòng: setImageRoomTagsDirectFn, setProductImageRoomTagsFn,
      │              bulkSetProductImageRoomTagsFn, setProductImageKindFn,
      │              bulkSetProductImageKindFn, deleteProductImageFn
      ├── Landing: fetchLpHeroImageFn, setLpHeroImageFn, setFeaturedSlotFn,
      │            fetchFeaturedSlotsFn
      ├── Lookbook: demoteConceptImageFn, setConceptImagePublicFn,
      │             updateConceptDescriptionFn
      ├── Công khai: toggleProductPublicFn, bulkSetProductsPublicFn, fetchProductFieldValues
      └── Reference: fetchMediaUsageFn (ảnh đang được dùng ở đâu)
```

`?usage=used|unused` — phân loại theo **ảnh sản phẩm**, mặc định `used`.
Card **asset-first**: tên sản phẩm (đậm) + dòng phụ mã SP · `WxH` · dung lượng + nút "Mô tả"
(highlight khi ảnh đã có `ai_description`) + khối usage (`2 Sản phẩm · 1 Lookbook`) click mở
`AssetUsageDialog`.
Bộ lọc đồng bộ `/san-pham`: `Nhóm`/`Tông màu` (8 nhóm, có count)/`Bề mặt`/`Kiểu dáng`/
`Hiệu ứng vân`/`Bộ sưu tập`/`Bối cảnh` (tab Lookbook).
Sort (mặc định `Tên SP A-Z`): `Tên SP (A-Z,Z-A)`/`Mã SP (A-Z,Z-A)`/`Mới nhất`/`Cũ nhất`/`Ưu tiên`;
tab MAP đẩy ảnh Tuyển chọn lên đầu, tab Lookbook đẩy ảnh Hero lên đầu.
Chi tiết reference trong dialog nạp bằng `fetchMediaUsageFn`.

---

## 14. `/khong-gian`

```text
/khong-gian (_app.khong-gian.tsx:224)                   1.4k dòng
│
├── loader: fetchCrmConceptImagesFn (:228-238)
├── Page: ConceptHubPage
├── Feature: QuickConceptRoomTagPopover (:84)
├── Shared: PageHeader, ui/dialog, ui/popover
├── State: items, total, page, limit, activeCategory, activeRoom, activeStatus,
│          activeColor, searchInput, debouncedSearch, busyPublicId, busyDemoteId,
│          demoteConfirmId, editingItem, previewItem
└── 5 serverFn: fetchCrmConceptImagesFn, setConceptImagePublicFn,
                updateConceptDescriptionFn, demoteConceptImageFn,
                setImageRoomTagsDirectFn
```

---

## 15. `/leads`

```text
/leads (_app.leads.tsx:28)
├── validateSearch { status, q } (:32-46) → loaderDeps (:41-45)
├── loader: fetchLpLeadsFn (:47-53)
├── Page: LeadsPage
├── Feature: STATUS_TABS (:20), xoá hai bước inline (:302)
├── Shared: PageHeader
├── State: search, busyId, pendingDelete (:61-63)
└── 4 serverFn: fetchLpLeadsFn, setLpLeadStatusFn, convertLpLeadFn, deleteLpLeadFn
```

Nhãn `form_kind` lấy từ `LP_FORM_KIND_LABEL` (`src/lib/lp-types.ts`) — gồm cả
`google-unlock → "Đăng nhập Google"`.

---

## 16. `/nguoi-dung` (admin)

```text
/nguoi-dung (_app.nguoi-dung.tsx:19)
├── beforeLoad: role != admin → redirect /tong-quan (:20-24)
├── Không có loader — dùng useQuery (react-query) (:7)
├── Page: UsersPage
├── Feature: Field (local :383)
├── Shared: PageHeader
└── 4 serverFn: fetchUsers, createUserFn, updateUserFn, resetUserPasswordFn
      (mọi handler đều requireAdmin trước khi chạy — functions.ts:116,133,159,179)
```

---

## 17. `/nhat-ky` (admin)

```text
/nhat-ky (_app.nhat-ky.tsx:7)
├── beforeLoad: role != admin → redirect /tong-quan (:8-12)
├── Không có loader — useQuery (:2)
├── Page: AuditPage (94 dòng)
├── Shared: PageHeader
└── fetchAuditLogs → audit.server.listAuditLogs
```

---

## 18. Component dùng chung — ai dùng ở đâu

```text
PageHeader            ── 13 route (mọi trang _app)
EmptyState            ── /ghi-chu, /leads, /cong-no (tầng text thuần; biến thể icon/CTA không gộp)
ProductImage         ── /san-pham, /luu-tru, /khach-hang/$id + 4 dialog
NewQuoteDialog       ── /bao-gia, /co-hoi, /khach-hang/, /khach-hang/$id, /san-pham, TopBar
NewCustomerDialog    ── /co-hoi, /khach-hang/, /khach-hang/$id, TopBar
PageFilterBar        ── /bao-gia, /co-hoi, /cong-no, /khach-hang/
CustomerMappingDialog── /khach-hang/$id, TopBar
ExportQuoteDialog    ── /bao-gia, /khach-hang/$id
FilterChip           ── /san-pham, /luu-tru, /bao-gia, landing/MaterialLibraryPage
MultiSelectFilter    ── /san-pham, /luu-tru, /bao-gia, landing/MaterialLibraryPage
SortMenu             ── /san-pham
ImageRoomTagPicker   ── /luu-tru, EditProductImagesDialog
ProductSuggestionField── NewProductDialog, EditProductDialog, BulkEditFieldDialog
ui/dialog            ── 17 nơi
ui/popover           ── 6 nơi
```

**Component một-trang (page-specific)**: `AppSidebar`, `TopBar`, `CustomerCard`, `NewNoteDialog`,
`EditProductDialog`, `EditProductImagesDialog`, `BulkEditFieldDialog`,
`ImportExportProductsDialog`, `ImportStockDialog`.

**Component mồ côi**: không có.
