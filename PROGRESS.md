# Progress

## Current phase
Phase 3: Comments (starting)

## Done
### Phase 0: Scaffold + spikes
- Monorepo scaffold, ESLint boundaries, root scripts, Tauri app launching an empty React UI.
- Spike B (editor perf): median 1.9ms/keystroke on a 10k-word doc — well under 16ms.
- Spike A (PDF): primary native `NSPrintOperation` approach deadlocked in this environment; switched to SPEC.md §11.3's documented fallback (visible "Export preview" window + `window.print()`). Full story in DECISIONS.md. Phase 6 will build on the fallback, not silent automatic export.
- `pnpm verify` passes.

### Phase 1: Core document + workspace + editor
- `packages/core`: `comments/{types,escape,ids,milestones}`, `document/{splitFile,joinFile}`, `workspace/workspace.ts`.
- `packages/platform-node`: full `Platform` impl over `node:fs`/`child_process` (pdf/dialogs/resolveAssetUrl throw "not supported in tests" per spec).
- `apps/desktop/src/platformTauri.ts`: full `Platform` impl over `@tauri-apps/api` invoke/events + dialog/opener plugins.
- Rust: `fs.rs`/`git.rs`/`watch.rs`/`store.rs` commands implemented and wired in `lib.rs`. `watch.rs` note: `notify-debouncer-mini` only exposes a coarse "something changed" event kind, so create/modify are both reported as `"modify"` and only `"remove"` is distinguished (by checking whether the path still exists after debounce) — logged as a simplification, not a bug.
- Editor (`packages/ui/src/editor`): `milestones.ts`, `livePreview.ts` (full SPEC.md §7.2 table: headings, emphasis/strong/strike, inline code, links, images, blockquotes, fenced code, hr, task checkboxes), `frontmatter.ts`, `theme.ts`, `sourceMode.ts`, `setup.ts` (history/search/GFM markdown/Cmd+B/I/K).
- UI: `store.ts` (zustand), `FileTree.tsx`, `EditorPane.tsx` (autosave: 1500ms debounce, Cmd+S, blur, before-quit — no git commits yet, per phase scope), `App.tsx` wired to real workspace open flow.
- **Phase 1 acceptance (SPEC.md §13), all passing:**
  - `splitFile`/`joinFile`/escape round-trip: 27 tests across 23 fixture files (frontmatter, CRLF, unicode, trailing-no-newline, malformed block, overlapping/orphaned/multi-paragraph ranges, etc.) — `packages/core/test/splitJoin.test.ts`.
  - `livePreview` jsdom tests: markup hidden on inactive lines, shown on active lines — `packages/ui/test/livePreview.test.ts` (7 tests).
  - ESLint boundary test: proves `no-restricted-imports` actually fires for `react`/`node:*`/`@tauri-apps/*` imports from `core/src` — `packages/core/test/eslintBoundary.test.ts` (4 tests).
- Also added (not required by acceptance, but real coverage): `workspace.integration.test.ts` — real git init/no-double-init/tree-listing/name-collision tests against `platform-node` + temp repos.
- `pnpm verify` passes (lint + typecheck + 44 tests + `cargo check`).
- **Manual verification done:** launched `pnpm dev`, confirmed the app compiles, launches, and stays running without crashing.
- **Manual verification NOT done (flagging honestly, per this run's own instructions):** no interactive/visual GUI pass was done (no computer-use/screenshot-driven click-through of Open Folder → file tree → open a note → type → watch live preview & autosave). The underlying logic for each of those is covered by jsdom/integration tests, but you should sanity-check the actual feel of it once. See "top things to manually test" note below once the whole build is done — this note will be superseded by the final report.

### Phase 2: Git versioning
- `packages/core`: `git/GitClient.ts`, `versions/{saveCommit,snapshots,branches,baseline,history}.ts`.
- UI: `StatusBar.tsx` (idea/branch button + save state), `BranchMenu.tsx` (list/switch/new/rename/delete — "Merge into current…" omitted, that's Phase 5), `HistoryPanel.tsx` (grouped history with View/Restore/Start-new-idea-from-here). `EditorPane` now saves through `SaveCommit` (real autosave commits) instead of a raw `fs.writeText`.
- Note: `git for-each-ref`'s pattern needs the full `refs/tags/...` prefix — an early bug where I passed the bare `snapshot/<branch>/` prefix made `listSnapshots` silently return nothing; caught by the snapshot round-trip test, fixed.
- Note: spec's for-each-ref format strings write `%1f`/`%1e` but real git syntax needs `%x1f`/`%x1e` (a literal hex-byte escape) — section 9.5's own log format uses the correct `%x1f` form, so treated the `%1f`/`%1e` spellings elsewhere in the spec as the same shorthand. Logged in DECISIONS.md.
- **Phase 2 acceptance (SPEC.md §13), all passing** — `packages/core/test/versions.integration.test.ts` (10 tests) against `platform-node` + temp repos: fresh-folder init, save→exactly-one-commit (+ no-op re-save, + concurrent-save serialization), snapshot create/list/restore with history intact, idea create/rename/delete (marginaliaBase, tag moves, tag+config cleanup), baseline resolution for all four kinds including a missing-at-baseline file, and autosave grouping in history.
- `pnpm verify` passes (lint + typecheck + 54 tests + `cargo check`). App launches cleanly (`pnpm dev` smoke test); no interactive GUI click-through was done this run either — same caveat as Phase 1.

## In progress
- Starting Phase 3: milestones/highlights/gutter numbers, create/reply/resolve/edit/delete, orphaning + re-anchoring, clipboard.

## Blocked
(none)

## Next steps
- Phase 3 acceptance (SPEC.md §13): 1,000-iteration fuzz test (random edits never lose comment text, reconciliation stays correct), paste id-regeneration with no duplicates, jsdom highlight-rendering test for overlapping/cross-paragraph ranges.
