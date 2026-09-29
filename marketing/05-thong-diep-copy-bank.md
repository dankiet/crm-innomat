# 05 — Thông điệp & Copy bank

> Nguồn copy thật: `src/data/mockData.ts` (hero, deliverables, 12 mã), `ArchitectLanding.tsx`
> (hero, brief-promise, footer, kicker), `MaterialLibraryPage.tsx` (gate, hero thư viện),
> `ProjectBriefForm.tsx` (form, success), `src/routes/-lp-route.ts` (SEO title/description),
> `src/lib/lp-content.ts` (**biến thể + FAQ — ĐỊNH NGHĨA NHƯNG CHƯA RENDER**, xem cảnh báo).
>
> ⚠️ **CẢNH BÁO QUAN TRỌNG — biến thể LP chưa được render.** `LP_VARIANTS` và `SHARED_FAQ`
> trong `src/lib/lp-content.ts` **chưa có consumer nào**: `lp.$slug.tsx` chỉ dùng
> `findLpVariant()` để chặn 404 rồi render `<ArchitectLanding>` **không truyền variant**.
> Nghĩa là **mọi slug render đúng cùng một trang** — `headline`, `sub`, `offer`, `formTitle`,
> `faq` trong file đó **không hiện ở đâu cả**. Chúng là **copy dự phòng**, không phải copy
> đang chạy. Đừng trích dẫn chúng như thể khách đang thấy.
>
> **Luật:** copy dưới đây đã chạy thật trên LP — **ưu tiên tái sử dụng** để content
> đồng bộ với trang. Copy mới phải khớp giọng ở `01` §4.

## 1. Message hierarchy (kim tự tháp thông điệp)

```
        ┌─────────────────────────────────────────────┐
        │  ĐỊNH VỊ: Từ concept đến shortlist gạch      │
        └─────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   [Bề mặt & màu]     [Mẫu thật & map]    [Tư vấn theo dự án]
   "Bắt đầu từ        "Ảnh map + mẫu      "Không gửi bảng
    cảm xúc bề mặt"    thật trong 24h"     giá chung"
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   Lưu mã vào         Mở Thư viện         Gửi brief
   shortlist          mã gạch             (4h phản hồi)
```

## 2. Headline / Hook bank

### Dùng được ngay (đang chạy trên LP)

| # | Câu | Nguồn | Hợp kênh |
|---|---|---|---|
| H1 | **Bắt đầu từ một mã gạch phù hợp.** | Hero | FB, LP, thumbnail |
| H2 | **Chọn dòng trước, rồi chọn mã.** | Intent section | Carousel, blog |
| H3 | **Vật liệu trong không gian thực tế.** | Lookbook | IG, Pinterest |
| H4 | **Thứ bạn nhận lại không chỉ là mã gạch.** | Deliverables | Ads chuyển đổi |
| H5 | **Bạn đang có dự án cần tìm vật liệu?** | Brief section | Bottom-funnel |
| H6 | **Những viên gạch nhỏ cho những không gian có chuyện để kể…** | Footer | Brand post |

### Copy dự phòng (⚠️ chưa render — đừng trích như copy đang chạy)

Các câu dưới nằm trong `lp-content.ts` nhưng **chưa hiện trên trang**. Chỉ dùng khi
được duyệt để wire biến thể vào `ArchitectLanding`, hoặc làm **nguồn cảm hứng** cho ad copy:

| # | Câu | Biến thể dự kiến |
|---|---|---|
| H7 | Chọn đúng mã gạch cho công trình của bạn. | `gach-trang-tri` |
| H8 | Gạch thẻ cho mặt tường có chiều sâu. | `gach-the` |
| H9 | Mosaic cho bề mặt có tính trang sức. | `mosaic` |

### Hook theo pillar (mới, khớp giọng)

**P1 — Bề mặt:**
- "Nhìn gần mới thấy hết."
- "Men rạn không phải lỗi — đó là chủ đích."
- "Bề mặt này đổi màu thế nào dưới nắng chiều?"
- "Gạch không cần đẹp — bề mặt cần đúng."

**P2 — Không gian:**
- "1 ảnh = 1 mã gạch."
- "Mã này trong nắng chiều trông thế này."
- "Cùng một mã, ba bối cảnh khác nhau."
- "Đặt đúng bối cảnh, vật liệu mới lên tiếng."

