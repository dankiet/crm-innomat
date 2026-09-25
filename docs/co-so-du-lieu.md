# Cơ sở dữ liệu

Schema nguồn duy nhất: **`src/db/schema-pg.sql`**. Áp bằng `npm run db:migrate`
(idempotent — mọi lệnh đều `IF NOT EXISTS` / `IF EXISTS`, chạy lại an toàn).

## 26 bảng

> Số dòng thật của từng bảng: xem [audit-2026-09-19](audit-2026-09-19.md) §G0b — **không
> chép lại ở đây** để tránh hai bản số liệu trôi lệch nhau. Mốc đó đo 25 bảng; từ 2026-09-21
> có thêm `image_assets` → 26, đã gỡ 2 bảng gallery (2026-09-24) → 24, gỡ luôn
> `image_assets` (2026-09-24, bỏ tầng registry/GC) → 23, rồi thêm lại đúng 3 bảng
> registry theo **Option 2 (1 file ảnh = 1 MediaAsset): `media_assets`,
> `mapping_media_usages`, `landing_page_media_usages`** (2026-09-25) → **26 bảng**.

### Catalog sản phẩm

| Bảng                     | Vai trò                                              | Ràng buộc đáng chú ý                                                                   |
| ------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `products`               | Sản phẩm theo **mã báo giá** (`code`)                | `UNIQUE(code)`; index cả `category` và `LOWER(category)`                               |
| `product_internal_codes` | Mã nội bộ (MISA) → sản phẩm, **1 sản phẩm nhiều mã** | `UNIQUE(internal_code)` toàn cục                                                       |
| `inventory`              | Tồn kho theo từng mã nội bộ × kho                    | `UNIQUE(internal_code, stock_location)`; FK về `product_internal_codes(internal_code)` |
| `product_images`         | Ảnh của sản phẩm                                     | `UNIQUE(product_id, path)` + partial unique cho `path LIKE '/products/imported/%'`; `media_asset_id → media_assets(id) ON DELETE SET NULL` (Option 2: 1 file = 1 MediaAsset)                                             |
| `product_image_room_tags`| Thẻ phòng gán cho ảnh (`room_slug`), kèm `source`, `confidence`, `model`, `model_version` | PK ghép `(product_image_id, room_slug)`; dùng bởi tab thẻ phòng ở `/luu-tru`. **Bộ review đã bỏ** — `review_status`/`reviewed_by`/`reviewed_at` chưa từng được dùng (1435/1435 dòng = `'accepted'`, 0 dòng có `reviewed_by`/`reviewed_at`), xem [audit](audit-2026-09-19.md) §G2 |

Cột `products` gắn với nhãn UI như sau:

| Cột           | Nhãn UI      |
| ------------- | ------------ |
| `supplier`    | Nhà cung cấp |
| `collections` | Bộ sưu tập   |
| `texture`     | Hiệu ứng vân |
| `shape`       | Kiểu dáng    |
| `surface`     | Bề mặt       |
| `color`       | Tông màu     |

> **Đã từng đảo nghĩa — đừng đọc nhầm theo ký ức cũ.** DB rất cũ có `collections` chứa *nhà
> cung cấp* và `finish_effect` chứa *bộ sưu tập*. Block `DO $$` ở `schema-pg.sql:33-40` đổi tên
> `collections`→`supplier` và `finish_effect`→`collections` để tên khớp nghĩa.
>
> Trên DB hiện tại tên **khớp** nghĩa, kiểm chứng bằng dữ liệu thật:
> `products.collections` = "Bộ Đá Tự Nhiên & Xi Măng 600x600", "Bộ Marble Mây & Neutral";
> `products.supplier` = "Innomat", "Hiệp Thủy", "Á Châu"; `products.texture` = "Vân đá", "Marble".

Giá: `retail_price` (giá lẻ), `trade_price` (cột A – CTYXD/TKE), `b2b_price` (cột C – cân đối),
kèm `discount_tp` / `discount_b2b` là **% chiết khấu dự phòng**. Xem [nghiep-vu.md](nghiep-vu.md).

### Kho Media — 1 file = 1 MediaAsset (Option 2)

Ở Kho ảnh (luu-tru) giờ duyệt **theo file vật lý**, không theo dòng `product_images`. Bảng registry:

