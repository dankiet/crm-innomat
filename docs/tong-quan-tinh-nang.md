# Tổng quan tính năng

Bản đồ tính năng của CRM Innomat. Mỗi tính năng gắn với **route → RPC → bảng DB → file chính**,
để từ một yêu cầu bất kỳ có thể nhảy thẳng tới đúng chỗ trong code.

Đây là **điểm vào**. Chi tiết từng mảng nằm ở docs chuyên đề — cột "Chi tiết" trỏ tới đó.

## 1. Bản đồ nhanh

| #   | Khu vực    | Tính năng                                          | Route                        | Trạng thái    | Chi tiết                                                                 |
| --- | ---------- | -------------------------------------------------- | ---------------------------- | ------------- | ------------------------------------------------------------------------ |
| 1   | Nền tảng   | Đăng nhập, session, phân quyền 2 vai               | `/login`, `/auth/callback`   | Đang dùng     | [xac-thuc-va-phan-quyen](xac-thuc-va-phan-quyen.md)                      |
| 2   | Nền tảng   | Dashboard KPI + thanh pipeline                     | `/tong-quan`                 | Đang dùng     | —                                                                        |
| 3   | Bán hàng   | Khách hàng — danh sách + hồ sơ                     | `/khach-hang`                | Đang dùng     | [nghiep-vu](nghiep-vu.md)                                                |
| 4   | Bán hàng   | Cơ hội — Kanban pipeline (dnd-kit)                 | `/co-hoi`                    | Đang dùng     | [nghiep-vu](nghiep-vu.md)                                                |
| 5   | Bán hàng   | Báo giá & đơn hàng                                 | `/bao-gia`                   | Đang dùng     | [nghiep-vu](nghiep-vu.md)                                                |
| 6   | Bán hàng   | Công nợ & thanh toán                               | `/cong-no`                   | Đang dùng     | [nghiep-vu](nghiep-vu.md)                                                |
| 7   | Bán hàng   | Ghi chú toàn hệ thống                              | `/ghi-chu`                   | Đang dùng     | —                                                                        |
| 8   | Catalog    | Sản phẩm + tồn kho + import/export Excel           | `/san-pham`                  | Đang dùng     | [san-pham-ton-kho-import](san-pham-ton-kho-import.md)                    |
| 9   | Ảnh        | Lưu trữ ảnh — kho ảnh, thẻ phòng, tuyển chọn       | `/luu-tru`                   | Đang dùng     | [hinh-anh-va-thu-vien](hinh-anh-va-thu-vien.md)                          |
| 10  | Landing    | Trang LP công khai (khách vãng lai)                | `/lp/$slug`                  | **Một phần**  | §9                                                                       |
| 11  | Landing    | Hộp thư Lead                                       | `/leads`                     | Đang dùng     | §10                                                                      |
| 12  | Landing    | Lookbook / Concept                                 | `/khong-gian`                | Đang dùng     | §11                                                                      |
| 13  | Quản trị   | Người dùng (**admin**)                             | `/nguoi-dung`                | Đang dùng     | [xac-thuc-va-phan-quyen](xac-thuc-va-phan-quyen.md)                      |
| 14  | Quản trị   | Nhật ký thao tác (**admin**)                       | `/nhat-ky`                   | Đang dùng     | [co-so-du-lieu](co-so-du-lieu.md)                                        |
| 15  | Landing    | Shortlink chia sẻ (302 + UTM đóng băng)            | `/s/$slug`                   | Đang dùng     | §9b                                                                      |
| 16  | Landing    | Quản lý Shortlink                                  | `/shortlink`                 | Đang dùng     | §9b                                                                      |

**Cột "Trạng thái"** suy ra từ dữ liệu thật trong DB, không phải phỏng đoán:

- **Đang dùng** — tính năng có dữ liệu thật (đa số). Bảng số dòng từng bảng:
  [audit-2026-09-19](audit-2026-09-19.md) §G0b.
- **Một phần** — chỉ `/lp/$slug`: trang vẫn chạy **song song** mock data
  (`src/data/mockData.ts`, dùng bởi `src/components/landing/*`) dù catalog thật đã có RPC
  (`fetchPublicCatalogFn`, `fetchLpMaterialsFn`). Cần chốt mock là fallback có chủ đích hay di sản
  (audit §E3).