**P3 — Kiến thức:**
- "4 câu hỏi trước khi chốt gạch."
- "Chọn gạch theo concept, không theo catalogue."
- "Khổ gạch ảnh hưởng gì tới cảm giác không gian?"
- "Vì sao em không gửi bảng giá chung?"

**P4 — Case study:**
- "Từ concept đến công trình."
- "Villa này bắt đầu từ một tấm moodboard."
- "Họ chọn 3 mã. Đây là lý do."

**P5 — Hậu trường:**
- "Hộp mẫu này đi đâu sau khi bạn gửi brief?"
- "4h sau khi gửi brief, chuyện gì xảy ra?"
- "Em đóng gói mẫu thật như thế nào."

## 3. Value proposition (theo persona)

| Persona | Câu giá trị chính | Proof đi kèm |
|---|---|---|
| A — KTS chủ trì | "Ảnh map + mẫu thật để bạn dựng 3D và trình chủ đầu tư." | Trọn bộ ảnh map SketchUp/3dsMax |
| B — Studio hoàn thiện | "Báo giá theo hạng mục, tư vấn số lượng đã trừ hao cắt ghép." | Đề xuất & báo giá trong 4h |
| C — Chủ đầu tư có gu | "Xem vật liệu trong không gian thực tế trước khi quyết." | Lookbook 1 ảnh = 1 mã + mẫu thật 24h |

## 4. CTA bank (dùng thống nhất)

| CTA | Ngữ cảnh | Ghi chú |
|---|---|---|
| **Gửi brief** | Chuyển đổi chính | Nút header + footer LP |
| **Nhận đề xuất vật liệu & Báo giá** | Nút submit form | **Nhãn thật đang chạy** (`ProjectBriefForm.tsx:466`) |
| **Lưu mã vào shortlist** | Mid-funnel | Sau khi xem mã |
| **Mở Thư viện mã gạch** | Gate | Vào trang thư viện |
| **Xem vật liệu tuyển chọn** | Top-funnel | Hero CTA 1 |
| **Xem Moodboard** | Khi có ≥1 mã | Drawer |
| ~~Nhận bảng giá & mẫu gạch~~ | — | ⚠️ Chỉ là `formTitle` của biến thể **chưa render** — **không dùng** |

**Không dùng CTA:** "Mua ngay", "Chốt đơn", "Đặt hàng", "Giảm giá sốc".

## 5. Copy theo từng vị trí (LP-aligned)

### Hero (đã chạy — dùng làm chuẩn)
> **Kicker:** DÀNH CHO KIẾN TRÚC SƯ & STUDIO THIẾT KẾ
> **H1:** Bắt đầu từ *một mã* gạch phù hợp.
> **Intro:** Một tài liệu vật liệu theo chiều dọc dành cho concept: bắt đầu từ màu sắc,
> bề mặt và nhịp gạch trước khi bạn cần tới thông số kỹ thuật. Em chọn trước các mã tiêu
> biểu để bạn khởi đầu nhanh cho công trình.

### Brief promise (đã chạy)
> Ưu tiên tư vấn theo context dự án, không gửi một bảng giá chung chung.

### Gate thư viện (đã chạy)
> **Mở khóa toàn bộ Thư viện mã gạch**
> Bạn đang ở chế độ xem trước (N mã). Đăng nhập bằng tài khoản Google để mở khóa toàn bộ
> **300+ mã gạch** cùng trọn bộ **ảnh Map vật liệu** (SketchUp / 3dsMax) và Bảng Spec
> vật liệu dự án.
>
> ⚠️ Con số **300+** chưa đối chiếu DB, và catalog public **cap 200 item/lần** — xem `README`.

### SEO title & description (đã chạy — dùng cho snippet/social)
> **Title:** Em bán gạch - Những viên gạch nhỏ cho những không gian có chuyện để kể...
> **Description:** em bán gạch — vật liệu cho concept kiến trúc. Từ shortlist đến công trình.

### Hero Thư viện mã gạch (đã chạy)
> **Badge:** PUBLIC ARCHITECTURAL CATALOG · 2026 EDITION
> **H1:** Thư viện mã gạch nguyên bản
> **Sub:** Khám phá trực tiếp các bề mặt đất nung, gốm men rạn thủ công, mosaic và gạch ốp lát.
> Bạn có thể xem trước 12 mã tuyển chọn và lọc tự do theo từng dòng concept.

