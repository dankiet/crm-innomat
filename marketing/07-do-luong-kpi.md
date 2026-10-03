# 07 — Đo lường & KPI

> Nguồn: `src/lib/lp-tracking.ts` (3 event đang bắn), `src/lib/lp-consent.ts` (consent, GTM),
> `src/lib/lp-types.ts` (`LpLeadStatus`, `LpFormKind`, UTM), `src/db/lp.server.ts`
> (`createLpLead`, `checkRateLimit`, `countNewLpLeads`), `src/db/auth-public.server.ts`
> (lead `google-unlock`), `docs/trien-khai-va-van-hanh.md` §GTM (container rỗng),
> `docs/tong-quan-tinh-nang.md` §10.

## 1. Event — cái nào thật sự bắn

`LpEvent` (`src/lib/lp-tracking.ts:20`) khai báo **4 tên**, nhưng chỉ **3 tên được gọi**.
Đây là phân biệt sống còn khi dựng audience và KPI:

| Event | Khi nào bắn | Tham số | Trạng thái |
|---|---|---|---|
| `ViewContent` | Mở chi tiết 1 mã gạch | `content_ids`, `content_name` | ✅ **Đang bắn** (`ArchitectLanding.tsx`) |
| `AddToCart` | Lưu 1 mã vào shortlist | `content_ids`, `material_id` | ✅ **Đang bắn** (`ArchitectLanding.tsx`) |
| `Lead` | Submit form brief | (form data) | ✅ **Đang bắn** (`ProjectBriefForm.tsx`) |

**Một sự kiện nội bộ → hai tên xuất** (Meta và GA4 dùng bộ tên chuẩn khác nhau):

| nội bộ | Meta | GA4 |
| --- | --- | --- |
| `ViewContent` | `ViewContent` | `view_item` |
| `AddToCart` | `AddToCart` | `add_to_cart` |
| `Lead` | `Lead` | `generate_lead` |

Tham số cũng dịch: Meta dùng `content_ids`/`content_name`, GA4 dùng
`items: [{ item_id, item_name }]`. Chi tiết: `docs/tong-quan-tinh-nang.md` §9.

> **Bất biến:** `trackEvent` **KHÔNG** chặn theo cờ đồng thuận — sự kiện bắn cho mọi khách.
> Mô hình hiện tại là **opt-out**: GTM nạp cho tất cả, lựa chọn của khách đi vào `dataLayer`
> (`ebg_consent`) để lọc bằng audience. Xem `docs/tong-quan-tinh-nang.md` §9.

## 2. Phễu đo lường (funnel)

```
ViewContent  →  AddToCart  →  Lead
(vào trang)    (lưu mã)       (gửi brief)
```

| Bước | Event | Nơi xem | Ghi chú |
|---|---|---|---|
| 1 | `ViewContent` | GA4 / Meta | Chỉ khi đã consent |
| 2 | `AddToCart` | GA4 / Meta | Tương ứng "Lưu mã" |
| 3 | `Lead` | GA4 / Meta + CRM | Đổ về `lp_leads` |

> **Điểm mù đã biết:** giữa `AddToCart` và `Lead` **không có event nào**. Không đo được
> "khách bắt đầu điền form rồi bỏ", và không đo được lượt mở thư viện. Muốn lấp → thêm
> event (xem `06` §5).

### Nguồn số liệu thứ hai (không phụ thuộc consent)

**CRM `lp_leads` là nguồn sự thật cuối cùng** — lead vào đây bất kể pixel. Dùng để
đối chiếu khi số pixel thấp:

- Số lead theo `utm_source` / `utm_campaign` / `utm_content`.
- Số lead theo `project_type` / `project_stage` — ⚠️ **không có cột riêng**; các field này
  nằm gộp trong `note`/`need` (`lp_leads` schema). Muốn thống kê → phải parse text.
  Hợp đồng bàn giao đầy đủ: xem `06` §9.
