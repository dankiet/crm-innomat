# Sản phẩm, mã nội bộ, tồn kho & import/export Excel

## Ba tầng dữ liệu

```
products                    1 sản phẩm = 1 «Mã báo giá» (code), UNIQUE
   │ 1..n
product_internal_codes      mã nội bộ MISA, UNIQUE toàn cục
   │ 1..n
inventory                   tồn kho theo (internal_code, stock_location), UNIQUE
```

Một sản phẩm có **nhiều mã nội bộ** (cùng viên gạch nhưng nhiều lô / nhiều mã MISA). Tồn kho gắn
vào **mã nội bộ**, không gắn vào sản phẩm — nên tồn của sản phẩm là tổng tồn các mã nội bộ của nó.

`internal_code` là `UNIQUE` **toàn cục**: một mã nội bộ không thể thuộc hai sản phẩm.
`syncProductInternalCodesFn` vì thế phải kiểm tra xung đột với sản phẩm khác trước khi ghi, rồi mới
delete-then-`INSERT OR IGNORE`.

## Cột `products` dễ nhầm

Tên cột DB **không khớp** nhãn nghiệp vụ (di sản đổi tên trong `schema-pg.sql`):

| Cột DB                       | Nhãn UI                        |
| ---------------------------- | ------------------------------ |
| `code`                       | Mã báo giá                     |
| `supplier`                   | **Bộ sưu tập**                 |
| `collections`                | **Hiệu ứng vân / mặt gạch**    |
| `shape`                      | Kiểu dáng                      |
| `surface`                    | Bề mặt                         |
| `material`                   | Chất liệu                      |
| `packing_m2` / `packing_pcs` | Quy cách: m²/thùng, viên/thùng |

Hai field ảo trên type `Product` (không có trong bảng, do query tính ra):

- `total_stock` — `SUM(inventory.quantity_stock)`
- `multi_codes_list` — `STRING_AGG(DISTINCT internal_code, ',')`
- `image_count` — số ảnh trong `product_images`

## `listProducts()` và cái bẫy kho

`listProducts({ category, search, stockLocation, limit })` trong `crm.server.ts` dùng một
`LEFT JOIN` với subquery gom mã nội bộ + tồn kho. Điều kiện kho được đặt **trong `ON` của JOIN**,
không phải trong `WHERE`:

```sql
LEFT JOIN inventory inv ON inv.internal_code = pic.internal_code AND inv.stock_location = ?
```

Nhờ vậy sản phẩm không có tồn ở kho đó **vẫn hiện** (với `total_stock` null) thay vì bị lọc mất.

Hệ quả: **không truyền `stockLocation` thì `total_stock` là tổng tất cả kho.** UI mặc định chip kho
là **Kho Q9**, nên loader của `/san-pham` phải mirror mặc định đó, nếu không con số hiện lên sẽ là
Q9 + VP:

```ts
// src/routes/_app.san-pham.tsx
// UI defaults the warehouse chip to Kho Q9 when URL has no stockLocation.
// Must mirror that here — otherwise listProducts sums Q9+VP (no JOIN filter).
const stockLocation =
  !deps.stockLocation || deps.stockLocation === "ALL" ? "KHOQ9" : deps.stockLocation;
```

Tìm kiếm quét đồng thời `code`, `multi_codes_list`, `name`, `size`, `supplier` — nên gõ mã nội bộ
vào ô tìm cũng ra sản phẩm.

## Whitelist field

`fetchProductFieldValues`, `bulkUpdateProductFieldFn`, `clearProductFieldValueFn` nhận **tên cột**
từ client (dùng cho datalist gợi ý và bulk apply). Chúng chỉ chấp nhận cột trong
**`PRODUCT_SUGGEST_FIELDS`** (`crm.server.ts`) — comment trong code: _"whitelist để tránh SQL
injection"_. Thêm field mới thì thêm vào whitelist, đừng bỏ kiểm tra.

## Import / export Excel

Module: **`src/db/product-import-export.server.ts`** (~751 dòng, dùng SheetJS `xlsx`).

Nguyên tắc đầu file:

```
Import / export catalog sản phẩm (Excel).
Upsert theo Mã báo giá (code). Không đụng ảnh.
```

**Import không bao giờ chạm tới ảnh sản phẩm.** Muốn đổi ảnh thì làm qua UI hoặc endpoint ảnh.

### Luồng import 2 bước

```
Chọn file → previewProductImportFn  → xem sẽ tạo mới / cập nhật / lỗi (KHÔNG ghi DB)
          → importProductsFn        → áp thật, trả { created, updated, skipped, errors[] }
```

