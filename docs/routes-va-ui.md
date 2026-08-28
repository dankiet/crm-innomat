# Routes & quy ước UI

## Sơ đồ route

File-based routing trong `src/routes/`. Tiền tố `_app.` = **vùng đã đăng nhập**.

| Route                     | File                                               | Vai trò                                                                  |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `/`                       | `index.tsx`                                        | Redirect → `/tong-quan` (có session) hoặc `/login`                       |
| `/login`                  | `login.tsx`                                        | Đăng nhập; đã có session thì redirect vào app                            |
| `/tong-quan`              | `_app.tong-quan.tsx`                               | KPI + thanh pipeline                                                     |
| `/khach-hang`             | `_app.khach-hang.tsx` (`<Outlet/>`) + `.index.tsx` | Danh sách khách hàng                                                     |
| `/khach-hang/$customerId` | `_app.khach-hang.$customerId.tsx`                  | Chi tiết khách: báo giá, đơn, thanh toán, ghi chú, mẫu, đề xuất vật liệu |
| `/co-hoi`                 | `_app.co-hoi.tsx`                                  | Kanban pipeline (dnd-kit)                                                |
| `/bao-gia`                | `_app.bao-gia.tsx`                                 | Báo giá & đơn hàng, chuyển tab bằng `?tab`                               |
| `/cong-no`                | `_app.cong-no.tsx`                                 | Công nợ                                                                  |
| `/ghi-chu`                | `_app.ghi-chu.tsx`                                 | Ghi chú toàn hệ thống                                                    |
| `/san-pham`               | `_app.san-pham.tsx`                                | Catalog sản phẩm, filter & tồn kho                                       |
| `/thu-vien`               | `_app.thu-vien.tsx`                                | Thư viện hình                                                            |
| `/nguoi-dung`             | `_app.nguoi-dung.tsx`                              | **Admin** — quản lý user                                                 |
| `/nhat-ky`                | `_app.nhat-ky.tsx`                                 | **Admin** — nhật ký thao tác                                             |

`_app.tsx` là cổng auth (`beforeLoad` → `fetchMe`, không có session thì redirect `/login`) và là chỗ
render sidebar, topbar, `<Toaster richColors position="top-center" />`.

Hai route admin có thêm `beforeLoad` kiểm tra `context.user.role`. Nhưng đó **chỉ là UX** — endpoint
tương ứng vẫn tự gọi `requireAdmin()`.

## Search param

URL là nơi giữ trạng thái lọc — người dùng copy link là bạn thấy đúng cái họ thấy.

| Route         | Param                                                                                                                                                           | Ghi chú                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `/khach-hang` | `q`                                                                                                                                                             | Tìm kiếm; rỗng thì bỏ khỏi URL                |
| `/co-hoi`     | `q`                                                                                                                                                             |                                               |
| `/bao-gia`    | `q`, `tab`                                                                                                                                                      | `tab` chỉ nhận `quotes` \| `orders`           |
| `/thu-vien`   | `sort`, `cat`, `c`, `v`                                                                                                                                         | `c` = collection id, `v` = index viewer       |
| `/san-pham`   | `nhom`, `q`, `min`, `max`, `priceKind`, `colors`, `surfaces`, `sizes`, `shapes`, `collections`, `supplier`, `materials`, `hot`, `view`, `stockLocation`, `sort` | Các filter nhiều giá trị nhận cả array và CSV |

Mọi route đều có `validateSearch` để chuẩn hoá — giá trị lạ bị bỏ (`undefined`), không throw. Nhờ vậy
URL người dùng sửa tay không làm vỡ trang.

### Hai bất biến phải giữ

**1. `/thu-vien`: `v` chỉ hợp lệ khi có `c`.**

```ts
// Viewer only valid while a collection is open
v: c != null ? parseViewerIndex(search.v) : undefined,
```

**2. `/san-pham`: `nhom` luôn phải có và phải là nhóm đã biết.**

`beforeLoad` redirect về `?nhom=tat-ca` khi `nhom` thiếu **hoặc** không khớp `PRODUCT_GROUPS`.
Nhóm hiện có (`src/lib/product-categories.ts`):

| slug          | Nhãn                                  |
| ------------- | ------------------------------------- |
| `tat-ca`      | Tất Cả Sản Phẩm (`ALL_PRODUCTS_SLUG`) |
| `gach-the`    | Gạch Thẻ                              |
| `gach-mosaic` | Gạch Mosaic                           |
| `gach-bong`   | Gạch Bông                             |
| `gach-op-lat` | Gạch Ốp Lát                           |

**3. `/san-pham`: mặc định kho phải là `KHOQ9` trong loader.**

```ts
// UI defaults the warehouse chip to Kho Q9 when URL has no stockLocation.
// Must mirror that here — otherwise listProducts sums Q9+VP (no JOIN filter).
const stockLocation =
  !deps.stockLocation || deps.stockLocation === "ALL" ? "KHOQ9" : deps.stockLocation;
```

