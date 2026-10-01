# Progress

## Final report (Phases 0–7 complete)

### What works
- **Full editor**: open a folder, browse/create/rename/delete/drag-move files and folders in the tree (each committed to git), open a `.md` note into a live-preview CodeMirror editor (headings/emphasis/links/images/blockquotes/fenced code/task checkboxes/frontmatter all styled and hidden-until-active per spec's table), source-mode toggle (Cmd+E), autosave (debounced, git-committed, configurable delay).
- **Comments**: select text, Cmd+Shift+M to comment; highlights, gutter numbers, reply/resolve/delete, orphaning when a range's milestones are deleted, re-anchoring a detached comment, copy/cut/paste preserving comment data across the app with regenerated ids.
- **Versioning**: every save is a real git commit; named snapshots; "ideas" (branches) with create/switch/rename/delete; full history panel (grouped autosaves, snapshot rows, merge rows) with view/restore/start-idea-from-here.
- **Redline**: toggle (Cmd+Shift+R) against Origin/a snapshot/an idea/an arbitrary commit; insertions/deletions rendered inline; Changes panel with count, prev/next navigation, per-hunk revert semantics implemented and property-tested (not yet wired to a UI button — see below).
- **Merge**: start a merge from the branch menu, resolve real text conflicts hunk-by-hunk (take ours/theirs/both/edit), non-.md conflicts (keep ours/theirs), abort, and resume correctly after a full app restart — all backed by integration tests against real git repos, not mocks.
- **PDF export**: Clean and redline export, verified to never leak comment markup or text into the output HTML; opens a real print-preview window backed by the native macOS print dialog (see "PDF export" below for why it's not silent).
- **Polish**: settings (autosave delay, default page size) persisted across restarts; Cmd+/ shortcut sheet; a blocking "Git is required" screen if no git binary resolves; dismissible error toasts with a Details expander for any git/file error; save-flush on quit.
- `pnpm verify` (lint + typecheck + **90 automated tests** + `cargo check`) passes clean, repeatably. `pnpm build` produces a working, launchable `Marginalia.app` (verified by actually opening it and confirming the process runs, then quitting it).

### What's stubbed, simplified, or blocked — and why
Every item below has a full explanation logged in `DECISIONS.md` at the point it was decided; this is the summary.
1. **PDF export is not silent/automatic.** The primary approach (a hidden/off-screen `WebviewWindow` driving native `NSPrintOperation` via `objc2`) reliably deadlocked in this environment — confirmed via a diagnostic that even plain synchronous `-runOperation` never returns, pointing at WKWebView's renderer never compositing a frame for a window that isn't genuinely on-screen here. Per spec's own explicit fallback permission, export now opens a real visible preview window with a Print… button; the person chooses "Save as PDF" themselves in the native dialog. **This is the single highest-value thing to verify on a real machine** — it may simply work natively there, in which case Phase 6's `pdf.rs` could be revisited.
2. ~~**Comment creation uses a `window.prompt()`**~~ — fixed post-Phase-7: `window.prompt()` never actually worked in the real Tauri app (WKWebView doesn't implement the JS prompt panel), so the feature was silently broken end-to-end, not just simplified. Comment creation now focuses a real draft textarea in the Comments panel per SPEC.md §8.2 (Cmd+Enter submits, Esc cancels and removes the tags). See DECISIONS.md.
3. **Comment body markdown rendering** is a small hand-rolled bold/italic/code/newline converter, not the real `remark` pipeline (which is async and would need extra state for what's usually one line of text).
4. **The "Pick from history…" baseline option** is a raw commit-SHA prompt, not a visual commit browser.
5. **The DMG bundler step is disabled** (`tauri.conf.json` only targets `"app"` now) — it failed twice in this sandboxed environment (likely an `hdiutil`/Finder-AppleScript restriction here, not a defect in the app itself); the `.app` bundle builds and runs correctly. Worth re-enabling `"dmg"` on a real dev Mac.
6. **No interactive/visual GUI click-through was ever performed by the agent** across all 8 phases — every UI code path is covered by jsdom unit tests and non-interactive `pnpm dev`/`pnpm build` launch checks (confirms the app starts and doesn't crash), never by actually clicking through the running app on a real screen. This is the most important category of manual testing below.
7. Two Rust-side simplifications, both logged as acceptable rather than bugs: `watch.rs`'s file-change events only distinguish "modify" vs "remove" (not "create"/"rename" — `notify-debouncer-mini` doesn't expose enough detail to do better); release builds emit a harmless `rust-objcopy`/`libLLVM.dylib` warning from a broken local `llvm-tools` component (doesn't affect the built binary).

### How to run it
```
pnpm install          # first time only
pnpm dev              # launch the app in dev mode (hot-reloading)
pnpm build            # produce target/release/bundle/macos/Marginalia.app
pnpm verify           # lint + typecheck + all 90 tests + cargo check
pnpm test             # just the test suite
```
Requires Node 20+, pnpm 9+, Rust stable (this machine needed a fresh install — see DECISIONS.md), and Xcode Command Line Tools. `pnpm dev` opens the app; use its "Open folder" button to pick or create a workspace directory (it'll offer to `git init` one that isn't already a repo).

### Top 5 things to manually test first
1. **PDF export, both Clean and Redline**, on a note with an image and a comment thread — confirm the preview window renders correctly and "Save as PDF" via the native print dialog produces a real, correct PDF. This is the riskiest, least-verified path in the whole app (see #1 above).
2. **The full comment lifecycle** in the live editor: select text → Cmd+Shift+M → type a comment → see the highlight and gutter number → reply → resolve → delete a comment vs. delete the whole thread → delete the underlying text and confirm it becomes a "Detached comment" → re-anchor it.
3. **A real merge with an actual text conflict**: create an idea, edit the same line on both the idea and main, merge, resolve via each of Take ours / Take theirs / Take both / Edit, finish the merge, and confirm the file and history look right. Then try Abort on a fresh conflict and confirm nothing was lost.
4. **File tree operations**: new note, new folder, rename, delete (with confirm), and drag a file into a folder — confirm each shows up correctly in git history and the tree updates live.
5. **Redline against each baseline kind** (Origin, a snapshot, another idea) via the Changes panel's baseline picker, including Prev/Next navigation (Alt+↑/↓) — and a resize/long-session sanity check that autosave, the git-missing screen (temporarily rename `/usr/bin/git` to test it, if you're brave), and error toasts (e.g., trigger one by deleting a file out from under an open merge) behave as expected.

---

## Current phase
Complete (Phases 0–7)

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

### Phase 5: Merge
- `packages/core`: `comments/mergeThreads.ts` (union by id; same-id comment edit conflicts favor ours; later `updated` wins on status; deleted-on-one-side-unchanged-on-other stays deleted), `versions/merge.ts` (`startMerge`/`resumeMerge`/`abortMerge`/`finishMerge`/`keepOurs|TheirsNonMd`/`markResolved`), `versions/diff3.ts` (pure diff3-marker parser + resolution renderer for ours/theirs/both/edit).
- UI: `MergeView.tsx` (replaces the editor area during a merge; per-file conflict cards, per-hunk Take ours/theirs/both/Edit, Mark resolved, Finish/Abort merge), wired into `App.tsx` (checks `.git/MERGE_HEAD` on every workspace open — including a fresh app launch — and calls `resumeMerge` if one's in progress) and `BranchMenu.tsx` (new "Merge into current" action, persists the source idea's name via `AppStore` so a restart can resume without knowing it from memory).
- **Phase 5 acceptance (SPEC.md §13), all passing** — `packages/core/test/merge.integration.test.ts` (11 tests): clean merge; text conflict resolved by ours/theirs/both (plus a diff3-marker-shape check); independent thread additions unioning with no surfaced conflict (real git line-merge subtlety hit and fixed along the way — see DECISIONS.md); same-thread replies on both sides unioning; later-`updated`-wins status conflict; abort restoring pre-merge HEAD and working tree; non-md conflict resolved with keep-theirs; resuming a merge (fresh `GitClient`, no in-memory state) re-deriving the identical pending conflict from git alone.
- `pnpm verify` passes (lint + typecheck + 84 tests + `cargo check`). App launches cleanly; no interactive GUI click-through (same caveat as Phases 1–4).

### Phase 6: PDF export
- `packages/core/src/export/`: `theme.ts` (SPEC.md §11.3's theme.css, kept as a TS string constant rather than a standalone .css file — core has no bundler/`node:fs` to read one at runtime; see DECISIONS.md), `embedImages.ts` (regex-based markdown image-reference rewriter to `data:` URIs — no AST walk, since `unist-util-visit` isn't in the allowed dependency list), `toHtml.ts` (clean export), `redlineHtml.ts` (redline export with `<ins>`/`<del>`, `allowDangerousHtml`).
- UI: `ExportDialog.tsx` (Clean/Redline + page size, wired to `platform.pdf.renderHtmlToPdf` — which is the Phase 0/Spike A **fallback** implementation: a visible preview window + native Print dialog, not silent automatic export), and finally a real `Toolbar.tsx` consolidating the previously-deferred triggers (Live/Source toggle, Comment, Redline toggle, **Snapshot** — which had no UI trigger at all before this — and Export).
- **Phase 6 acceptance (SPEC.md §13), all passing** — `packages/core/test/export.test.ts` (5 tests): clean and redline exports contain no `comment-start`/`comment-end`/`marginalia:comments` strings and no comment body text, even when the source document has an active comment thread with a distinctive secret string in its body; redline HTML's `<ins>`/`<del>` counts match the fixture's actual hunk count (single edit → 1/1, two independent edits → 2/2, no changes → 0/0).
- **Manual export smoke procedure** (documented here per spec, since `pnpm verify` can't drive the native print dialog):
  1. `pnpm dev`, open a workspace folder, open a note with at least one image reference and one comment thread.
  2. Toolbar → Export → choose **Clean** → Letter → Export → pick a save location in the OS dialog that appears.
  3. A visible "Export preview" window should open showing the rendered note (serif body text, sans-serif headings, embedded image, **no** milestone tags or comment text visible) with a "Print…" banner at the top.
  4. Click **Print…** → in the native print dialog, choose **PDF → Save as PDF** → confirm the saved PDF opens and looks right (theme fonts, image embedded, margins reasonable).
  5. Repeat with **Redline** selected: the preview should additionally show a "Changes from Origin to `<branch>`" header line, with insertions underlined/green and deletions struck-through/red.
  6. Toolbar → Snapshot → name it → confirm no error toast; Sidebar → History tab → confirm the new snapshot row appears.
- `pnpm verify` passes (lint + typecheck + 89 tests + `cargo check`). App launches cleanly; the automated GUI-click-through caveat from Phases 1–5 now specifically includes **not having run the manual procedure above** — flagging this explicitly since PDF export was the single riskiest, most novel part of the whole spec (Spike A's saga) and deserves an actual human check before being trusted.

### Phase 7: Polish
- Settings (`autosaveDelayMs`, `defaultPageSize`) persisted via `AppStore`, editable through a new `SettingsDialog.tsx` (gear icon in the status bar); `EditorPane`'s autosave debounce and `ExportDialog`'s default page size both read from it now instead of hardcoded constants.
- `ShortcutsSheet.tsx` (Cmd+/), the git-missing blocking screen (detected from the existing `GitRunner` contract's rejection rather than a new Platform method — see DECISIONS.md), a global `unhandledrejection`-driven `ToastContainer.tsx` for dismissible error toasts with a Details expander, and the missing Cmd+E source-mode shortcut (previously toolbar-button-only).
- Resolved `workspace.ts`'s one remaining TODO: `createNote`/`createFolder`/`renameEntry`/`removeEntry`/`moveEntry` now commit per SPEC.md §6 (skipping the commit for an empty new folder, since git can't track those at all). Wired all of these into `FileTree.tsx` for the first time (new note/folder buttons, right-click rename/delete, native HTML5 drag-and-drop move) — previously built in core but never reachable from the UI.
- Removed the now-obsolete Phase 0 `spike_a.rs` diagnostic hook, as promised in its own comment, now that Phase 6 wired the real export path.
- Final TODO sweep: zero `TODO` comments remain anywhere in `packages/` or `apps/`.
- **First-ever `pnpm build` run** (every prior phase only checked `pnpm dev`) surfaced a real, previously-unknown issue: the `.dmg` bundling step failed twice (Tauri's own bundler, likely an environment-specific `hdiutil`/Finder restriction) while the `.app` bundle succeeded both times. Switched `tauri.conf.json` to `"app"`-only bundling per the two-failures rule, then verified the resulting `Marginalia.app` both builds and actually launches as a real process.
- `pnpm verify` passes (lint + typecheck + 90 tests + `cargo check`). `pnpm build` passes and produces a working `.app`. See the final report at the top of this file for the complete picture.

### Post-Phase 7: Compare view (saved idea vs. current draft)
- Core: `SaveCommit.save` is write-only; `commitDraft` ("Save idea"); `versions/draft.ts` (`hasDraftChanges`, `draftSummary`, `discardDraft`, `switchIdea` carry/discard/clean); `versions/compare.ts` (`listChangedFiles`, `ideaFileText`, `defaultCompareBase`). Tree actions no longer commit.
- UI: `CompareBar` (Base | Changes dropdowns), rewritten `ChangesPanel` (VS Code-colored changed-file list, Save idea, hunk nav), `BasePane` (read-only base with struck-through removals, scroll-synced), `ideaActions.ts` (`saveIdea`, `switchToIdea`, `refreshDraft`), `ChoiceDialogHost` (carry over / discard). Cmd+S = Save idea. Status bar shows "Unsaved changes" / "Idea saved".
- `pnpm verify` passes (102 tests). See DECISIONS.md for the trade-offs.
- **Manual check still needed:** open two ideas, edit, watch the file list colors, switch the right dropdown with unsaved changes (carry and discard), delete/add a note and open it from the list.

### Post-Phase 7: Per-section custom CSS (requested by the user)
- Core: `document/frontmatter.ts` (`splitFrontmatter`, `parseSectionStyles` — a hand-rolled parser for a `sectionStyles:` frontmatter block only), `export/scopeCss.ts` (`slugifyHeading`, `scopeCss` — brace-depth-counting selector-prefixer), `export/htmlTransform.ts` (`rehypeAddClasses` adds `md-*` classes to common elements; `rehypeWrapSections` wraps each H1's content in `<div class="md-section" data-section="...">`), `export/sectionCss.ts` (`buildSectionCss` reads and scopes each mapped stylesheet). `embedImages.ts`'s path-joining helper is now exported as `resolveRelativePath` and shared. Wired into both `toHtml` (also now strips frontmatter before rendering) and `redlineHtml`.
- UI: `editor/sectionStyles.ts` (`computeSections`, `sectionsField` — H1-to-next-H1 line ranges as a `cm-section-<slug>` class, same pattern as `cm-quote`), `editor/useSectionCss.ts` (reads a note's frontmatter, loads/scopes the mapped stylesheet(s), gated on the frontmatter text so it doesn't re-read on every keystroke), wired into `EditorPane` as an injected `<style>` tag. `basePane.ts` (compare view's read-only left pane) also gets `sectionsField` for consistency. `livePreview.ts` additionally gives list items a `cm-li` line class (the spec table's "ListMark, Table | styled" entry previously had no class of its own for list items).
- SPEC.md §11.4 documents the feature; the old "Custom export CSS" out-of-scope line is removed.
- `pnpm verify` passes (lint + typecheck + 120 tests + `cargo check`). New tests: `frontmatter.test.ts`, `scopeCss.test.ts`, an export.test.ts section covering class-adding/section-wrapping/scoped-stylesheet-inclusion end to end, `ui/test/sectionStyles.test.ts`, and a `cm-li` case in `livePreview.test.ts`.
- **Manual check still needed** (same caveat as everything else in this file): no interactive GUI click-through — open a note with a `sectionStyles` frontmatter block and confirm the live editor actually applies the per-section styling, and that exported PDFs do too.

### Post-Phase 7: Doc-wide custom CSS (follow-up requested by the user)
- Core: `document/frontmatter.ts` adds `parseDocCss` (a single top-level `css:` frontmatter key, unscoped, separate from `sectionStyles`); `export/sectionCss.ts` adds `buildDocCss`. Wired into `toHtml`/`redlineHtml` so the doc-wide stylesheet is inlined first, before any section-scoped CSS (so a section's own rules win on equal specificity).
- UI: `editor/useSectionCss.ts` reads `css` the same way, unscoped, and injects it before the section-scoped CSS in the same `<style>` tag.
- SPEC.md §11.4 updated to document `css` alongside `sectionStyles`.
- `pnpm verify` passes. New tests: `parseDocCss` cases in `frontmatter.test.ts`, an export.test.ts section covering `css` + `sectionStyles` together (unscoped doc-wide CSS before scoped section CSS) and an unreadable-`css`-path case.
- **Manual check still needed:** same caveat — open a note with just a `css:` frontmatter key (no `sectionStyles`) and confirm it styles the whole note live and in export.

### Post-Phase 7: Editable CSS files, an unfiltered file tree, and an "unreadable file" state (requested by the user)
- Core: `workspace.ts`'s `listTree` no longer filters to `.md`/images or hides dotfiles/dot-folders — it now shows every file and folder, hiding only `.git` (git's own plumbing; exposing it would let tree actions like rename/delete/drag-move touch the repo itself).
- UI: `store.ts` adds `OpenFile.kind` (`"markdown" | "css"`) and `fileKindFor(path)` (`.md` -> markdown, `.css` -> css, anything else -> `"unreadable"`), plus an `unreadableFile` store field (same pattern as the existing `deletedView`). `FileTree.tsx` and `ideaActions.ts`'s `reopen` (restoring the open file after a branch switch) both dispatch on `fileKindFor` instead of assuming markdown. New `CssEditorPane.tsx`: a plain-text CodeMirror editor for `.css` files (no comments/threads/milestones/live-preview/redline — markdown-only concepts), with the same write-only autosave flow as `EditorPane`. `App.tsx` routes the editor area by `openFile.kind`/`unreadableFile` (css -> `CssEditorPane`, unreadable -> "File not readable in Marginalia", otherwise `EditorPane`) and hides `BasePane`/export for non-markdown files; `Toolbar.tsx` hides the Live/Source, Comment, and compare-layout buttons for `.css` files (Snapshot stays, since it's idea-wide).
- SPEC.md §6 updated.
- `pnpm verify` passes (130 tests). New tests: a rewritten `listTree` test (shows hidden files/folders and non-md/image extensions, still hides `.git`), `packages/ui/test/store.test.ts` (`fileKindFor`).
- **Known gap:** if an *unreadable* file (not a `deletedView`/`openFile`) is open when the user switches ideas, `reopen` doesn't restore that state — `openPath` is only captured from `openFile`/`deletedView`. Minor; logged rather than fixed, since it only affects what's showing right after a branch switch, not any data.
- **Manual check still needed:** same caveat as everything else in this file — open a `.css` file from the tree, edit it, confirm autosave/Save-idea commits it; open a hidden dotfile and a non-css/md file and confirm the "File not readable in Marginalia" message; confirm `.git` still doesn't show up in the tree.

### Post-Phase 7: Fixed the live-preview CSS bug the user hit, and documented the class vocabulary
- The user reported "the css yaml attribute doesn't seem to work." Root cause: the live editor is CodeMirror decorating markdown *source*, never a real HTML tree — plain tag selectors (`h1 { … }`) that work fine against exported HTML's real tags match nothing in the live editor, which only has `cm-*` classes.
- SPEC.md §11.4 rewritten with a full class-by-class table (export's tag + `md-*` class vs. the live editor's `cm-*` class for every common construct), and moved to its correct position after §11.3 (it had been misnumbered/misplaced ahead of "Native PDF" since it was first added).
- Filled two real gaps so the table has an entry for every row: `livePreview.ts` now gives plain paragraphs a `cm-paragraph` line class and the rendered image widget a `cm-image` class (previously neither had any class at all).
- **Separately found and fixed a real bug while tracing this:** the doc-wide `css:` stylesheet was injected into the live editor completely unscoped, leaking into the whole app's UI (toolbar, sidebar, …), not just the note. `useSectionCss.ts` now scopes it to `.cm-editor` instead. Export's doc-wide CSS is correctly left unscoped (it's a standalone document, nothing else to leak into) — unaffected.
- Initially declined (per the user, "distinct classes are fine"), then asked for again next message: auto-aliasing bare tag selectors to their `cm-*` equivalent so one stylesheet "just works" in both renderers.
- `pnpm verify` passes (132 tests). New tests: `cm-paragraph`/`cm-image` cases in `livePreview.test.ts`.
- **Manual check still needed:** open a note with `css: note.css` setting e.g. `.cm-h1 { color: red }`, confirm it colors headings in the live editor and does NOT bleed into the toolbar/sidebar; confirm the same note's exported PDF is still styled correctly by its `h1 { color: red }` (or `.md-h1`) rule.

### Post-Phase 7: Auto-alias bare tag selectors for the live editor (follow-up — the user asked for this after all)
- Core: `export/scopeCss.ts`'s rule-splitting loop factored out as `parseTopLevelCssRules` (behavior-preserving — `scopeCss` itself is unchanged, just built on the shared helper now).
- UI: new `editor/cssTagAlias.ts` (`aliasTagSelectors`) — for each top-level rule, a bare-tag selector (`h1`, `li`, `p`, `blockquote`, `code`, `pre`, `strong`/`b`, `em`/`i`, `del`/`s`, `a`, `img`; case-insensitive) gets its matching `.cm-*` class added alongside it. Anything else (classes, combinators, pseudo-classes) is left as-is. Wired into `useSectionCss.ts`: every stylesheet (doc-wide and per-section) is aliased before it's scoped, so a stylesheet written once with plain tags now works unmodified in both the live editor and PDF export.
- SPEC.md §11.4 updated to describe the aliasing (and that the export side needs none of this, since it already has real tags).
- `pnpm verify` passes. New tests: `packages/ui/test/cssTagAlias.test.ts` (aliasing cases, including "leaves complex selectors alone" and "leaves at-rules alone"); `scopeCss.test.ts` re-run unchanged to confirm the refactor didn't change its behavior.
- **Manual check still needed:** open a note with `css: note.css` containing plain tags only (`h1 { color: red; } li { font-style: italic; }`), confirm both rules visibly apply in the live editor (not just the exported PDF).

### Post-Phase 7: Live-reload CSS within a second or two of saving (follow-up — the user explicitly asked for this timing)
- UI: `useSectionCss.ts` rewritten to poll the referenced stylesheet(s) from disk every 1 second (`POLL_MS`) instead of only re-reading when the open note's own path or frontmatter text changes. The polling `setInterval` is set up once per file open (keyed on `[platform, path]`, not `docText`, which changes on every keystroke) and reads the note's current text through a ref updated every render, so it survives typing instead of being torn down and rebuilt on every character. A `setCss` (and the `<style>` tag re-render it causes) only fires when the combined CSS string actually changed since the last tick.
- The composed read-and-combine logic is now a standalone, exported, unit-tested function (`buildCombinedCss`), separate from the React effect/polling wiring.
- Considered building on `platform.fs.watch` instead of polling — it's on the `Platform` interface and SPEC.md §6 describes using it for external-file-change sync, but nothing in the UI actually calls `fs.watch` anywhere (that sync was apparently never wired up despite being spec'd). Polling was the much smaller lift for "a second or two."
- SPEC.md §11.4 updated with a "Live reload" bullet.
- `pnpm verify` passes. New test: `packages/ui/test/useSectionCss.test.ts` (`buildCombinedCss` composition — doc-wide-before-section ordering, missing-file skip, empty case). The polling/timer behavior itself isn't automated (no React testing utility in this project — flagged, not silently skipped).
- **Manual check still needed:** with a note open that references `part-one.css`, edit and save `part-one.css` in its own tab, and confirm the note's live styling updates within a second or two without switching away and back.

### Post-Phase 7: Render top-level lists as a real <ol>/<ul> in the live editor (requested by the user, to make `list-style-type` controllable for ordered lists)
- Core: new `export/renderMarkdownFragment.ts` (`renderMarkdownFragmentSync`) — the same remark/rehype pipeline export uses (including `rehypeAddClasses`), run via `processSync` so it can be called synchronously from CodeMirror's decoration-building.
- UI: new `editor/listEligibility.ts` (`isCollapsibleList`, shared between the two providers below), `editor/listWidget.ts` (`ListWidget`, renders a list's sliced source via `renderMarkdownFragmentSync`, lazily in `toDOM()` so an unchanged list doesn't re-render), and `editor/listRenderField.ts` — a **StateField**, not a ViewPlugin, specifically because CodeMirror throws `RangeError: Block decorations may not be specified via plugins` if a ViewPlugin tries to provide one (found this the hard way — see DECISIONS.md for the full story). `livePreview.ts`'s existing ViewPlugin now skips its own per-item decorations for a list exactly when `isCollapsibleList` says the other field is handling it, so the two never cover the same lines twice. Wired into `editorSetup`/`baseExtensions` (`setup.ts`, `basePane.ts`).
- A list is collapsed only when it's top-level (direct child of `Document`, so never nested inside a blockquote — verified against the real parse tree first), not actively being edited, compare/redline mode is off, and it contains no comment milestone. Any of those makes it fall back to plain source (`cm-li` lines), same as before this change existed.
- SPEC.md §7.2's decoration table updated with the new `OrderedList`/`BulletList` row.
- `pnpm verify` passes (152 tests). New tests: `core/test/renderMarkdownFragment.test.ts` (ordered/unordered/nested/inline-formatting/task-checkbox rendering, non-1 start number), 5 new cases in `ui/test/livePreview.test.ts` (collapses when inactive, falls back to source when active, unordered too, never collapses in a blockquote, never collapses with a comment milestone inside it).
- **Known, deliberate gaps** (logged, not silently regressed): a task-list checkbox inside a collapsed list is shown (checked/unchecked correctly) but not clickable — click into the list to edit it, where the existing clickable checkbox widget takes back over. No perf benchmark was written for `listRenderField`'s whole-document tree walk (it can't restrict itself to the viewport the way `livePreview` does, since StateFields have no viewport access) — flagged as something to profile if a document with many lists is ever reported slow, not pre-optimized on a guess.
- **Manual check still needed:** open a note with `css: note.css` setting `ol { list-style-type: upper-roman; }`, confirm an ordered list renders with roman numerals while the cursor is elsewhere and falls back to plain `1. 2. 3.` source while editing it; confirm a nested list, a task-list item, and inline bold/link/code inside a list item all render correctly; confirm a list inside a blockquote and a list with a comment on it never collapse.

## Blocked
(none)
