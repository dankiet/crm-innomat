# Innomat CRM (`crm-innomat`)

CRM nội bộ cho showroom **gạch ốp lát**: quản lý sản phẩm & tồn kho theo mã nội bộ,
khách hàng theo pipeline, đề xuất vật liệu, báo giá / đơn hàng, công nợ, thư viện hình
và nhật ký hệ thống.

Ứng dụng chạy **TanStack Start (SSR) + React 19**, dữ liệu ở **PostgreSQL (Supabase)**,
hình ảnh ở **Supabase Storage**, triển khai trên **Vercel** (preset `nitro`, region `sin1`).

## Bộ docs

| Tài liệu                                                           | Nội dung                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------- |
| [docs/kien-truc.md](docs/kien-truc.md)                             | Kiến trúc, tech stack, luồng request, build chain        |
| [docs/cai-dat-va-moi-truong.md](docs/cai-dat-va-moi-truong.md)     | Chạy local, biến môi trường, script                      |
| [docs/co-so-du-lieu.md](docs/co-so-du-lieu.md)                     | 19 bảng, RLS, và hợp đồng của `db/driver.ts`             |
| [docs/xac-thuc-va-phan-quyen.md](docs/xac-thuc-va-phan-quyen.md)   | Session cookie, scrypt, role, owner-scoping, CSRF        |
| [docs/api-server-functions.md](docs/api-server-functions.md)       | Bề mặt RPC `createServerFn` (~85 endpoint)               |
| [docs/nghiep-vu.md](docs/nghiep-vu.md)                             | Mã chứng từ, pipeline, giá/VAT 8%, xuất HTML             |
| [docs/san-pham-ton-kho-import.md](docs/san-pham-ton-kho-import.md) | Sản phẩm, mã nội bộ, tồn kho, import/export Excel        |
| [docs/hinh-anh-va-thu-vien.md](docs/hinh-anh-va-thu-vien.md)       | Lưu hình content-addressed, nén ảnh, thư viện            |
| [docs/routes-va-ui.md](docs/routes-va-ui.md)                       | Danh sách route, search param, quy ước UI, history layer |
| [docs/trien-khai-va-van-hanh.md](docs/trien-khai-va-van-hanh.md)   | Deploy Vercel, migrate, backup, vận hành                 |

Quy ước bắt buộc khi sửa code (delete 2 bước, không `router.invalidate()` khi lưu,
workflow GitNexus, luật deploy) nằm ở [AGENTS.md](AGENTS.md) — docs không lặp lại.

## Bắt đầu nhanh

```bash
npm install
cp .env.example .env      # điền DATABASE_URL, SUPABASE_* ...
npm run db:migrate        # tạo/cập nhật schema
npm run db:seed-admin     # tạo user admin đầu tiên
npm run dev               # http://localhost:8080
```

Windows: bấm đúp `START_LOCAL.bat` để mở dev server + browser trên port 8080.

## Script

| Script                            | Việc nó làm                                                   |
| --------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                     | Vite dev server, port 8080, `host: true`                      |
| `npm run build`                   | Build SSR + nitro (`preset: vercel`), sau đó chạy `postbuild` |
| `npm run build:dev`               | Build ở mode `development` (debug output)                     |
| `npm run preview`                 | Chạy thử bản build                                            |
| `npm run lint` / `npm run format` | ESLint / Prettier                                             |
| `npm run db:migrate`              | Áp `src/db/schema-pg.sql` (ưu tiên `DATABASE_URL_UNPOOLED`)   |
| `npm run db:enable-rls`           | Bật RLS cho mọi bảng public                                   |
| `npm run db:seed-admin`           | Tạo/đặt lại admin từ `CRM_ADMIN_*`                            |
| `npm run storage:backup`          | Mirror bucket Supabase về `public/images`                     |
| `npm run clean:generated`         | Xoá output build/generated                                    |

## Cấu trúc thư mục

```
src/
  api/functions.ts      # toàn bộ RPC createServerFn (client gọi vào đây)
  db/                   # driver.ts, schema-pg.sql, *.server.ts (nghiệp vụ + SQL)
  routes/               # route file-based (_app.* = vùng đã đăng nhập)
  components/           # UI, dialog, bảng
  lib/                  # types, pricing, storage, image-upload, history-layer
  hooks/                # useHistoryLayer, ...
  server.ts             # wrapper SSR: serve /public + chuẩn hoá lỗi 500
  start.ts              # requestMiddleware: error + CSRF
scripts/                # *.mjs: migrate, rls, seed-admin, backup, clean
docs/                   # bộ tài liệu này
```
