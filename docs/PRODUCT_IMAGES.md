# Quản lý ảnh CRM

Toàn bộ ảnh runtime do CRM quản lý được lưu content-addressed trong một thư mục:

```text
public/images/{sha256}.{ext}
```

Các bảng DB xác định ảnh thuộc sản phẩm hay đề xuất vật liệu; thư mục không mã hóa nguồn hoặc loại ảnh.

## Ảnh sản phẩm

- `product_images` là gallery chuẩn: `product_id`, `path`, `sort_order`, `is_primary`, `caption`.
- `products.image_path` là cache của ảnh primary.
- Upload UI và importer cùng resize cạnh dài tối đa 1600px, giữ tỉ lệ.
- JPEG dùng quality 85/mozjpeg; PNG giữ alpha; WebP quality 85.
- File trùng bytes dùng chung một path; xóa vật lý chỉ khi không còn bản ghi nào tham chiếu.
- Importer bổ sung tối đa 8 ảnh/mã, không thay primary hiện có.

```bash
npm run images:import -- --dry-run
npm run images:import -- --dry-run --codes=IN20JM4,IN52038LM
npm run images:import -- --codes=IN20JM4,IN52038LM
npm run images:import -- --sources="GẠCH BÔNG,GẠCH ỐP LÁT"
npm run images:import -- --max-images=6
```

Nguồn mặc định của importer là `Y:\HÌNH GẠCH` với các nhóm GẠCH BÔNG, GẠCH MOSAIC, GẠCH THẺ và GẠCH ỐP LÁT.

## Audit và cleanup

`images:cleanup` mặc định là dry-run; thêm `--apply` mới thay đổi dữ liệu.

```bash
npm run images:cleanup audit
npm run images:cleanup dedupe
npm run images:cleanup dedupe --apply
npm run images:cleanup optimize --apply
npm run images:cleanup quarantine --apply
npm run images:cleanup near-duplicates
npm run images:cleanup apply-review -- --report=data/reports/near-duplicates-review.json
npm run images:cleanup apply-review -- --report=data/reports/near-duplicates-review.json --apply
npm run images:cleanup clean-review -- --report=data/reports/near-duplicates-review.json --apply
npm run images:cleanup backup --images
npm run images:verify
```

Quy tắc an toàn:

- Backup DB dùng SQLite backup API, an toàn với WAL.
- Dedupe chỉ tự xử lý SHA-256 trùng tuyệt đối.
- Near-duplicate chỉ xuất báo cáo, không tự xóa.
- `apply-review` chỉ xử lý cụm có `status: "approved"`, tự backup DB và file trước khi xóa.
- `clean-review` xóa JSON/HTML/contact sheets sau khi đã nghiệm thu.
- Orphan được chuyển sang `data/image-quarantine/`, không xóa trực tiếp.
- `images:verify` kiểm tra file thiếu, prefix cũ, integrity và foreign key.
