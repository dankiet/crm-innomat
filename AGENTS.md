# Deployment

This repo is the source of truth. The deploy loop is **not** git-triggered:

- **Git (GitHub `main`)** is the source and versioned backup — every commit is a
  full snapshot of the code. Keep it in a working state; it is the only way to
  restore older source.
- **Vercel** serves production (`nitro` preset `vercel`, linked through
  `.vercel/project.json`). Build locally with `npm run build`, then ship the
  prebuilt output: `npx vercel deploy --prebuilt --prod`. Pushing commits to
  `main` does **not** itself trigger a deploy.
- Never rewrite published git history (force-push, rebase/amend/squash of pushed
  commits) — it destroys the version history that git alone preserves.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **crm-innomat** (1213 symbols, 3682 relationships, 102 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