- **Chưa từng chạy** — liên kết **đề xuất vật liệu ↔ báo giá** (`customer_mapping_quote_links`,
  nằm trong tính năng Đề xuất vật liệu ở hồ sơ khách hàng, §3): bảng **0 dòng**, nhưng code ghi
  (`crm.server.ts`) và đọc (`crm.server.ts`, `api/functions.ts`) còn sống → đây là **tính năng
  chưa từng chạy ở production**, không phải code chết. Xem
  [audit-2026-09-19](audit-2026-09-19.md) §G3.

**Toàn bộ 28 bảng đều đang dùng** — `public` có đúng 28 bảng, khớp 100% với `schema-pg.sql`,
**0 bảng mồ côi** (bằng chứng: [audit-2026-09-19](audit-2026-09-19.md) §G0; đã gỡ 2 bảng gallery
và `image_assets` ngày 2026-09-24, rồi thêm lại `media_assets`, `mapping_media_usages`,
`landing_page_media_usages` ngày 2026-09-25 theo Option 2, thêm `short_links` ngày 2026-09-30).
Không có bảng nào nên xoá.

Chỉ các route có tiền tố `_app.*` nằm sau cổng auth (`_app.tsx`). Ngoài ra có 5 route **công
khai**: `/` (trang chủ landing — cũng render `ArchitectLanding`, xem §1 cột Trạng thái),
`/lp/$slug` (biến thể landing theo slug), `/s/$slug` (shortlink chia sẻ), `/login`,
`/auth/callback`. Route quản trị shortlink `/shortlink` nằm **trong** `_app.*` (cần đăng nhập).

## 2. Nền tảng

### Đăng nhập & phân quyền

- `scrypt` hash mật khẩu, session lưu ở bảng `sessions`, cookie `HttpOnly`.
- **Hai vai**: `admin` và `user` (`role CHECK (role IN ('admin','user'))`). Route admin có
  `beforeLoad` chặn ở client, nhưng đó chỉ là UX — endpoint tương ứng vẫn tự gọi `requireAdmin()`.
- **Owner-scoping**: vai `user` chỉ thấy khách hàng mình phụ trách (`assertCanAccessCustomer`).
- **CSRF**: `csrfMiddleware` chỉ áp cho `serverFn` (`src/start.ts`), không áp cho request tài liệu.

### Dashboard `/tong-quan`

KPI + thanh pipeline. RPC nhóm `Dashboard` trong `src/api/functions.ts`.

## 3. Khách hàng

| Màn hình  | Route                         | Nội dung                                                                 |
| --------- | ----------------------------- | ------------------------------------------------------------------------ |
| Danh sách | `/khach-hang`                 | Bảng khách hàng, tìm kiếm `?q`                                           |
| Hồ sơ     | `/khach-hang/$customerId`     | Báo giá, đơn, thanh toán, ghi chú, mẫu sản phẩm, đề xuất vật liệu (DXVL) |

Trạng thái khách hàng (`CustomerStatus`) và pipeline: xem [nghiep-vu](nghiep-vu.md).

## 4. Cơ hội — Kanban

`/co-hoi` — bảng Kanban kéo thả (`dnd-kit`) theo trạng thái pipeline. Kéo thẻ = đổi trạng thái
khách hàng.

## 5. Báo giá & đơn hàng

`/bao-gia` — hai tab qua `?tab=quotes|orders`:

- **Báo giá**: dòng hàng, chiết khấu, VAT 8%, xuất HTML in được.
- **Đơn hàng**: sinh từ báo giá, mã chứng từ riêng.
- Mã chứng từ, trạng thái, công thức giá: xem [nghiep-vu](nghiep-vu.md).

## 6. Công nợ

`/cong-no` — công nợ & thanh toán (`payments`), đối chiếu theo khách hàng / đơn.

## 7. Ghi chú

`/ghi-chu` — ghi chú toàn hệ thống (`notes`), gắn được với khách hàng.

## 8. Sản phẩm & tồn kho — `/san-pham`

Màn hình lớn nhất của CRM (`_app.san-pham.tsx`, ~2.300 dòng).

**Bộ lọc** (URL là nguồn sự thật — copy link là thấy đúng cái người gửi thấy):

