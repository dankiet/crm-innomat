# 03 — Ngôn ngữ thiết kế cho content

> Nguồn: `em-ban-gach/Design specification — Em bán gạch.md` §1–8, `src/styles-lp.css`
> (design tokens), `ArchitectLanding.tsx`, `MaterialCard.tsx`.
>
> Đây là bản dịch visual language của landing page thành **luật cho content creator**:
> làm ảnh, video, carousel, thumbnail phải trông **cùng một thế giới** với LP.

## 1. Hướng thiết kế một câu

> **Thư viện Đất Nung** — một *material journal* theo chiều dọc cho kiến trúc sư:
> cảm giác **giấy mẫu, nhãn lưu trữ và catalog biên tập**. Không phải dashboard,
> không phải SaaS, không phải storefront card bo tròn đồng nhất.

**Nguyên tắc vàng:** *Vật liệu là nhân vật chính.* Ảnh không gian chỉ để chứng minh
bối cảnh; quyết định chọn mã bắt đầu từ **màu, bề mặt, khổ và thông số**.

## 2. Bảng màu (dùng chính xác mã hex)

| Token | Hex | Vai trò trong content |
|---|---|---|
| **Mineral Ink** | `#1F2B33` | Chữ chính, panel tối, footer — "mực khoáng" |
| **Paper** | `#F4F0E8` | Nền tổng thể — giấy ngà |
| **Paper Deep** | `#E8E1D5` | Nền phụ, block vật liệu |
| **Terracotta** | `#B94A2E` | **Accent chủ sở hữu** — CTA, marker, mã đang chọn |
| **Terracotta Dark** | `#963A24` | Hover CTA |
| **Olive** | `#657151` | Nhấn hỗ trợ, shortlist |
| **Warm White** | `#FFFAF3` | Chữ trên nền tối |
| **Archive Grey** | `#697176` | Metadata trên **nền sáng** |

**Màu bổ trợ có thật trên LP** (được phép dùng — không phải "màu lạ"):

| Token | Hex | Vai trò |
|---|---|---|
| Section tối | `#21323A` | Nền khối Deliverables (đậm hơn Ink) |
| Xanh đã chọn | `#2E6B4E` | Trạng thái "đã lưu shortlist" |
| Hero `em` | `#DDA48A` | Từ nhấn trong headline hero |
| Nền intent | `#F9F6EF` | Nền khối chọn dòng gạch |
| Nền lookbook | `#F8F5ED` | Nền khối không gian |
| Nền brief | `#E7DDD0` | Nền khối form brief |

### Luật dùng màu

1. **Terracotta là accent duy nhất chủ sở hữu** — một layout chỉ nên có **một** CTA nền
   Terracotta. Không rải Terracotta khắp badge/button.
2. **Nền mặc định là Paper**, không phải trắng tinh (`#FFFFFF`). Trắng tinh trông
   "sàn TMĐT", phá brand.
3. **Chữ trên nền tối luôn Warm White**, không dùng trắng `#FFFFFF`.
4. **Metadata (mã, size, spec) trên nền sáng dùng Archive Grey**; trên nền tối dùng
   Warm White mờ (xem §3). Chữ nhỏ, uppercase.
5. Chỉ dùng **màu trong hai bảng trên** cho creative. Nếu cần màu gạch, lấy **đúng tone
   gạch** làm swatch, không lấy màu brand.

## 3. Typography

| Vai trò | Font | Quy tắc |
|---|---|---|
| **Headline / display** | **Cormorant Garamond** | Weight 500–600; letter-spacing âm nhẹ; line-height 0.84–0.95 |
| **Body / UI** | **DM Sans** | Weight 400–700; line-height 1.45–1.68 |
| **Metadata / nhãn nhỏ** | **DM Sans uppercase** | 9–10 px; letter-spacing 0.12–0.16 em |

> ⚠️ **Về chữ "mono".** CSS LP có khai báo `font-family: var(--mono)` cho nhãn metadata,
> **nhưng `--mono` không được định nghĩa ở đâu trong repo** ⇒ trình duyệt **fallback về
> DM Sans**. Vì vậy trên thực tế nhãn `EBG / GT-01` render bằng **DM Sans**, không phải
> monospace. Khi làm content, dùng **DM Sans uppercase** — đừng giả định có font mono.

### Cách dùng trong content

- **Tiêu đề bài/thumbnail** → Cormorant Garamond (serif thanh mảnh, hơi cổ điển).
- **Caption, mô tả, CTA** → DM Sans.
- **Nhãn nhỏ như `EBG / GT-01`, `2026 EDITION`, `CURATED SELECTION`** → DM Sans
  uppercase, giãn chữ. Màu: **Archive Grey trên nền sáng**, **Warm White mờ trên nền tối**.
- **Không** dùng font hệ thống mặc định cho headline. Không dùng font script/handwriting.

## 4. Bố cục & nhịp (layout)

Cấu trúc trang chuẩn — content nên "ăn khớp" với nhịp này:

```
Header → Hero (copy / ảnh) → Chọn dòng gạch (4 card)
→ Vật liệu tuyển chọn (12 mã + shortlist) → Lookbook không gian
→ Quy trình & Cam kết (4 deliverables) → Gửi brief → Footer
```

| Yếu tố | Đặc trưng | Ứng dụng cho content |
|---|---|---|
| Nhịp **editorial** | Số thứ tự `01 / 02 / 03`, kicker uppercase | Dùng số thứ tự cho series/carousel |
| **Ledger / nhãn lưu trữ** | Thanh ghi chú uppercase ở đầu block | Slide đầu carousel làm "ledger line" |
| **Stagger grid** | Card vật liệu lệch dọc nhẹ | Tránh lưới đều tăm tắp kiểu e-commerce |
| **Kicker + serif H2** | `CHỌN DÒNG GẠCH THEO CONCEPT` + tiêu đề serif | Công thức chuẩn cho slide tiêu đề |
| Bo góc nhỏ | `--radius: 0.25rem` | **Không bo tròn lớn** — tránh cảm giác app |

