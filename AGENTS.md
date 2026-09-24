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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **crm-innomat** (2447 symbols, 7114 relationships, 190 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/crm-innomat/context` | Codebase overview, check index freshness |
| `gitnexus://repo/crm-innomat/clusters` | All functional areas |
| `gitnexus://repo/crm-innomat/processes` | All execution flows |
| `gitnexus://repo/crm-innomat/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

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

## `CLAUDE.md` không được track

`AGENTS.md` là **nguồn luật duy nhất**, và là file chỉ dẫn duy nhất trong git.

`gitnexus analyze` tự sinh `CLAUDE.md` mỗi lần chạy (`ai-context.js` — tạo vô điều kiện, không
có option tắt riêng; `--skip-agents-md` tắt cả `AGENTS.md`). Vì vậy file đó **đã được
gitignore**: gitnexus cứ sinh ở máy, nhưng nó không bao giờ vào repo.

→ **Đừng `git add -f CLAUDE.md`, đừng chép luật vào đó.** Luật chỉ nằm ở `AGENTS.md`.

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
