# Kiến trúc & tech stack

## Tech stack

| Lớp           | Công nghệ                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Framework     | TanStack Start 1.168 (SSR) + TanStack React Router 1.170 (file-based)                                                         |
| UI            | React 19, Tailwind CSS 4 (`@theme inline`, token oklch), Radix Dialog/Popover, lucide-react, sonner (toast), dnd-kit (Kanban) |
| Data (client) | TanStack React Query 5 + loader của router                                                                                    |
| RPC           | `createServerFn` — toàn bộ ở `src/api/functions.ts`                                                                           |
| DB            | PostgreSQL (Supabase) qua `pg` Pool, facade `src/db/driver.ts`                                                                |
| Storage       | Supabase Storage (bucket public) hoặc `public/images` khi chạy local                                                          |
| Ảnh           | `sharp` (server) / canvas + `createImageBitmap` (client) → WebP                                                               |
| Excel         | `xlsx` (SheetJS)                                                                                                              |
| Build         | Vite 8, `lightningcss`, nitro 3 beta (`preset: "vercel"`), TypeScript 5.8                                                     |

## Sơ đồ luồng

```
Browser
  │  navigate  →  TanStack Router (file-based, src/routes/*)
  │                 │ beforeLoad: cổng auth (_app.tsx → fetchMe)
  │                 │ loader:     gọi serverFn để lấy dữ liệu SSR
  │  action    →  createServerFn (src/api/functions.ts)
  │                 │ requestMiddleware: errorMiddleware + csrfMiddleware
  │                 │ await import("../db/*.server")   ← chỉ trong handler
  │                 │ requireUser / requireAdmin / assertCanAccessCustomer
  │                 ▼
  │              src/db/*.server.ts  (nghiệp vụ + SQL)
  │                 ▼
  │              src/db/driver.ts  →  pg Pool  →  PostgreSQL (Supabase)
  │                                   └→ Supabase Storage (hình)
  └── SSR HTML  ←  src/server.ts (serve /public, chuẩn hoá lỗi 500)
```

## Ba điểm vào

### `src/server.ts` (~141 dòng)

Wrapper quanh SSR handler, làm hai việc:

1. **Serve file tĩnh trong `/public`**, kể cả đường dẫn lồng nhau như `/images/<hash>.webp`,
   với MIME map và **guard chống path traversal**. Cần thiết vì TanStack Start SSR trả về
   HTML 404 của SPA cho các đường dẫn public lồng nhau.
2. **Chuẩn hoá lỗi 500.** h3 nuốt throw trong handler thành `Response` 500 với body
   `{"unhandled":true,"message":"HTTPError"}` — `try/catch` không bao giờ bắt được. Nên mọi
   response ≥ 500 được soi lại, log lỗi thật (`consumeLastCapturedError()`), rồi trả về trang
   lỗi HTML tự render.

### `src/start.ts` (26 dòng)

```ts
createStart(() => ({ requestMiddleware: [errorMiddleware, csrfMiddleware] }));
// csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" })
```

CSRF chỉ áp cho serverFn, không áp cho request tài liệu.

### `src/routes/__root.tsx` + `_app.tsx`

`__root.tsx` là shell (html/head/scripts). `_app.tsx` là **cổng xác thực**: `beforeLoad` gọi
`fetchMe`, không có session thì `redirect({ to: "/login" })`; nếu có thì đưa `{ user }` vào
router context và render sidebar + topbar + `<Toaster richColors position="top-center" />`.
Mọi route `_app.*` đều nằm sau cổng này.

## Quy ước phân lớp

- **`src/api/functions.ts`** là _ranh giới_ client ↔ server. Client chỉ gọi các hàm ở đây.
- **`src/db/*.server.ts`** giữ SQL và nghiệp vụ; **không** được import ở phía client.
- Mỗi handler `createServerFn` dùng **dynamic `await import()`** để nạp module server. Nhờ vậy
  code server không rơi vào bundle client. Đây là quy ước áp dụng nhất quán cho cả ~85 endpoint.
- Vite bật **import protection**: import `**/server/**` hoặc `server-only` từ client là **lỗi build**
  (`importProtection: { behavior: "error" }`).

## Build chain

`vite.config.ts` — thứ tự plugin có ý nghĩa, đừng đổi:

```
devtools (chỉ dev) → tailwindcss() → tsConfigPaths()
  → tanstackStart({ server: { entry: "server" }, importProtection: {...} })
  → nitro({ preset: "vercel" })   (chỉ khi build)
  → viteReact()
```

Thêm: `css: { transformer: "lightningcss" }`, alias `@` → `./src`, dedupe `react`/`react-query`,
dev server port **8080** với `host: true`.

`vercel.json`: `{ "framework": "nitro", "regions": ["sin1"] }`.

## Kích thước để định hướng

`src/` khoảng 26.500 dòng TS/TSX. Bốn file lớn nhất đáng biết:

| File                                     | Dòng   | Vai trò                                                  |
| ---------------------------------------- | ------ | -------------------------------------------------------- |
| `src/db/crm.server.ts`                   | ~2.554 | Lớp nghiệp vụ chính (khách hàng, báo giá, đơn, sản phẩm) |
| `src/api/functions.ts`                   | ~1.581 | Toàn bộ RPC                                              |
| `src/db/product-import-export.server.ts` | ~751   | Import/export Excel sản phẩm                             |
| `src/db/export-quote.server.ts`          | ~499   | Xuất báo giá ra HTML in được                             |
