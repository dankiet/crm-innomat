# Nghiệp vụ

## Luồng chính

```
Khách hàng ──► Đề xuất vật liệu (DXVL) ──► Báo giá (QT) ──► Đơn hàng (DH) ──► Thanh toán / Công nợ
     │                                          ▲
     └── mẫu đã gửi, ghi chú                    └── createQuoteFromMappingFn
```

Không bắt buộc đi đủ các bước — báo giá có thể tạo trực tiếp từ khách hàng, và đơn hàng cũng có
thể tạo mà không đi qua báo giá.

## Mã chứng từ

Sinh bởi `buildEntityCode()` trong `src/db/crm.server.ts`:

```
{PREFIX}-{YYMMDD}-INM-{TÊN_VIẾT_TẮT}
VD: QT-260723-INM-KIMAO
```

| Prefix | Bảng                | Nghiệp vụ        |
| ------ | ------------------- | ---------------- |
| `QT`   | `quotes`            | Báo giá          |
| `DH`   | `orders`            | Đơn hàng         |
| `DXVL` | `customer_mappings` | Đề xuất vật liệu |

- Tên viết tắt lấy theo thứ tự ưu tiên `short_name` → `company` → `name`, bỏ dấu và viết hoa.
  Không có gì dùng được thì fallback `KH`.
- Cột `code` là `UNIQUE`, nên nếu trùng thì thêm hậu tố `-2`, `-3`… cho tới khi trống.
- Ngày trong mã là **ngày tạo**, không đổi khi sửa chứng từ về sau.

## Trạng thái

### Khách hàng (`CustomerStatus`)

| Giá trị       | Nhãn        |
| ------------- | ----------- |
| `consulting`  | Đang tư vấn |
| `sample_sent` | Đã gửi mẫu  |
| `quoted`      | Gửi báo giá |
| `closed`      | Đã chốt     |
| `delivering`  | Đang giao   |
| `done`        | Hoàn tất    |
| `lost`        | Bỏ lỡ       |

`sample_sent` **không phải** trạng thái thất bại — theo comment trong `types.ts`: _"Đã gửi mẫu —
chờ cơ hội / dự án mới để tiếp tục, không hẳn là fail"_. Thất bại chỉ có `lost` (Closed-Lost).

**Kanban `/co-hoi` chỉ hiện 5 cột** (`pipelineStages`): `consulting`, `sample_sent`, `quoted`,
`closed`, `lost`. Hai trạng thái `delivering` và `done` tồn tại nhưng không có cột riêng — khách ở
hai trạng thái này được theo dõi ở màn đơn hàng/công nợ. Nếu thêm cột Kanban, phải sửa
`pipelineStages`, không phải `statusMeta`.

### Báo giá (`QuoteStatus`)

`draft` (Nháp) → `sent` (Đã gửi) → `accepted` (Đã duyệt) | `expired` (Hết hạn).

### Đơn hàng (`OrderStatus`)

`preparing` (Đang soạn kho) → `shipping` (Đang vận chuyển) → `delivered` (Đã giao).

### Đề xuất vật liệu

`draft` | `sent` | `accepted` | `expired`, kèm `version` (mặc định `'01'`) để đánh dấu bản chỉnh sửa.

Nhãn + class Tailwind của mọi trạng thái nằm trong `statusMeta` / `quoteStatusMeta` /
`orderStatusMeta` (`src/lib/types.ts`). **Dùng các map này**, đừng hardcode chuỗi tiếng Việt trong
component.

## Giá & chiết khấu

`src/lib/pricing.ts`. Bốn kiểu chiết khấu (`DiscountType`):

| Kiểu     | Nghĩa               | Cách tính đơn giá                                                                  |
| -------- | ------------------- | ---------------------------------------------------------------------------------- |
| `none`   | Giá lẻ              | `retail_price`                                                                     |
| `tp`     | CK TP (CTYXD / TKE) | **Ưu tiên `trade_price` đã lưu**; không có thì `retail_price × (1 − discount_tp%)` |
| `b2b`    | CK B2B (đối tác)    | **Ưu tiên `b2b_price` đã lưu**; không có thì `retail_price × (1 − discount_b2b%)`  |
| `custom` | Tự nhập %           | `retail_price × (1 − customPct%)`                                                  |

Điểm dễ sai: **giá tuyệt đối thắng phần trăm.** `discount_tp` / `discount_b2b` chỉ là dự phòng cho
sản phẩm chưa có `trade_price` / `b2b_price`. Sửa % mà sản phẩm đã có giá tuyệt đối thì đơn giá
không đổi.

`effectiveDiscountPct(retail, unitPrice)` tính lại % để **hiển thị** trên dòng báo giá (làm tròn
2 chữ số) — nó là kết quả, không phải input.

