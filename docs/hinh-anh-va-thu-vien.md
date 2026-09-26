# Hình ảnh

## Lưu trữ hai chế độ

`src/lib/storage.server.ts` (~156 dòng) là lớp lưu trữ dùng chung. Tên file **content-addressed theo
SHA-256** nên tự chống trùng: cùng một tấm ảnh upload nhiều lần chỉ tốn một file.

| Chế độ               | Điều kiện                                               | Ref trả về                                                                                       |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Supabase Storage** | có cả `SUPABASE_URL` **và** `SUPABASE_SERVICE_ROLE_KEY` | URL công khai `https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<prefix>/<hash>.webp` |
| **Local**            | thiếu một trong hai biến                                | `/images/<hash>.<ext>` (ghi vào `public/images/`)                                                |

Bucket là **public** (`SUPABASE_STORAGE_BUCKET`, mặc định `crm-images`), tiền tố object
`SUPABASE_STORAGE_PREFIX` (mặc định `crm`). Upload dùng
`cacheControl: "31536000"` (1 năm — an toàn vì tên file là hash) và `upsert: true`.

Chế độ local chỉ nên dùng khi dev. Trên Vercel filesystem là ephemeral, ảnh ghi vào `public/images`
sẽ mất sau mỗi deploy — production **phải** cấu hình Supabase.

### API

```ts
putImageBuffer(buf, ext); // → ref
readImageBytes(ref); // Buffer | null; fetch có timeout 8s, đọc local qua public/
deleteImageKey(key); // → boolean: true nếu file đã KHÔNG còn, false nếu xoá thất bại
```

`deleteImageKey` nhận thẳng `storage_key` (tên file content-addressed) — không parse lại URL hiển
thị, nên không phụ thuộc `path` có hợp lệ hay không. Nó là API **duy nhất** xoá file vật lý, và chỉ
được gọi từ đường xoá vĩnh viễn trên `/luu-tru`.

`readImageBytes` **không throw** — mọi lỗi (404, timeout, file thiếu) đều trả `null`. Nơi gọi phải
xử lý `null` (export HTML thì bỏ ảnh đó, không vỡ cả tài liệu).

## Nén ảnh

Hai đường, cùng đích là **WebP q82, cạnh dài tối đa 1600px**.

|                | Server (`src/lib/image-upload.server.ts`) | Client (`src/lib/image-upload.ts`)    |
| -------------- | ----------------------------------------- | ------------------------------------- |
| Công cụ        | `sharp`                                   | `createImageBitmap` + canvas `toBlob` |
| Chất lượng     | `webp({ quality: 82, effort: 4 })`        | `toBlob("image/webp", 0.82)`          |
| Cạnh tối đa    | 1600                                      | 1600                                  |
| Giới hạn input | **12 MB** → reject                        | **30 MB** → reject                    |
| Khi lỗi        | throw                                     | **fallback về data URL gốc**          |

Server bỏ qua bước encode nếu ảnh đã là WebP và đã nhỏ hơn 1600px — không nén lại chồng chất.

Client nén trước khi gửi để tiết kiệm băng thông; nếu browser không làm được (`createImageBitmap`
lỗi, canvas bị chặn) thì gửi data URL thô và **server nén lại**. Vì vậy giới hạn client (30 MB) nới
hơn giới hạn server (12 MB): ảnh 20 MB thường nén ở client xuống dưới ngưỡng server. Ảnh không nén
được ở client mà > 12 MB sẽ bị server từ chối.

## Xoá ảnh an toàn

Một ref có thể được **nhiều bảng** tham chiếu. Reference Resolver
(`src/db/image-references.server.ts`, 5 nguồn: `product_images.path`, `products.image_path`,
`customer_mapping_items.image_path`, `customer_mapping_items.custom_product_image_path`,
`lp_settings.hero_image`) vẫn là nguồn sự thật cho câu hỏi "path này phục vụ bản ghi nào?"
— tầng **path → bản ghi**. Từ 2026-09-25 có thêm tầng **file → asset** (`media_assets` + usage,
xem §Kho ảnh asset-centric bên dưới).

Quy tắc — **chỉ có ĐÚNG MỘT cửa xoá vĩnh viễn**:

- **Xoá asset trên `/luu-tru`** (`deleteMediaAssetFn`): **xoá vĩnh viễn, xoá ở TOÀN BỘ nơi dùng**.
  Trong 1 transaction: xoá **mọi** row `product_images` gắn asset đó (ảnh biến mất khỏi gallery của
  **tất cả** sản phẩm đang dùng nó), clear `customer_mapping_items.image_path` /
  `custom_product_image_path`, clear `lp_settings.hero_image`, đồng bộ lại `products.image_path`,
  xoá row `media_assets`. Tầng API sau đó **xoá luôn file trong Supabase Storage**
  (`deleteImageKey`, theo `storage_key` của chính row vừa xoá). Trả `file_deleted` / `file_failed`
  để UI nói đúng: `file_failed` khi Storage từ chối xoá (kèm audit "XOÁ FILE THẤT BẠI"), không bao
  giờ báo "đã xoá vĩnh viễn" khi file còn nằm lại bucket.
- **Mọi chỗ khác chỉ GỠ LIÊN KẾT — không đụng tới file.** Gồm `deleteProductImage` (nút thùng rác
  trong "Sửa hình" của sản phẩm), `deleteProduct`, `deleteCustomerMapping`, `deleteCustomer`,
  `setHeroImageSetting`. Ảnh chỉ rơi về nhóm `unused` (Not in use) trên `/luu-tru` và vẫn gắn lại
  được cho sản phẩm khác. Muốn xoá thật thì xoá card tương ứng ở `/luu-tru`.

> Tripwire duy nhất còn lại trong đường xoá vĩnh viễn: nếu sau khi dọn DB mà **vẫn còn** row nào
> trỏ tới cùng storage key (dữ liệu cũ chưa gắn liên kết), file được GIỮ LẠI — xoá file lúc đó sẽ
> làm row kia thành ảnh hỏng. Trạng thái sạch (đo 2026-09-26: 0 row) thì nhánh này không bao giờ
> chạy, và `npm run media:sync` là công cụ dọn phần dư đó.

## Ảnh sản phẩm

Bảng `product_images`: `path`, `sort_order`, `is_primary`, `caption`.

- `UNIQUE(product_id, path)` — không add trùng một ảnh vào cùng sản phẩm.
- Thêm một partial unique riêng cho `path LIKE '/products/imported/%'` (ảnh import theo lô).
- `products.image_path` là ảnh đại diện, được `syncPrimaryImagePath()` đồng bộ theo ảnh đang
  `is_primary`. Đừng ghi `image_path` bằng tay.
  **Cưỡng chế (2026-09-25):** `updateProduct`/`createProduct` **không còn nhận** `image_path`
  (không có trong `ProductUpdate`/`ProductCreateInput`, validator RPC cũng bỏ), import Excel
  không ghi cột này, và form sửa sản phẩm chỉ hiển thị ảnh chứ không gửi lên. Trước đây form gửi
  lại giá trị cũ nên mỗi lần lưu là ghi đè kết quả `syncPrimaryImagePath` mới hơn → cột trỏ tới
  ảnh không còn gắn với sản phẩm. Chỉ `syncPrimaryImagePath`, luồng thêm/xoá ảnh và
  `deleteMediaAsset` được ghi cột này.

Endpoint: `fetchProductImages`, `uploadProductImageFn`, `addProductImageByPathFn`,
`setPrimaryProductImageFn`, `deleteProductImageFn`.

## Kho ảnh asset-centric (Option 2 — 1 file = 1 MediaAsset)

Từ 2026-09-25, `/luu-tru` duyệt theo **file vật lý** thay vì theo dòng `product_images`.
Mỗi `media_assets` row (storage key content-addressed) là **một thẻ card**. Product, Lookbook,
Tuyển chọn, Mapping, Hero là **usage** của asset đó.

### Đọc

`src/db/media-assets.server.ts` → `listMediaAssets(db, opts)`, qua `listFlatMediaImages` giữ
signature cũ. Kết quả `FlatMediaItem`:

- `asset_id` — key card, selection, delete asset.
- `id` / `product_id` — representative product usage (`product_images.id`/`product_id`);
  **0-sentinel** khi asset không có usage product (sản phẩm bị xoá hoặc file chỉ nằm ở
  mapping/hero). UI guard bằng `> 0`.
- `storage_key` (tail hash), `path` (**path thật** để card render `<img src>` — không rỗng),
  `created_at`.
- `width` / `height` / `mime_type` / `file_size` — metadata file vật lý. `NULL` khi chưa đo
  (asset backfill từ legacy không có nguồn kích thước); card ẩn dòng kích thước khi thiếu.
