# Tổng kết rà soát hình — Gạch Ốp Lát

**Ngày xử lý:** 2026-08-21  
**Nhóm CRM:** `Gạch Ốp Lát`  
**Nguồn hình local:** `C:\Users\dankiet\Pictures\HÌNH GẠCH\GẠCH ỐP LÁT`  
**Khớp mã:** chỉ theo `products.code` (không dùng internal_codes)

---

## 1. Quy tắc đã áp dụng

### Folder **không** đưa vào đối chiếu (không crawl)
- Tên chứa: không / ko / no logo  
- Hình chụp thực tế / thực tế chụp  
- Hình mã cũ / mã cũ  
- Folder tên **`crawl`**

### Trích mã từ tên file
- Bỏ `(1)`, `(2)`, copy, nghiêng…  
- Bỏ hậu tố kích thước kiểu `_300x600`, `-400x800`  
  → ví dụ `MF36Y05F_300x600.jpg` → mã `MF36Y05F`

### Chuẩn ảnh khi upload lên CRM (đúng code project)
- `sharp` + auto-rotate  
- Cạnh dài tối đa **1600px** (giữ tỉ lệ)  
- Xuất **WebP quality 82**  
- Lưu Supabase Storage (hash) + `product_images` / `image_path`

---

## 2. Số liệu audit (lần cuối trước thao tác xóa/upload)

| Chỉ số | Số |
|--------|---:|
| SP CRM Gạch Ốp Lát | 335 |
| File ảnh sau khi skip folder | 1398 |
| **01** Có mã + có file folder | 259 |
| **02** File/mã folder không map SP | ~312 mã + file không trích được mã |
| **03** Có mã CRM, không có file folder | 76 |
| **04** Tab SP trống ảnh | 29 (26 có nguồn folder, 3 không) |
| **05** Tab đã có ảnh (cần soi tay nếu muốn) | 306 |

---

## 3. Việc đã làm trên CRM

### A. Xóa ảnh — nhóm 03 (thiếu file folder)

**Mục tiêu:** xóa hết ảnh CRM của mã trong 03, **trừ** list giữ.

**Giữ nguyên ảnh (13 mã — không xóa):**  
`6861LV`, `N12X02`, `N12X06`, `N12X09`, `N12X10B`, `N12X16`,  
`NHC802-5`, `NHC804`, `NHC806-1`, `NHC809`, `NHC812`, `NHC816`, `NHC822`

**Đã xóa ảnh:** **60/60** SP, **60** ảnh, **0** lỗi.

Nhóm đã xóa (tóm tắt theo NCC):
- **Á Châu (IC…):** IC61203, IC61204, IC61215, IC61216, IC61219, IC61225, IC6613, IC6617, IC6622–IC6624, IC6626–IC6629  
- **Hiệp Thủy (IH…):** IH61210, IH61212–IH61215, IH6603, IH6620  
- **Kiệt Anh:** IK61201, IK61205  
- **Phổ An (IPK…):** IPK6610–IPK6615  
- **DCL (IW…):** IW61201–IW61207, IW61209, IW61210, IW6601–IW6610  
- **Kim Hương (IZA159…):** IZA15901–IZA15911  

*(Không gồm 3 mã đã trống sẵn: IC61217, IC6625, IW61208.)*

### B. Upload ảnh — nhóm 04 có nguồn folder

**26/26** SP upload OK, **53** ảnh, **0** lỗi.

| Mã | Số ảnh | Nguồn chính |
|----|-------:|-------------|
| IF3601–IF3609, IF61201–IF61212, IF6601–IF6603 (Tesoro) | 2/mã | `Gạch Tesoro\…` |
| IG21209 | 1 | `Gạch Kiệt Anh\IG21209.jpg` |
| IZA6618 | 4 | `Gạch Kim Hương\IZA6618-01…04.jpg` |

### C. Gộp 04 không có nguồn → 03

3 mã trống ảnh + không có file folder đã gộp chung nhóm thiếu hình:  
`IC61217`, `IC6625`, `IW61208`

→ File `04` sau xử lý **không còn việc** (0 dòng cần upload).

---

## 4. Trạng thái hiện tại (sau xóa + upload)

| Việc | Trạng thái |
|------|------------|
| Tesoro / IG21209 / IZA6618 trước trống ảnh | **Đã có ảnh trên tab SP** |
| 60 mã 03 (trừ list giữ) | **Đã xóa ảnh** — tab trống, chờ nguồn hình đúng |
| 13 mã keep trong 03 | **Vẫn giữ ảnh cũ** |
| IC61217, IC6625, IW61208 | Trống ảnh, **chưa có** file folder khớp (ngoài crawl/ko logo/…) |
| Nhóm 05 (đã có ảnh + có/không có file folder) | **Chưa review tay** ảnh đúng/sai |

### Còn việc nếu muốn làm tiếp
1. Tìm/bổ sung hình “sạch” cho các mã đã xóa ảnh (IC/IH/IK/IPK/IW/IZA159…) — có thể nằm trong `crawl` / ko logo / thực tế (đã cố ý bỏ khi audit).  
2. Review tay nhóm đã có ảnh (ex-05): so tab SP với folder; sai thì xóa–upload lại.  
3. Rà `02` (hình folder không map mã CRM): tạo SP / đổi tên file / bỏ qua.

---

## 5. Script còn trong repo (nếu cần chạy lại)

| Script | Công dụng |
|--------|-----------|
| `scripts/audit-gach-op-lat-images.mjs` | Audit lại folder ↔ CRM → CSV |
| `scripts/delete-gach-op-lat-03-images.mjs` | Xóa ảnh theo plan (đã chạy `--execute`) |
| `scripts/upload-gach-op-lat-04-images.mjs` | Upload 04 + gộp no→03 (đã chạy `--execute`) |

Chạy audit lại (folder local):

```bash
set GACH_OP_LAT_IMAGE_ROOT=C:\Users\dankiet\Pictures\HÌNH GẠCH\GẠCH ỐP LÁT
node scripts/audit-gach-op-lat-images.mjs
```

---

## 6. File trong thư mục này

Chỉ giữ **file ghi chú này**.  
Các CSV/log/summary trung gian (01–06, index, backup log…) đã dọn sau khi hoàn tất thao tác.

**Thư mục:** `docs/audit-gach-op-lat/`  
**File duy nhất cần đọc:** `TONG-KET-RA-SOAT-HINH.md`
