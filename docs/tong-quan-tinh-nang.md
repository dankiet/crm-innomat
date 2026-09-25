# Tổng quan tính năng

Bản đồ tính năng của CRM Innomat. Mỗi tính năng gắn với **route → RPC → bảng DB → file chính**,
để từ một yêu cầu bất kỳ có thể nhảy thẳng tới đúng chỗ trong code.

Đây là **điểm vào**. Chi tiết từng mảng nằm ở docs chuyên đề — cột "Chi tiết" trỏ tới đó.

## 1. Bản đồ nhanh

| #   | Khu vực    | Tính năng                                          | Route                        | Trạng thái    | Chi tiết                                                                 |
| --- | ---------- | -------------------------------------------------- | ---------------------------- | ------------- | ------------------------------------------------------------------------ |
| 1   | Nền tảng   | Đăng nhập, session, phân quyền 2 vai               | `/login`, `/auth/callback`   | Đang dùng     | [xac-thuc-va-phan-quyen](xac-thuc-va-phan-quyen.md)                      |
| 2   | Nền tảng   | Dashboard KPI + thanh pipeline                     | `/tong-quan`                 | Đang dùng     | —                                                                        |
| 3   | Bán hàng   | Khách hàng — danh sách + hồ sơ                     | `/khach-hang`                | Đang dùng     | [nghiep-vu](nghiep-vu.md)                                                |
| 4   | Bán hàng   | Cơ hội — Kanban pipeline (dnd-kit)                 | `/co-hoi`                    | Đang dùng     | [nghiep-vu](nghiep-vu.md)                                                |
| 5   | Bán hàng   | Báo giá & đơn hàng                                 | `/bao-gia`                   | Đang dùng     | [nghiep-vu](nghiep-vu.md)                                                |
| 6   | Bán hàng   | Công nợ & thanh toán                               | `/cong-no`                   | Đang dùng     | [nghiep-vu](nghiep-vu.md)                                                |
| 7   | Bán hàng   | Ghi chú toàn hệ thống                              | `/ghi-chu`                   | Đang dùng     | —                                                                        |
| 8   | Catalog    | Sản phẩm + tồn kho + import/export Excel           | `/san-pham`                  | Đang dùng     | [san-pham-ton-kho-import](san-pham-ton-kho-import.md)                    |
| 9   | Ảnh        | Lưu trữ ảnh — kho ảnh, thẻ phòng, tuyển chọn       | `/luu-tru`                   | Đang dùng     | [hinh-anh-va-thu-vien](hinh-anh-va-thu-vien.md)                          |
| 10  | Landing    | Trang LP công khai (khách vãng lai)                | `/lp/$slug`                  | **Một phần**  | §9                                                                       |
| 11  | Landing    | Hộp thư Lead                                       | `/leads`                     | Đang dùng     | §10                                                                      |
| 12  | Landing    | Lookbook / Concept                                 | `/khong-gian`                | Đang dùng     | §11                                                                      |
| 13  | Quản trị   | Người dùng (**admin**)                             | `/nguoi-dung`                | Đang dùng     | [xac-thuc-va-phan-quyen](xac-thuc-va-phan-quyen.md)                      |
| 14  | Quản trị   | Nhật ký thao tác (**admin**)                       | `/nhat-ky`                   | Đang dùng     | [co-so-du-lieu](co-so-du-lieu.md)                                        |

**Cột "Trạng thái"** suy ra từ dữ liệu thật trong DB, không phải phỏng đoán:

- **Đang dùng** — tính năng có dữ liệu thật (đa số). Bảng số dòng từng bảng:
  [audit-2026-09-19](audit-2026-09-19.md) §G0b.
- **Một phần** — chỉ `/lp/$slug`: trang vẫn chạy **song song** mock data
  (`src/data/mockData.ts`, dùng bởi `src/components/landing/*`) dù catalog thật đã có RPC
  (`fetchPublicCatalogFn`, `fetchLpMaterialsFn`). Cần chốt mock là fallback có chủ đích hay di sản
  (audit §E3).
- **Chưa từng chạy** — liên kết **đề xuất vật liệu ↔ báo giá** (`customer_mapping_quote_links`,
  nằm trong tính năng Đề xuất vật liệu ở hồ sơ khách hàng, §3): bảng **0 dòng**, nhưng code ghi
  (`crm.server.ts`) và đọc (`crm.server.ts`, `api/functions.ts`) còn sống → đây là **tính năng
  chưa từng chạy ở production**, không phải code chết. Xem
  [audit-2026-09-19](audit-2026-09-19.md) §G3.

