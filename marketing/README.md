# Marketing — em bán gạch

Bộ tài liệu này là **nguồn duy nhất** cho content creator, marketing specialist và
ads buyer của thương hiệu **em bán gạch** (Innomat). Nó không mô tả code — nó mô tả
**thương hiệu, khách hàng, thông điệp và cách chạy quảng cáo**, tất cả suy ra từ chính
sản phẩm đang chạy ở repo này.

> **Định vị một câu:** em bán gạch giúp kiến trúc sư và studio thiết kế đi từ
> **bề mặt, màu sắc và moodboard** đến một **shortlist gạch có lý do** cho dự án.

## Đọc gì trước

| Bạn là | Đọc theo thứ tự |
|---|---|
| **Content creator** | `01` → `02` → `03` → `04` → `05` |
| **Marketing specialist / ads buyer** | `01` → `02` → `06` → `07` → `05` |
| **Người mới vào team** | `README` → `01` → `02` → `03` |

## Bản đồ tài liệu

| # | File | Trả lời câu hỏi | Người dùng chính |
|---|---|---|---|
| 01 | [`01-dinh-vi-thuong-hieu.md`](01-dinh-vi-thuong-hieu.md) | Thương hiệu là ai, khác gì đối thủ, giọng nói ra sao? | Tất cả |
| 02 | [`02-doi-tuong-muc-tieu.md`](02-doi-tuong-muc-tieu.md) | Khách hàng là ai, đau ở đâu, đi qua hành trình nào? | Content, ads |
| 03 | [`03-ngon-ngu-thiet-ke.md`](03-ngon-ngu-thiet-ke.md) | Visual language: màu, font, ảnh, layout — để content đúng brand | Content, designer |
| 04 | [`04-chien-luoc-noi-dung.md`](04-chien-luoc-noi-dung.md) | Content pillar, funnel, lịch đăng, format | Content creator |
| 05 | [`05-thong-diep-copy-bank.md`](05-thong-diep-copy-bank.md) | Câu chữ dùng được ngay: hook, caption, CTA, email, objection | Content, ads |
| 06 | [`06-targeting-quang-cao.md`](06-targeting-quang-cao.md) | Target ai, ở đâu, audience/interest, UTM, cấu trúc camp | Ads buyer |
| 07 | [`07-do-luong-kpi.md`](07-do-luong-kpi.md) | Đo cái gì, event nào, KPI nào, đọc số ra sao? | Ads, marketer |

## Nguồn sự thật — docs này suy ra từ đâu

Mọi khẳng định về sản phẩm trong thư mục này **phải** truy được về một trong các nguồn sau.
Nếu code đổi mà docs chưa đổi, **docs sai** — sửa docs trong cùng commit.

| Nguồn | Cho biết |
|---|---|
| `em-ban-gach/Design specification — Em bán gạch.md` | Visual tokens, typography, cấu trúc layout, asset rules |
| `em-ban-gach/Kế Hoạch Xây Dựng Ladi-Page cho _Anh Bán Gạch_/Khuyến nghị kiến trúc nội dung*.md` | Kiến trúc IA, vai trò Product / Ảnh / Bộ sưu tập |
| `em-ban-gach/Kế Hoạch Xây Dựng Ladi-Page cho _Anh Bán Gạch_/Taxonomy và luồng catalog*.md` | Taxonomy 4 dòng gạch, luồng landing → dòng gạch → thư viện |
| `em-ban-gach/Kế Hoạch Xây Dựng Ladi-Page cho _Anh Bán Gạch_/Plan triển khai*.md` | Định vị, scope MVP, data contract công khai |
| `src/lib/lp-content.ts` | Copy **dự phòng** của 3 biến thể LP + FAQ — ⚠️ **chưa render** (xem cảnh báo dưới) |
| `src/routes/-lp-route.ts` | SEO title + meta description của landing |
| `src/data/mockData.ts` | 12 mã tuyển chọn, 4 dòng gạch, 4 deliverables, hero/footer copy |
| `src/components/landing/*.tsx` | Copy thật đang chạy: hero, gate thư viện, brief, lookbook |
| `src/lib/lp-types.ts` | `LP_PROJECT_TYPES`, `LP_PROJECT_STAGES`, UTM, loại form |
| `src/lib/types.ts` | `SPACE_TYPES` (bối cảnh phòng), `IMAGE_ROOM_TAGS` |
| `src/lib/color-tones.ts` | 8 nhóm tông màu — dùng cho creative & ads interest |
| `src/lib/lp-tracking.ts` | 3 event: `ViewContent`, `AddToCart`, `Lead` — dịch tên riêng cho Meta và GA4 |
| `docs/tong-quan-tinh-nang.md` | Bản đồ tính năng, trạng thái |

## Luật của thư mục này

Kế thừa tinh thần `AGENTS.md` (nguồn luật duy nhất của repo) — không lặp lại luật ở đó.

