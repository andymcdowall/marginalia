# Progress

## Current phase
Phase 1: Core document + workspace + editor (starting)

## Done
### Phase 0: Scaffold + spikes
- Monorepo scaffold: root configs, `packages/core`, `packages/platform-node`, `packages/ui`, `apps/desktop` (Tauri 2 + React + CodeMirror 6).
- ESLint boundary rules (`no-restricted-imports` for `core`/`ui`), root scripts (`dev`/`build`/`test`/`lint`/`typecheck`/`verify`).
- Tauri app launches an empty React UI (`pnpm dev`); Rust shell has `fs`/`git`/`watch`/`store` command modules wired (implementation is Phase 1 work, scaffolding + `set_workspace`/`quit_now`/lifecycle done now).
- CLAUDE.md, DECISIONS.md, PROGRESS.md created.
- **Spike B (editor perf):** `milestones.ts` + a stub redline decoration field, benchmarked on a 10,000-word doc — median 1.93ms, p95 4.67ms per keystroke (jsdom decoration-recompute proxy, not real paint). Well under the 16ms target.
- **Spike A (PDF export):** primary approach (hidden/off-screen `WebviewWindow` → native `NSPrintOperation` via raw `objc2`) reliably deadlocked in this environment (confirmed via a diagnostic: even plain synchronous `-runOperation` never returns). Switched to SPEC.md §11.3's documented fallback — a visible "Export preview" window with a Print… button calling `window.print()` — verified working end-to-end. Full story in DECISIONS.md. **This means Phase 6's PDF export will use the fallback UX** ("Use Save as PDF in the print dialog"), not a fully automatic silent export.
- `pnpm verify` (lint + typecheck + test + `cargo check`) passes clean.

## In progress
- Starting Phase 1: `platform.ts` is already written (needed early for shared typing); building out `platform-node`, `platformTauri`, workspace open/init, file tree, live preview, autosave, and `splitFile`/`joinFile`.

## Blocked
(none)

## Next steps
- Phase 1 acceptance (SPEC.md §13): splitFile/joinFile/escape round-trip tests on 20+ fixtures, livePreview jsdom tests, ESLint boundary fixture test.