| Nhóm         | Param        | Ghi chú                          |
| ------------ | ------------ | -------------------------------- |
| Nhóm SP      | `nhom`       | slug nhóm ở sidebar              |
| Tìm kiếm     | `q`          |                                  |
| Tông màu     | `colors`     | nhiều giá trị, nhận cả array/CSV |
| Bề mặt       | `surfaces`   |                                  |
| Kích thước   | `sizes`      |                                  |
| Kiểu dáng    | `shapes`     |                                  |
| Hiệu ứng vân | `textures`   |                                  |
| Bộ sưu tập   | `collections`|                                  |
| Nhà cung cấp | `supplier`   |                                  |
| Nổi bật      | `hot`        |                                  |
| Kho          | `stockLocation` | `KHOBC` / kho VP              |
| Hiển thị web | `web`        | `all` / `public` / `hidden`      |
| Kiểu xem     | `view`       | `grid` / `list`                  |
| Sắp xếp      | `sort`       | qua `SortMenu`                   |

**Chức năng**: lưới/danh sách, tồn kho theo kho, sửa nhanh nhiều dòng (`BulkEditFieldDialog`),
tạo/sửa sản phẩm, quản lý ảnh sản phẩm, import/export Excel, import tồn kho MISA.

Chi tiết ba tầng dữ liệu, bẫy kho, whitelist field: [san-pham-ton-kho-import](san-pham-ton-kho-import.md).

## 9. Landing page công khai — `/lp/$slug`

Trang public cho khách vãng lai (không cần đăng nhập), nội dung lấy từ DB.

| RPC (`src/api/lp.ts`)                                          | Việc                                        |
| -------------------------------------------------------------- | ------------------------------------------- |
| `fetchLpMaterialsFn`, `fetchPublicCatalogFn`                    | Vật liệu + catalog công khai                 |
| `fetchPublicSpaceCollectionsFn`, `fetchCrmConceptImagesFn`      | Bộ sưu tập không gian, ảnh Concept          |
| `fetchLpHeroImageFn` / `setLpHeroImageFn`                       | Ảnh hero 1 (section 1)                      |
| `fetchLpHeroImage2Fn` / `setLpHeroImage2Fn`                     | Ảnh hero 2 (section 4)                      |
| `submitLpLeadFn`                                                | Nhận form liên hệ → `lp_leads`              |
| `startBriefUploadFn` / `verifyBriefUploadFn`                    | Cấp signed URL + xác thực file brief (magic bytes) |
| `getBriefAttachmentUrlFn` / `fetchLeadAttachmentsFn`            | Signed URL tải file (TTL 300s) + danh sách file của lead |
| `deleteLeadAttachmentFn` / `fetchAttachmentStatsFn`             | Xoá file thủ công + thống kê dung lượng      |
| `fetchFeaturedSlotsFn` / `setFeaturedSlotFn`                    | 12 vị trí "Tuyển chọn Trang chủ"            |

**Bảng**: `lp_settings` (key/value), `lp_leads`, `lp_lead_attachments` (file khách gửi),
`lp_rate_limits` (chống spam form), `public_users` + `public_sessions` (danh tính khách vãng lai).

**File đính kèm brief** đi đường riêng: browser PUT thẳng lên bucket **riêng tư**
(`SUPABASE_BRIEF_BUCKET`, mặc định `crm-brief-files`) qua signed URL — không qua server app
(trần body Vercel thấp hơn 10MB), và không nằm trong bucket ảnh public. Định dạng chốt bằng
magic bytes ở server; chỉ nhận PDF/PNG/JPEG/WEBP. Row mồ côi quá 24h bị
`npm run lp:attachments-sweep` dọn.

Ảnh dùng cho LP được bật/tắt bằng `toggleProductPublicFn` / `bulkSetProductsPublicFn` /
`setConceptImagePublicFn` — tức là từ CRM chứ không sửa trực tiếp trên LP.

**Ảnh xem trước khi chia sẻ link** (`/og-image`) — LP khai `og:image` trỏ về route này, không trỏ
thẳng vào hero. Lý do: hero là `.webp` mà bộ thu thập OG của Facebook không nhận WebP. Route tải
hero, cắt 1200×630, xuất JPEG; hero lỗi thì rơi về logo em bán gạch trên nền thương hiệu. Route
nằm trong `src/server.ts` (entry), **không** phải file route. Chi tiết + cách ép Facebook quét
lại: [routes-va-ui.md](routes-va-ui.md).

### Đồng thuận cookie & Google Tag Manager