### Lợi nhuận ước tính

`estimateLineProfitInfo(unitPrice, quantityM2, tradePrice, includeVat)`:

- Quy đơn giá bán về **trục gồm VAT** trước khi so sánh, vì `trade_price` được lưu là giá **đã gồm VAT**.
- `amount = (giá bán gồm VAT − trade_price) × m²`, `pct = amount / doanh thu gồm VAT`.
- Trả về `null` khi thiếu `trade_price` (≤ 0) hoặc số lượng ≤ 0 — UI phải xử lý `null` là "không
  đủ dữ liệu", không hiển thị 0%.

## VAT 8%

`VAT_RATE = 0.08` khai báo một chỗ trong `src/lib/pricing.ts`. Quy tắc xuất báo giá
(docblock của `exportQuoteToHtml` trong `src/db/export-quote.server.ts` là bản đặc tả chuẩn):

**Tài liệu luôn có một dòng "VAT 8%" riêng.**

| `prices_include_vat` | Đơn giá hiển thị                  | VAT                              | Tổng cộng                       |
| -------------------- | --------------------------------- | -------------------------------- | ------------------------------- |
| `0` — chưa gồm VAT   | `unit_price`                      | (Σ thành tiền + phí VC) × 8%     | Σ thành tiền + phí VC + VAT     |
| `1` — đã gồm VAT     | `unit_price / 1.08` (tách VAT ra) | (Σ thành tiền gốc + phí VC) × 8% | Σ thành tiền gốc + phí VC + VAT |

**Phí vận chuyển luôn được nhập chưa VAT** và bị đánh VAT cùng hàng hoá.

Tham số `hideVat` chỉ **ẩn dòng VAT khi in**, không thay đổi cách tính.

## Xuất tài liệu

### Báo giá → HTML in được

```ts
exportQuoteToHtml(
  quoteId,
  paymentTerms,
  deliveryTerms,
  hideVat,
  showOrigin,
  showColorVariance,
  projectName,
  deliveryLocation,
);
```

- Trả về `{ filename, base64, mimeType }`; client tự tải/mở để in.
- Hình được nhúng thành **data URL** (`imageRefToDataUrl`) nên file HTML chạy độc lập, không cần
  mạng khi mở lại. Ảnh được nạp song song có giới hạn qua `mapLimit`.
- Logo và mộc lấy từ `logoDataUrl` / `stampDataUrl` (`src/lib/brand-assets.server.ts`).
- `showOrigin` hiện cột xuất xứ, `showColorVariance` thêm ghi chú sai lệch màu giữa các lô gạch.
- Dialog `ExportQuoteDialog` nhớ tên công trình / địa điểm giao lần trước trong
  `localStorage` khoá `quote-export-project-site`.

### Đề xuất vật liệu → HTML

`exportMappingToHtml(mappingId)` (`src/db/export-mapping.server.ts`) → `{ filename, base64, mimeType }`.
Cũng nhúng ảnh dạng data URL. Giá hiển thị qua `formatPrice` → `"… đ/m²"`, hoặc **`"Liên hệ"`** khi
không có giá.

Cả hai endpoint export đều ghi audit (`quote.export`, `mapping.export`).

## Đề xuất vật liệu (DXVL)

Một đề xuất là tập dòng vật liệu gom theo khu vực thi công:

- Dòng có thể trỏ tới sản phẩm trong catalog (`product_id`) **hoặc** là hàng ngoài catalog, khai
  báo trực tiếp qua bộ cột `custom_product_*` (code / name / size / surface / retail_price /
  image_path).
- Gom nhóm theo `area_group_key` + `area_description` (VD "Sàn WC", "Ốp tường bếp").
- `createQuoteFromMappingFn` chuyển đề xuất thành báo giá và ghi liên kết vào
  `customer_mapping_quote_links` (quan hệ N–N, một đề xuất có thể sinh nhiều báo giá).
  Trường `linked_quotes[]` trong type `CustomerMapping` đọc ra từ bảng này.

## Công nợ

`listCustomerDebts()` / `getCustomerDetail()` trong `crm.server.ts`. Công nợ = tổng giá trị đơn
hàng − tổng `payments` của khách. Thanh toán có thể gắn với một đơn cụ thể (`order_id`) hoặc để
trống (thu chung); xoá đơn hàng không xoá thanh toán (`ON DELETE SET NULL`).

## Xoá khách hàng

`deleteCustomer()` xoá lan: báo giá + quote item, đơn hàng, thanh toán, ghi chú. Không hoàn tác
được. UI dùng confirm 2 bước (`AGENTS.md`).
