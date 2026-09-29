# Deployment

This repo is the source of truth:

- **Git (GitHub `main`)** is the source and versioned backup — every commit is a
  full snapshot of the code. Keep it in a working state; it is the only way to
  restore older source.
- **Vercel** serves production via its GitHub integration (`nitro` framework
  preset → `npm run build`, project linked through `.vercel/project.json`).
  Every push to `main` is built and deployed automatically by Vercel — no
  manual deploy step.
- Never rewrite published git history (force-push, rebase/amend/squash of pushed
  commits) — it destroys the version history that git alone preserves.

# UI Conventions

These are hard rules for the CRM UI. Follow them on every edit — do not silently
reintroduce the old patterns.

## Delete buttons — inline two-step confirm (NO `window.confirm`)
- A delete action must NEVER use the native `window.confirm()` popup.
- Pattern: clicking the trash icon enters a confirm state — show **"Xóa vĩnh viễn"**
  (solid red `bg-red-600 text-white hover:bg-red-700`) plus a **"Không xóa"**
  (neutral) button inline, next to the icon. Only the second click on
  "Xóa vĩnh viễn" performs the delete.
- Reset the confirm state whenever the dialog (re)opens.
- Canonical examples to copy from:
  - `src/components/NewCustomerDialog.tsx` (`confirmDelete` two-step)
  - `src/components/NewQuoteDialog.tsx` (header inline confirm)
  - `src/components/CustomerMappingDialog.tsx` (`EditorHeader` inline confirm)
  - `src/routes/_app.khach-hang.$customerId.tsx` (`SmallBtn` danger solid)

## Save in create/edit dialogs — keep popup open, no mid-save refresh
- On save, keep the dialog open and show a success toast. Do NOT call
  `router.invalidate()` inside the save handler (it reloads active route loaders
  and causes a visible grid refresh while the popup is still open).
- Refresh the underlying list only when the popup closes or via the page's
  `onCreated` callback — never mid-save.
- Canonical examples: `CustomerMappingDialog.tsx` (no invalidate on save),
  `NewQuoteDialog.tsx` (`handleSubmit` does not invalidate).

# Tài liệu — cập nhật cùng lúc với code

Tài liệu nằm ở `docs/`. Điểm vào là **`docs/tong-quan-tinh-nang.md`** — bản đồ tính năng
→ route/RPC/bảng. Docs chỉ ghi thứ **suy ra được từ code**; không lặp lại luật trong file này.

## `AGENTS.md` là nguồn luật duy nhất

`AGENTS.md` là file chỉ dẫn duy nhất trong git. Đừng tạo file luật thứ hai
(`CLAUDE.md`, `.cursorrules`, …) — luật tách ra nhiều chỗ sẽ trôi lệch nhau.

## Mỗi tài liệu sở hữu một mảng

| Thay đổi gì                                  | Phải sửa                                                            |
| -------------------------------------------- | ------------------------------------------------------------------- |
| Thêm/sửa/xoá **route** hoặc **search param** | `docs/routes-va-ui.md` **và** `docs/tong-quan-tinh-nang.md`         |
| Thêm **endpoint** `createServerFn`           | `docs/api-server-functions.md` (đúng nhóm của nó)                   |
| Thêm/sửa **bảng** hoặc cột                   | `docs/co-so-du-lieu.md` (kèm số bảng ở tiêu đề)                     |
| Đổi **nghiệp vụ** (trạng thái, mã, giá, VAT) | `docs/nghiep-vu.md`                                                 |
| Thêm **tính năng mới**                       | `docs/tong-quan-tinh-nang.md` (bản đồ + mục của khu vực đó)         |
| Đổi **script / biến môi trường**             | `docs/cai-dat-va-moi-truong.md` + bảng script ở `README.md`         |
| Đổi **quy trình deploy / migrate**           | `docs/trien-khai-va-van-hanh.md`                                    |
| Đổi **copy LP, định vị, offer, target quảng cáo** | `marketing/` — đúng file theo bảng ở `marketing/README.md`     |

## Hai tầng tài liệu

- **`docs/`** — tài liệu **kỹ thuật**: route, RPC, bảng DB, nghiệp vụ. Suy ra từ code.
- **`marketing/`** — tài liệu **thương mại**: khách hàng, thông điệp, content, quảng cáo.
  Điểm vào là `marketing/README.md`; mọi con số phải truy được về code hoặc ghi nhãn `[GIẢ ĐỊNH]`.

Một thay đổi vừa đổi **route/tính năng** vừa đổi **offer/định vị** phải sửa **cả hai** trong
cùng commit. Copy thật đang chạy nằm ở `src/lib/lp-content.ts`, `src/data/mockData.ts` và
`src/components/landing/*` — `marketing/05-thong-diep-copy-bank.md` là bản sao có chủ đích,
lệch nhau là lỗi.

## Luật

- **Một tính năng = một PR có docs.** Không tách: docs sửa ở commit sau sẽ không bao giờ được sửa.
- **Số liệu đếm được thì đừng chép tay.** Dòng code, số bảng, số endpoint trôi rất nhanh —
  audit 2026-09-19 phát hiện `docs/` đã lệch tới +51% ở con số dòng code. Nếu buộc phải ghi,
  ghi kèm **ngày đo** và con trỏ tới `docs/tong-quan-tinh-nang.md` §15 (nơi duy nhất giữ bảng quy mô).
- **Tài liệu sai còn tệ hơn không có.** Khi phát hiện docs nói khác code, sửa docs **trong cùng
  commit** với thay đổi code, hoặc mở việc riêng — đừng để lại.
- **Không viết lại luật đã có ở đây.** Docs trỏ về `AGENTS.md`, không sao chép.

## Kiểm tra nhanh trước khi commit

```bash
npm run build          # Vercel deploy bằng vite build — không typecheck
npx tsc --noEmit       # phải là 0 lỗi. Baseline cũ 29 lỗi đã được xoá hẳn (2026-09-19)
```

`tsc` là **bất biến**: 0 lỗi, và phải giữ ở 0. Trước đây repo có 29 lỗi tồn đọng khiến type
checking gần như tắt ở `_app.luu-tru.tsx` (2.358 dòng) — xem
[docs/audit-2026-09-19.md §E1](docs/audit-2026-09-19.md) để biết chúng là gì.
Thêm lỗi mới = hỏng.