GTM (`GTM-P4SQ7HBB`) **nạp cho MỌI khách trên landing** — kể cả người bấm "Từ chối". Lựa chọn
của khách chỉ quyết định (a) thanh hỏi còn hiện hay không, và (b) cờ đẩy vào `dataLayer`.

> **Đánh đổi có chủ đích.** Bản trước chặn ở server: chưa đồng ý thì không nạp GTM. Nhưng thanh
> là loại **không chặn** (khách cuộn qua, phần lớn không bấm), nên nhóm đông nhất không có số
> liệu nào — mất tracking đúng chỗ cần nhất. Giờ ưu tiên có số liệu; khách từ chối được ghi
> nhận bằng cờ để lọc về sau.
>
> ⚠️ Hệ quả: đây là mô hình **tự khai báo rồi loại trừ**, KHÔNG phải chặn theo đồng thuận.
> Cookie theo dõi được đặt TRƯỚC khi khách chọn. Nếu sau này cần chặt hơn (Nghị định 13/2023,
> hoặc có khách EU), phải quay lại gate ở `lpHead()` và chấp nhận mất số liệu nhóm không bấm.

- Cookie `ebg_gtm_consent` (`granted` | `denied`, `Max-Age` 1 năm, `SameSite=Lax`) là nguồn
  sự thật. Giá trị lạ ⇒ coi như chưa chọn.
- `gtmHeadSnippet()` (`src/lib/lp-consent.ts`) đẩy cờ `ebg_consent` (`granted` / `denied` /
  `unknown`) vào `dataLayer` **trước** khi nạp container — nếu đẩy sau thì trigger đã bắn xong
  trước khi GTM biết khách từ chối, mất khả năng lọc.
- Thẻ `<noscript>` của GTM nằm ở `RootShell` (`src/routes/__root.tsx`), chỉ trong phạm vi landing
  (`/` hoặc `/lp/*`) — route CRM không dính GTM.
- `ConsentBanner` (`src/components/landing/ConsentBanner.tsx`) là **thanh neo đáy, KHÔNG chặn**
  (`z-index: 95`): khách vẫn cuộn và dùng trang bình thường, thanh chỉ chiếm một dải ở đáy. Hiện
  khi cookie chưa có; nút "Đổi lựa chọn cookie" ở footer xoá cookie để thanh trở lại.

**Trong GTM cần dựng:** biến đọc `ebg_consent` + audience/trigger lọc `denied` cho các tag đo
lường. Không có bước này thì "từ chối" không có tác dụng gì.

- Snapshot server của `useSyncExternalStore` là chính `readConsent`, tức server đọc cookie của
  request y như `lpHead()` đã đọc để ghi cờ vào snippet — khách đã chọn rồi không thấy thanh loé
  lên ở lần render đầu.
- Khách tắt JS: `<noscript><style>` ẩn thanh đi vì hai nút sẽ không làm gì được (GTM `noscript`
  vẫn chạy — đó là iframe, không cần JS của ta).
- Nội dung cố ý KHÔNG nêu tên công cụ thu thập (Google Tag Manager) — chỉ nói mục đích. Về mặt
  kỹ thuật, sự kiện đi qua `dataLayer` rồi GTM mới chuyển tiếp sang cả GA4 lẫn Meta Pixel, nên
  nêu đích danh một cái là vừa thừa vừa dễ sai.
- Component dùng `<div>` chứ không `<aside>`: `src/styles.css` (CSS app CRM, cũng nạp ở landing)
  có `aside{…!important}` + `aside button{color:…!important}` cho sidebar, đè mất màu nút. Đổi thẻ
  là sửa gốc, không phải thêm `!important` ngược lại.
- `trackEvent` (`src/lib/lp-tracking.ts`) **không** tự chặn theo cờ đồng thuận — sự kiện bắn cho
  mọi khách, việc lọc nằm ở audience trong GTM (đúng theo mô hình tự khai báo rồi loại trừ).
- `trackEvent` bắn theo **HAI đường**: gọi thẳng `window.fbq`/`window.gtag` (đường chính, sự kiện
  tới Meta/GA4 ngay, KHÔNG phụ thuộc cấu hình GTM) **và** đẩy vào `dataLayer` (đường phụ, cho GTM
  lọc consent về sau).
  Lịch sử để lại: bản đầu chỉ gọi thẳng (mất sự kiện khi GTM chưa kịp khởi động vì điều kiện
  `typeof === "function"` sai); bản sau chỉ đẩy `dataLayer` — nhưng container KHÔNG có tag Custom
  Event cho `AddToCart`/`ViewContent`/`Lead` (trước giờ không cần) nên sự kiện kẹt, tracking chết
  hẳn. Giữ cả hai đường mới đúng.
