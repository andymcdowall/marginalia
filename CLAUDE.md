# Marginalia — agent notes

Full spec: `SPEC.md`. Progress/blockers: `PROGRESS.md`. Autonomous choices: `DECISIONS.md`.
If context was compacted, re-read those three files before anything else.

## Architecture rules (enforced by ESLint `no-restricted-imports`)
- `packages/core`: pure TS. No `react`, `@codemirror/*`, `@tauri-apps/*`, `electron`, `node:*`, no `window`/`document`.
- `packages/ui`: no `@tauri-apps/*`, `electron`, `node:*`. Gets `Platform` only via `platformContext`.
- All git logic (argument building, output parsing) lives in `core/src/git` and `core/src/versions`. Rust only executes the args it's given — no business logic in Rust beyond fs IO, process exec, file watching, a JSON store, and PDF printing.
- Pass `Platform` as a function argument. No DI frameworks, no class hierarchies, no clever abstractions.
- Comment block is source of truth in the file itself (see SPEC.md §5). Never lose user/comment text — prefer marking content orphaned over discarding it.

## Repo layout
See SPEC.md §2.1. `packages/core`, `packages/platform-node` (test-only Platform impl), `packages/ui`, `apps/desktop` (Tauri 2).

## Commands
```
pnpm dev        -> pnpm --filter desktop tauri dev
pnpm build      -> pnpm -r build && pnpm --filter desktop tauri build
pnpm test       -> vitest run (all packages)
pnpm lint       -> eslint .
pnpm typecheck  -> tsc -b (all packages)
pnpm verify     -> pnpm lint && pnpm typecheck && pnpm test && (cd apps/desktop/src-tauri && cargo check)
```
Use `pnpm verify` to check a phase is done. Never leave `pnpm tauri dev` running as a check — it doesn't exit.

## Conventions
- Strict TypeScript everywhere. No `any` unless justified with a comment.
- Vitest only (no Playwright, no Tauri E2E). UI logic tests use `jsdom` and drive CodeMirror via `EditorState`/`EditorView` directly, not React.
- Dependencies limited to SPEC.md §3.1. Adding one needs a `DECISIONS.md` line.
- macOS only (13+, Apple Silicon + Intel). No Windows/Linux code paths.
- UI wording: "idea" not "branch", "snapshot" not "tag", "Detached comment" not "orphaned thread" (SPEC.md §15).
- Commit after each completed sub-feature and at each phase end.