**Toàn bộ 26 bảng đều đang dùng** — `public` có đúng 26 bảng, khớp 100% với `schema-pg.sql`,
**0 bảng mồ côi** (bằng chứng: [audit-2026-09-19](audit-2026-09-19.md) §G0; đã gỡ 2 bảng gallery
và `image_assets` ngày 2026-09-24, rồi thêm lại `media_assets`, `mapping_media_usages`,
`landing_page_media_usages` ngày 2026-09-25 theo Option 2). Không có bảng nào nên xoá.

Chỉ các route có tiền tố `_app.*` nằm sau cổng auth (`_app.tsx`). Ngoài ra có 4 route **công
khai**: `/` (trang chủ landing — cũng render `ArchitectLanding`, xem §1 cột Trạng thái),
`/lp/$slug` (biến thể landing theo slug), `/login`, `/auth/callback`.

## 2. Nền tảng

### Đăng nhập & phân quyền

- `scrypt` hash mật khẩu, session lưu ở bảng `sessions`, cookie `HttpOnly`.
- **Hai vai**: `admin` và `user` (`role CHECK (role IN ('admin','user'))`). Route admin có
  `beforeLoad` chặn ở client, nhưng đó chỉ là UX — endpoint tương ứng vẫn tự gọi `requireAdmin()`.
- **Owner-scoping**: vai `user` chỉ thấy khách hàng mình phụ trách (`assertCanAccessCustomer`).
- **CSRF**: `csrfMiddleware` chỉ áp cho `serverFn` (`src/start.ts`), không áp cho request tài liệu.

### Dashboard `/tong-quan`

KPI + thanh pipeline. RPC nhóm `Dashboard` trong `src/api/functions.ts`.

## 3. Khách hàng

| Màn hình  | Route                         | Nội dung                                                                 |
| --------- | ----------------------------- | ------------------------------------------------------------------------ |
| Danh sách | `/khach-hang`                 | Bảng khách hàng, tìm kiếm `?q`                                           |
| Hồ sơ     | `/khach-hang/$customerId`     | Báo giá, đơn, thanh toán, ghi chú, mẫu sản phẩm, đề xuất vật liệu (DXVL) |

Trạng thái khách hàng (`CustomerStatus`) và pipeline: xem [nghiep-vu](nghiep-vu.md).

## 4. Cơ hội — Kanban

`/co-hoi` — bảng Kanban kéo thả (`dnd-kit`) theo trạng thái pipeline. Kéo thẻ = đổi trạng thái
khách hàng.

## 5. Báo giá & đơn hàng

`/bao-gia` — hai tab qua `?tab=quotes|orders`:

- **Báo giá**: dòng hàng, chiết khấu, VAT 8%, xuất HTML in được.
- **Đơn hàng**: sinh từ báo giá, mã chứng từ riêng.
- Mã chứng từ, trạng thái, công thức giá: xem [nghiep-vu](nghiep-vu.md).

## 6. Công nợ

`/cong-no` — công nợ & thanh toán (`payments`), đối chiếu theo khách hàng / đơn.

## 7. Ghi chú

`/ghi-chu` — ghi chú toàn hệ thống (`notes`), gắn được với khách hàng.

## 8. Sản phẩm & tồn kho — `/san-pham`

Màn hình lớn nhất của CRM (`_app.san-pham.tsx`, ~2.300 dòng).

**Bộ lọc** (URL là nguồn sự thật — copy link là thấy đúng cái người gửi thấy):

| Nhóm         | Param        | Ghi chú                          |
| ------------ | ------------ | -------------------------------- |
| Nhóm SP      | `nhom`       | slug nhóm ở sidebar              |
| Tìm kiếm     | `q`          |                                  |
| Tông màu     | `colors`     | nhiều giá trị, nhận cả array/CSV |
| Bề mặt       | `surfaces`   |                                  |
| Kích thước   | `sizes`      |                                  |
| Kiểu dáng    | `shapes`     |                                  |
| Hiệu ứng vân | `textures`   |                                  |
| Bộ sưu tập   | `collections`|                                  |
| Nhà cung cấp | `supplier`   |                                  |
| Nổi bật      | `hot`        |                                  |
| Kho          | `stockLocation` | `KHOBC` / kho VP              |
| Hiển thị web | `web`        | `all` / `public` / `hidden`      |
| Kiểu xem     | `view`       | `grid` / `list`                  |
| Sắp xếp      | `sort`       | qua `SortMenu`                   |

**Chức năng**: lưới/danh sách, tồn kho theo kho, sửa nhanh nhiều dòng (`BulkEditFieldDialog`),
tạo/sửa sản phẩm, quản lý ảnh sản phẩm, import/export Excel, import tồn kho MISA.