- **Một sự kiện nội bộ → hai tên xuất.** Meta và GA4 có bộ tên chuẩn khác nhau, và báo cáo dựng
  sẵn của mỗi bên chỉ hoạt động khi đúng tên của nó. Gửi `AddToCart` cho GA4 thì GA4 vẫn nhận
  nhưng coi là **custom event**, không vào funnel thương mại điện tử.

  | nội bộ | Meta | GA4 |
  | --- | --- | --- |
  | `ViewContent` | `ViewContent` | `view_item` |
  | `AddToCart` | `AddToCart` | `add_to_cart` |
  | `Lead` | `Lead` | `generate_lead` |

  Tham số cũng dịch: Meta dùng `content_ids` / `content_name` / `content_category` /
  `content_type`; GA4 dùng `items: [{ item_id, item_name, item_category }]`. Caller truyền dữ
  liệu TRUNG LẬP (`itemId`/`itemName`/`itemCategory`), `trackEvent` lo phần dịch — thêm nền tảng
  mới chỉ sửa một chỗ.
- ⚠️ **Đếm trùng — hai nguồn cần tắt ở phía nền tảng:**
  - **Meta Automatic Events**: Meta dùng AI tự đoán hành động từ nút bấm. Đang BẬT mà code đã
    gửi thủ công → Meta nhận 2 lần. Tắt ở Events Manager.
  - **GTM Custom Event tag** khớp `event`: nếu dựng thêm tag trong GTM cho cùng tên, sự kiện
    cũng gửi 2 lần (một từ code, một từ GTM).
  - GA4 Enhanced Measurement thì **KHÔNG** gây trùng: nó chỉ bắt cuộn / bấm link ngoài / tìm
    kiếm / video / tải file — không đụng `view_item`/`add_to_cart`.
- `ViewContent` bắn khi khách **mở chi tiết một mã gạch** (`handleOpenMaterialModal`).
- **KHÔNG** bắn `ViewContent` khi tải trang chủ. Trước đây nó bắn lúc mount, trùng chức năng với
  `PageView` mà tag custom HTML trong GTM đã bắn — Meta thấy 2 lượt xem cho 1 khách. Với Meta,
  `PageView` mới là sự kiện đúng cho "vừa xem trang"; `ViewContent` dành cho xem một nội dung
  cụ thể. Bắn sai chỗ làm nhiễu dữ liệu thuật toán quảng cáo.

> Khác với `consent_marketing` trên form lead (`lp_leads`) — đó là đồng ý **nhận email
> marketing**, không liên quan tới cookie theo dõi.

## 9b. Shortlink chia sẻ — `/s/$slug`

Link ngắn cho ads / caption / comment / bio. Vấn đề gốc: link dài kèm UTM dán vào caption bị
coi là "quảng cáo" và làm giảm reach, mà người đăng cũng hay quên/gõ sai UTM → lead về
`lp_leads` với cột UTM rỗng. Shortlink đóng băng UTM theo shortcode.

| RPC (`src/api/lp.ts`) | Việc |
| --- | --- |
| `resolveShortLinkFn` | **Công khai** — slug → URL tuyệt đối (302). Dùng bởi route `/s/$slug` |
| `listShortLinksFn` | Liệt kê shortlink (`requireUser`) |
| `createShortLinkFn` / `updateShortLinkFn` / `deleteShortLinkFn` | CRUD (`requireUser` + audit) |

**Bảng**: `short_links` — `UNIQUE(slug)`, slug khớp `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`.

Bốn bất biến (đọc `src/lib/short-link.ts` trước khi sửa):

1. **302, không 301.** Đây là link tracking theo chiến dịch — UTM/đích còn sửa. 301 bị browser
   và FB link-scanner cache vĩnh viễn nên sửa xong người đã bấm trước đó vẫn đi đích cũ.
2. **Query đến được MERGE, không bỏ.** Meta tự gắn `fbclid` khi khách bấm quảng cáo; bỏ nó là
   mất attribution. Nhưng **UTM lưu sẵn luôn thắng** khi trùng key — không ai đổi được
   `utm_campaign` bằng cách sửa URL.