- `kind` (map/concept/normal) + `room_tags` — lấy từ representative product usage.
- `usage_count` (tổng 5 nhóm), `usage_groups` (product/lookbook/featured/hero/mapping),
  `status` (`used`/`unused`).

**Status 2 trạng thái** — phân loại theo **ảnh sản phẩm** (đổi 2026-09-25):

| Status       | Điều kiện                                                                     |
| ------------ | ----------------------------------------------------------------------------- |
| `used`       | Asset được gán vào **≥1 sản phẩm** — MAP / ảnh đại diện / Concept / ảnh thường (kể cả sản phẩm **chưa public**) |
| `unused`     | **Không gắn vào sản phẩm nào** — kể cả khi file đang được **Đề xuất vật liệu** hoặc **Hero** trỏ tới |

> Vì sao `unused` gồm cả ảnh Đề xuất/Hero: **Hero bản chất là ảnh Concept** — khi được gán làm
> Hero nó đã nằm trong nhóm ảnh sản phẩm; còn **Đề xuất vật liệu là tham chiếu ngoài catalog**
> (hàng ngoài danh mục), không phải ảnh thuộc sản phẩm.
>
> Trước đó từng có 3 trạng thái (`used`/`draft`/`orphan`) rồi gộp thành "mọi nơi gán" — cả hai
> đều bỏ để theo định nghĩa hẹp này.

Lưu ý: `usage_groups` trên card **vẫn đếm đủ** (kể cả mapping/hero) — một asset `unused` vẫn
hiện "1 Đề xuất" để bạn biết file đang được dùng ở đâu trước khi xoá.

Filter `usage=used|unused` → 2 nút segmented, **mặc định `used`** (nhãn **In use** / **Not in use**).

### Bố cục card (asset-first)

Mỗi card hiển thị **asset là chủ thể**, sản phẩm chỉ là usage phụ:

1. Thumbnail + badge MAP/Concept.
2. **Tên sản phẩm** (đậm, click mở gallery) — hoặc "Không thuộc sản phẩm".
3. Dòng phụ (mono, mờ): mã SP · `WxH` · dung lượng (phần nào thiếu thì ẩn).
4. Nút **"Mô tả"** (chỉ ở tab Lookbook) — **highlight terracotta khi ảnh đã có `ai_description`**,
   xám mờ khi chưa có. Không trích nội dung mô tả ra card; chỉ báo "đã có mô tả".
5. Khối usage (click mở `AssetUsageDialog`): `2 Sản phẩm` · `1 Lookbook` · … hoặc "Không nơi nào dùng".
6. Tag phòng Lookbook + toolbar thao tác.

### Sắp xếp

Sort người dùng chọn (popover Sắp xếp): **mặc định `Tên SP (A-Z)`** · `Tên SP (Z-A)` ·
`Mã SP (A-Z)` · `Mã SP (Z-A)` · `Mới nhất` · `Cũ nhất` · `Ưu tiên (#1—#12)`.

Khi sort theo tên/mã SP, asset **không có product usage** (chỉ mapping/hero, tên rỗng) luôn xếp
**cuối** ở cả hai chiều — nếu không, chiều A-Z sẽ đẩy chuỗi rỗng lên đầu.

Ngoài ra có **ưu tiên theo ngữ cảnh tab** (luôn xếp trước, rồi mới tới sort người dùng):

- Tab **MAP**: ảnh thuộc sản phẩm **Tuyển chọn #1–#12** lên đầu (xếp theo rank).
- Tab **Lookbook**: ảnh đang làm **Hero trang chủ** lên đầu.
- Tab **Tuyển chọn**: xếp theo `featured_rank` (như cũ).

### Xoá theo asset — xoá vĩnh viễn

`deleteMediaAsset(db, assetId)` (`deleteMediaAssetFn` API). Trong 1 transaction:

- Gỡ mọi liên kết: **xoá row `product_images`** (ảnh biến mất khỏi gallery sản phẩm),
  clear cột `customer_mapping_items.image_path` / `custom_product_image_path`,
  clear `lp_settings.hero_image`.
- Đồng bộ lại `products.image_path` (suy ra từ ảnh `is_primary` còn lại).
- Xoá row `media_assets`; trả `{ deleted, usages_removed, path, storage_key }`.

