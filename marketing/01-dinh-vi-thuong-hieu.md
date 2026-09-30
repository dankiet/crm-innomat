# 01 — Định vị thương hiệu & giọng nói

> Nguồn: `Plan triển khai — Landing page Em bán gạch.md` §1, `Design specification` §1,
> `src/lib/lp-content.ts`, `src/data/mockData.ts`, `ArchitectLanding.tsx`.

## 1. Thương hiệu này là ai

**em bán gạch** là thương hiệu gạch ốp lát **hướng tới kiến trúc sư và studio thiết kế**,
thuộc hệ **Innomat**. Không phải một cửa hàng gạch đại trà: đây là một
**material journal** — một tạp chí vật liệu có tư vấn thật ở cuối.

| Trục | em bán gạch | Cửa hàng gạch thường | Sàn TMĐT |
|---|---|---|---|
| Người mua | Kiến trúc sư, studio, chủ đầu tư có KTS | Chủ nhà tự mua | Người tìm giá rẻ |
| Đơn vị bán | **Mã gạch + bề mặt + bối cảnh** | Thùng gạch | Thùng gạch |
| Giọng | Biên tập, ấm, chuyên môn | Rao hàng | Khuyến mãi |
| Output | **Shortlist có lý do** + mẫu thật | Hoá đơn | Đơn hàng |
| Giá | **Không công khai** — báo theo dòng/nhu cầu | Niêm yết | Niêm yết |

### Định vị một câu

> em bán gạch giúp kiến trúc sư đi từ **bề mặt, màu sắc hoặc moodboard** đến một
> **shortlist gạch phù hợp cho dự án** — kèm mẫu thật, ảnh map và tư vấn theo context.

### Định vị mở rộng (positioning statement)

```
Với  [kiến trúc sư & studio thiết kế đang lên concept vật liệu]
mà   [cần chọn đúng mã gạch cho một bối cảnh cụ thể, không phải mua theo thùng]
em bán gạch là  [người tư vấn vật liệu theo dự án]
mang lại  [shortlist có lý do + mẫu thật + ảnh map dựng 3D + báo giá theo nhu cầu]
khác với  [showroom gạch và sàn TMĐT]
vì   [bắt đầu từ cảm xúc bề mặt trước khi cần tới thông số, và tư vấn theo context
      thay vì gửi một bảng giá chung]
```

## 2. Danh mục & sản phẩm (brand bán cái gì)

Bốn **dòng gạch** là xương sống — dùng thống nhất trong content, ads, hashtag:

| # | Dòng | Vai trò thương mại | Lối vào cảm xúc | Facet chính |
|---|---|---|---|---|
| 01 | **Gạch thẻ** | Dòng trang trí chủ lực, giàu màu/khổ/hiệu ứng | Nhịp gạch, chiều sâu tường | Màu sắc → Bề mặt → Kích thước |
| 02 | **Gạch mosaic** | Dòng trang trí chủ lực, quyết định bởi pattern | Tính trang sức của bề mặt | Kiểu dáng → Màu sắc → Bề mặt |
| 03 | **Gạch bông** | Dòng nhấn họa tiết, tạo điểm nhìn | Ký ức, bản sắc, cá tính | Họa tiết/Màu sắc → Kích thước |
| 04 | **Gạch ốp lát** | Dòng nền bổ trợ hoàn thiện không gian | Lớp nền liền mạch | Kiểu vân → Bề mặt → Kích thước |

**8 nhóm tông màu** (từ `src/lib/color-tones.ts`) — dùng làm ngôn ngữ chung giữa
content, CRM và quảng cáo:

`Trắng / Kem` · `Xám` · `Xanh Lá` · `Xanh Dương` · `Nâu` · `Đen` · `Cam / Terracotta` · `Vàng`

**Bối cảnh không gian** (từ `SPACE_TYPES`, `src/lib/types.ts`) — dùng cho content theo công trình:

`Living Room & Lounge` · `Kitchen & Dining` · `Bathroom & Spa` · `Bedroom & Suite` ·
`Balcony & Courtyard` · `F&B / Hotel / Resort`