3. **Chỉ path nội bộ.** `isSafeTargetPath` chặn `https://…`, `//host`, backslash — nếu không thì
   `target_path` do người dùng CRM đặt thành **open-redirect** (lấy domain mình làm bàn đạp phishing).
4. **Đếm click best-effort.** Lỗi đếm không được làm hỏng redirect.

Có UI quản trị tại `/shortlink` (nhóm "Landing Page" ở sidebar): danh sách link kèm số click, nút
Copy / Mở / Sửa, dialog tạo-sửa có preview URL sống, xoá 2 bước. Tạo/sửa/xoá vẫn qua RPC như
trên — UI chỉ là lớp gọi.

## 10. Hộp thư Lead — `/leads`

`/leads` — lead đổ về từ form landing (`lp_leads`: tên, điện thoại, email, nhu cầu, shortlist mã,
UTM).

- `setLpLeadStatusFn` — đổi trạng thái xử lý.
- `convertLpLeadFn` — **chuyển lead thành khách hàng** trong CRM.
- `deleteLpLeadFn` — xoá.

**File khách đính kèm** hiện thành nút tải ngay trong thẻ lead (nhãn "File đính kèm"). Bấm nút
mới xin signed URL TTL 300s — link không nhúng sẵn vào DOM vì sẽ hết hạn, và token không nằm
trong HTML. Cạnh mỗi file có nút thùng rác để **xoá thủ công** (xác nhận hai bước inline);
đầu trang hiện tổng số file + dung lượng. Lead cũ (trước khi có tính năng) vẫn hiện dòng
"Khách nói sẽ gửi file: …" vì khi đó chỉ lưu được tên.

## 11. Lookbook / Concept — `/khong-gian` (redirect)

> `/khong-gian` **không còn là workspace riêng** — `beforeLoad` redirect về
> `/luu-tru?tab=concept` (giữ `room`, `q`, `category`). Toàn bộ workflow Concept/Lookbook
> sống trong **Media Workspace `/luu-tru`**: card Concept có mô tả (AI-generated), bật/ẩn
> LD-page, hạ về thường (consequence rõ), và nút "nơi đang dùng".

### Lookbook (context của media)

- `listCrmConceptImages` — danh sách cho CRM.
- `setConceptImagePublic` — bật/tắt Lookbook visibility (per image).
- `updateConceptDescription` — mô tả (AI description).
- `demoteConceptImage` — hạ concept → ảnh thường (rời khỏi Lookbook).

## 11b. Nơi đang dùng (Media Workspace)

Từ 2026-09-25 theo **Option 2 (1 file = 1 MediaAsset)**:
`/luu-tru` trả lời "MediaAsset này dùng ở đâu?" qua tầng registry
(`media_assets` + `mapping_media_usages` + `landing_page_media_usages` +
`product_images.media_asset_id`). Reference Resolver (`image-references.server.ts`) vẫn giữ vai
trò detail cho dialog (5 nguồn `path`) nhưng **đọc chính là `listMediaAssets`**.

Card hiển thị chip tổng hợp trực tiếp từ `usage_groups` (Product/Lookbook/Tuyển chọn/Hero/
Mapping) + `status` (`used`·`unused`). Click → **AssetUsageDialog** liệt kê nhóm usage
và references chi tiết theo role + href khi có route.

Xoá asset (`deleteMediaAssetFn`) là **xoá vĩnh viễn**: gỡ mọi liên kết (xoá row `product_images`,
clear ref trong Đề xuất/Hero), xoá row `media_assets`, **và xoá file trong Supabase Storage** —
chỉ giữ file khi còn bảng khác trỏ tới cùng storage key (lưới an toàn chống *drift*; trạng thái đã
verify thì không chạy). Nếu còn usage, dialog nhắc
"Xem N nơi đang dùng trước khi xóa" (xem
[hinh-anh-va-thu-vien](hinh-anh-va-thu-vien.md) §"Kho ảnh asset-centric").

