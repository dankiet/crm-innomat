/**
 * Entry-point DB server module.
 * Tất cả truy cập dữ liệu production đi qua PostgreSQL (async) từ `./driver`.
 * Migration/schema được quản lý bằng `npm run db:migrate` (không chạy ở runtime).
 */
export { getDb, type SqlValue } from "./driver";
