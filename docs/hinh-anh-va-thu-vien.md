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
`lp_settings.hero_image`) là nguồn sự thật duy nhất cho câu hỏi "ảnh này đang được dùng ở đâu?".

Không có tầng registry, không có tiến trình dọn dẹp tự động. Quy tắc:

- **Gỡ ảnh khỏi bản ghi** (`deleteProduct`, `deleteCustomerMapping`, `deleteCustomer`,
  `setHeroImageSetting`, `deleteProductImage`) **không** đụng tới file. File vẫn nằm nguyên trong
  kho lưu trữ; ảnh chỉ rơi vào trạng thái "không còn nơi dùng" trên `/luu-tru`.
- **Xoá file** chỉ xảy ra ở đúng một chỗ: người dùng xoá ảnh trên `/luu-tru`
  (`deleteProductImage`). Lúc đó hàm kiểm tra lại Reference Resolver và chỉ gọi `deleteImageRef()`
  khi **không còn nguồn nào** trỏ tới. Vì tên file là hash, hai sản phẩm dùng chung một tấm ảnh sẽ
  chia sẻ đúng một file — xoá thẳng khi còn tham chiếu là làm hỏng bản ghi còn lại.
- Endpoint trả `file_deleted` để UI phân biệt "đã xoá file" với "chỉ gỡ khỏi sản phẩm".

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