### Brief success (đã chạy — một lời hứa nữa cần nhớ)
> **Em đã tiếp nhận brief của bạn!**
> Đội ngũ chuyên gia vật liệu sẽ xem xét concept, **chuẩn bị bảng moodboard PDF** và liên hệ
> trao đổi qua Zalo trong vòng **4 giờ làm việc**.

> 🚩 **"Bảng moodboard PDF" là một cam kết thật nhưng CHƯA có trong bảng proof ở `README`.**
> Đây là deliverable thứ 5 — phải thêm vào hợp đồng marketing/sản phẩm và đảm bảo vận hành
> thực hiện được.

### 4 Deliverables (đã chạy — dùng làm proof)

> Trích nguyên văn từ `mockData.ts` (không rút gọn — dùng đúng chuỗi này khi cần):

1. **Shortlist có lý do** — Mẫu vật liệu được chọn lọc kỹ lưỡng theo đúng concept, công năng và bề mặt bạn đang tìm kiếm cho công trình.
2. **Ảnh thực tế & Map vật liệu** — Cung cấp đầy đủ hình chụp thực tế bề mặt, khổ, màu và trọn bộ file ảnh map vật liệu để lên phối cảnh 3D.
3. **Hộp Sample tận nơi** — Gửi hộp mẫu gạch thật đến tận văn phòng thiết kế hoặc công trình trong 24h để bạn cảm nhận xúc giác dưới ánh sáng thực tế.
4. **Đề xuất & Báo giá trong 4h** — Dự toán chi phí tối ưu, tiến độ kiểm kho và bảng thông số kỹ thuật rõ ràng để kịp thời trao đổi với chủ đầu tư.

### FAQ (⚠️ copy dự phòng — chưa render)

Các Q&A dưới nằm trong `lp-content.ts` (`SHARED_FAQ`) nhưng **chưa hiện trên trang**.
Vẫn dùng tốt làm **kịch bản trả lời comment/ads** vì nội dung đúng với vận hành:

| Câu hỏi | Trả lời chuẩn |
|---|---|
| Giá bao nhiêu một mét vuông? | Giá phụ thuộc dòng gạch, khổ và số lượng. Em gửi bảng giá đúng nhóm anh/chị cần ngay sau khi nắm được diện tích và hạng mục — không có giá chung cho mọi mã. |
| Có cần đặt tối thiểu bao nhiêu? | Không có mức tối thiểu để hỏi mẫu hoặc nhận báo giá. Với đơn thi công, em tư vấn số lượng theo diện tích thực và trừ hao cắt ghép. |
| Em có gửi mẫu thật không? | Có. Sau khi chốt được 2–3 mã phù hợp, em gửi mẫu thật để anh/chị so màu trong ánh sáng công trình trước khi quyết định. |
| Giao hàng khu vực nào? | Em giao toàn quốc. Nội thành TP.HCM thường trong 1–2 ngày, tỉnh tuỳ tuyến vận chuyển — em xác nhận lịch cụ thể khi báo giá. |
| Chọn sai mẫu thì sao? | Đây là lý do em luôn gửi mẫu thật trước khi chốt số lượng lớn. Hàng nguyên kiện chưa thi công, còn tem, em hỗ trợ đổi theo chính sách từng dòng. |

## 6. Caption mẫu (theo kênh)

### Facebook — P1 (carousel bề mặt)
> Bề mặt men mờ nung ở nhiệt độ cao — nhìn gần mới thấy hết chuyện.
>
> Mã **GT-01** giữ trọn sắc đỏ gốm nung ấm áp, gờ cạnh mộc tự nhiên. Đây là mã em hay
> gợi ý cho tường điểm nhấn phòng khách và mặt tiền hiên nhà.
>
> 👉 Lưu mã này vào shortlist để em gửi ảnh map + mẫu thật khi bạn có dự án.
>
> #embangach #gachthe #terracotta #kientrucsu #vatlieuxaydung

### TikTok — P2 (reel "1 ảnh = 1 mã")
> Hook (0–2s): "Mỗi bức ảnh này là đúng một mã gạch."
> Body: lia ảnh bối cảnh, chèn nhãn `EBG / MX-01 · 30×145mm · Men mờ sâu`
> End: "Bạn muốn mã nào cho dự án của mình? Comment mã, em gửi ảnh map."