**Đồng bộ Storage ↔ DB** — `npm run media:sync` (chỉ đọc mặc định; `--apply` mới ghi). Xoá ảnh
thời kỳ đầu (trước `86cf51e`) chỉ gỡ liên kết DB mà không xoá file → bucket tồn đọng file mồ côi;
chiều ngược lại, ref trong DB có thể thiếu row `media_assets`. Script reconcile cả hai và xoá file
rác, keep-set là hợp của `media_assets` + 5 nguồn ref nên không bao giờ xoá oan ảnh còn dùng.
Đã chạy 2026-09-26: bucket khớp tuyệt đối **3.558 object = 3.558 asset** (xoá 80 file mồ côi,
14,8 MB; `storage:backup` chạy trước) — xem
[hinh-anh-va-thu-vien](hinh-anh-va-thu-vien.md) §Đồng bộ.

## 12. Media — `/luu-tru`

Media Workspace duy nhất: **mỗi card = 1 file vật lý (MediaAsset)**, không phải 1 dòng
`product_images`.

**Bố cục card (asset-first)** — thứ tự từ trên xuống:

1. Ảnh thumbnail (badge MAP/Concept ở góc).
2. **Tên sản phẩm** (đậm, click mở gallery) — hoặc "Không thuộc sản phẩm".
3. Dòng phụ (mono, mờ): mã SP · `WxH` · dung lượng.
4. Nút **"Mô tả"** (tab Lookbook) — highlight terracotta khi ảnh đã có `ai_description`, xám mờ
   khi chưa (không trích nội dung ra card).
5. **Khối usage** (click mở `AssetUsageDialog`): liệt kê số theo nhóm — `2 Sản phẩm`,
   `1 Lookbook`, `1 Tuyển chọn`, `1 Đề xuất`, `1 Hero`; hoặc "Không nơi nào dùng" nếu chưa gán.
6. Tag phòng Lookbook.
7. Toolbar thao tác + xoá 2 bước inline.