1. **Một thay đổi brand = một commit có docs.** Đổi copy trên LP mà không cập nhật
   `05-thong-diep-copy-bank.md` là lỗi.
2. **Số liệu đếm được thì đừng chép tay.** Số mã gạch, số bài, số lead — ghi kèm
   **ngày đo** và con trỏ tới nguồn, không hardcode.
3. **Không bịa số.** Mọi con số trong đây hoặc là **số thật đọc từ code/DB** (ghi rõ
   ngày), hoặc là **giả định có nhãn** `[GIẢ ĐỊNH]` kèm cách kiểm chứng.
4. **Không tự nghĩ ra brand mới.** Nếu muốn đổi tone/định vị, sửa `01` và báo lại —
   đừng để content trôi khỏi landing page.
5. **Không hứa quá sản phẩm.** Chỉ hứa thứ LP/CRM thực sự làm được (xem bảng
   "Cam kết có thật" ở `01`).

## Cam kết có thật (đối chiếu code — không được hứa khác)

Đây là các lời hứa đã được implement; content **được phép** dùng làm USP:

| Lời hứa | Bằng chứng trong code |
|---|---|
| Phản hồi brief trong **4h làm việc** | `ProjectBriefForm.tsx` — badge "Phản hồi trong 4h làm việc" |
| Chuẩn bị **bảng moodboard PDF** sau khi nhận brief | `ProjectBriefForm.tsx` — success copy |
| Gửi **mẫu thật tận nơi trong 24h** | `mockData.ts` → `deliverables[2]` |
| **Đề xuất & báo giá trong 4h** | `mockData.ts` → `deliverables[3]` |
| Trọn bộ **ảnh Map vật liệu** (SketchUp/3dsMax) khi mở khóa | `MaterialLibraryPage.tsx` — copy gate |
| Thư viện **300+ mã gạch** | `MaterialLibraryPage.tsx` — copy gate. ⚠️ **Chưa đối chiếu DB**, và catalog public **cap 200 item/lần đọc** (`lp.server.ts:327`). Trang **không có UI phân trang** ⇒ **không list được toàn bộ 300+ trong một màn**; muốn xem thêm phải **lọc**. **Không claim "xem toàn bộ thư viện"** — nói "hơn 300 mã, lọc theo dòng/tông". Xác nhận số live trước khi dùng. |
| Không gate phần xem cơ bản trên LP | Chỉ trang **Thư viện mã gạch** mới có gate; gate hiện **ngay** với khách chưa đăng nhập (12 mã là số card preview, không phải ngưỡng) |
| Tư vấn theo context dự án, **không gửi bảng giá chung** | `ArchitectLanding.tsx` — brief-promise |
| Giao **toàn quốc**, nội thành HCM 1–2 ngày | `lp-content.ts` — FAQ |

> Chi tiết cách dùng các cam kết này trong content: xem `05-thong-diep-copy-bank.md`
> §Proof bank. Chi tiết đối chiếu: xem `01-dinh-vi-thuong-hieu.md` §Bằng chứng.

## ⚠️ Hai điểm code chưa khớp docs (đã kiểm 2026-09-29)

Khi viết content/ads, **đừng tin các điểm sau cho tới khi code được sửa**:

| Điểm | Thực tế code | Hệ quả cho marketing |
|---|---|---|
| **Biến thể LP chưa render** | `LP_VARIANTS` + `SHARED_FAQ` (`src/lib/lp-content.ts`) **không có consumer**; mọi slug render cùng `ArchitectLanding` | 3 track chỉ khác URL, **thông điệp giống hệt**. Đừng quảng cáo offer riêng theo track. |
| **Không có event "mở thư viện"** | Luồng mở khoá đi qua Google OAuth, **không** qua `trackEvent` | Không dựng audience/KPI cho tầng này. Proxy: đếm lead `google-unlock`. |

> ✅ **GTM đã publish (sửa 2026-09-29).** Container `GTM-P4SQ7HBB` giờ có tag Meta
> Pixel `1086936020738731`. Kiểm chứng bằng browser (bấm "Đồng ý" rồi đọc
> `window.fbq`): `fbq` = function, script `connect.facebook.net/signals/config/1086936020738731`
> nạp thật. Pixel đã nhận event thật (30 ngày: PageView, ViewContent, Lead).
> **Retargeting + conversion optimization dùng được.** Ghi chú cũ "container rỗng"
> (đo 2026-09-28) đã lỗi thời.

## Đồng bộ với thư mục `docs/`

`docs/` là tài liệu **kỹ thuật** (route, RPC, bảng DB). `marketing/` là tài liệu
**thương mại** (khách hàng, thông điệp, quảng cáo). Hai bên không trùng vai:

- Đổi **route/search param/tính năng** → `docs/routes-va-ui.md` + `docs/tong-quan-tinh-nang.md`.
- Đổi **copy LP, offer, định vị, target** → `marketing/`.
- Một thay đổi vừa đổi route vừa đổi offer → sửa **cả hai** trong cùng commit.