> Ngoài 6 bối cảnh trên, `IMAGE_ROOM_TAGS` còn có `Office / Workspace`, `Other Space`,
> `Unknown` — **chỉ dùng để gắn tag ảnh trong CRM** (`imageOnly`), không phải bối cảnh
> content chính.

**Loại hình công trình** (từ `LP_PROJECT_TYPES`) — dùng cho form, ads, segmentation:

`Nhà ở / Villa` · `Hospitality / Resort` · `F&B / Retail` · `Văn phòng Studio` · `Công trình khác`

## 3. Bằng chứng — cam kết phải đối chiếu code

**Content chỉ được hứa những gì code đang làm thật.** Bảng này là hợp đồng giữa
marketing và sản phẩm:

| Cam kết dùng trong content | Bằng chứng | Điều kiện |
|---|---|---|
| Phản hồi brief trong **4h làm việc** | `ProjectBriefForm.tsx` | Giờ làm việc |
| **Mẫu thật tận nơi trong 24h** | `mockData.ts` `deliverables[2]` | Sau khi chốt 2–3 mã |
| **Đề xuất & báo giá trong 4h** | `mockData.ts` `deliverables[3]` | Đã có diện tích/hạng mục |
| **Ảnh Map vật liệu** trọn bộ (SketchUp/3dsMax) | `MaterialLibraryPage.tsx` gate | Sau khi mở khóa |
| **Thư viện 300+ mã gạch** | `MaterialLibraryPage.tsx` gate | `[CẦN XÁC NHẬN SỐ LIVE]` — kiểm tra DB trước khi dùng số |
| Tư vấn theo context, **không bảng giá chung** | `ArchitectLanding.tsx` brief-promise | Luôn |
| Giao **toàn quốc**, HCM 1–2 ngày | `lp-content.ts` FAQ | Nội thành |
| **Mẫu thật trước khi chốt số lượng lớn** | `lp-content.ts` FAQ "Chọn sai mẫu" | Luôn |

> ⚠️ **Bất biến:** không hứa giá cụ thể, không hứa tồn kho, không hứa ngày giao cho
> tỉnh, không nói "rẻ nhất". Các con số **300+ mã**, **24h**, **4h** phải kiểm tra lại
> mỗi quý — nếu vận hành đổi, sửa cả code và docs.

## 4. Giọng nói (brand voice)

Thương hiệu xưng **"em"**, gọi khách là **"anh/chị"**. Đây là lựa chọn có chủ đích:
gần gũi, khiêm nhường, chuyên môn — không phải giọng tập đoàn.

### Bốn thuộc tính giọng nói

| Thuộc tính | Nghĩa là | Ví dụ đúng |
|---|---|---|
| **Biên tập** (editorial) | Nói như tạp chí vật liệu, không như catalogue | "Bề mặt men mờ nung ở nhiệt độ cao, giữ trọn sắc đỏ gốm nung ấm áp." |
| **Ấm & người** (warm) | Có người thật đứng sau, không phải bot | "Em gửi bảng giá đúng nhóm anh/chị cần ngay sau khi nắm được diện tích." |
| **Chuyên môn, không khoe** | Dùng đúng thuật ngữ, giải thích khi cần | "Men rạn vi mô ẩn dưới lớp men trong — wabi-sabi thanh tịnh." |
| **Không hype** | Không "số 1", "tốt nhất", "siêu rẻ" | "Giá phụ thuộc dòng gạch, khổ và số lượng." |

### Do / Don't

| ✅ Nên | ❌ Tránh |
|---|---|
| Bắt đầu từ **cảm xúc bề mặt** trước thông số | Mở bài bằng bảng thông số kỹ thuật |
| Nói **mã gạch, bề mặt, bối cảnh** | Nói "sản phẩm", "hàng hoá", "combo" |
| Dùng "bạn", "em" | Dùng "quý khách", "chúng tôi" |
| Để ảnh vật liệu là **nhân vật chính** | Ảnh nội thất chung chung làm hero |
| Nói lý do chọn ("vì concept cần…") | Nói "đẹp", "sang", "hot trend" |
| Cụ thể: "75 × 300 mm", "R10", "men mờ" | Chung chung: "chất lượng cao", "đa dạng mẫu mã" |
| CTA mời trao đổi: "Gửi brief", "Lưu mã" | CTA mua hàng: "Mua ngay", "Chốt đơn" |
| Copy ra ngoài chỉ dùng gạch ngang "-" | Dùng dấu "—"; dấu này bị quét ra là AI |

