# Hình ảnh & Thư viện

## Lưu trữ hai chế độ

`src/lib/storage.ts` (~156 dòng) là lớp lưu trữ dùng chung. Tên file **content-addressed theo
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

Một ref có thể được **nhiều bảng** tham chiếu. `isPublicImagePathReferenced()`
(`crm.server.ts`) kiểm tra 5 chỗ:

```sql
product_images.path
products.image_path
customer_mapping_items.image_path
customer_mapping_items.custom_product_image_path
gallery_collection_items.path
```

`deleteUnreferencedPaths()` trong `gallery.server.ts` chỉ xoá file khi ref **là ảnh do CRM quản lý**
và **không còn bản ghi nào trỏ tới**:

```ts
if (isManagedImageRef(path) && !(await isPublicImagePathReferenced(db, path))) {
  await deleteImageRef(path);
}
```

Đây là quy tắc bắt buộc: **đừng gọi `deleteImageRef()` trực tiếp** khi xoá bản ghi. Vì tên file là
hash, hai sản phẩm khác nhau dùng chung một tấm ảnh sẽ chia sẻ đúng một file — xoá thẳng là làm hỏng
bản ghi còn lại. Cùng cơ chế được dùng ở `deleteProduct`, `deleteProductImage` và
`deleteOrphanMappingImages`.

## Ảnh sản phẩm

Bảng `product_images`: `path`, `sort_order`, `is_primary`, `caption`.

- `UNIQUE(product_id, path)` — không add trùng một ảnh vào cùng sản phẩm.
- Thêm một partial unique riêng cho `path LIKE '/products/imported/%'` (ảnh import theo lô).
- `products.image_path` là ảnh đại diện, được `syncPrimaryImagePath()` đồng bộ theo ảnh đang
  `is_primary`. Đừng ghi `image_path` bằng tay.

Endpoint: `fetchProductImages`, `uploadProductImageFn`, `addProductImageByPathFn`,
`setPrimaryProductImageFn`, `deleteProductImageFn`.
`addProductImageByPathFn` dùng để gắn một ảnh đã có trong storage (VD ảnh từ Thư viện) mà không
upload lại.

## Thư viện (`/thu-vien`)

`src/db/gallery.server.ts` (~401 dòng). Hai bảng: `gallery_collections` và
`gallery_collection_items`.

Đặc điểm:

- Item giữ **snapshot `product_code` / `product_name`** ngoài `product_id`
  (`ON DELETE SET NULL`) — nên xoá sản phẩm thì ảnh trong bộ sưu tập vẫn còn nhãn để nhận biết.
- `UNIQUE(collection_id, path)` — một ảnh chỉ vào bộ sưu tập một lần.
- `sort_order` cho phép sắp xếp thủ công; `applyGalleryItemOrder()` **từ chối** item không thuộc bộ
  sưu tập đang sắp — chống việc client gửi id lạ để dò dữ liệu.
- `cover_path` là ảnh bìa, đặt bằng `setGalleryCoverFn`.

Giới hạn bulk:

| Hằng số              | Giá trị | Ý nghĩa                                           |
| -------------------- | ------- | ------------------------------------------------- |
| `MAX_BULK_IMAGE_IDS` | 5.000   | Mỗi lần thêm/sắp tối đa 5.000 ảnh, vượt thì throw |
| `BULK_CHUNK_SIZE`    | 400     | Chia chunk khi ghi để không nổ số placeholder SQL |

Endpoint: `fetchGalleryCollections`, `fetchGalleryCollection`, `fetchGalleryImageCandidates`,
`createGalleryCollectionFn`, `updateGalleryCollectionFn`, `addGalleryProductImagesFn`,
`uploadGalleryImageFn`, `setGalleryCoverFn`, `reorderGalleryItemsFn`, `removeGalleryItemFn`,
`deleteGalleryCollectionFn`.

Search param của route: `?c=<collectionId>`, `?v=<index>` cho viewer. **`v` chỉ có nghĩa khi `c` đã
có** — mở `?v=3` mà không có `c` là trạng thái không hợp lệ.

## Phục vụ file tĩnh

`src/server.ts` tự serve `/public` cho các đường dẫn lồng nhau như `/images/<hash>.webp`, kèm MIME
map và **guard chống path traversal**. Cần thiết vì TanStack Start SSR trả HTML 404 của SPA cho
đường dẫn public lồng nhau.

Ở chế độ Supabase, ảnh được trả trực tiếp từ CDN Supabase nên không đi qua đường này.

## Nhúng ảnh khi xuất tài liệu

`exportQuoteToHtml` và `exportMappingToHtml` nhúng ảnh thành **data URL** (`imageRefToDataUrl` →
`readImageBytes` → base64) để file HTML mở được offline. Export báo giá nạp ảnh **song song có giới
hạn** qua `mapLimit` — đừng bỏ giới hạn đó, báo giá vài chục dòng sẽ mở hàng chục fetch cùng lúc.

## Sao lưu

```bash
npm run storage:backup      # mirror bucket Supabase → public/images
```

`public/images/` **không nằm trong git** (`.gitignore`: _"Runtime images — kept local only, not
tracked in git"_). Nguồn thật của ảnh production là **Supabase Storage**, và git không phải bản
backup cho ảnh. Chạy script này định kỳ nếu muốn có bản sao cục bộ.