- Số lead theo `form_kind` — **chỉ có 2 giá trị thật**:
  - `lp` — brief từ form landing (`ProjectBriefForm.tsx:147`).
  - `google-unlock` — lead sinh khi đăng nhập Google mở thư viện (`auth-public.server.ts:315`).
  - `library-gate` **là giá trị chết** — có trong type và trong `createLpLead` nhưng
    **không caller nào gửi**. Đừng lọc/báo cáo theo nó.
- Tỷ lệ chuyển đổi `new → contacted → converted` (`LpLeadStatus`).

## 3. Trạng thái lead & cách đọc

Từ `LP_LEAD_STATUS_LABEL`:

| Trạng thái | Nhãn | Ý nghĩa cho MKT |
|---|---|---|
| `new` | Mới | Lead chưa xử lý — **đo được tốc độ phản hồi** |
| `contacted` | Đã liên hệ | Sales đã gọi |
| `converted` | Đã chuyển KH | **Lead chất lượng** — dùng cho lookalike |
| `spam` | Spam | Loại khỏi mọi thống kê |

> **Cảnh báo về chống bot:** lớp bảo vệ **thực tế** chỉ có hai — **time-trap**
> (`rendered_at < 2s`, `src/api/lp.ts:138`) và **rate limit** (`lp_rate_limits`).
> API *có* nhánh honeypot (`data.hp`, `src/api/lp.ts:133`) nhưng **không form nào render
> hay gửi field `hp`** — coi như honeypot chưa hoạt động. Vì vậy đừng giả định lead sạch
> tuyệt đối; luôn lọc `spam` bằng tay. Lead `spam` **không được tính** vào KPI.

## 4. KPI theo tầng funnel

| Tầng | KPI | Cách tính | Nhịp đọc |
|---|---|---|---|
| **Top** | Reach, CPM, CTR | Từ nền tảng ads | Ngày |
| **Mid** | Tỷ lệ lưu mã | `AddToCart` ÷ `ViewContent` | Tuần |
| **Bottom** | **CPL nền tảng** | Chi phí ÷ `Lead` (pixel) | Ngày |
| **Bottom** | **CPL thật** | Chi phí ÷ lead `lp` trong CRM (trừ `spam`) | Tuần |
| **Bottom** | Tỷ lệ liên hệ được | (`contacted`+`converted`) ÷ tổng lead | Tuần |
| **Bottom** | Tỷ lệ chuyển KH | `converted` ÷ tổng lead | Tháng |
| **Retain** | Số lần cùng SĐT gửi lead | `dup_count` (đếm row cùng `phone_norm`) | Tháng |

> ⚠️ **CPL nền tảng ≠ CPL thật.** Pixel bị consent gate + container rỗng nên `Lead` trên
> nền tảng **luôn thấp hơn** lead thật trong CRM ⇒ CPL nền tảng trông **xấu hơn** thực tế.
> Dùng **CPL nền tảng chỉ để xếp hạng creative trong cùng nền tảng**; **quyết định ngân
> sách dùng CPL thật**.
>
> ⚠️ **`dup_count` không phải "quay lại theo dự án".** Nó là số row `lp_leads` cùng
> `phone_norm` (`lp.server.ts:652`), và các lần resubmit cùng `lp_slug` + `form_kind`
> trong 24h **đã bị dedupe** (`lp.server.ts:550`) ⇒ chỉ số này **đếm thiếu** và **không
> nói gì về dự án**. Muốn đo khách quay lại theo dự án → tính từ `project_name` hoặc liên
> kết `customer_id`.

### Ngưỡng cảnh báo sơ bộ `[GIẢ ĐỊNH]`

> Chưa có dữ liệu lịch sử ⇒ đây là **giả định** để bắt đầu, **phải hiệu chỉnh** sau
> 4–8 tuần chạy thật. Không có ngưỡng nào ở đây là số thật.

| Chỉ số | Ngưỡng tốt | Cần xem lại |
|---|---|---|
| CTR | > 1.5% | < 0.8% |
| Tỷ lệ lưu mã (`AddToCart`/`ViewContent`) | > 15% | < 5% |
| Tỷ lệ liên hệ được | > 60% | < 40% |
| Tỷ lệ chuyển KH | > 20% | < 10% |