Chi tiết ba tầng dữ liệu, bẫy kho, whitelist field: [san-pham-ton-kho-import](san-pham-ton-kho-import.md).

## 9. Landing page công khai — `/lp/$slug`

Trang public cho khách vãng lai (không cần đăng nhập), nội dung lấy từ DB.

| RPC (`src/api/lp.ts`)                                          | Việc                                        |
| -------------------------------------------------------------- | ------------------------------------------- |
| `fetchLpMaterialsFn`, `fetchPublicCatalogFn`                    | Vật liệu + catalog công khai                 |
| `fetchPublicSpaceCollectionsFn`, `fetchCrmConceptImagesFn`      | Bộ sưu tập không gian, ảnh Concept          |
| `fetchLpHeroImageFn` / `setLpHeroImageFn`                       | Ảnh hero                                    |
| `submitLpLeadFn`                                                | Nhận form liên hệ → `lp_leads`              |
| `fetchFeaturedSlotsFn` / `setFeaturedSlotFn`                    | 12 vị trí "Tuyển chọn Trang chủ"            |

**Bảng**: `lp_settings` (key/value), `lp_leads`, `lp_rate_limits` (chống spam form),
`public_users` + `public_sessions` (danh tính khách vãng lai).

Ảnh dùng cho LP được bật/tắt bằng `toggleProductPublicFn` / `bulkSetProductsPublicFn` /
`setConceptImagePublicFn` — tức là từ CRM chứ không sửa trực tiếp trên LP.

### Đồng thuận cookie & Google Tag Manager

GTM (`GTM-P4SQ7HBB`) **chỉ hoạt động sau khi khách đồng ý**. Cổng chặn nằm ở **server**, ngay
lúc dựng `<head>` — không phải chặn bằng JS phía client (chặn client vẫn kịp bắn request).

- Cookie `ebg_gtm_consent` (`granted` | `denied`, `Max-Age` 1 năm, `SameSite=Lax`) là nguồn
  sự thật. Giá trị lạ ⇒ coi như chưa chọn.
- `lpHead()` (`src/routes/-lp-route.ts`) đọc cookie: chỉ khi `granted` mới phát snippet GTM
  vào `<head>`. Thẻ `<noscript>` của GTM nằm ở `RootShell` (`src/routes/__root.tsx`), cũng chỉ
  khi `granted` **và** đang ở phạm vi landing (`/` hoặc `/lp/*`) — route CRM không dính GTM.
- `ConsentBanner` (`src/components/landing/ConsentBanner.tsx`) hiện khi cookie chưa có; nút
  "Đổi lựa chọn cookie" ở footer xoá cookie để banner trở lại.
- `trackEvent` (`src/lib/lp-tracking.ts`) tự chặn nếu chưa `granted`, nên bất biến không phụ
  thuộc vào việc GTM có tình cờ định nghĩa `gtag`/`fbq` hay không.
- Rút lại đồng thuận ⇒ `stopGtm()` **nạp lại trang**: gỡ thẻ `<script>` không dừng được
  container đã nằm trong RAM, chỉ reload mới thật sự về trạng thái "chưa đồng ý".

> Khác với `consent_marketing` trên form lead (`lp_leads`) — đó là đồng ý **nhận email
> marketing**, không liên quan tới cookie theo dõi.

## 10. Hộp thư Lead — `/leads`

`/leads` — lead đổ về từ form landing (`lp_leads`: tên, điện thoại, email, nhu cầu, shortlist mã,
UTM).

- `setLpLeadStatusFn` — đổi trạng thái xử lý.
- `convertLpLeadFn` — **chuyển lead thành khách hàng** trong CRM.
- `deleteLpLeadFn` — xoá.

## 11. Lookbook / Concept — `/khong-gian` (redirect)

> `/khong-gian` **không còn là workspace riêng** — `beforeLoad` redirect về
> `/luu-tru?tab=concept` (giữ `room`, `q`, `category`). Toàn bộ workflow Concept/Lookbook
> sống trong **Media Workspace `/luu-tru`**: card Concept có mô tả (AI-generated), bật/ẩn
> LD-page, hạ về thường (consequence rõ), và nút "nơi đang dùng".

### Lookbook (context của media)

- `listCrmConceptImages` — danh sách cho CRM.
- `setConceptImagePublic` — bật/tắt Lookbook visibility (per image).
- `updateConceptDescription` — mô tả (AI description).
- `demoteConceptImage` — hạ concept → ảnh thường (rời khỏi Lookbook).

