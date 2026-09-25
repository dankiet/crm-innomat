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
isManagedImageRef(ref); // true nếu ref là /images/... hoặc host *.supabase.co
putImageBuffer(buf, ext); // → ref
readImageBytes(ref); // Buffer | null; fetch có timeout 8s, đọc local qua public/
deleteImageRef(ref); // xoá file; KHÔNG tự kiểm tra tham chiếu
```

`readImageBytes` **không throw** — mọi lỗi (404, timeout, file thiếu) đều trả `null`. Nơi gọi phải
xử lý `null` (export HTML thì bỏ ảnh đó, không vỡ cả tài liệu).

`isManagedImageRef` là điều kiện để được phép xoá: ảnh do CRM quản lý mới xoá, URL ngoài thì không
đụng tới.

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

Quy tắc (đã tách theo từng phạm vi xoá):

- **Gỡ ảnh khỏi bản ghi** (`deleteProduct`, `deleteCustomerMapping`, `deleteCustomer`,
  `setHeroImageSetting`) **không** đụng tới file hay asset. Ảnh chỉ rơi vào nhóm `unused`
  (Not in use) trên `/luu-tru`.
- **Xoá ảnh trong phạm vi sản phẩm** (`deleteProductImage` — từ màn hình sản phẩm): kiểm tra
  Reference Resolver và **có thể gọi `deleteImageRef()`** khi **không còn nguồn nào** trỏ tới path.
  Vì tên file là hash, hai bản ghi dùng chung một tấm ảnh sẽ chia sẻ đúng một file — xoá thẳng khi
  còn tham chiếu là làm hỏng bản ghi còn lại. Endpoint trả `file_deleted` để UI phân biệt "đã xoá
  file" với "chỉ gỡ khỏi sản phẩm".
- **Xoá asset trên `/luu-tru`** (`deleteMediaAssetFn`): **xoá vĩnh viễn** — gỡ mọi liên kết
  (kể cả xoá row `product_images`) + xoá row `media_assets` + **xoá file storage**, với guard
  không còn tham chiếu nào trỏ tới cùng storage key (xem §Kho ảnh asset-centric).

`isManagedImageRef` giới hạn phạm vi: chỉ file do CRM quản lý (`/images/...` hoặc host
`*.supabase.co`) mới bị xoá, URL ngoài không đụng tới.

## Ảnh sản phẩm

Bảng `product_images`: `path`, `sort_order`, `is_primary`, `caption`.

- `UNIQUE(product_id, path)` — không add trùng một ảnh vào cùng sản phẩm.
- Thêm một partial unique riêng cho `path LIKE '/products/imported/%'` (ảnh import theo lô).
- `products.image_path` là ảnh đại diện, được `syncPrimaryImagePath()` đồng bộ theo ảnh đang
  `is_primary`. Đừng ghi `image_path` bằng tay.

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
4. **Tag mô tả concept** — chỉ hiện khi ảnh CÓ `ai_description`; ảnh không có mô tả thì không
   hiện tag nào (click tag để sửa mô tả).
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
- Xoá row `media_assets`; trả `{ deleted, usages_removed, path }`.

Tầng API (`deleteMediaAssetFn`) sau đó **xoá file vật lý** bằng `deleteImageRef` — nhưng chỉ khi
`listImageReferencesForKeys` xác nhận **không còn bảng nào** trỏ tới cùng storage key (file hash
có thể dùng chung nhiều sản phẩm). Trả `file_deleted` để UI phân biệt.

Khi asset còn usage, UI nhắc "Xem N nơi đang dùng trước khi xóa" mở `AssetUsageDialog`.
Xoá luôn theo quy tắc 2 bước inline (AGENTS.md) — không `window.confirm`.

### Backfill

`applyMediaBackfill(db, sources)` trong `src/db/media-assets.server.ts` + scripts
`db:media-backfill` / `db:media-verify` (idempotent — chạy lại ra cùng kết quả).
Đã chạy ở production ngày **2026-09-25** (có duyệt): 3.561 asset, 3.597 product usage,
156 mapping, 1 hero; `db:media-verify` PASS 11/11 (xem [trien-khai-va-van-hanh](trien-khai-va-van-hanh.md)).