| Bảng                        | Vai trò                                                        | Ràng buộc đáng chú ý                                                         |
| --------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `media_assets`              | 1 file ảnh (storage key) = 1 dòng                              | `storage_key UNIQUE` (tail `<sha256>.<ext>`); index `path`; `path` = ref thật (URL/`/images/...`) để render; `width`/`height`/`mime_type`/`file_size` NULL khi chưa đo |
| `mapping_media_usages`      | Đề xuất vật liệu đang dùng asset ở cột nào                     | `media_asset_id → media_assets ON DELETE CASCADE`; `mapping_item_id ON DELETE CASCADE`; `UNIQUE(mapping_item_id, col)`; `col CHECK IN ('image_path','custom_product_image_path')` |
| `landing_page_media_usages` | Landing/Hero đang dùng asset                                   | `media_asset_id → media_assets ON DELETE CASCADE`; `setting_key UNIQUE`       |

`product_images.media_asset_id` là "usage product" của asset. Write-path giữ hành vi cũ
(`product_images.path`, `customer_mapping_items.*`, `lp_settings.hero_image` vẫn là nguồn sự
thật), bảng usage mới được đồng bộ kèm theo (xem [hinh-anh-va-thu-vien](hinh-anh-va-thu-vien.md)).

### Người dùng & session

| Bảng       | Ghi chú                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- |
| `users`    | `UNIQUE(username)`, `role CHECK IN ('admin','user')`, `is_active`, `password_hash` scrypt |
| `sessions` | PK là chuỗi id ngẫu nhiên (giá trị cookie), `expires_at`, `last_seen_at`, `user_agent`    |

### Khách hàng & bán hàng

| Bảng                       | Ghi chú                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `customers`                | `status` pipeline, `owner_id → users(id)` là gốc của owner-scoping, `short_name` dùng để sinh mã chứng từ                          |
| `quotes`                   | `UNIQUE(code)`, `discount_type`, `prices_include_vat`, `shipping_fee`; `ON DELETE CASCADE` từ customer                             |
| `quote_items`              | Snapshot `product_code`/`product_name`/`size` tại thời điểm báo giá + `unit_price`, `discount_pct`, `line_total`, `area`, `origin` |
| `orders`                   | `UNIQUE(code)`, `quote_id ON DELETE SET NULL` (xoá báo giá không xoá đơn)                                                          |
| `payments`                 | Thu tiền theo khách, `order_id ON DELETE SET NULL`                                                                                 |
| `notes`                    | `customer_id ON DELETE SET NULL` → ghi chú chung không thuộc khách nào vẫn tồn tại                                                 |
| `customer_product_samples` | Mẫu đã gửi khách, `UNIQUE(customer_id, product_id)`                                                                                |

### Đề xuất vật liệu (DXVL)

| Bảng                           | Ghi chú                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `customer_mappings`            | `UNIQUE(code)`, `status`, `version` (mặc định `'01'`)                                                                                      |
| `customer_mapping_items`       | Dòng đề xuất: trỏ `product_id` **hoặc** dùng bộ `custom_product_*` cho hàng ngoài catalog; nhóm theo `area_group_key` (`area_description` còn khai báo nhưng 0 code dùng, 0/151 dòng có giá trị — xem [audit](audit-2026-09-19.md) §G1) |
| `customer_mapping_quote_links` | Liên kết N–N mapping ↔ quote. **PK ghép, không có cột `id`**. Hiện **0 dòng** — tính năng đã viết xong code (ghi ở `crm.server.ts`, đọc ở `crm.server.ts` + `api/functions.ts`) nhưng chưa từng chạy ở production; **không** phải bảng chết |

### Nhật ký

`audit_logs` — `user_id ON DELETE SET NULL` nhưng vẫn giữ `username` dạng text để log không mất
dấu vết khi user bị xoá. Có `action`, `entity_type`, `entity_id`, `summary`, `meta_json`.

### Landing công khai (LP)

Năm bảng phục vụ trang `/lp/$slug` và khách vãng lai — **không** dùng chung `users`/`sessions`
của CRM:

| Bảng             | Ghi chú                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `lp_settings`    | Key/value cấu hình landing (ảnh hero, nội dung khối)                                                        |
| `lp_leads`       | Lead từ form: `full_name`, `phone` + `phone_norm` (để chống trùng), `need`, `shortlist_codes`, `utm_source`, `status`, `customer_id` (gắn sau khi chuyển đổi) |
| `lp_rate_limits` | Chống spam form: `bucket`, `hits`, `window_start`                                                           |
| `public_users`   | Danh tính khách vãng lai (`supabase_id`, `email`, `first_seen_at`, `last_seen_at`) — tách khỏi `users`       |
| `public_sessions`| Session của `public_users`, song song với `sessions` của CRM                                                |