### Công thức slide/carousel chuẩn brand

```
[KICKER UPPERCASE — Archive Grey trên nền sáng, giãn chữ]
[TIÊU ĐỀ SERIF — Cormorant, 2 dòng, có 1 từ <em> nhấn]
[ẢNH VẬT LIỆU — chiếm ≥50% diện tích]
[CAPTION DM Sans uppercase: EBG / mã · khổ · bề mặt]
```

## 5. Ngôn ngữ hình ảnh (asset rules)

| Loại ảnh | Yêu cầu | Dùng ở |
|---|---|---|
| **Hero** | Material board/flatlay, ánh sáng **low-key**, overlay tối nhẹ | Ảnh mở đầu, cover |
| **Material card** | Ảnh **surface/map** — phải thấy texture, mạch, hoặc cạnh vật liệu | Mọi card mã gạch |
| **Concept / bối cảnh** | Ảnh nội thất có vai trò minh họa bối cảnh, **gắn với 1 mã** | Lookbook, "xem trong không gian" |
| **Logo** | Reuse `BrandMark`, PNG transparent | Góc ảnh, watermark |

### File logo & brand asset (dùng đúng file)

| File | Dùng cho |
|---|---|
| `public/logo.png` | Logo chính |
| `public/favicon-ebg.svg` | Favicon / icon nhỏ |
| `public/dau_do.png` | **Con dấu đỏ (stamp)** — watermark/ấn triện |
| `em-ban-gach/anh-ban-gach-logo-refined.png` | Bản logo refined gốc |
| `BrandMark` (component) | Mọi logo trong LP/UI — **không vẽ lại bằng SVG inline** |

### Luật ảnh bắt buộc

1. **Ảnh sản phẩm phải có alt mô tả**; ảnh decor thuần để `alt=""`.
2. **Không lặp cùng một ảnh nội thất cho nhiều card** — mỗi mã phải có ảnh riêng.
3. **Ảnh vật liệu phải cho thấy bề mặt thật** — không dùng ảnh stock chung chung.
4. **1 ảnh = 1 mã gạch**: mỗi ảnh bối cảnh phải định danh được đúng mã đang ốp
   (đây là nguyên tắc cốt lõi của Lookbook).
5. **Ánh sáng tự nhiên, low-key, ấm** — không dùng ảnh over-saturated, HDR gắt.
6. Trước khi đăng: **kiểm tra mã gạch trong ảnh có tồn tại trong thư viện** không.

### Prompt/tham chiếu khi cần chụp hoặc tạo ảnh

- Ánh sáng: chiều muộn, nắng xiên, bóng mềm.
- Vật liệu phối: gỗ tự nhiên, đá, kim loại mờ, vải lanh.
- Bảng màu: đất nung, xanh khoáng, cát, ô liu — theo 8 nhóm tông.
- Tránh: bóng đèn vàng gắt, phối màu neon, nội thất "hot trend" Tây Âu.

## 6. Motion & tương tác (khi làm video/reel)

| Thuộc tính | Giá trị |
|---|---|
| Animate | Chỉ `transform` và `opacity` |
| Timing UI | 160–200 ms |
| Hero entrance | tối đa 560 ms |
| Easing | `cubic-bezier(0.23, 1, 0.32, 1)` |

**Không** dùng: animation height/width, animation lặp vô hạn, hover effect quá lớn,
scale từ 0.

**Áp cho video:** chuyển cảnh mượt, không giật; zoom chậm (slow push) trên bề mặt
vật liệu; không dùng hiệu ứng "whip pan", glitch, hay transition flashy.

## 7. Accessibility & QA (áp cho cả content)

- Chữ trên nền tối phải **đủ contrast** sau overlay.
- Mọi ảnh có alt (kể cả trong bài).
- Không dùng chữ trên nền ảnh nếu không có overlay tối.
- Kiểm tra hiển thị ở **1280 / 768 / 375 px** cho mọi layout.
- Không có horizontal scroll ở mobile.

## 8. Checklist trước khi đăng content

- [ ] Nền là Paper (`#F4F0E8`), không phải trắng tinh.
- [ ] Headline dùng Cormorant; body dùng DM Sans.
- [ ] Chỉ **một** CTA Terracotta trong layout.
- [ ] Ảnh vật liệu là nhân vật chính, có texture rõ.
- [ ] Có **mã gạch cụ thể** hoặc **bối cảnh cụ thể**.
- [ ] Không có giá, không có từ cấm (xem `01` §4).
- [ ] Có nhãn DM Sans uppercase `EBG / mã` hoặc kicker uppercase.
- [ ] Alt text cho ảnh.
- [ ] Không bo tròn lớn, không đổ bóng kiểu card app.

## 9. Những gì KHÔNG thuộc ngôn ngữ này

Không đưa vào creative nếu chưa có quyết định mới: trang Thư viện kiểu grid e-commerce,
checkout, badge giảm giá, countdown sale, popup "mua ngay", gradient tím-hồng,
glassmorphism, card bo tròn lớn, icon 3D bóng bẩy.

> **Nguồn gốc luật này:** `Design specification` §8 — "Không thuộc thiết kế hiện tại".
> Muốn mở rộng visual language → sửa `01` + `03` và báo lại, đừng tự thêm.
