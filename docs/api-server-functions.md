# Bề mặt RPC (`createServerFn`)

Tất cả nằm trong **`src/api/functions.ts`** (~1.581 dòng, ~85 endpoint). Đây là ranh giới
client ↔ server: client **chỉ** gọi các hàm export từ file này.

Docblock đầu file là hợp đồng:

```ts
/**
 * Client-callable RPC functions (createServerFn).
 * DB logic lives in *.server.ts and is only used inside handlers.
 * Every private handler requires a session; mutations enforce role/owner.
 */
```

## Khuôn mẫu một endpoint

```ts
export const updateCustomerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number /* ... */ }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("../db/auth.server");
    const { updateCustomer } = await import("../db/crm.server");
    const { writeAudit } = await import("../db/audit.server");

    const user = await requireUser();
    await assertCanAccessCustomer(user, data.id);
    const result = await updateCustomer(data);
    await writeAudit({
      action: "customer.update",
      entity_type: "customer",
      entity_id: data.id /* ... */,
    });
    return result;
  });
```

Bốn luật bắt buộc khi thêm endpoint:

1. **`await import()` động** mọi module server _bên trong_ handler. Không import tĩnh ở đầu file —
   sẽ kéo code server vào bundle client và Vite `importProtection` sẽ báo lỗi build.
2. **`requireUser()` hoặc `requireAdmin()`** ở dòng đầu tiên của handler.
3. **`assertCanAccessCustomer()`** nếu endpoint chạm tới một khách hàng cụ thể (kể cả gián tiếp
   qua `quoteId` / `orderId` / `mappingId`). Xem [xac-thuc-va-phan-quyen.md](xac-thuc-va-phan-quyen.md).
4. **`writeAudit()`** cho mọi mutation.

`method: "GET"` cho đọc, `"POST"` cho ghi. `.inputValidator()` là nơi ép kiểu/chuẩn hoá input.

## Nhóm endpoint

Các nhóm được phân cách bằng comment `// ─── ... ───` trong file.

### Auth

`fetchMe`, `loginFn`, `logoutFn`.
`fetchMe` là endpoint mà `_app.tsx` gọi trong `beforeLoad` để dựng cổng đăng nhập.
`loginFn` ghi audit cả `login` và `login.failed`.

### Users — admin

`fetchUsers`, `createUserFn`, `updateUserFn`, `resetUserPasswordFn`, `assignCustomerOwnerFn`,
`checkCustomerPhoneFn`.
Toàn bộ (trừ `checkCustomerPhoneFn`) đi qua `requireAdmin()`. `assignCustomerOwnerFn` là cách
chuyển khách hàng giữa các sale.

### Audit — admin

`fetchAuditLogs` — clamp limit về 1–500, filter theo `userId` và `action LIKE`.

### Products

`fetchProducts`, `fetchProductFieldValues`, `bulkUpdateProductFieldFn`, `clearProductFieldValueFn`,
`updateProductFn`, `createProductFn`, `deleteProductFn`.
Ảnh sản phẩm: `fetchProductImages`, `uploadProductImageFn`, `addProductImageByPathFn`,
`setPrimaryProductImageFn`, `deleteProductImageFn`.

`fetchProductFieldValues` / `bulkUpdateProductFieldFn` / `clearProductFieldValueFn` nhận **tên cột**
từ client, nên chỉ chấp nhận cột nằm trong **whitelist `PRODUCT_SUGGEST_FIELDS`** — đây là lá chắn
SQL injection, đừng nới lỏng.

### Gallery — Thư viện

`fetchGalleryCollections`, `fetchGalleryCollection`, `fetchGalleryImageCandidates`,
`createGalleryCollectionFn`, `updateGalleryCollectionFn`, `addGalleryProductImagesFn`,
`uploadGalleryImageFn`, `setGalleryCoverFn`, `reorderGalleryItemsFn`, `removeGalleryItemFn`,
`deleteGalleryCollectionFn`. Chi tiết: [hinh-anh-va-thu-vien.md](hinh-anh-va-thu-vien.md).

### Customers

`fetchCustomers`, `saveCustomer`, `updateCustomerFn`, `setCustomerStatus`, `fetchCustomerDetail`,
`deleteCustomerFn`.
Mẫu gửi khách: `addManualCustomerProductFn`, `setCustomerProductSampleSentFn`,
`deleteCustomerProductSampleFn`.

`deleteCustomerFn` **xoá lan** báo giá, quote item, đơn hàng, thanh toán và ghi chú của khách.
Thao tác không hoàn tác được — UI dùng confirm 2 bước theo quy ước ở `AGENTS.md`.

### Customer mappings — Đề xuất vật liệu (DXVL)