### Từ vựng bắt buộc vs cấm

**Từ khoá thương hiệu (dùng đều):** mã gạch · bề mặt · shortlist · moodboard ·
brief · dòng gạch · bối cảnh · không gian · vật liệu · tư vấn theo dự án · mẫu thật.

**Từ cấm (phá vỡ định vị):** giá rẻ · khuyến mãi · xả hàng · số 1 · tốt nhất ·
rẻ nhất · combo · chốt đơn · mua ngay · giao ngay trong 2h.

### Ba câu định vị dùng làm anchor

1. *"Bắt đầu từ một mã gạch phù hợp."* — hero headline (đã chạy)
2. *"Chọn dòng trước, rồi chọn mã."* — nguyên tắc khám phá (đã chạy)
3. *"Những viên gạch nhỏ cho những không gian có chuyện để kể…"* — footer tagline (đã chạy)

## 5. Naming & mã

- Tên viết: **em bán gạch** (chữ thường, có khoảng trắng). Viết hoa đầu câu vẫn OK,
  nhưng không viết "EM BÁN GẠCH" toàn bộ trong body copy.
  - **Thực tế trên LP:** có chỗ viết hoa "Em bán gạch" giữa câu (success copy) và trong
    `<title>` (`Em bán gạch - ...`). Đây là **cách viết được chấp nhận cho tên riêng** ở
    đầu câu/tiêu đề — không phải lỗi. Body copy vẫn ưu tiên chữ thường.
- Viết tắt kỹ thuật: **EBG** (xuất hiện trong nhãn `EBG / code`, tên brand).
- Mã gạch công khai có prefix theo dòng: `GT-` (gạch thẻ), `MX-` (mosaic),
  `GB-` (gạch bông), `OL-` (ốp lát). **Không dùng mã nội bộ CRM** trên content công khai.
  - ⚠️ Placeholder tìm kiếm trong Thư viện ghi "MS-02" — **prefix `MS-` không tồn tại**
    trong taxonomy. Không sao chép placeholder này vào content.
- Handle: `fb.com/embangach`, TikTok `@embangach`. Hotline `0909 888 951`.

## 6. Đối thủ & khung so sánh

> `[GIẢ ĐỊNH]` — bảng này là **giả định định vị**, chưa có nghiên cứu đối thủ chính thức.
> Cần kiểm chứng (giá, catalog, chính sách mẫu) trước khi dùng làm luận điểm bán hàng.

| Đối thủ | Họ mạnh | em bán gạch khác ở |
|---|---|---|
| **Showroom gạch truyền thống** | Hàng sẵn, giá thương lượng | Bắt đầu từ concept, có ảnh map 3D, shortlist |
| **Sàn TMĐT (Shopee/Lazada)** | Giá, giao nhanh | Tư vấn theo dự án, mẫu thật, không bán lẻ |
| **Innomat (mẹ)** | Catalog rộng, thương hiệu | Lớp biên tập + tư vấn cho KTS, không phải catalog thô |
| **Nhà phân phối cao cấp nhập khẩu** | Hàng Ý/Tây Ban Nha | Hiểu công trình Việt, mẫu nhanh, tư vấn theo context |

**Khung định vị:** không cạnh tranh bằng giá hay độ rộng catalog — cạnh tranh bằng
**tốc độ biến concept thành shortlist dùng được**.

## 7. Điều content creator phải nhớ

1. **Ảnh vật liệu là nhân vật chính**, ảnh nội thất chỉ để chứng minh bối cảnh.
2. **Không có giá trên content** — luôn dẫn về "gửi brief để nhận báo giá đúng nhóm".
3. **Mỗi bài phải có một mã gạch cụ thể** hoặc một bối cảnh cụ thể — không nói chung.
4. **CTA thống nhất:** `Gửi brief` / `Lưu mã vào shortlist` / `Mở Thư viện mã gạch`.
5. **Giọng em–anh/chị** xuyên suốt, kể cả ads.
