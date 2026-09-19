# Innomat CRM — hướng dẫn cho agent

Toàn bộ luật của repo nằm ở **[AGENTS.md](AGENTS.md)** — đó là nguồn duy nhất:

- Luật deploy (Vercel, không rewrite git history)
- Quy ước UI bắt buộc (delete 2 bước, không `router.invalidate()` khi lưu)
- Quy ước cập nhật tài liệu
- Workflow GitNexus

File này **không** chứa luật nào — chỉ trỏ về `AGENTS.md`, để không tồn tại hai bản luật
trôi lệch nhau.

> `gitnexus analyze` sẽ tự chèn block GitNexus vào file này (và vào `AGENTS.md`). Nội dung
> ngoài block — chính là phần trên — được giữ nguyên. Đây là lý do file vẫn tồn tại dù
> `AGENTS.md` mới là nguồn luật.
