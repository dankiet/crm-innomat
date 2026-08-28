# Cài đặt & môi trường

## Yêu cầu

- **Node.js LTS** (≥ 20) và npm.
- Một project **Supabase** (PostgreSQL + Storage). Không cần cài Postgres local.
- `sharp` được build sẵn theo nền tảng — nếu `npm install` lỗi ở `sharp`, xoá
  `node_modules` rồi cài lại.

## Chạy lần đầu

```bash
npm install
cp .env.example .env
# điền các biến ở phần dưới, tối thiểu: DATABASE_URL
npm run db:migrate        # tạo schema (19 bảng) + bật RLS
npm run db:seed-admin     # tạo user admin từ CRM_ADMIN_*
npm run dev               # → http://localhost:8080
```

Dev server nghe port **8080** và bật `host: true`, nên máy khác trong LAN vào được
qua `http://<ip-máy>:8080` (tiện test trên điện thoại).

### Windows: `START_LOCAL.bat`

Bấm đúp để mở dev server. Script này:

- kiểm tra `node`, `npm`, `node_modules/` trước khi chạy;
- **probe** `http://127.0.0.1:8080/` xem CRM đã chạy chưa — nếu rồi thì chỉ mở browser;
- **không kill** process lạ đang giữ port 8080 (chỉ cảnh báo), tránh giết oan app khác;
- chờ tối đa 60s cho server lên rồi mở browser.

Đổi port: `set PORT=3000` trước khi chạy.

## Biến môi trường

Khai báo trong `.env` (local) và trong **Vercel → Project → Environment Variables** (production).
`.env`, `.env.local` **không bao giờ** được commit; chỉ `.env.example` nằm trong git.

### Bắt buộc

| Biến           | Ý nghĩa                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL` | Connection string Supabase **session pooler** — dùng ở runtime (serverless). |

### Storage (khuyến nghị bật cho production)

| Biến                        | Ý nghĩa                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `SUPABASE_URL`              | `https://<project-ref>.supabase.co`                                |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role`. **Chỉ dùng phía server.** |
| `SUPABASE_STORAGE_BUCKET`   | Tên bucket, mặc định `crm-images`                                  |
| `SUPABASE_STORAGE_PREFIX`   | Tiền tố object, mặc định `crm`                                     |

Thiếu `SUPABASE_URL` **hoặc** `SUPABASE_SERVICE_ROLE_KEY` → app tự chuyển sang chế độ
lưu hình local vào `public/images/`. Xem [hinh-anh-va-thu-vien.md](hinh-anh-va-thu-vien.md).

### Migration & bootstrap

| Biến                    | Ý nghĩa                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL_UNPOOLED` | Direct connection (không qua pooler). `db:migrate` ưu tiên biến này vì DDL không nên đi qua pooler. |
| `CRM_ADMIN_USERNAME`    | Username admin khởi tạo                                                                             |
| `CRM_ADMIN_PASSWORD`    | Mật khẩu admin khởi tạo — đặt mật khẩu mạnh, script sẽ cảnh báo nếu để giá trị mặc định             |
| `CRM_ADMIN_NAME`        | Tên hiển thị                                                                                        |

### Tuỳ chọn / chẩn đoán

| Biến                      | Mặc định | Ý nghĩa                                                 |
| ------------------------- | -------- | ------------------------------------------------------- |
| `PG_MAX_CONNECTIONS`      | `7`      | Giới hạn pool. Serverless nhiều instance → giữ số nhỏ.  |
| `PG_STATEMENT_TIMEOUT_MS` | `15000`  | `statement_timeout` cho mỗi connection                  |
| `SQL_DEBUG`               | tắt      | `=1` bật log query chậm. **Không** log giá trị tham số. |
| `PG_SSL_DISABLE`          | tắt      | `=1` tắt SSL (chỉ khi chạy Postgres local)              |

> Docs chỉ ghi **tên** biến. Không copy giá trị thật từ `.env` vào bất kỳ file nào trong repo.

## Script

| Script                    | Việc nó làm                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run dev`             | Vite dev server (port 8080, `host: true`)                                                |
| `npm run build`           | Build SSR + nitro (`preset: vercel`); `postbuild` chạy `scripts/prune-deploy-backup.mjs` |
| `npm run build:dev`       | Build ở mode `development` để debug output                                               |
| `npm run preview`         | Chạy thử bản đã build                                                                    |
| `npm run lint`            | ESLint toàn repo                                                                         |
| `npm run format`          | Prettier `--write .`                                                                     |
| `npm run db:migrate`      | Áp `src/db/schema-pg.sql` (idempotent)                                                   |
| `npm run db:enable-rls`   | Bật RLS cho mọi bảng schema `public`                                                     |
| `npm run db:seed-admin`   | Tạo/đặt lại admin, hash scrypt                                                           |
| `npm run storage:backup`  | Mirror bucket Supabase → `public/images`                                                 |
| `npm run clean:generated` | Xoá output build/generated                                                               |

`clean-generated.mjs` và `prune-deploy-backup.mjs` đều **từ chối xoá** đường dẫn nằm ngoài
workspace — an toàn khi chạy lại.

## File không nằm trong git

| Đường dẫn                                             | Lý do                                                   |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `.env`, `.env.local`                                  | Bí mật                                                  |
| `public/images/`                                      | Hình runtime, chỉ local; nguồn thật là Supabase Storage |
| `.vercel/`, `data/exports/`, `Stock.xlsx`, `.claude/` | Sản phẩm phụ khi làm việc                               |

Vì `public/images/` không có trong git, sau khi clone máy mới hãy chạy
`npm run storage:backup` nếu muốn có hình để xem offline.