Bỏ dòng này thì tồn kho hiện lên là tổng Q9 + VP trong khi chip UI nói "Kho Q9". Xem
[san-pham-ton-kho-import.md](san-pham-ton-kho-import.md).

## Sidebar

`src/components/AppSidebar.tsx` (~285 dòng). Cấu trúc nav:

```
Workspace   → Tổng quan
Bán hàng    → Khách hàng, Cơ hội, Báo giá & đơn hàng, Ghi chú
Tài chính   → Công nợ
Catalog     → Sản phẩm (+ 4 nhóm con theo ?nhom), Thư viện
Quản trị    → Người dùng, Nhật ký          (chỉ admin)
```

### Bẫy drawer mobile

Drawer mobile đóng lại nhờ một effect theo `[pathname, search]`. Nhưng khi tap vào item **đang
active** thì pathname/search không đổi → effect không chạy → drawer đứng im. Cách xử lý:

```ts
/**
 * True when activating this item cannot change pathname/search (already on the
 * exact target). Those taps must close the drawer themselves — the
 * [pathname, search] close-effect will not fire. Taps that DO navigate must
 * NOT close here: closing in the same click races the router commit and can
 * cancel the navigation (mobile "Sản phẩm" did nothing).
 */
function closesWithoutNavigation(item, pathname, nhom): boolean;
```

Đây là bug đã sửa, đừng "đơn giản hoá" thành đóng drawer ở mọi click — sẽ làm hỏng điều hướng mobile
trở lại.

## History layer — Back đóng overlay

`src/lib/history-layer.ts` (~127 dòng) + `src/hooks/useHistoryLayer.ts`.

Vấn đề: nút Back của Android/browser mặc định rời trang thay vì đóng dialog đang mở. Giải pháp là
một **stack layer** đẩy vào history khi mở overlay, và `popstate` sẽ pop layer trên cùng.

Hai chi tiết bắt buộc (docblock trong file):

1. Gọi **`History.prototype.pushState` native**, không gọi method đã bị TanStack Router monkey-patch.
   Router coi push đó là navigation thật và **remount trang** — state React bị xoá, khiến tap vào sản
   phẩm trên mobile "không làm gì".
2. **Merge `history.state` cũ** và bump `__TSR_index` / `__TSR_key`, để khi user bấm Back thật thì
   popstate handler của TanStack vẫn thấy delta hợp lý.

Khi dispose (đóng dialog bằng nút X), layer chỉ rewind history nếu **vẫn là layer trên cùng**,
**`location.href` vẫn đúng href lúc mở**, và **layer id trong state khớp**. Nguyên tắc:
_"Never rewind across a navigation."_

Dùng overlay mới thì gọi `useHistoryLayer` thay vì tự `pushState`.

## Quy ước UI bắt buộc

Hai luật cứng nằm ở **[AGENTS.md](../AGENTS.md)** — đọc ở đó, docs này chỉ nhắc để không ai bỏ sót:

1. **Nút xoá: không bao giờ `window.confirm()`.** Confirm inline 2 bước (icon thùng rác →
   **"Xóa vĩnh viễn"** đỏ + **"Không xóa"** trung tính), và reset trạng thái confirm mỗi lần dialog
   mở lại. Mẫu chuẩn: `NewCustomerDialog.tsx`, `NewQuoteDialog.tsx`, `CustomerMappingDialog.tsx`,
   `_app.khach-hang.$customerId.tsx`.
2. **Lưu trong dialog tạo/sửa: giữ popup mở + toast thành công**, và **không** gọi
   `router.invalidate()` trong handler lưu (grid phía sau popup sẽ refresh thấy rõ). Chỉ refresh khi
   đóng popup hoặc qua `onCreated`.

Ngoài ra:

- Toast dùng `sonner`, đã cấu hình `richColors` + `position="top-center"` ở `_app.tsx` — gọi
  `toast.success()` / `toast.error()`, không tự dựng Toaster mới.
- Nhãn trạng thái và class màu lấy từ `statusMeta` / `quoteStatusMeta` / `orderStatusMeta`
  (`src/lib/types.ts`), không hardcode chuỗi tiếng Việt trong component.
- Kanban `/co-hoi` chỉ render 5 cột theo `pipelineStages`. Thêm cột thì sửa mảng đó.
- Tailwind 4 với token `oklch` khai báo bằng `@theme inline`; class tuỳ biến của dự án
  (`bg-moss-soft`, `text-moss`…) đến từ đó, không phải palette mặc định của Tailwind.

## Dữ liệu trên client

- **Loader của route** cho dữ liệu render lần đầu (SSR).
- **React Query** cho thao tác người dùng và dữ liệu phụ.
- Sau mutation: `router.invalidate()` hoặc invalidate query — trừ trường hợp dialog đang mở, theo
  luật số 2 phía trên.
- `useLocalStorageState` dùng cho tuỳ chọn hiển thị của từng người (VD `ExportQuoteDialog` nhớ tên
  công trình ở khoá `quote-export-project-site`). Không dùng localStorage cho dữ liệu nghiệp vụ.