## 11b. Nơi đang dùng (Media Workspace)

Từ 2026-09-25 theo **Option 2 (1 file = 1 MediaAsset)**:
`/luu-tru` trả lời "MediaAsset này dùng ở đâu?" qua tầng registry
(`media_assets` + `mapping_media_usages` + `landing_page_media_usages` +
`product_images.media_asset_id`). Reference Resolver (`image-references.server.ts`) vẫn giữ vai
trò detail cho dialog (5 nguồn `path`) nhưng **đọc chính là `listMediaAssets`**.

Card hiển thị chip tổng hợp trực tiếp từ `usage_groups` (Product/Lookbook/Tuyển chọn/Hero/
Mapping) + `status` (`used`·`unused`). Click → **AssetUsageDialog** liệt kê nhóm usage
và references chi tiết theo role + href khi có route.

Xoá asset (`deleteMediaAssetFn`) là **xoá vĩnh viễn**: gỡ mọi liên kết (xoá row `product_images`,
clear ref trong Đề xuất/Hero), xoá row `media_assets`, **và xoá file trong Supabase Storage** —
chỉ giữ file khi còn bảng khác trỏ tới cùng storage key. Nếu còn usage, dialog nhắc
"Xem N nơi đang dùng trước khi xóa" (xem
[hinh-anh-va-thu-vien](hinh-anh-va-thu-vien.md) §"Kho ảnh asset-centric").

## 12. Media — `/luu-tru`

Media Workspace duy nhất: **mỗi card = 1 file vật lý (MediaAsset)**, không phải 1 dòng
`product_images`.

**Bố cục card (asset-first)** — thứ tự từ trên xuống:

1. Ảnh thumbnail (badge MAP/Concept ở góc).
2. **Tên sản phẩm** (đậm, click mở gallery) — hoặc "Không thuộc sản phẩm"; góc phải badge
   `IN USE`/`NOT IN USE`.
3. Dòng phụ (mono, mờ): mã SP · `WxH` · dung lượng.
4. **Khối usage** (click mở `AssetUsageDialog`): liệt kê số theo nhóm — `2 Sản phẩm`,
   `1 Lookbook`, `1 Tuyển chọn`, `1 Đề xuất`, `1 Hero`; hoặc "Không nơi nào dùng" nếu chưa gán.
5. Tag phòng Lookbook.
6. Toolbar thao tác + xoá 2 bước inline.

