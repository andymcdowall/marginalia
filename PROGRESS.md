# Progress

## Current phase
Phase 5: Merge (starting)

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

### Phase 3: Comments
- `packages/core`: extracted `reconcileThreads`/`isThreadRangeValid` into `comments/reconcile.ts` (shared between file parsing and live in-editor reconciliation), plus `comments/displayNumbers.ts` and `comments/paste.ts` (id regeneration).
- Editor: `commentHighlights.ts` (highlight marks for open threads, gutter display-number widgets, active-thread class; resolved threads get a number but no highlight per §8.1/§5.6), `comments.ts` (insert/remove/re-anchor tag transactions), `clipboard.ts` (copy/cut puts clean text + `application/x-marginalia` JSON; paste regenerates ids).
- UI: `CommentsPanel.tsx` (thread cards, excerpt, reply, resolve/reopen, delete thread/comment, Open/All filter, Detached-comments section with re-anchor), wired into a new sidebar tab switcher (Comments/History) in `App.tsx`. Comment creation is Cmd+Shift+M (simplified from the spec's draft-textarea-in-panel flow — see DECISIONS.md).
- **Phase 3 acceptance (SPEC.md §13), all passing:**
  - Fuzz test: 1,000 random insert/delete edits (including whole-tag deletion) over 5 overlapping ranges never lose comment body text, and status always matches milestone validity — `packages/core/test/commentsFuzz.test.ts`.
  - Paste id regeneration: every milestone/thread/comment id regenerated, no duplicates (single large slice and per-slice checks) — `packages/core/test/paste.test.ts` (2 tests).
  - Overlapping/cross-paragraph highlight rendering (jsdom): separate marks per overlapping range, correct display numbers, cross-paragraph range renders, active class, resolved-thread has a number but no highlight — `packages/ui/test/commentHighlights.test.ts` (3 tests).
- `pnpm verify` passes (lint + typecheck + 60 tests + `cargo check`). App launches cleanly; no interactive GUI click-through (same caveat as Phases 1–2).
- Known gaps, logged rather than silently skipped: no `Toolbar.tsx` yet (Comment button reachable only via Cmd+Shift+M; Live/Source toggle has no UI button yet either, though the underlying `sourceMode` field/toggle exists); no Snapshot-creation UI trigger yet (the `createSnapshot` core function is tested but nothing in the UI calls it — `BranchMenu`'s idea-creation flow is the only wired write action for versions right now).

### Phase 4: Redline
- `packages/core/src/diff/`: `cleanText.ts` (strip milestones + position map), `tokenize.ts`, `hunks.ts` (Hunk type + whitespace-only filtering), `wordDiff.ts` (private-use-codepoint token encoding through `diff-match-patch`, correctly handling the BMP→supplementary-plane rollover via per-UTF16-unit token indices, not just per-character), `revert.ts`.
- Editor: `redline.ts` rebuilt as a `ViewPlugin` with a real 150ms debounce timer (see DECISIONS.md for why the first, purely-reactive version was a real perf bug, not just a stylistic simplification) — insertions get a `cm-ins` mark, deletions a `cm-del` widget. `ChangesPanel.tsx` (hunk count, Prev/Next via Alt+↑/↓, click-to-jump) + `BaselinePicker.tsx` (Origin/snapshots/ideas/pick-a-commit) wired as a new "Changes" sidebar tab. Cmd+Shift+R toggles redline.
- **Phase 4 acceptance (SPEC.md §13), all passing** — `packages/core/test/redline.test.ts` + `cleanText.test.ts`:
  - Revert property test: 500 random base/current pairs with random milestones, reverting all hunks last-to-first restores the base text exactly and every milestone id survives.
  - Adding/removing comments produces zero hunks (verified directly, plus the fuzz/property tests never spuriously produce comment-only hunks either).
  - `cleanText` offset-map tests (no milestones, tags stripped, tag at start/end, adjacent tags).
  - 10,000-word/200-hunk diff recompute benchmark, under 50ms (see DECISIONS.md re: warmup + best-of-N against shared-machine test-suite noise).
- `pnpm verify` passes (lint + typecheck + 69 tests + `cargo check`), stable across repeated full-suite runs. App launches cleanly; no interactive GUI click-through (same caveat as Phases 1–3).

## In progress
- Starting Phase 5: `mergeThreads`, the merge flow (`merge.ts`), `MergeView`, abort.

## Blocked
(none)

## Next steps
- Phase 5 acceptance (SPEC.md §13): integration tests for clean merge, text conflict (ours/theirs/both), independent thread additions uniting without conflict, same-thread replies on both sides uniting, later-`updated`-wins status conflict, abort restoring pre-merge state, non-md conflict keep-theirs, and resuming a merge after an app restart.
