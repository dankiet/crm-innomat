# Cơ sở dữ liệu

Schema nguồn duy nhất: **`src/db/schema-pg.sql`**. Áp bằng `npm run db:migrate`
(idempotent — mọi lệnh đều `IF NOT EXISTS`, chạy lại an toàn).

## 19 bảng

### Catalog sản phẩm

| Bảng                     | Vai trò                                              | Ràng buộc đáng chú ý                                                                   |
| ------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `products`               | Sản phẩm theo **mã báo giá** (`code`)                | `UNIQUE(code)`; index cả `category` và `LOWER(category)`                               |
| `product_internal_codes` | Mã nội bộ (MISA) → sản phẩm, **1 sản phẩm nhiều mã** | `UNIQUE(internal_code)` toàn cục                                                       |
| `inventory`              | Tồn kho theo từng mã nội bộ × kho                    | `UNIQUE(internal_code, stock_location)`; FK về `product_internal_codes(internal_code)` |
| `product_images`         | Ảnh của sản phẩm                                     | `UNIQUE(product_id, path)` + partial unique cho `path LIKE '/products/imported/%'`     |

Cột `products` dễ nhầm — **ý nghĩa nghiệp vụ không khớp tên cột** (di sản migration):

| Cột           | Nhãn UI                     |
| ------------- | --------------------------- |
| `supplier`    | **Bộ sưu tập**              |
| `collections` | **Hiệu ứng vân / mặt gạch** |
| `shape`       | Kiểu dáng                   |
| `surface`     | Bề mặt                      |

Schema có một block `DO $$` đổi tên `collections`→`supplier` và `finish_effect`→`collections`
cho DB cũ. Đã migrate rồi thì block này không làm gì.

Giá: `retail_price` (giá lẻ), `trade_price` (cột A – CTYXD/TKE), `b2b_price` (cột C – cân đối),
kèm `discount_tp` / `discount_b2b` là **% chiết khấu dự phòng**. Xem [nghiep-vu.md](nghiep-vu.md).

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
| `customer_mapping_items`       | Dòng đề xuất: trỏ `product_id` **hoặc** dùng bộ `custom_product_*` cho hàng ngoài catalog; nhóm theo `area_group_key` / `area_description` |
| `customer_mapping_quote_links` | Liên kết N–N mapping ↔ quote. **PK ghép, không có cột `id`**                                                                               |

### Thư viện hình

| Bảng                       | Ghi chú                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gallery_collections`      | Bộ sưu tập hình, có `cover_path`                                                                                                                       |
| `gallery_collection_items` | `UNIQUE(collection_id, path)`, `sort_order`; giữ `product_code`/`product_name` để hiển thị kể cả khi sản phẩm bị xoá (`product_id ON DELETE SET NULL`) |

### Nhật ký

`audit_logs` — `user_id ON DELETE SET NULL` nhưng vẫn giữ `username` dạng text để log không mất
dấu vết khi user bị xoá. Có `action`, `entity_type`, `entity_id`, `summary`, `meta_json`.

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