- **Phạm vi (primary tabs)**: `All` · `MAP` · `Lookbook` · `Uncategorized` (nhãn tiếng Anh trên
  UI; `featured` = Tuyển chọn #1—#12 vẫn nhận qua deep-link nhưng không còn là tab). Tab dùng
  segmented nhỏ (`px-2.5 py-1 text-[11px]`) cùng cỡ với segmented trạng thái.
- **Sử dụng (secondary, URL `usage`)**: **2 trạng thái, mặc định `used`** (nhãn UI **In use** /
  **Not in use**). `used` = đã gán vào ≥1 **sản phẩm** (MAP / đại diện / Concept / ảnh thường);
  `unused` = không gắn sản phẩm nào — **gồm cả ảnh chỉ nằm trong Đề xuất vật liệu hoặc Hero**
  (Hero bản chất là ảnh Concept; Đề xuất là tham chiếu ngoài catalog). Asset-level qua
  `listMediaAssets` (xem [hinh-anh-va-thu-vien](hinh-anh-va-thu-vien.md) §Kho ảnh asset-centric).
  Có banner ngữ cảnh khi lọc "Not in use"; khối usage trên card vẫn đếm đủ mọi nhóm và click để
  mở AssetUsageDialog.
- **Sắp xếp**: `Mới nhất` · `Cũ nhất` · `Tên SP (A-Z/Z-A)` · `Mã SP (A-Z/Z-A)` ·
  `Ưu tiên (#1—#12)`. Tab MAP tự đẩy ảnh Tuyển chọn #1–#12 lên đầu; tab Lookbook đẩy ảnh
  đang làm Hero lên đầu.
- **Tuyển chọn Trang chủ (#1–#12)**: tab `featured` trực tiếp trên thanh tab chính; hỗ trợ lọc secondary (`selected` = `yes`/`no`) trong popover Trạng thái; sort `priority` xếp #1→#12→chưa chọn.
- **Bộ lọc**: Nhóm (product taxonomy) → Facet (Màu, Bề mặt, Dáng, Vân, BST) → Popover Trạng thái (Sử dụng + Tuyển chọn) + Popover Sắp xếp (7 kiểu gồm ưu tiên). Mọi bộ lọc đang áp
  dụng hiện thành **dải chip** (`ActiveTag` — `src/components/product-filter/ActiveTag.tsx`,
  dùng chung với `/san-pham`) kèm nút **"Xoá tất cả (N)"** gọi `resetAllFilters`; nhờ đó bộ lọc
  nào cũng gỡ được, kể cả `category` (Nhóm) — nút "Xóa bộ lọc SP" cũ bỏ sót `category`.
- **Bối cảnh phòng (Lookbook)**: nhãn tiếng Anh lấy từ `IMAGE_ROOM_TAGS` / `SPACE_TYPES`
  (`src/lib/types.ts`) — `Living Room & Lounge`, `Kitchen & Dining`, `Bathroom & Spa`,
  `Bedroom & Suite`, `Balcony & Courtyard`, `F&B / Hotel / Resort`, `Office / Workspace`,
  `Other Space`, `Unknown`. Không hardcode lại chuỗi phòng trong component.
- **Phân trang + bộ lọc lưu trong URL** (`validateSearch`, giá trị mặc định bị bỏ).
- **Thao tác nhanh**: gán phòng (`product_image_room_tags`, consequence rõ), mô tả
  (AI-generated · edit), Lookbook visibility, hạ về thường, đặt hạng "Tuyển chọn",
  gán hàng loạt, **xóa hàng loạt (Bulk Delete)** có hộp thoại xác nhận 2 bước an toàn (tuân thủ quy ước xóa) và chạy với giới hạn concurrency `mapLimit` (~5).
- Nén ảnh WebP, xoá an toàn theo tham chiếu: [hinh-anh-va-thu-vien](hinh-anh-va-thu-vien.md).

## 13. Quản trị (**admin**)

| Route          | Việc                                                          |
| -------------- | ------------------------------------------------------------- |
| `/nguoi-dung`  | Tạo/sửa user, đặt lại mật khẩu, gán owner cho khách hàng       |
| `/nhat-ky`     | Nhật ký thao tác (`audit_logs`) — mọi thao tác ghi đều ghi lại |

## 14. Bảng dữ liệu theo tính năng

| Nhóm                  | Bảng                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Người dùng & session  | `users`, `sessions`, `audit_logs`                                                                   |
| Catalog sản phẩm      | `products`, `product_internal_codes`, `inventory`                                                    |
| Ảnh sản phẩm          | `product_images`, `product_image_room_tags` + `media_assets`, `mapping_media_usages`, `landing_page_media_usages` |
| Khách hàng & bán hàng | `customers`, `quotes`, `quote_items`, `orders`, `payments`, `notes`, `customer_product_samples`      |
| Đề xuất vật liệu      | `customer_mappings`, `customer_mapping_items`, `customer_mapping_quote_links`                        |
| Landing công khai     | `lp_settings`, `lp_leads`, `lp_rate_limits`, `public_users`, `public_sessions`                       |

Tổng **26 bảng**. Chi tiết cột & RLS: [co-so-du-lieu](co-so-du-lieu.md).

## 15. Quy mô code

> Đo ngày **2026-09-24** (sau đợt dọn dead code + đợt tối ưu kiến trúc + đợt
> refactor được duyệt + đợt media-workspace + gỡ Thư viện — xem [CLEANUP_REPORT](CLEANUP_REPORT.md),
> [REFACTOR_REPORT](REFACTOR_REPORT.md)). **2026-09-25** bổ sung Option 2 MediaAsset:
> `src/db/media-assets.server.ts` (+873 dòng) và `src/lib/media-assets.ts` (+189 dòng).

| Vùng             | File | Dòng   |
| ---------------- | ---: | -----: |
| `src/routes`     |   21 | 12.068 |
| `src/components` |   43 | 12.375 |
| `src/db`         |   13 |  7.026 |
| `src/lib`        |   33 |  3.006 |
| `src/api`        |    2 |  2.027 |
| `src/render`     |    2 |    815 |
| `src/*.ts` (gốc) |    4 |    645 |
| `src/data`       |    1 |    321 |
| `src/hooks`      |    2 |     63 |
| **Tổng `src/`**  |  121 | **38.346** |
| `*.test.ts` (node --test) | 11 | 1.067 |

RPC: **72** `createServerFn` trong `src/api/functions.ts` + **21** trong `src/api/lp.ts` = **93**
(2 hàm auth được `api/lp.ts` re-export lại, không tính trùng).

`npx tsc --noEmit` = **0 lỗi** (baseline cũ 29 đã được xoá — xem
[audit-2026-09-19](audit-2026-09-19.md) §E1). `npm test` = **104 test pass**.