Nghiệp vụ: [tong-quan-tinh-nang](tong-quan-tinh-nang.md) §9–§11.

## Quy ước kiểu dữ liệu

- **Thời gian là `TEXT`**, định dạng `YYYY-MM-DD HH:MM:SS` theo giờ local, sinh bằng
  `datetime('now','localtime')` → driver transpile thành `to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`.
- **Boolean là `INTEGER` 0/1** (`is_hot`, `is_primary`, `is_active`, `prices_include_vat`, `sample_sent`).
- **Tiền là `BIGINT`** (đồng, không phần thập phân). Diện tích/quy cách là `DOUBLE PRECISION`.
- Cột text hầu hết `NOT NULL DEFAULT ''` — code đọc ra dùng trực tiếp, không cần lo `null`.

Các quy ước này là di sản của thời SQLite và được giữ có chủ đích để `driver.ts` làm facade được.

## Row Level Security

Cuối `schema-pg.sql` có block `DO $$` bật **RLS trên mọi bảng schema `public`** và **không tạo
policy nào**. Ý đồ:

- CRM kết nối bằng `DATABASE_URL` với role server → **bypass RLS**, chạy bình thường.
- Role `anon` / `authenticated` của Supabase PostgREST → **không có policy = không đọc/ghi/xoá được**.
  Kể cả ai đó lấy được anon key thì REST endpoint công khai vẫn trơ.

Chạy lại riêng lẻ: `npm run db:enable-rls`. **Đừng thêm policy cho `anon`** trừ khi cố ý mở REST.

## Hợp đồng của `src/db/driver.ts`

Facade async mang hình dạng API của `better-sqlite3`, chạy trên `pg`.

```ts
const db = getDb();
await db.prepare("SELECT * FROM products WHERE id = ?").get<Product>(id);
await db.prepare("SELECT * FROM products WHERE category = ?").all<Product>(cat);
const res = await db.prepare("INSERT INTO notes (content) VALUES (?)").run(text);
// res = { changes, lastInsertRowid }

await db.transaction(async () => {
  /* ... */
})(); // gọi 2 lần: tạo rồi chạy
```

Điểm phải nhớ:

1. **Mọi thứ đều `await`.** `prepare()` trả về object có method async — quên `await` là nhận Promise.
2. **`run()` tự thêm `RETURNING id`** cho INSERT vào bảng có cột `id`, để `lastInsertRowid` có giá trị.
   Bảng nằm trong `TABLES_WITHOUT_ID` (`customer_mapping_quote_links`) thì không.
3. **Placeholder:** viết `?` hoặc `@name`, driver đổi sang `$1..$n` và **bind tham số** — không nội suy
   chuỗi. Dynamic SQL (sort/filter theo cột) phải đi qua **whitelist field**, ví dụ
   `PRODUCT_SUGGEST_FIELDS` trong `crm.server.ts`.
4. **Transpile cú pháp SQLite:**
   - `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`
   - `datetime('now','localtime')` → `to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`
   - `GROUP_CONCAT(DISTINCT x)` → `STRING_AGG(DISTINCT x, ',')`
5. **Transaction lồng nhau dùng SAVEPOINT**, nên gọi `transaction()` bên trong `transaction()` không vỡ.

### Cấu hình pool

| Thông số                  | Giá trị                                                                   |
| ------------------------- | ------------------------------------------------------------------------- |
| `max`                     | `PG_MAX_CONNECTIONS` hoặc `7`                                             |
| `idleTimeoutMillis`       | 30.000                                                                    |
| `connectionTimeoutMillis` | 10.000                                                                    |
| `statement_timeout`       | `PG_STATEMENT_TIMEOUT_MS` hoặc 15.000                                     |
| `ssl`                     | `false` khi `PG_SSL_DISABLE=1`, ngược lại `{ rejectUnauthorized: false }` |

`SQL_DEBUG=1` log query chậm kèm thời gian. **Không log giá trị tham số** — cố ý, để log không lộ
dữ liệu khách.

## Khi cần đổi schema

1. Sửa `src/db/schema-pg.sql` theo hướng **thêm mới, idempotent** (`CREATE ... IF NOT EXISTS`,
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Không viết migration phá dữ liệu cũ.
2. Chạy `npm run db:migrate` (ưu tiên `DATABASE_URL_UNPOOLED`).
3. Cập nhật type ở `src/lib/types.ts` và hàm đọc/ghi tương ứng trong `src/db/*.server.ts`.
4. Bảng mới → chạy `npm run db:enable-rls` để không sót RLS.