`fetchCustomerMappings`, `uploadMappingImageFn`, `saveCustomerMappingFn`,
`deleteCustomerMappingFn`, `exportMappingPrintFn`, `createQuoteFromMappingFn`.
`createQuoteFromMappingFn` sinh báo giá từ đề xuất và ghi liên kết vào
`customer_mapping_quote_links`.

### Quotes

`fetchQuotes`, `fetchQuote`, `saveQuote`, `updateQuoteFn`, `deleteQuoteFn`.

### Orders

`fetchOrders`, `setOrderStatusFn`, `deleteOrderFn`, `convertQuoteToOrder`.

### Debt & payments — Công nợ

`fetchCustomerDebts`, `fetchCustomerDebtDetail`, `savePayment`, `updatePaymentFn`, `deletePaymentFn`.

### Notes

`fetchNotes`, `saveNote`.

### Dashboard

`fetchDashboard` → KPI + số liệu pipeline cho `/tong-quan`.

### Import / Export

| Endpoint                      | Việc nó làm                                                            |
| ----------------------------- | ---------------------------------------------------------------------- |
| `exportProductsXlsxFn`        | Xuất catalog ra Excel                                                  |
| `previewProductImportFn`      | Đọc file, trả về preview (tạo mới / cập nhật / lỗi) — **không ghi DB** |
| `importProductsFn`            | Áp import sau khi người dùng xác nhận preview                          |
| `exportInternalCodesXlsxFn`   | Xuất bảng mã nội bộ                                                    |
| `importInternalCodeMappingFn` | Import mapping mã nội bộ → sản phẩm                                    |
| `syncProductInternalCodesFn`  | Đồng bộ danh sách mã nội bộ của **một** sản phẩm                       |
| `importStockUpdateFn`         | Cập nhật tồn kho từ file MISA                                          |
| `exportQuotePrintFn`          | Xuất báo giá ra HTML in được                                           |
| `exportMappingPrintFn`        | Xuất đề xuất vật liệu ra HTML                                          |

Chi tiết định dạng file: [san-pham-ton-kho-import.md](san-pham-ton-kho-import.md).
Quy tắc VAT khi xuất báo giá: [nghiep-vu.md](nghiep-vu.md).

Ba endpoint import có hành vi đáng nhớ:

- **`previewProductImportFn` luôn chạy trước `importProductsFn`.** Preview không ghi gì; đây là
  chỗ người dùng thấy trước cái gì sẽ bị đổi.
- **`importStockUpdateFn`** dedupe bằng `Map` khoá `internal_code|stock_location` — _"File MISA có
  thể chứa trùng mã/kho; giữ dòng cuối cùng"_ — ghi theo chunk 500 dòng, bỏ qua mã chưa được map,
  và trả về `{ updated, skipped }`.
- **`syncProductInternalCodesFn`** kiểm tra mã có đang thuộc sản phẩm khác không (`internal_code`
  UNIQUE toàn cục) rồi mới delete-then-`INSERT OR IGNORE`.

## Nhật ký (`writeAudit`)

`src/db/audit.server.ts`:

```ts
// Never break business flow because of audit failure
```

`writeAudit()` bọc insert trong `try/catch` — ghi log thất bại **không** làm hỏng nghiệp vụ.

Action đang dùng, đặt tên theo `<entity>.<hành động>`:

```
login  login.failed  logout
user.create  user.reset_password
customer.create  customer.update  customer.status  customer.delete  customer.assign_owner
quote.create  quote.create.from_mapping  quote.update  quote.delete  quote.export
order.convert  order.status  order.delete
payment.create  payment.update  payment.delete
note.create
product.create  product.update  product.delete  product.bulk_update
product.import  product.export
product.image.upload  product.image.add  product.image.delete
mapping.save  mapping.delete  mapping.export  mapping.image.upload
gallery.create  gallery.update  gallery.delete  gallery.cover.set
gallery.items.add  gallery.items.reorder  gallery.item.remove  gallery.image.upload
```

Thêm action mới thì giữ đúng quy ước tên này — UI `/nhat-ky` filter bằng `action LIKE`, nên
tiền tố nhất quán mới lọc được theo nhóm.

## Gọi từ client

Hai kiểu, dùng tuỳ ngữ cảnh:

- **Trong `loader` của route** — dữ liệu render SSR ngay lần đầu (danh sách sản phẩm, khách hàng…).
- **Trong `useMutation` / `useQuery`** của React Query — thao tác người dùng và dữ liệu phụ.

Sau mutation, refresh bằng `router.invalidate()` **hoặc** invalidate query — nhưng **không** gọi
`router.invalidate()` ngay trong handler lưu của dialog đang mở. Lý do và cách làm đúng: `AGENTS.md`,
mục UI Conventions.
