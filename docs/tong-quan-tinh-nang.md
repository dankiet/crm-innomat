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
| 10  | Ảnh        | Thư viện — bộ sưu tập + picker                     | `/thu-vien`                  | Đang dùng     | [hinh-anh-va-thu-vien](hinh-anh-va-thu-vien.md)                          |
| 11  | Landing    | Trang LP công khai (khách vãng lai)                | `/lp/$slug`                  | **Một phần**  | §9                                                                       |
| 12  | Landing    | Hộp thư Lead                                       | `/leads`                     | Đang dùng     | §10                                                                      |
| 13  | Landing    | Lookbook / Concept                                 | `/khong-gian`                | Đang dùng     | §11                                                                      |
| 14  | Quản trị   | Người dùng (**admin**)                             | `/nguoi-dung`                | Đang dùng     | [xac-thuc-va-phan-quyen](xac-thuc-va-phan-quyen.md)                      |
| 15  | Quản trị   | Nhật ký thao tác (**admin**)                       | `/nhat-ky`                   | Đang dùng     | [co-so-du-lieu](co-so-du-lieu.md)                                        |

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

**Toàn bộ 25 bảng đều đang dùng** — `public` có đúng 25 bảng, khớp 100% với `schema-pg.sql`,
**0 bảng mồ côi** (bằng chứng: [audit-2026-09-19](audit-2026-09-19.md) §G0). Không có bảng nào
nên xoá.

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

## 11b. Nơi đang dùng & lifecycle (Media Workspace)

`/luu-tru` trả lời "Ảnh này dùng ở đâu?" qua **Reference Resolver**
(`src/db/image-references.server.ts`) — 7 nguồn: `product_images.path`,
`products.image_path`, `customer_mapping_items.image_path` + `custom_product_image_path`,
`gallery_collection_items.path`, **`gallery_collections.cover_path`**, **`lp_settings.hero_image`**
(`key='hero_image'`). Matching tail `%/<storage_key>` (chấp nhận cả `/images/…`, full URL,
key trần). GC re-check `countImageReferencesForKey` **delegate về cùng resolver** — một
"truth source"; `isPublicImagePathReferenced` (orphan-marking) cũng đếm cover + hero.

Card hiển thị chip: `Đang dùng · N` / `Sắp xóa · X giờ` (orphan + retention
`IMAGE_GC_RETENTION_HOURS`) / `Đã dọn storage`. Click chip → **AssetUsageDialog**
(references theo role + lifecycle registry + href khi có route). Registry
`image_assets` giữ vĩnh viễn (không purge).

## 12. Lưu trữ ảnh — `/luu-tru`

Kho ảnh vận hành: mọi ảnh sản phẩm + phân loại.

- **Tab**: Tất cả / Chỉ ảnh MAP / Bối cảnh (Concept) / Tuyển chọn Trang chủ / Chưa gán thẻ.
- **Bộ lọc**: Màu, Bề mặt, Kiểu dáng, **Hiệu ứng vân**, Bộ sưu tập (lọc server-side).
- **Phân trang + bộ lọc lưu trong URL** (`validateSearch`, giá trị mặc định bị bỏ —
  link chia sẻ tái hiện đúng trạng thái).
- **Thao tác nhanh**: gán thẻ phòng (`product_image_room_tags`), đặt hạng "Tuyển chọn",
  bật/tắt hiển thị trên LP, gán hàng loạt.
- Nén ảnh WebP, xoá an toàn theo tham chiếu: [hinh-anh-va-thu-vien](hinh-anh-va-thu-vien.md).

## 13. Thư viện — `/thu-vien`

Bộ sưu tập ảnh (`gallery_collections` + `gallery_collection_items`):

- Tạo/sửa bộ sưu tập, gán ảnh sản phẩm hoặc upload ảnh riêng.
- `ImagePickerDialog` — chọn ảnh theo 9 facet (Nhóm, Nhà cung cấp, Màu, Bề mặt, Kích thước,
  Kiểu dáng, **Hiệu ứng vân**, Bộ sưu tập, Chất liệu).
- Kéo thả sắp xếp, đặt ảnh bìa, viewer toàn màn hình.

## 14. Quản trị (**admin**)

| Route          | Việc                                                          |
| -------------- | ------------------------------------------------------------- |
| `/nguoi-dung`  | Tạo/sửa user, đặt lại mật khẩu, gán owner cho khách hàng       |
| `/nhat-ky`     | Nhật ký thao tác (`audit_logs`) — mọi thao tác ghi đều ghi lại |

## 15. Bảng dữ liệu theo tính năng

| Nhóm                  | Bảng                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Người dùng & session  | `users`, `sessions`, `audit_logs`                                                                   |
| Catalog sản phẩm      | `products`, `product_internal_codes`, `inventory`                                                    |
| Ảnh sản phẩm          | `product_images`, `product_image_room_tags`                                                          |
| Khách hàng & bán hàng | `customers`, `quotes`, `quote_items`, `orders`, `payments`, `notes`, `customer_product_samples`      |
| Đề xuất vật liệu      | `customer_mappings`, `customer_mapping_items`, `customer_mapping_quote_links`                        |
| Thư viện hình         | `gallery_collections`, `gallery_collection_items`                                                    |
| Landing công khai     | `lp_settings`, `lp_leads`, `lp_rate_limits`, `public_users`, `public_sessions`                       |

Tổng **25 bảng**. Chi tiết cột & RLS: [co-so-du-lieu](co-so-du-lieu.md).

## 16. Quy mô code

> Đo ngày **2026-09-19** (sau đợt dọn dead code + đợt tối ưu kiến trúc + đợt
> refactor được duyệt — xem [CLEANUP_REPORT](CLEANUP_REPORT.md) và [REFACTOR_REPORT](REFACTOR_REPORT.md)).

| Vùng             | File | Dòng   |
| ---------------- | ---: | -----: |
| `src/routes`     |   22 | 13.819 |
| `src/components` |   39 | 11.849 |
| `src/db`         |   12 |  6.801 |
| `src/lib`        |   30 |  3.024 |
| `src/api`        |    2 |  2.171 |
| `src/render`     |    2 |    815 |
| `src/*.ts` (gốc) |    4 |    666 |
| `src/data`       |    1 |    321 |
| `src/hooks`      |    2 |     63 |
| **Tổng `src/`**  |  114 | **39.529** |
| `*.test.ts` (node --test) | 10 |  ~516 |

RPC: **82** `createServerFn` trong `src/api/functions.ts` + **18** trong `src/api/lp.ts` = **100**
(2 hàm auth được `api/lp.ts` re-export lại, không tính trùng).

`npx tsc --noEmit` = **0 lỗi** (baseline cũ 29 đã được xoá — xem
[audit-2026-09-19](audit-2026-09-19.md) §E1). `npm test` = **67 test pass**.