- **Phạm vi (primary tabs)**: `All` · `MAP` · `Lookbook` · `Uncategorized` (nhãn tiếng Anh trên
  UI; `featured` = Tuyển chọn #1—#12 vẫn nhận qua deep-link nhưng không còn là tab). Tab dùng
  segmented nhỏ (`px-2.5 py-1 text-[11px]`) cùng cỡ với segmented trạng thái.
- **Sử dụng (secondary, URL `usage`)**: **2 trạng thái, mặc định `used`** (nhãn UI **In use** /
  **Not in use**). `used` = đã gán vào ≥1 **sản phẩm** (MAP / đại diện / Concept / ảnh thường);
  `unused` = không gắn sản phẩm nào — **gồm cả ảnh chỉ nằm trong Đề xuất vật liệu hoặc Hero**
  (Hero bản chất là ảnh Concept; Đề xuất là tham chiếu ngoài catalog). Asset-level qua
  `listMediaAssets` (xem [hinh-anh-va-thu-vien](hinh-anh-va-thu-vien.md) §Kho ảnh asset-centric).
  Có banner ngữ cảnh khi lọc "Not in use"; khối usage trên card vẫn đếm đủ mọi nhóm và click để
  mở AssetUsageDialog.
- **Sắp xếp** (mặc định `Tên SP (A-Z)`): `Tên SP (A-Z/Z-A)` · `Mã SP (A-Z/Z-A)` · `Mới nhất` ·
  `Cũ nhất` · `Ưu tiên (#1—#12)`. Tab MAP tự đẩy ảnh Tuyển chọn #1–#12 lên đầu; tab Lookbook đẩy
  ảnh đang làm Hero (1 hoặc 2) lên đầu.
- **Tuyển chọn Trang chủ (#1–#12)**: tab `featured` trực tiếp trên thanh tab chính; hỗ trợ lọc secondary (`selected` = `yes`/`no`) trong popover Trạng thái; sort `priority` xếp #1→#12→chưa chọn.
- **Bộ lọc (đồng bộ với `/san-pham`)**: chip `Nhóm` · `Tông màu` · `Bề mặt` · `Kiểu dáng` ·
  `Hiệu ứng vân` · `Bộ sưu tập` (+ `Bối cảnh` khi ở tab Lookbook). **Tông màu gộp 8 nhóm**
  (`src/lib/color-tones.ts`: Trắng/Kem, Xám, Xanh Lá, Xanh Dương, Nâu, Đen, Cam/Terracotta,
  Vàng) thay vì liệt kê từng giá trị `products.color` thô — options có kèm **số lượng**
  (`toneCounts` trả từ server). Lọc theo nhóm tự dịch sang các màu raw thuộc nhóm đó; link cũ
  chứa màu raw ("Xám") vẫn hoạt động.
- **Bối cảnh phòng (Lookbook)**: chip **"Bối cảnh"** trong hàng facet (cạnh Nhóm/Tông màu/Bề mặt/
  Kiểu dáng/Hiệu ứng vân/Bộ sưu tập), chỉ hiện khi ở tab Lookbook hoặc đang lọc bối cảnh. Chọn
  bối cảnh tự chuyển tab Lookbook. Nhãn tiếng Anh lấy từ `IMAGE_ROOM_TAGS` / `SPACE_TYPES`
  (`src/lib/types.ts`) — `Living Room & Lounge`, `Kitchen & Dining`, `Bathroom & Spa`,
  `Bedroom & Suite`, `Balcony & Courtyard`, `F&B / Hotel / Resort`, `Office / Workspace`,
  `Other Space`, `Unknown`. Không hardcode lại chuỗi phòng trong component.
- **Phân trang + bộ lọc lưu trong URL** (`validateSearch`, giá trị mặc định bị bỏ).
- **Thao tác nhanh**: gán phòng (`product_image_room_tags`, consequence rõ), mô tả
  (AI-generated · edit), Lookbook visibility, hạ về thường, đặt hạng "Tuyển chọn",
  gán hàng loạt, **xóa hàng loạt (Bulk Delete)** có hộp thoại xác nhận 2 bước an toàn (tuân thủ quy ước xóa) và chạy với giới hạn concurrency `mapLimit` (~5).
- Nén ảnh WebP, xoá an toàn theo tham chiếu: [hinh-anh-va-thu-vien](hinh-anh-va-thu-vien.md).

## 13. Quản trị (**admin**)

| Route          | Việc                                                          |
| -------------- | ------------------------------------------------------------- |
| `/nguoi-dung`  | Tạo/sửa user, đặt lại mật khẩu, gán owner cho khách hàng       |
| `/nhat-ky`     | Nhật ký thao tác (`audit_logs`) — mọi thao tác ghi đều ghi lại |

## 14. Bảng dữ liệu theo tính năng

| Nhóm                  | Bảng                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Người dùng & session  | `users`, `sessions`, `audit_logs`                                                                   |
| Catalog sản phẩm      | `products`, `product_internal_codes`, `inventory`                                                    |
| Ảnh sản phẩm          | `product_images`, `product_image_room_tags` + `media_assets`, `mapping_media_usages`, `landing_page_media_usages` |
| Khách hàng & bán hàng | `customers`, `quotes`, `quote_items`, `orders`, `payments`, `notes`, `customer_product_samples`      |
| Đề xuất vật liệu      | `customer_mappings`, `customer_mapping_items`, `customer_mapping_quote_links`                        |
| Landing công khai     | `lp_settings`, `lp_leads`, `lp_lead_attachments`, `lp_rate_limits`, `public_users`, `public_sessions` |
| Shortlink             | `short_links`                                                                                        |

Tổng **28 bảng**. Chi tiết cột & RLS: [co-so-du-lieu](co-so-du-lieu.md).

## 15. Quy mô code

> Đo ngày **2026-09-25** (sau đợt Option 2 MediaAsset + card asset-first + gộp lọc In use/Not in use).
> Mốc trước đó 2026-09-24: xem [CLEANUP_REPORT](CLEANUP_REPORT.md), [REFACTOR_REPORT](REFACTOR_REPORT.md).

| Vùng             | File | Dòng   |
| ---------------- | ---: | -----: |
| `src/routes`     |   21 | 12.155 |
| `src/components` |   43 | 12.413 |
| `src/db`         |   13 |  7.266 |
| `src/lib`        |   34 |  3.217 |
| `src/api`        |    2 |  2.068 |
| `src/render`     |    2 |    815 |
| `src/*.ts` (gốc) |    3 |    629 |
| `src/data`       |    1 |    321 |
| `src/hooks`      |    2 |     63 |
| **Tổng `src/`**  |  123 | **39.226** |
| `*.test.ts` (node --test) | 11 | 1.238 |

RPC: **72** `createServerFn` trong `src/api/functions.ts` + **21** trong `src/api/lp.ts` = **93**
(2 hàm auth được `api/lp.ts` re-export lại, không tính trùng).

`npx tsc --noEmit` = **0 lỗi** (baseline cũ 29 đã được xoá — xem
[audit-2026-09-19](audit-2026-09-19.md) §E1). `npm test` = **115 test pass**.