## 5. Đọc số đúng (quan trọng)

### Vì sao số liệu pixel thấp hơn thực tế — hai tầng

1. **~~Container GTM đang rỗng~~ → ĐÃ SỬA (2026-09-29).** Container `GTM-P4SQ7HBB`
   đã được publish tag: Meta Pixel `1086936020738731`. Kiểm chứng bằng browser
   (bấm "Đồng ý" rồi đọc `window.fbq`): `fbq` = function, script
   `connect.facebook.net/signals/config/1086936020738731` nạp thật. Pixel nhận event
   thật (30 ngày: PageView, ViewContent, Lead). Ghi chú cũ "container rỗng" (đo
   2026-09-28) đã lỗi thời — **retargeting + conversion optimization dùng được**.
2. **Consent model:** GTM chỉ nạp khi khách bấm đồng ý. Khách bỏ qua ⇒ **0 event**.
   Cookie 1 năm, nhưng khách mới luôn bắt đầu ở trạng thái "chưa chọn".
3. **Banner không nêu tên công cụ** — cố ý, để tăng tỷ lệ đồng ý.

**Hệ quả:** không được lấy "số `Lead` trên pixel" làm tổng lead thật. Luôn đối chiếu
với `lp_leads` trong CRM.

### Quy tắc đọc số

| Tình huống | Cách xử lý |
|---|---|
| Pixel = 0 hoàn toàn | **Kiểm container GTM trước** (`"tags":[]`?) — chưa publish tag thì không phải lỗi camp |
| Pixel thấp, CRM cao | Bình thường — lấy CRM làm chuẩn |
| Pixel cao, CRM thấp | Nghi spam/bot — kiểm `spam` status |
| Cả hai đều thấp | Camp/creative/landing có vấn đề |
| CPL tăng đột biến | Kiểm creative fatigue hoặc audience saturation |

## 6. Báo cáo định kỳ

### Báo cáo tuần (1 trang)

1. Bảng: camp × (reach, CTR, `Lead` pixel, **CPL thật**).
2. Top 3 creative theo CPL; bottom 3 cần tắt.
3. Lead mới trong `lp_leads` — phân loại theo `utm_campaign`, `project_type`.
4. Hành động tuần sau.

### Báo cáo tháng

1. Phễu: `ViewContent` → `AddToCart` → `Lead` → Converted.
2. Tỷ lệ chuyển đổi lead → khách hàng.
3. Hiệu quả theo track (gạch thẻ / mosaic / chung).
4. Hiệu quả theo persona/loại công trình.
5. Điều chỉnh ngân sách.

## 7. UTM → báo cáo

Lead `form_kind='lp'` mang 5 cột UTM. Cách nối với camp:

| Cột CRM | Dùng để |
|---|---|
| `utm_source` | Nền tảng nào ra lead |
| `utm_campaign` | Camp nào ra lead |
| `utm_content` | **Ad nào ra lead** (quan trọng nhất để tối ưu creative) |
| `utm_term` | Audience/keyword |
| `landing_path` | Trang nào nhận lead |
| `referrer` | Nguồn tham chiếu |

> ⚠️ **Lead `google-unlock` KHÔNG có UTM.** `auth-public.server.ts:315` insert không
> truyền cột UTM ⇒ 5 cột đều rỗng. Mọi báo cáo theo UTM **chỉ phủ được brief `lp`**,
> và **bỏ sót đúng nhóm mid-funnel** (người mở thư viện). Ghi rõ điều này khi đọc số,
> hoặc instrument UTM cho luồng OAuth.

> **Luật:** nếu một ad không có `utm_content` riêng, **không thể biết nó hiệu quả hay
> không** — coi như không đo được.

## 8. Attribution & giới hạn