Preview là bắt buộc trong UI — người dùng phải thấy trước cái gì bị đổi. `applyProductImport` bắt
lỗi từng dòng vào `errors[]` chứ không abort cả file, và sau mỗi update còn verify sản phẩm còn tồn
tại.

### Header được nhận

Import nhận **hai loại file**:

**1. File do CRM xuất ra** — header là tên cột DB snake_case
(`PRODUCT_XLSX_COLUMNS`): `id`, `code` (bắt buộc), `name`, `size`, `material`, `category`,
`supplier`, `color`, `packing`, `packing_m2`, `packing_pcs`, `retail_price`, `trade_price`,
`b2b_price`, `discount_tp`, `discount_b2b`, `surface`, `shape`, `collections`, `unit`,
`image_path`, `created_at`, `note`, `is_hot`.

**2. Bảng giá thô của nhà cung cấp** — dạng
`STT | Mã số | Kích thước | Tên | Chất liệu | ĐƠN GIÁ xuất… | Cột A/B/C | GIÁ BÁN LẺ | Tỉ lệ | GHI CHÚ`.

Map giá từ bảng thô:

| Cột file                  | → Field                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `GIÁ BÁN LẺ`              | `retail_price`                                               |
| `Cột A (CTYXD/TKE)`       | `trade_price` (CK TP)                                        |
| `Cột C (cân đối)`         | `b2b_price` — **fallback `Cột B`** nếu không có C            |
| `Tỉ lệ %`                 | **không map** — đó là markup giá xuất, không phải chiết khấu |
| `STT`, `Ảnh`, `Tham khảo` | không map                                                    |

`Đơn giá xuất…` có thể bị gán tạm vào `trade_price`, nhưng nếu file có `Cột A` thì `Cột A` thắng —
code gỡ giá trị tạm ra.

Header được chuẩn hoá (bỏ dấu, lowercase) rồi so với bảng alias, nên `Mã báo giá`, `Mã số`,
`Mã SP`, `Mã hàng`, `code` đều nhận. Không tìm được cột mã thì báo lỗi rõ:
_"Không tìm thấy cột mã SP («Mã báo giá» / «Mã số»). Kiểm tra header file."_

### Export

| Endpoint                    | File ra                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exportProductsXlsxFn`      | Catalog sản phẩm, header snake_case → import lại được luôn                                                                                        |
| `exportInternalCodesXlsxFn` | `TonKho_YYYY-MM-DD.xlsx`, sheet `TonKho`: `id`, `product_code`, `product_name`, `internal_code`, `stock_location`, `quantity_stock`, `created_at` |

Vì file export dùng đúng header mà import hiểu, vòng **export → sửa Excel → import** là workflow
chính khi cần cập nhật hàng loạt.

## Import mã nội bộ & tồn kho

Dialog `ImportStockDialog` có 2 tab:

| Tab       | Endpoint                      | Việc nó làm                          |
| --------- | ----------------------------- | ------------------------------------ |
| `mapping` | `importInternalCodeMappingFn` | Gắn mã nội bộ vào sản phẩm           |
| `stock`   | `importStockUpdateFn`         | Cập nhật số tồn theo mã nội bộ × kho |

### `importStockUpdateFn` — file MISA

Chỉ admin. Nhận `items[{ internal_code, stock_location, quantity }]`, rồi:

1. **Dedupe** bằng `Map` khoá `` `${internal_code}|${stock_location}` `` — _"File MISA có thể chứa
   trùng mã/kho; giữ dòng cuối cùng như import tuần tự cũ."_ Dòng sau ghi đè dòng trước.
2. Bỏ qua dòng thiếu mã hoặc thiếu kho (đếm vào `skipped`); số lượng âm/không hợp lệ → `0`.
3. Chạy trong **một transaction**, chia **chunk 500 dòng**.
4. Mỗi chunk kiểm tra mã có tồn tại trong `product_internal_codes` chưa — **mã chưa được map thì bỏ
   qua** (`skipped`), không tự tạo mã mới.
5. Ghi bằng `ON CONFLICT(internal_code, stock_location) DO UPDATE SET quantity_stock = excluded.quantity_stock`
   → tồn kho là **ghi đè**, không cộng dồn.

Trả về `{ updated, skipped }`; UI hiện cả hai con số trong toast. Nếu `skipped` cao bất thường,
nguyên nhân gần như luôn là mã nội bộ chưa được map — chạy tab `mapping` trước.

## Thứ tự thao tác khuyến nghị

```
1. Import catalog sản phẩm   (previewProductImportFn → importProductsFn)
2. Import mapping mã nội bộ  (importInternalCodeMappingFn)
3. Import tồn kho từ MISA    (importStockUpdateFn)
```

Làm sai thứ tự thì bước 3 sẽ `skipped` toàn bộ vì chưa có mã nội bộ để gắn tồn vào.
