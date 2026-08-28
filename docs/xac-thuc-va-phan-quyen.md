# Xác thực & phân quyền

Toàn bộ logic ở **`src/db/auth.server.ts`** (~227 dòng). Cổng chặn ở tầng route là
`src/routes/_app.tsx`; cổng chặn ở tầng dữ liệu là `requireUser()` / `requireAdmin()` /
`assertCanAccessCustomer()` bên trong từng handler serverFn.

## Mật khẩu

- Hash bằng **scrypt** (`node:crypto`), keylen 64, salt random 16 byte.
- Lưu dạng `"<salt-hex>:<hash-hex>"` trong `users.password_hash`.
- So sánh bằng **`timingSafeEqual`** (chống timing attack), không dùng `===`.
- Ràng buộc: username `^[a-z0-9._-]{3,32}$` (tự lowercase + trim), mật khẩu **8–128 ký tự**,
  role chỉ `admin` | `user`.

## Session

Session là bản ghi trong bảng `sessions`, id ngẫu nhiên chính là giá trị cookie.

| Thuộc tính cookie | Giá trị                                |
| ----------------- | -------------------------------------- |
| Tên               | `crm_session`                          |
| `httpOnly`        | `true`                                 |
| `sameSite`        | `lax`                                  |
| `secure`          | `true` khi `NODE_ENV === "production"` |
| `path`            | `/`                                    |
| `maxAge`          | 14 ngày (`SESSION_DAYS`)               |

`getCurrentUser()` dùng **một câu CTE duy nhất** làm cả ba việc: xác thực session
(`expires_at >= now` **và** `users.is_active = 1`), lấy thông tin user, và cập nhật
`last_seen_at` — nhưng chỉ khi giá trị cũ đã quá **15 phút**. Nhờ vậy mỗi request không sinh
thêm một lượt UPDATE.

Hệ quả cần biết: **vô hiệu hoá user (`is_active = 0`) có hiệu lực ngay** ở request kế tiếp,
không cần chờ session hết hạn. `deleteSessionsForUser(userId)` dùng khi đổi mật khẩu / khoá
tài khoản để đá mọi thiết bị.

Đăng nhập sai luôn trả về đúng một thông báo `"Sai tên đăng nhập hoặc mật khẩu"` cho cả hai
trường hợp không có user và sai mật khẩu — không tiết lộ username nào tồn tại.

## Hai vai

| Role    | Phạm vi                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `admin` | Thấy & sửa mọi dữ liệu; vào được `/nguoi-dung` và `/nhat-ky`; được phép import/export, sửa catalog sản phẩm, đồng bộ mã nội bộ |
| `user`  | Chỉ thấy khách hàng mình sở hữu (`customers.owner_id = user.id`) và mọi thứ dẫn xuất từ đó                                     |

## Owner-scoping

Gốc là cột **`customers.owner_id`**. Hai công cụ:

```ts
ownerFilter(user); // admin → null (không filter), user → user.id
await assertCanAccessCustomer(user, id); // admin → pass; user → so owner_id, sai thì throw
```

- `ownerFilter()` dùng ở **truy vấn danh sách** — thêm điều kiện `owner_id = ?` khi không phải admin.
- `assertCanAccessCustomer()` dùng ở **mọi thao tác trên một khách cụ thể**, kể cả đọc chi tiết,
  và cả các nghiệp vụ dẫn xuất: báo giá, đơn hàng, thanh toán, ghi chú, đề xuất vật liệu, xuất HTML.
  Ví dụ `exportQuotePrintFn` chạy chuỗi `requireUser → getQuote → assertCanAccessCustomer → export → writeAudit`.

Quy tắc khi viết endpoint mới: **nếu tham số có `customerId` (hoặc suy ra được customer từ
`quoteId`/`orderId`/`mappingId`) thì phải gọi `assertCanAccessCustomer`.** Chỉ `requireUser()`
là chưa đủ — nó chỉ chứng minh có đăng nhập, không chứng minh có quyền trên bản ghi đó.

## Lỗi & mã trạng thái

`AuthError` mang sẵn `status`:

| Tình huống                        | Status |
| --------------------------------- | ------ |
| Chưa đăng nhập (`requireUser`)    | 401    |
| Không phải admin (`requireAdmin`) | 403    |
| Không sở hữu khách hàng           | 403    |
| Khách hàng không tồn tại          | 404    |

## CSRF

`src/start.ts`:

```ts
createStart(() => ({ requestMiddleware: [errorMiddleware, csrfMiddleware] }));
// csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" })
```

CSRF check **chỉ áp cho serverFn**, không áp cho request tài liệu (nếu áp thì SSR load trang đầu
sẽ vỡ). Vì mọi mutation đều đi qua serverFn nên vùng cần bảo vệ được phủ kín.

## Cổng route

`src/routes/_app.tsx` có `beforeLoad` gọi `fetchMe`; không có session thì
`redirect({ to: "/login" })`. User hợp lệ được đưa vào router context (`{ user }`) để UI ẩn/hiện
menu theo role.

Ẩn menu **không phải** là kiểm soát truy cập — mọi endpoint admin vẫn tự gọi `requireAdmin()`.
Đừng bỏ bước đó vì "UI đã ẩn rồi".

## Tạo tài khoản đầu tiên

```bash
npm run db:seed-admin      # đọc CRM_ADMIN_USERNAME / CRM_ADMIN_PASSWORD / CRM_ADMIN_NAME
```

Script hash bằng scrypt và **cảnh báo nếu mật khẩu vẫn là giá trị mặc định**. Sau khi có admin,
tạo user tiếp theo qua UI `/nguoi-dung`.

## Liên quan

- Bảo vệ ở tầng DB (RLS, không policy cho `anon`): [co-so-du-lieu.md](co-so-du-lieu.md)
- Nhật ký thao tác: `writeAudit()` trong `src/db/audit.server.ts`, xem [api-server-functions.md](api-server-functions.md)