| Giới hạn | Thực tế |
|---|---|
| **Container GTM** | **Đã publish (2026-09-29) — Meta Pixel `1086936020738731` chạy thật** |
| Consent gate | Số event thấp hơn thực tế |
| **Slug mặc định 301 strip UTM** | `/lp/gach-trang-tri` redirect về `/` **mất query** ⇒ lead Track-1 về với UTM rỗng. Dùng thẳng `/` cho track chung |
| **`google-unlock` không có UTM** | Lead mở thư viện không gắn được camp |
| Không có server-side tracking | Chỉ client-side |
| Không có event giữa `AddToCart` và `Lead` | Mù đoạn bỏ form |
| Lead có thể đến từ nhiều chạm | Chỉ ghi nhận UTM lần submit |
| Zalo/điện thoại | **Không tự động đo được** — sales phải nhập tay |

> **Hành động bù:** sales khi nhận lead từ Zalo/điện thoại **phải ghi nguồn** vào ghi chú
> khách hàng để MKT đối chiếu. Nếu không, kênh offline sẽ vô hình trong báo cáo.

## 9. Checklist setup trước khi chạy

- [ ] **Container `GTM-P4SQ7HBB` đã có tag GA4 + Meta Pixel và đã Publish** (kiểm bằng
      `curl` `"tags":[]`). **Không có bước này thì mọi bước sau vô nghĩa.**
- [ ] Meta Pixel nhận 3 event **tên Meta**: `ViewContent`, `AddToCart`, `Lead`.
- [ ] GA4 nhận 3 event **tên GA4**: `view_item`, `add_to_cart`, `generate_lead`.

> 🚫 **KHÔNG tạo tag GA4 Event trong GTM.**
>
> Cả hai nền tảng đều nhận sự kiện qua **đường gọi thẳng từ code**
> (`w.fbq(...)` / `w.gtag(...)` trong `src/lib/lp-tracking.ts`). GTM chỉ lo phần
> **nạp thư viện**: tag GA4 Config tải `gtag.js` (measurement ID `G-NFCGP5VNFV`),
> tag Meta tải `fbevents.js` + `init`.
>
> Dựng thêm tag GA4 Event sẽ khiến GA4 nhận **HAI lần** mỗi sự kiện — một từ code,
> một từ tag. Cùng loại lỗi đã ghi ở `docs/tong-quan-tinh-nang.md` §9.
>
> Khoá `ga4_event_name` trong `dataLayer` **chỉ để dành**: nó tồn tại cho trường
> hợp sau này muốn chuyển sang đường qua GTM (khi đó phải **bỏ** đường gọi thẳng
> trước, không được để cả hai). Hiện tại không dùng.
- [ ] (Tùy chọn) Instrument `trackEvent` ở nhánh mở khoá thư viện thành công nếu muốn đo lượt mở thư viện.
- [ ] Đã bắn thử 1 lead test và **thấy nó trong `lp_leads`** với UTM đúng.
- [ ] Track chung dùng `/` (không dùng `/lp/gach-trang-tri` — sẽ mất UTM khi 301).
- [ ] Banner consent hiện đúng, bấm "đồng ý" ⇒ GTM nạp.
- [ ] Có nơi xem `lp_leads` theo tuần (nhớ cap 500 row/lần đọc — `lp.server.ts`).
- [ ] Sales biết phải ghi nguồn cho lead offline.

## 10. Điều KHÔNG làm

| ❌ | Vì |
|---|---|
| Lấy số pixel làm tổng lead | Sai do consent gate |
| Tính lead `spam` vào KPI | Làm loãng chất lượng |
| Dùng CPL nền tảng để quyết ngân sách | Pixel thấp hơn CRM ⇒ CPL nền tảng sai lệch; dùng CPL thật |
| Dựng audience/KPI cho tầng "mở thư viện" | Không có event nào ⇒ luôn rỗng |
| Lọc/báo cáo theo `form_kind='library-gate'` | Giá trị chết, không caller nào gửi |
| Đổi tên UTM giữa chiến dịch | Vỡ chuỗi dữ liệu |
| Bỏ qua kênh Zalo/điện thoại | Offline thường chiếm tỷ trọng lớn |
| Kết luận sau 1–2 ngày | Volume nhỏ, chưa đủ mẫu |
