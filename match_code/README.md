# Tạo file import mã nội bộ và catalogue cho CRM

Công cụ đọc catalogue CRM, báo cáo tồn kho MISA và export mã nội bộ hiện tại của CRM để tạo sẵn các file import. Công cụ không sửa trực tiếp database CRM.

CRM import theo hai luồng:

1. **Mã nội bộ**: workbook hai cột `Mã báo giá | Mã nội bộ`.
2. **Catalogue**: workbook có `code` và các field sản phẩm cần cập nhật.

Generator tạo đúng định dạng cho cả hai trong một lần chạy; bạn tự kiểm tra file rồi import trực tiếp.

## Chuẩn bị

Cần Python 3.12+ và `openpyxl`.

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install openpyxl
```

Input mặc định phải nằm cạnh `generate_import_files.py`:

- `San_pham.xlsx`: file export catalogue từ CRM, bắt buộc có cột `code`.
- `Tong_hop_ton_kho.xlsx`: báo cáo MISA có `Mã hàng`, `Tên hàng`, `Mô tả`, `Mã kho`, `Cuối kỳ`.
- `crm_internal_codes.xlsx`: export mới nhất từ CRM qua **Sản phẩm → Xuất File Tồn Kho & Mã Nội Bộ**.

File export CRM là preflight bắt buộc: nó chặn mã nội bộ đang thuộc sản phẩm khác. CRM hiện có thể bỏ qua collision này mà không báo rõ.

## Chạy generator

Từ bất kỳ thư mục nào:

```powershell
& "C:/Users/dankiet/Documents/CRM/.venv/Scripts/python.exe" `
  "C:/Users/dankiet/Documents/CRM/match_code/generate_import_files.py"
```

Hoặc chỉ định input/output khác:

```powershell
& "C:/Users/dankiet/Documents/CRM/.venv/Scripts/python.exe" `
  "C:/Users/dankiet/Documents/CRM/match_code/generate_import_files.py" `
  --catalogue "San_pham.xlsx" `
  --inventory "Tong_hop_ton_kho.xlsx" `
  --crm-internal-codes "crm_internal_codes.xlsx" `
  --output-dir "output"
```

## Kết quả

Generator ghi vào `match_code/output/`:

- `internal_code_mapping_<timestamp>.xlsx`
  - Import qua CRM → **Sản phẩm → Nhập Mã Nội Bộ**.
  - Sheet đầu tiên `Mapping`, chỉ có hai cột theo thứ tự: `Mã báo giá`, `Mã nội bộ`.
  - Một mã nội bộ chỉ xuất một lần, dù có ở nhiều kho.
  - Không chứa mã chưa khớp, mã mơ hồ, mã conflict CRM, hoặc mã đã được gắn đúng.

- Một hoặc nhiều `catalogue_update_<timestamp>_*.xlsx`
  - Import qua CRM → **Sản phẩm → Nhập / Xuất Excel**.
  - Mỗi file chỉ có `code` và các field thay đổi thực sự của nhóm sản phẩm đó: `name`, `size`, `packing`, `packing_m2`, `packing_pcs`.
  - Các file được tách theo header để CRM không nhận cột rỗng hoặc cột không muốn cập nhật.
  - Không xuất giá, discount, ảnh, `unit`, `created_at` hay `id`.

- `matching_audit_<timestamp>.xlsx`
  - Chỉ để đối chiếu, **không import**.
  - Có toàn bộ dòng tồn kho nguồn, kho, tồn, quy tắc match, lý do loại, và giá trị catalogue hiện tại/đề xuất.

## Quy tắc an toàn

Công cụ chỉ nhận match khi một biến thể mã dẫn tới **duy nhất một** `code` catalogue:

1. Match trực tiếp `Mã hàng`.
2. Thử biến thể an toàn như bỏ ký tự đặc biệt, prefix `1-` hoặc suffix `-HN`.
3. Nếu chưa khớp, thử alias trong `Mô tả`, kể cả mã ngăn cách bằng `/`.

Không fuzzy-match theo tên. Với catalogue, một field chỉ xuất nếu nó có giá trị không rỗng và thống nhất trên toàn bộ mã nội bộ đã match của sản phẩm. Field thiếu hoặc mâu thuẫn chỉ nằm trong audit, không đi vào file import.

## Quy trình import

1. Mở `matching_audit_*.xlsx`, `internal_code_mapping_*.xlsx` và mọi `catalogue_update_*.xlsx` để kiểm tra.
2. CRM → **Sản phẩm → Nhập Mã Nội Bộ**: import file mapping.
3. CRM → **Sản phẩm → Nhập / Xuất Excel**: preview, rồi import lần lượt mọi file catalogue update.
4. Kiểm tra nhãn `NB:` và các field catalogue đã thay đổi trong CRM.

## Chạy test

```powershell
& ".\.venv\Scripts\python.exe" -m unittest discover -s match_code/tests -v
```
