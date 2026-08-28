# Triển khai & vận hành

## Nguyên tắc gốc

Luật deploy nằm ở **[AGENTS.md](../AGENTS.md)**, tóm lại:

- **Git (`main` trên GitHub) là nguồn sự thật và là bản backup có version duy nhất của source.**
- **Vercel deploy tự động qua GitHub integration** — mọi push lên `main` được build và lên
  production, không có bước deploy tay.
- **Không bao giờ rewrite history đã push** (force-push, rebase/amend/squash commit đã đẩy) — nó
  phá đúng cái mà git đang giữ hộ.

Hệ quả trực tiếp: `main` phải luôn ở trạng thái build được. Push lên `main` = deploy.

## Cấu hình Vercel

`vercel.json`:

```json
{ "framework": "nitro", "regions": ["sin1"] }
```

- **Framework preset `nitro`** — Vercel chạy `npm run build`, output do `nitro({ preset: "vercel" })`
  trong `vite.config.ts` sinh ra (`.vercel/output`).
- **Region `sin1` (Singapore)** — chọn theo vị trí Supabase để giảm latency DB. Đổi region mà không
  đổi region Supabase là tự thêm round-trip.
- Project được link qua `.vercel/project.json` (không commit).

### `postbuild`

```
"postbuild": "node scripts/prune-deploy-backup.mjs"
```

Script xoá `.vercel/output/static/images` — tức **loại `public/images` khỏi output deploy**. Lý do:
ảnh runtime không thuộc source, production đọc ảnh từ Supabase Storage, đưa vào output chỉ làm phình
bundle. Script từ chối xoá đường dẫn nằm ngoài workspace.

## Biến môi trường trên production

Khai trong **Vercel → Project → Settings → Environment Variables**. Tối thiểu:

```
DATABASE_URL                  (Supabase session pooler)
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
SUPABASE_STORAGE_PREFIX
```

Lưu ý cho môi trường serverless:

- Dùng **session pooler** cho `DATABASE_URL`. Direct connection sẽ cạn slot khi nhiều lambda cùng
  mở kết nối.
- Giữ `PG_MAX_CONNECTIONS` nhỏ (mặc định **7**). Mỗi instance có pool riêng, nhân lên nhanh.
- Thiếu `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` thì app rơi về chế độ lưu ảnh local — trên
  Vercel filesystem là ephemeral nên **ảnh sẽ mất sau mỗi deploy**. Production phải có đủ hai biến.

Danh sách đầy đủ: [cai-dat-va-moi-truong.md](cai-dat-va-moi-truong.md).

## Migration schema

```bash
npm run db:migrate
```

`scripts/db-migrate.mjs`:

- Đọc `DATABASE_URL_UNPOOLED` **trước**, fallback `DATABASE_URL` — DDL không nên đi qua pooler.
- Áp toàn bộ `src/db/schema-pg.sql` trong **một transaction** (`BEGIN` … `COMMIT`), nên hoặc chạy
  hết hoặc không đổi gì.
- Schema idempotent, chạy lại nhiều lần an toàn.

Migration **không tự chạy khi deploy**. Đổi schema thì tự chạy `db:migrate` trước (hoặc ngay sau)
khi push, tuỳ thay đổi đó tương thích ngược hay không:

- **Thêm cột/bảng** (tương thích ngược): chạy migrate trước rồi push.
- **Thay đổi ràng buộc**: chạy migrate trước, và đảm bảo code cũ vẫn chạy được với schema mới trong
  khoảng thời gian giữa hai bước.

Sau khi thêm bảng mới, chạy `npm run db:enable-rls` để không sót RLS
([co-so-du-lieu.md](co-so-du-lieu.md)).

## Tài khoản admin

```bash
npm run db:seed-admin      # đọc CRM_ADMIN_USERNAME / CRM_ADMIN_PASSWORD / CRM_ADMIN_NAME
```

Chỉ cần cho môi trường mới / DB trống. Script hash scrypt và cảnh báo nếu mật khẩu còn là giá trị
mặc định. Đổi mật khẩu về sau làm qua UI `/nguoi-dung`.

## Sao lưu

| Đối tượng              | Backup ở đâu                                                   |
| ---------------------- | -------------------------------------------------------------- |
| **Source code**        | Git / GitHub `main` — mỗi commit là một snapshot đầy đủ        |
| **Dữ liệu (Postgres)** | Backup của Supabase (Project → Database → Backups)             |
| **Ảnh**                | Supabase Storage; bản sao cục bộ bằng `npm run storage:backup` |

```bash
npm run storage:backup     # mirror bucket → public/images
```

Script cần `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, ghi vào `public/images` (thư mục này
không nằm trong git). Đây là bản sao để xem offline, **không** phải phương án khôi phục chính.

Ba nguồn trên độc lập nhau. Git **không** giữ dữ liệu và ảnh — revert code không revert dữ liệu.

## Chẩn đoán sự cố

### Lỗi 500 trên production

`src/server.ts` chuẩn hoá mọi response ≥ 500: h3 nuốt throw trong handler thành 500 với body
`{"unhandled":true,"message":"HTTPError"}`, nên code soi lại response, log lỗi thật
(`consumeLastCapturedError()`) rồi trả trang lỗi HTML.

→ **Lỗi thật nằm trong Vercel Runtime Logs**, không nằm trong trang lỗi người dùng thấy.

### Query chậm / timeout

- `statement_timeout` mặc định **15s** (`PG_STATEMENT_TIMEOUT_MS`). Query vượt ngưỡng bị Postgres
  hủy, không treo lambda.
- Bật `SQL_DEBUG=1` **tạm thời** để log query chậm. Log **không chứa giá trị tham số** (cố ý, để
  không lộ dữ liệu khách) — nên khi debug phải suy từ câu SQL, không mong đợi thấy giá trị.
- Cạn connection: kiểm tra `DATABASE_URL` có đúng pooler và `PG_MAX_CONNECTIONS` có bị đặt cao.

### Ảnh không hiện

1. Kiểm tra `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` có trên Vercel chưa. Thiếu → app ghi
   local → mất sau deploy.
2. Bucket phải là **public**.
3. `readImageBytes` có timeout 8s và trả `null` khi lỗi — ảnh thiếu thì tài liệu export bỏ ảnh đó,
   không báo lỗi. Ảnh trống trong file export thường là ref đã mất khỏi storage.

### Import tồn kho `skipped` cao

Gần như luôn do mã nội bộ chưa được map vào sản phẩm. Chạy tab `mapping` trước tab `stock`
([san-pham-ton-kho-import.md](san-pham-ton-kho-import.md)).

## Quy trình sửa code an toàn

Theo `AGENTS.md` (GitNexus, index `crm-innomat`):

1. `impact({ target: "symbolName", direction: "upstream" })` **trước khi** sửa một symbol; cảnh báo
   nếu risk HIGH/CRITICAL.
2. Đổi tên bằng `rename` (hiểu call graph), **không** find-and-replace.
3. `detect_changes()` **trước khi commit** để xác nhận phạm vi ảnh hưởng đúng như dự kiến.
4. `npm run lint` và build thử trước khi push — vì push là deploy.

Index cũ thì chạy `node .gitnexus/run.cjs analyze` ở gốc project.

## Dọn dẹp

```bash
npm run clean:generated    # xoá output build/generated
```

Cả `clean-generated.mjs` và `prune-deploy-backup.mjs` đều **từ chối xoá** đường dẫn ngoài workspace.