### Instagram — P3 (kiến thức)
> **Chọn dòng trước, rồi chọn mã.**
>
> Gạch thẻ đi từ màu → bề mặt → khổ.
> Mosaic đi từ kiểu dáng → màu → bề mặt.
> Gạch bông đi từ họa tiết.
> Gạch ốp lát đi từ kiểu vân.
>
> Chọn sai thứ tự là mất thời gian nhất. Bạn đang ở bước nào?

### Email/Zalo — chăm sóc lead (retain)
> Chào anh/chị,
>
> Em gửi lại shortlist mình đã lưu hôm trước. Nếu dự án đã sang bước chọn mã, em có thể
> gửi hộp mẫu thật để anh/chị so màu dưới ánh sáng công trình.
>
> Anh/chị cần em bổ sung thêm mã nào theo tông không?

## 7. Objection handling (xử lý từ chối)

> **Chính sách giá:** không public giá ở bất kỳ đâu (xem `06` §0). Mọi objection về giá
> đều quy về "gửi brief để nhận báo giá đúng nhóm".

| Objection | Trả lời |
|---|---|
| "Bên em có rẻ hơn không?" | Em không cạnh tranh bằng giá rẻ nhất. Em giúp anh/chị chọn đúng mã ngay từ đầu để không phải đổi hàng giữa công trình — cái đó mới tiết kiệm. |
| "Gửi bảng giá trước đi." | Giá phụ thuộc dòng, khổ và số lượng nên bảng giá chung sẽ sai. Anh/chị cho em diện tích và hạng mục, em gửi đúng nhóm trong 4h. |
| "Tôi chưa cần, đang xem thôi." | Không sao anh/chị. Anh/chị cứ lưu mã vào shortlist, khi nào cần em gửi mẫu thật và ảnh map cho dự án. |
| "Sợ chọn xong đổi ý." | Đây là lý do em gửi mẫu thật trước khi chốt số lượng lớn — anh/chị so màu ngoài ánh sáng thật rồi mới quyết. |
| "Tôi không ở TP.HCM." | Em giao toàn quốc và gửi mẫu qua chuyển phát. Tỉnh thì em xác nhận tuyến và lịch cụ thể khi báo giá. |
| "Có ảnh map để dựng 3D không?" | Có. Sau khi mở Thư viện mã gạch, anh/chị có trọn bộ ảnh map (SketchUp/3dsMax) và bảng spec. |

## 8. Hashtag bank

**Core:** `#embangach` `#vatlieuxaydung` `#kientrucsu` `#thietkenoithat`

**Theo dòng (4 dòng gạch):** `#gachthe` `#gachmosaic` `#gachbong` `#gachoplat`

**Theo tông màu:** `#gachterracotta` `#datnung` `#xanhkhoang`

**Theo bối cảnh:** `#noithatvilla` `#quancafe` `#resort` `#phongtam` `#sanvuon`

**Theo cảm hứng:** `#moodboard` `#materialboard` `#bemattuthien`

> **Luật:** `#gachoplat` chỉ nằm ở nhóm **Theo dòng**; `#gachterracotta` là **tông màu**,
> không phải dòng gạch — không trộn hai nhóm.

## 9. Liên hệ & kênh (dùng trong content)

| Kênh | Giá trị thật |
|---|---|
| Hotline | `0909 888 951` |
| Showroom & Kho mẫu | TP. Hồ Chí Minh ([Google Maps](https://maps.app.goo.gl/3Hqo3fNFhF2B3UrY8)) |
| Facebook | `fb.com/embangach` |
| TikTok | `@embangach` |
| Chat Zalo OA / Messenger | `ChatWidget` trên LP (chỉ hiện khi đã cấu hình `VITE_ZALO_OA_URL` / `VITE_MESSENGER_PAGE_ID`) |

## 10. Điều copy creator phải kiểm

- [ ] Có **mã gạch** hoặc **bối cảnh** cụ thể.
- [ ] Giọng "em — anh/chị", không "quý khách".
- [ ] Không có giá, không từ cấm.
- [ ] Chỉ hứa điều có trong `README` §Cam kết có thật (nhớ cả **moodboard PDF**).
- [ ] CTA thuộc CTA bank.
- [ ] Có link LP kèm UTM (xem `06`).