Tầng API (`deleteMediaAssetFn`) sau đó **xoá file vật lý** bằng `deleteImageKey(storage_key)`.
Trả `file_deleted` và `file_failed` — `file_failed` khi Storage từ chối xoá (UI hiện toast lỗi kèm
gợi ý chạy `media:sync`, audit ghi rõ "XOÁ FILE THẤT BẠI") — không bao giờ báo thành công khi file
còn nằm lại bucket.

Khi asset còn usage, UI nhắc "Xem N nơi đang dùng trước khi xóa" mở `AssetUsageDialog`.
Xoá luôn theo quy tắc 2 bước inline (AGENTS.md) — không `window.confirm`.

### Backfill

`applyMediaBackfill(db, sources)` trong `src/db/media-assets.server.ts` + scripts
`db:media-backfill` / `db:media-verify` (idempotent — chạy lại ra cùng kết quả).
Đã chạy ở production ngày **2026-09-25** (có duyệt): 3.561 asset, 3.597 product usage,
156 mapping, 1 hero; `db:media-verify` PASS với **11 mục kiểm tra của thời điểm đó** (script nay có
14 mục — xem §Đồng bộ bên dưới).

### Đồng bộ Storage ↔ DB (`npm run media:sync`)

Backfill chỉ đọc **ref trong DB**; nó không biết file nào nằm trong Storage mà không ai trỏ tới.
Xoá ảnh thời kỳ đầu (trước `86cf51e` — khi đó xoá chỉ gỡ liên kết DB, không xoá file) để lại
**file mồ côi** trong bucket. `scripts/media-sync.mjs` đối chiếu hai chiều và sửa cả hai loại lệch.

```bash
npm run media:sync                          # chỉ đọc, in báo cáo (mặc định)
npm run media:sync -- --apply               # ghi: reconcile + xoá rác
npm run media:sync -- --apply --no-prune    # ghi: chỉ reconcile, giữ nguyên file
npm run media:sync -- --prune               # ghi: chỉ xoá rác
npm run media:sync -- --limit 10            # giới hạn số file xoá (chạy thử)
npm run media:sync -- --min-age-hours 48    # tuổi tối thiểu của file rác (mặc định 24)
```

**Keep-set là HỢP của** `media_assets.storage_key` **và** mọi key trích từ 5 nguồn ref trong DB.
Chỉ file không nằm trong hợp đó mới bị coi là rác — nhờ vậy ref thiếu row `media_assets` (lỗ write
path cũ) **không bao giờ** bị xoá oan. Chỉ đụng file có tên đúng dạng storage_key
(`<sha256>[.<ext>]`); tên lạ bị bỏ qua và báo cáo.

Hai chốt an toàn trước khi xoá:

- **Tuổi tối thiểu** (`--min-age-hours`, mặc định 24h): `uploadProductImageFile` ghi file lên
  Storage **trước** rồi mới tạo row DB — trong khoảng giữa hai bước, file vừa tải lên chưa nằm
  trong keep-set nào. File mồ côi còn mới hơn ngưỡng bị **giữ lại** và liệt kê riêng.
- **Soát lại ngay trước `remove()`**: đọc lại ref **và** `media_assets` để bỏ ra những key vừa
  xuất hiện trong lúc chạy (chống đua với request đang ghi).

`--apply` còn sửa `products.image_path` lệch về ảnh primary thật **trước** khi reconcile, để ref
cũ không sinh asset "ma". Sửa snapshot và reconcile nằm trong **cùng một transaction**.

Nguồn chung: `scripts/lib/media-reconcile.mjs` (SQL 5 nguồn, reconcile theo tập, sửa snapshot) —
`db:media-backfill` và `media:sync` dùng đúng cùng một lõi, nên không có bản SQL thứ ba lệch nhau.
`scripts/lib/env.mjs` là loader `.env` dùng chung cho mọi script CLI.

**Đã chạy ở production 2026-09-26** (có duyệt, sau `storage:backup`): trước 3.638 object (658 MB)
· 3.557 asset · 2 ref thiếu asset · 80 file mồ côi (14,8 MB). Sau: `+1` asset, `product_images
#6864` được gắn, snapshot `products #2122` dẹp về rỗng, 80 file mồ côi đã xoá → **3.558 object
(643 MB) = 3.558 media_assets**, `db:media-verify` PASS 14/14.

> Thứ tự: `storage:backup` **trước** khi prune — backup mirror bucket về `public/images/` (không
> track git) nên giữ được bản local của file sắp xoá để khôi phục nếu cần.

