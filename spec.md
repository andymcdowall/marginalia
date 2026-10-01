# Marginalia — Implementation Spec (v1, macOS)

Marginalia is a desktop markdown editor in the spirit of Obsidian (live preview), built for **proposing and tracking changes** to documents: range comments with reply threads, a redline diff against any past version, git-backed branches ("ideas") and named snapshots, and PDF export.

This spec is written to be executed directly. Where it says **MUST**, do exactly that. Where a detail is unspecified, choose the simplest option consistent with this document and log it in `DECISIONS.md`.

---

## 0. Ground rules for the implementing agent

1. **Build in the phase order of section 13.** Don't start a phase until the previous phase's "Done when" list passes.
2. **Respect the architecture boundaries in section 2.** They are the most important rule in this document.
3. **Prefer boring code.** Use plain functions and small modules, with no clever abstractions, no class hierarchies, and no dependency injection frameworks. Pass the `Platform` object as an argument.
4. **Use only the dependencies listed in section 3.** Adding one requires a line in `DECISIONS.md`.
5. **Use `pnpm verify` (section 3.3) to check a phase is done.** Never leave `pnpm tauri dev` running as a check; it doesn't exit.
6. **Target macOS only** (Apple Silicon and Intel, macOS 13+). Don't write Windows or Linux code paths.
7. **Keep the files the source of truth.** Never lose user text or comment text. When in doubt, preserve content and mark it orphaned instead of discarding it.

---

## 1. Product scope

### In scope (v1)
- A folder workspace with a file tree, containing markdown notes and images.
- An Obsidian-style live-preview editor, with a source-mode toggle.
- Range comments stored in the file, with replies, resolve/reopen, orphan handling, and re-anchoring.
- A git backend: autosave writes files into a current draft, "Save idea" commits it, named snapshots, idea branches (create/switch/rename/delete), merge with a conflict UI, per-file history, and restore.
- A redline diff: word-level, toggleable, editable while on, with per-change revert, a selectable baseline, and change navigation.
- PDF export, clean or redline, with a default theme. Comments never appear in exports.

### Out of scope (v1). Don't build these.
- Wikilinks, backlinks, graph view, plugins, tags, and search across files.
- Git remotes (push/pull/clone), multiple users, and sync.
- Windows, Linux, web, and mobile.
- Rendered table widgets (tables are shown as styled source).
- Mermaid diagrams and math.
- Page numbers in PDF.

---

## 2. Architecture

### 2.1 Repository layout (MUST)

```
marginalia/
  package.json               # root scripts (section 3.3), pnpm workspaces
  pnpm-workspace.yaml
  tsconfig.base.json
  eslint.config.js
  CLAUDE.md  PROGRESS.md  DECISIONS.md  SPEC.md
  packages/
    core/                    # @marginalia/core — pure TS, no DOM, no Node, no Tauri
      src/
        platform.ts          # Platform interfaces (section 2.3)
        comments/            # types.ts parse.ts serialize.ts ids.ts escape.ts mergeThreads.ts
        document/            # splitFile.ts joinFile.ts (file <-> {body, threads})
        diff/                # tokenize.ts wordDiff.ts cleanText.ts hunks.ts revert.ts
        git/                 # GitClient.ts (command builders + output parsers)
        versions/            # saveCommit.ts snapshots.ts branches.ts history.ts merge.ts baseline.ts
        workspace/           # workspace.ts (open/init/tree/external-change sync)
        export/              # toHtml.ts redlineHtml.ts theme.css
        index.ts
      test/
    platform-node/           # @marginalia/platform-node — Platform over node:fs + child_process
      src/index.ts           # used ONLY by tests
    ui/                      # @marginalia/ui — React + CodeMirror 6
      src/
        App.tsx  main.tsx  platformContext.tsx  store.ts
        components/          # FileTree, EditorPane, Toolbar, StatusBar, CommentsPanel,
                             # ChangesPanel, HistoryPanel, BranchMenu, MergeView, dialogs/
        editor/              # livePreview.ts milestones.ts commentHighlights.ts redline.ts
                             # clipboard.ts frontmatter.ts theme.ts setup.ts
        styles/              # app.css (CSS variables, light/dark)
      test/
  apps/
    desktop/                 # Tauri 2 app
      index.html  vite.config.ts
      src/platformTauri.ts   # Platform impl over Tauri invoke/events
      src/main.tsx           # mounts @marginalia/ui with platformTauri
      src-tauri/
        Cargo.toml  tauri.conf.json  capabilities/default.json
        src/main.rs  lib.rs  fs.rs  git.rs  watch.rs  store.rs  pdf.rs
```

### 2.2 Boundary rules (MUST; enforced by ESLint `no-restricted-imports`)
- `packages/core` MUST NOT import `react`, `@codemirror/*`, `@tauri-apps/*`, `electron`, or `node:*`, and MUST NOT use `window` or `document`.
- `packages/ui` MUST NOT import `@tauri-apps/*`, `electron`, or `node:*`. It gets the platform only through `platformContext`.
- **All git logic lives in `core/src/git` and `core/src/versions`.** This means building argument arrays and parsing output. Rust only executes `git` with the arguments it's given.
- Rust contains no business logic: just file IO, process execution, file watching, a JSON key-value store, and PDF printing.
- Swapping to Electron later should require only a new `apps/desktop-electron` containing a `platformElectron.ts`.

### 2.3 Platform interfaces (`core/src/platform.ts`, MUST match)

```ts
export type DirEntry = { name: string; path: string; kind: 'file' | 'dir' };
export type FsEvent = { kind: 'create' | 'modify' | 'remove' | 'rename'; paths: string[] };
export type Unsubscribe = () => void;

export interface FileSystem {
  // All paths are ABSOLUTE. Implementations MUST reject paths outside the open workspace root
  // (except the app config/cache dirs used by AppStore/PdfRenderer).
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  writeText(path: string, content: string): Promise<void>;   // atomic: temp file + rename
  writeBinary(path: string, data: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<DirEntry[]>;                     // non-recursive
  mkdir(path: string): Promise<void>;                         // recursive
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;                        // file or dir (recursive)
  watch(dir: string, cb: (e: FsEvent) => void): Unsubscribe;  // recursive, debounced 200ms
}

export type GitResult = { stdout: string; stderr: string; code: number };
export interface GitRunner {
  run(cwd: string, args: string[], opts?: { stdin?: string }): Promise<GitResult>;
}

export type PdfOptions = { pageSize: 'letter' | 'a4'; marginPt: number };
export interface PdfRenderer {
  renderHtmlToPdf(html: string, outPath: string, opts: PdfOptions): Promise<void>;
}

export interface Dialogs {
  openFolder(): Promise<string | null>;
  saveFile(opts: { defaultName: string; extensions: string[] }): Promise<string | null>;
  confirm(message: string, opts?: { okLabel?: string; danger?: boolean }): Promise<boolean>;
}

export interface AppStore {            // app-level settings, JSON in the app config dir
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface Platform {
  fs: FileSystem;
  git: GitRunner;
  pdf: PdfRenderer;
  dialogs: Dialogs;
  store: AppStore;
  resolveAssetUrl(absPath: string): string;   // for <img src>, e.g. Tauri convertFileSrc
  openExternal(url: string): Promise<void>;
  onBeforeQuit(cb: () => Promise<void>): Unsubscribe;
}
```

`platform-node` implements everything except `pdf`, `dialogs`, and `resolveAssetUrl`, which throw "not supported in tests".

---

## 3. Stack & tooling

### 3.1 Dependencies (use the latest stable versions)
- **Root/dev:** `typescript` (strict), `vite`, `vitest`, `jsdom`, `eslint` + `typescript-eslint`, `prettier`.
- **core:** `diff-match-patch` (+ `@types/diff-match-patch`), `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-stringify`. No other runtime deps.
- **ui:** `react`, `react-dom`, `zustand`, `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-markdown`, `@codemirror/language-data`, `@codemirror/search`, `@lezer/markdown`, `@lezer/highlight`.
- **desktop (JS):** `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-opener`, `@tauri-apps/cli`.
- **desktop (Rust):** `tauri` (v2), `tauri-plugin-dialog`, `tauri-plugin-opener`, `serde`, `serde_json`, `notify` + `notify-debouncer-mini`, `tempfile`, and for PDF `objc2`, `objc2-foundation`, `objc2-app-kit`, `objc2-web-kit`.
- **Don't use:** Playwright, Redux, CSS frameworks (Tailwind etc.), ProseMirror/TipTap, isomorphic-git, or `tauri-plugin-fs`. The app uses its own Rust commands instead of `tauri-plugin-fs`.

### 3.2 Toolchain
Node 20+, pnpm 9+, Rust stable, and Xcode Command Line Tools.

### 3.3 Root scripts (MUST exist)
```
pnpm dev        -> pnpm --filter desktop tauri dev
pnpm build      -> pnpm -r build && pnpm --filter desktop tauri build
pnpm test       -> vitest run (all packages)
pnpm lint       -> eslint .
pnpm typecheck  -> tsc -b (all packages)
pnpm verify     -> pnpm lint && pnpm typecheck && pnpm test && (cd apps/desktop/src-tauri && cargo check)
```

---

## 4. Rust shell (`apps/desktop/src-tauri`)

### 4.1 Commands
Every command returns `Result<T, String>` and runs its work in `tauri::async_runtime::spawn_blocking`.

| Command | Args | Notes |
|---|---|---|
| `set_workspace` | `root` | Stores the root in app state, and allows the root in the asset-protocol scope (`app.asset_protocol_scope().allow_directory(root, true)`). |
| `fs_read_text` / `fs_read_binary` | `path` | Rejects paths outside the root. |
| `fs_write_text` / `fs_write_binary` | `path, content` | Atomic: write `path.tmp-<rand>` in the same dir, then rename it over `path`. |
| `fs_exists`, `fs_list`, `fs_mkdir`, `fs_rename`, `fs_remove` | | Rejects paths outside the root. |
| `watch_start` / `watch_stop` | `root` | `notify-debouncer-mini` at 200 ms, recursive. Emits the `fs-change` event with `{kind, paths}`. Ignores anything under `.git/`. |
| `git_run` | `cwd, args, stdin?` | See 4.2. |
| `store_get` / `store_set` | `key, value` | A single `settings.json` in `app_config_dir`. |
| `pdf_render` | `html, outPath, pageSize, marginPt` | See section 11.3. |

Path check: canonicalize (or normalize, for paths that don't exist yet) and require `starts_with(root)`. For `fs_write_*`, the out path for PDF export comes from the save dialog, so PDF writing happens only through `pdf_render`, which skips the root check.

### 4.2 Running git
- Resolve the git binary once at startup, using the first path that works: `/opt/homebrew/bin/git`, `/usr/local/bin/git`, `/usr/bin/git`. A binary works if `git --version` exits with 0. If none works, the UI shows a blocking screen: "Git is required. Install Xcode Command Line Tools (`xcode-select --install`) or Homebrew git, then restart."
- Set the environment for each run: `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, `GIT_OPTIONAL_LOCKS=0`.
- Return stdout, stderr, and the exit code. Never treat a non-zero code as a Rust error; core interprets it.

### 4.3 Lifecycle
On `CloseRequested`, prevent the close and emit `before-quit`. The UI flushes its saves and then calls the `quit_now` command.

---

## 5. File format

### 5.1 Overall
```
<body markdown, containing comment milestones>
[ "\n" + comment block ]      # present only if there is at least one thread
```
- The **body** is everything before the comment block, byte-for-byte. Frontmatter, CRLF/LF, and trailing whitespace are preserved.
- The **comment block** MUST be the last thing in the file, and has exactly this shape:

```
<!-- marginalia:comments
<comments>
  <thread id="k3f9a2" status="open" updated="2026-09-28T20:31:00-05:00">
    <comment id="p81xq0" created="2026-09-28T20:15:00-05:00">Is this date right?</comment>
    <comment id="z0m4c7" created="2026-09-28T20:31:00-05:00">Confirmed **March 14**.&#10;&#10;Second paragraph.</comment>
  </thread>
</comments>
-->
```
- The block is wrapped in an HTML comment, so other markdown renderers show nothing.

### 5.2 Milestones (inline, in the body)
- Start: `<comment-start id="k3f9a2"/>`. End: `<comment-end id="k3f9a2"/>`.
- Regex: `/<comment-(start|end) id="([a-z0-9]{6})"\/>/g`.
- A range may span paragraphs, and ranges may overlap or interleave.
- IDs: 6 characters of lowercase base36, randomly generated and unique within the file (thread IDs and comment IDs share one namespace). Generate with `crypto.getRandomValues`.

### 5.3 Escaping comment bodies (`comments/escape.ts`)
- Escape in this order: `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`, `"`→`&quot;`, `-`→`&#45;` **only when directly preceded by `-`** (so that `--` can't occur), and `\n`→`&#10;`, `\r`→`&#13;`.
- Unescape these entities in reverse. **Round-trip MUST be exact for any string**; include a property test.

### 5.4 Types (`comments/types.ts`)
```ts
export type ThreadStatus = 'open' | 'resolved' | 'orphaned';
export type Comment = { id: string; created: string; body: string };   // ISO 8601 with local offset
export type Thread = { id: string; status: ThreadStatus; updated: string; comments: Comment[] };
export type SplitFile = { body: string; threads: Thread[]; warnings: string[] };
```

### 5.5 `splitFile(raw)` / `joinFile(body, threads)`
- **splitFile:** find the last occurrence of `\n<!-- marginalia:comments\n`. If the text after it ends with `-->` plus optional trailing whitespace, that's the block. The body is everything before the `\n`. Parse the threads with a small hand-written parser (regexes for `<thread …>…</thread>` and `<comment …>…</comment>`; attributes in any order). No XML library.
- Malformed block: keep the raw text inside the body unchanged, return no threads, and add a warning. The UI then shows a banner: "Comment block could not be read; it was left in the file as text."
- **Reconciliation after parsing** (mutates statuses; `updated` is not changed):
  - A thread with no start or end milestone in the body, or with end before start, becomes `orphaned`.
  - A thread whose milestones enclose zero characters becomes `orphaned`.
  - A milestone whose id has no thread gets a new thread created for it, with status `orphaned` and one comment body `(comment text missing)`.
  - An `orphaned` thread whose milestones are valid again is set back to `open`.
- **joinFile:** if there are no threads, return `body` unchanged. Otherwise return `body + "\n" + block`, where the block uses the exact indentation above: 2 spaces for threads, 4 for comments, and `\n` line endings. Threads are ordered by their start-milestone position, with orphans last (sorted by id).
- **Round-trip MUST hold:** `joinFile(splitFile(x))` equals `x` for any file previously produced by `joinFile`.

### 5.6 Display numbers
Numbers are computed at runtime, never stored. Order threads by start position, then assign 1..n. Orphans get no number.

---

## 6. Workspace (`core/src/workspace`)

- **Open folder:** call `dialogs.openFolder()`, then `set_workspace`, then check git:
  - Run `git -C root rev-parse --show-toplevel`. If the folder isn't a repo, confirm "Initialize version history in this folder?" and then run `git init -b main`.
  - If `git config user.name` is empty, set a repo-local `user.name "Marginalia"` and `user.email "marginalia@localhost"`.
  - If the repo has no commits, run `git add -A` then `git commit --allow-empty -m "Initial commit"`, and record `git config branch.main.marginaliaBase <root sha>`.
  - If the root isn't the toplevel (the user opened a subfolder), use the toplevel as the git cwd and the folder as the tree root.
- **Sync external changes on open:** if `git status --porcelain` is non-empty, run `git add -A` and `git commit -m "sync: external changes"`.
- **Merge in progress:** if `.git/MERGE_HEAD` exists, open the Merge view (section 9.4) immediately.
- Persist the last workspace in `AppStore` (`lastWorkspace`) and reopen it on launch.
- **File tree:** lazy-list directories. Shows every file and folder, including dotfiles/dot-folders, except `.git` (git's own plumbing — exposing it would let tree actions touch the repo itself). Sort folders first, then case-insensitive by name. Opening a file dispatches on its extension (`fileKindFor`, `packages/ui/src/store.ts`): `.md` opens the full live-preview editor, `.css` opens a plain-text editor (`CssEditorPane` — no comments/threads/live-preview/redline, which are markdown-only), and anything else shows "File not readable in Marginalia" instead of being opened.
- **Tree actions:** new note (creates `Untitled.md`, or `Untitled 2.md` etc., then starts rename), new folder, rename, delete (confirm), and drag-move. Each only changes the working tree (it becomes part of the current draft); nothing is committed until the idea is saved.
- **External change to the open file** (from a watch event): read the file. If it equals the last content we wrote, ignore it. If the editor has no unsaved changes, reload silently. Otherwise show a banner: "File changed on disk. [Reload] [Keep mine]". *Keep mine* saves, which overwrites the file (still part of the draft).

---

## 7. Editor (`packages/ui/src/editor`)

### 7.1 Document model in the editor (IMPORTANT)
- The CodeMirror document contains **only the body** (milestones included). The comment block is **never** in the editor.
- Threads live in the zustand store for the open file.
- Save = `joinFile(editorDoc, threads)`.

### 7.2 Live preview (`livePreview.ts`)
A `ViewPlugin` builds decorations from `syntaxTree(state)` over `view.visibleRanges`. The "active" set is every line touched by any selection range. Markup is hidden (`Decoration.replace({})`) only when it's **not** on an active line.

| Node(s) | Always | When not on an active line |
|---|---|---|
| `ATXHeading1-6` | line class `cm-h1..6` | hide `HeaderMark` and the following space |
| `Emphasis`, `StrongEmphasis`, `Strikethrough` | mark class `cm-em` / `cm-strong` / `cm-strike` | hide `EmphasisMark`/`StrikethroughMark` |
| `InlineCode` | mark `cm-inline-code` | hide `CodeMark` |
| `Link` | mark `cm-link` on the text | hide `LinkMark`s and `URL` (show only the link text); Cmd+click opens it: `.md` relative paths open in the app, `http(s)` via `openExternal` |
| `Image` | — | replace the whole node with an `<img class="cm-image">` widget (`src=resolveAssetUrl(resolved path)`, max-width 100%) |
| `Blockquote` | line class `cm-quote` | hide `QuoteMark` |
| `FencedCode` | line class `cm-code-block` on all lines; syntax highlighting via `@codemirror/language-data` | fence lines get class `cm-fence` (dimmed, still visible) |
| `ListItem` | line class `cm-li` on every line it spans | — |
| `Paragraph` | line class `cm-paragraph` on every line it spans | — |
| `HorizontalRule` | — | replace with an `<hr>` widget |
| `TaskMarker` | — | replace with a checkbox widget; clicking it toggles `[ ]`/`[x]` |
| `ListMark`, `Table` | styled, never hidden | — |

- Frontmatter (`frontmatter.ts`): if the doc starts with `---\n`, lines through the next `---` line get class `cm-frontmatter` (monospace, dimmed). No parsing.
- **Source mode** (toggle with Cmd+E or a toolbar button) disables `livePreview` and `milestones` hiding, so the raw body is shown.
- Setup: `history()`, default keymap, `search()` keymap (Cmd+F), line wrapping, `markdown({ base: markdownLanguage, codeLanguages: languages })` with GFM, and Cmd+B / Cmd+I / Cmd+K to wrap the selection in `**`, `*`, or `[](url)`.

### 7.3 Autosave
Triggered by a 1500 ms debounce after the last doc change, window blur, switching files, switching ideas, and `before-quit`. Autosave **only writes the file** (`SaveCommit.save`, section 9.1); it never commits. The edits form the idea's *current draft*. Cmd+S and the toolbar's "Save idea" button commit the draft (section 9.1). The status bar shows "Saving…", "Unsaved changes" (draft differs from the idea's latest commit) or "Idea saved", plus an error state with a retry button.

---

## 8. Comments UI

### 8.1 Milestones in the editor (`milestones.ts`)
- A `StateField` finds all milestone matches in the doc (a regex over the doc text; recompute on docChanged). It provides `Decoration.replace({})` for each tag **in both live and source mode** (hidden unless source mode is on). It also provides `EditorView.atomicRanges`, so tags behave as one unit: the cursor skips over them, and Backspace or Delete removes the whole tag.
- **Highlights** (`commentHighlights.ts`): for each thread with valid milestones and status `open`, add a mark `cm-comment` (a yellow background) between the tags. The active thread gets `cm-comment-active`. Resolved threads get no highlight.
- **Gutter markers:** a superscript number widget placed right after the end tag, showing the display number. Clicking it activates the thread.
- **After every transaction that changes the doc,** re-run reconciliation (section 5.5) on the store's threads, so a deleted range becomes `orphaned` at once and an undo restores `open`.
- Typing at range boundaries uses CodeMirror's default behavior; don't add special handling.

### 8.2 Creating a comment
With a non-empty selection, press Cmd+Shift+M or the "Comment" toolbar button. In one transaction, insert the end tag at `to` and the start tag at `from`. Create a thread (`open`, `updated=now`) with no comments yet, focus a draft textarea in the Comments panel, and submit with Cmd+Enter. If the draft is cancelled or submitted empty, remove both tags and the thread.

### 8.3 Comments panel (right sidebar tab)
- Thread cards appear in display order. Each card shows the number, a quoted excerpt of the range (the first 120 characters of the clean text), the comments (markdown-rendered, with timestamps shown as relative time), and a reply box.
- Card actions: **Resolve/Reopen** (sets `updated`), **Delete thread** (confirm; removes the tags and the thread), and on each comment **Edit** and **Delete**. Deleting the last comment deletes the thread.
- Filter: *Open* (default) / *All*. Orphaned threads appear in their own "Orphaned" section with **Re-anchor** (enabled when there's a selection: insert new tags with the same id around the selection) and **Delete**.
- Clicking a card scrolls to and selects its range.
- Any thread change marks the file dirty and triggers autosave.

### 8.4 Clipboard (`clipboard.ts`)
- **Copy/cut:** put the clean text (milestones stripped) in `text/plain`, and put `{ body: rawSlice, threads: threadsFullyInsideSlice }` as JSON in `application/x-marginalia`.
- **Paste:** if `application/x-marginalia` is present, regenerate every id found in the slice (both the tags and the thread/comment ids), add the copied threads to the store, and insert the rewritten slice. Otherwise, paste the plain text.

---

## 9. Versioning (`core/src/versions`)

`GitClient` wraps `platform.git.run(repoRoot, ['-c','core.quotepath=false','-c','color.ui=never', ...args])` and throws a `GitError { args, code, stderr }` on unexpected non-zero exits.

### 9.1 Draft vs. saved idea (`saveCommit.ts`, `draft.ts`)
An **idea** is a git branch; its **saved** state is the branch's latest commit. The **current draft** is whatever differs in the working tree (modified, added, deleted, untracked files). Autosave and tree actions (new/rename/delete/move) only change the working tree.
```
save(path, content):                 # autosave
  if content === lastSaved[path]: return
  fs.writeText(path, content); lastSaved[path] = content     # no git

commitDraft(message):                # "Save idea" (Cmd+S)
  if mergeInProgress: return
  git add -A
  if `git diff --cached --quiet` exits 0: return false       # nothing to save
  git commit -m <message>; return true
```
- "Save idea" prompts for a one-line message, prefilled from `draftSummary` ("Update a.md, b.md and 2 more").
- `hasDraftChanges` = `git status --porcelain` is non-empty.
- Everything is serialized through a single promise queue, so git commands never overlap.
- `saveAndCommit(path, content, message?)` (write + commit that one file) exists for tests and tooling; the UI does not use it.

### 9.1.1 Switching ideas with a draft (`switchIdea`)
Choosing another idea in the right-hand dropdown checks it out. If there is a draft, the user picks **Carry over** or **Discard changes** (or cancels):
- **Carry over:** `git stash push -u`, `git switch <target>`, `git stash pop`. If the pop conflicts, reset the tree, switch back to the original idea and `git stash pop` there, so the draft is never lost, and show a toast.
- **Discard:** `git reset --hard HEAD`, `git clean -fd`, then `git switch`.
- After any checkout or discard, `SaveCommit.clearLastSaved()` so a later save isn't skipped as "unchanged".

### 9.2 Snapshots (`snapshots.ts`)
- **Create** (toolbar camera button → dialog with a name and an optional note): flush the save, compute `slug` (lowercased; non-alphanumerics become `-`; trimmed; max 40 characters; `-2`, `-3`… on collision), then run `git tag -a snapshot/<branch>/<slug> -m "<name>\n\n<note>"`.
- **List:** `git for-each-ref refs/tags/snapshot/<branch>/ --sort=-taggerdate --format=%(refname:short)%1f%(*objectname)%1f%(taggerdate:iso-strict)%1f%(contents:subject)%1f%(contents:body)%1e`.
- **Restore a file to a snapshot or commit:** `git show <sha>:<rel>` → write it to the file as a normal edit. It becomes part of the current draft; saving the idea commits it. Never reset or rewrite history.
- **Snapshots tag the latest commit**, so if there is a draft the UI saves the idea first.

### 9.3 Ideas (branches) (`branches.ts`)
- **List:** `git for-each-ref refs/heads --format=%(refname:short)%1f%(objectname)%1f%(committerdate:iso-strict)%1e`. The current branch comes from `git branch --show-current`.
- **Create** (from the current HEAD, a snapshot, or a commit): validate with `git check-ref-format --branch <name>`, flush the save, `sha = git rev-parse <start>^{commit}`, `git switch -c <name> <sha>`, then `git config branch.<name>.marginaliaBase <sha>`.
- **Switch:** flush the save, handle the draft (section 9.1.1), `git switch <name>`, then reload the open file (close it if it doesn't exist on that branch) and refresh the tree.
- **Rename:** `git branch -m <old> <new>` (git moves the config section itself). Then rename the snapshot tags: for each tag, `git tag -a snapshot/<new>/<slug> -m <same message> <peeled sha>` followed by `git tag -d <old tag>`. The message comes from `%(contents)`.
- **Delete:** not allowed for the current branch. Show a confirm dialog that lists the branch's snapshots, then `git branch -D <name>`, delete its `snapshot/<name>/*` tags, and `git config --remove-section branch.<name>` (ignore errors).
- UI: the status-bar branch button opens `BranchMenu`, which has the list, a "New idea…", a "Merge into current…", and rename and delete on each item. The UI says "idea", never "branch".

### 9.4 Merge (`merge.ts` + `MergeView`)
```
merge(source into current):
  flush save
  git merge --no-ff --no-commit <source>
  conflicted = git diff --name-only --diff-filter=U
  for f in conflicted where f ends with .md:
     base   = git show :1:<f>  (missing -> "")
     ours   = git show :2:<f>
     theirs = git show :3:<f>
     B,O,T  = splitFile each
     threads = mergeThreads(B.threads, O.threads, T.threads)
     write O.body/B.body/T.body to .git/marginalia/merge/{ours,base,theirs}
     r = git merge-file -p --diff3 -L ours -L base -L theirs <ours> <base> <theirs>
     if r.code == 0: write joinFile(r.stdout, threads); git add -- <f>
     else: store {file, mergedWithMarkers: r.stdout, threads} as a pending conflict
  if no pending conflicts and no non-md conflicts:
     git commit -m "merge: <source> into <current>"
  else: open MergeView
```
- `mergeThreads` (in `comments/mergeThreads.ts`): take the union of threads by id. When the same thread exists on both sides, take the union of comments by id, sorted by `created`; for status, take the side with the later `updated`; for comment text, prefer ours if both sides edited it. Threads deleted on one side but present in the base and unchanged on the other side stay deleted.
- **MergeView** (replaces the editor area): lists the conflicted files. For an `.md` file, parse the diff3 markers (`<<<<<<< ours`, `||||||| base`, `=======`, `>>>>>>> theirs`) into hunks and show the non-conflicting text as plain paragraphs. Each conflict is a card showing the *Ours* and *Theirs* text, with buttons **Take ours**, **Take theirs**, **Take both** (ours then theirs), and **Edit** (a textarea prefilled with both). Once every hunk is resolved, **Mark resolved** writes `joinFile(resolvedBody, threads)` and runs `git add`. Non-md conflicts offer **Keep ours** (`git checkout --ours -- f && git add -- f`) or **Keep theirs**.
- **Finish merge** is enabled when all files are resolved; it commits with the merge message. **Abort merge** runs `git merge --abort`.
- `mergeInProgress` equals `.git/MERGE_HEAD` existing; the check is cached and refreshed after every merge command.

### 9.5 History (`history.ts` + `HistoryPanel`)
- For the current file on the current branch: `git log --format=%H%x1f%P%x1f%aI%x1f%s%x1e -- <rel>`.
- Group consecutive `autosave:` commits into one collapsible row ("12 autosaves, 3:02–3:40 PM"). Snapshots (matched by peeled sha) show as prominent rows with their name and note. Merge commits (2+ parents) get a merge icon.
- Row actions: **View** (a read-only modal rendering that version), **Restore** (writes that version into the working tree as part of the draft), and **Start new idea from here**.

### 9.6 Compare (`baseline.ts`, `compare.ts`)
The compare view has two sides:
- **Left = base:** an idea's latest commit. Picking a different idea only changes the diff. The default is `main` when it exists, otherwise the checked-out idea.
- **Right = changes:** the checked-out idea **plus its draft** (the working tree). It is the only editable side. Picking a different idea checks it out (section 9.1.1). The dropdown label reads `<idea> (unsaved changes)` while there is a draft.
- Dropdown entries are ideas at their latest commit only (no snapshots or arbitrary commits).

```ts
type Baseline =                                 // internal; the UI only produces `branch`
  | { kind: 'origin' } | { kind: 'snapshot'; tag: string }
  | { kind: 'branch'; name: string } | { kind: 'commit'; sha: string };
```
- **Base text:** `git show <sha>:<rel>` where `sha = git rev-parse <idea>`; if that fails the file didn't exist there, so use `""`. Then `splitFile(...).body`.
- **Changed files** (`listChangedFiles(git, baseIdea)`): `git diff --name-status --no-renames -z <sha>` (base commit vs working tree) plus `git ls-files --others --exclude-standard` (untracked files count as Added, or Modified if the base also has them). Hidden (dot) paths are dropped. This is a direct two-dot comparison, not a merge-base (pull-request style) diff.
- The base re-resolves after every commit, checkout, or base change.

---

## 10. Redline diff

### 10.1 Clean text & position map (`diff/cleanText.ts`)
```ts
cleanText(body: string): { text: string; toDoc: Int32Array /* length text.length+1 */ }
```
This removes all milestone tags. `toDoc[i]` is the doc offset of clean char `i`; `toDoc[text.length]` is the doc length. Both the baseline body and the current doc are cleaned before diffing, so **comment changes never produce hunks**.

### 10.2 Word diff (`diff/tokenize.ts`, `diff/wordDiff.ts`)
- Tokenize with `/\s+|[\p{L}\p{N}_]+(?:['’][\p{L}\p{N}_]+)*|[^\s\p{L}\p{N}_]/gu`, so every character belongs to exactly one token.
- Map each distinct token to a single char (starting at U+E000, rolling into the next plane if needed), run `dmp.diff_main(a, b, false)`, then `dmp.diff_cleanupSemantic`, and map back to token strings.
- Output: `Hunk[]`, where
  ```ts
  type Hunk = { id: number; baseFrom: number; baseTo: number; curFrom: number; curTo: number;
                deleted: string; inserted: string };   // offsets in CLEAN text
  ```
  Adjacent delete and insert operations merge into a single replace hunk.
- Hunks that are whitespace-only on both sides are dropped (whitespace changes are hidden).

### 10.3 Rendering (`editor/redline.ts`)
- While redline mode is on, a `StateField` holds `{ baselineClean, hunks }`, recomputed 150 ms after doc changes, or immediately on toggle or baseline change.
- **Insertions:** a mark `cm-ins` (green underline plus a light green background) from `toDoc[curFrom]` to `toDoc[curTo]` in the editable **right pane**.
- **Deletions** are not drawn inline. The **left pane** (`editor/basePane.ts`) renders the base text read-only (same live preview) with each deleted range (`baseFrom`..`baseTo`) struck through in red (`cm-del`). The two panes scroll together proportionally.
- The right pane stays fully editable.
- **Changes panel** (right sidebar tab): the two dropdowns side by side (**Base** | **Changes**), a **Save idea** button, a **Side by side** toggle, the list of changed files, and, for the open file, a count of its changes with **Prev/Next** buttons (Alt+↑/↓) and a hunk list. File rows are colored like VS Code: orange = modified (`M`), green = added (`A`), red = deleted (`D`). Clicking a row opens that file in the side-by-side view; a deleted file shows the base on the left and "Deleted in <idea>" on the right. Non-`.md` files are listed but not diffable.
- Any file you open in compare mode shows its changes, even if it isn't in the list.
- The toolbar shows "Compare with ⟨base idea⟩" as a toggle (Cmd+Shift+R), and "Save idea".

### 10.4 Revert (`diff/revert.ts`, pure function returning CodeMirror-agnostic changes)
```ts
revertHunk(doc: string, clean: CleanText, hunk: Hunk): { from: number; to: number; insert: string }
```
- `from = toDoc[curFrom]`, `to = toDoc[curTo]`.
- `insert` = `hunk.deleted` + **every milestone tag found in `doc.slice(from, to)`, in order, appended after it**. This way, comment anchors inside a reverted insertion survive; they may become empty and therefore orphaned, which is acceptable.
- Apply the change as one normal transaction, so it's undoable.
- **Property test (MUST):** for random base and current strings with random milestones inserted into current, reverting all hunks from last to first gives `cleanText(result).text === base`, and every milestone id is still present.

---

## 11. PDF export

### 11.1 Flow
Toolbar Export → a dialog with **Clean** / **Redline (base idea → checked-out idea, including unsaved changes)** and page size (Letter default, A4) → `dialogs.saveFile({defaultName: "<note>.pdf"})` → build the HTML → `platform.pdf.renderHtmlToPdf`.

### 11.2 HTML (`export/toHtml.ts`, `export/redlineHtml.ts`)
- **Clean:** `cleanText(body).text` → remark-parse + gfm → remark-rehype → rehype-stringify. Images are embedded as `data:` URIs (via `fs.readBinary`, with a MIME type from the file extension). The result is wrapped in a full HTML document with `<style>` inlined from `theme.css`.
- **Redline:** compute hunks against the baseline, then build a merged markdown string in which insertions are wrapped as `<ins>…</ins>` and deletions as `<del>…</del>`, placed at their clean-text positions. Render with `allowDangerousHtml` in remark-rehype and rehype-stringify. Add a header line: "Changes from ⟨baseline label⟩ to ⟨idea⟩ — ⟨date⟩".
  - Known limitation (log it; don't fix it): a hunk that crosses markdown syntax (for example, half of a `**bold**`) may render imperfectly.
- The exported HTML never contains milestones, the comment block, or comment text. A test MUST assert this.
- **theme.css:** body in `"Iowan Old Style", Georgia, serif` at 11pt with 1.45 line height; headings in a sans-serif (`-apple-system`); code in `"SF Mono", Menlo, monospace` at 9.5pt on a `#f5f5f5` background; `img { max-width: 100% }`; `ins { color:#1a7f37; text-decoration: underline; background:#e6ffec }`; `del { color:#cf222e; text-decoration: line-through; background:#ffebe9 }`; `h1,h2,h3 { break-after: avoid }`; `pre, img, table { break-inside: avoid }`.

### 11.3 Native PDF (`src-tauri/src/pdf.rs`)
**Primary approach:**
1. Create a hidden `WebviewWindow` (`visible(false)`, 800×1000) with label `pdf-<n>`, loading the app's `print.html` (a blank page included in the build).
2. Inject the HTML with `webview.eval("document.open();document.write(<json-escaped html>);document.close();")`, then wait for a `pdf-ready` event, which `print.html` emits on `window.load` after images decode.
3. Via `webview.with_webview`, get the `WKWebView` and its `NSWindow`, and build an `NSPrintInfo` (a copy of the shared info) with:
   - `paperSize` = Letter (612×792) or A4 (595×842)
   - all four margins = `marginPt` (default 54)
   - `jobDisposition = NSPrintSaveJob`
   - `dictionary[NSPrintJobSavingURL] = file URL of outPath`
   - horizontal pagination = fit, vertical = automatic
4. Call `wkWebView.printOperationWithPrintInfo(info)`, set `showsPrintPanel = false` and `showsProgressPanel = false`, set the operation view's frame to the webview bounds (a known cause of blank output), then run it with `runOperationModalForWindow:delegate:didRunSelector:contextInfo:` on the hidden window. **Do not use plain `runOperation`**, which yields blank pages for WKWebView. Resolve the command when the operation completes, then close the hidden window.
5. Verify the output file exists and is larger than 1 KB. Otherwise return an error.

**Fallback** (use it only if the primary approach still fails after two focused attempts; record the reason in `DECISIONS.md`): open a **visible** "Export preview" window with the same HTML and a **Print…** button that calls `window.print()`. The user then chooses "Save as PDF" in the macOS dialog. In this mode `renderHtmlToPdf` resolves once the window opens, and the UI says "Use Save as PDF in the print dialog."

### 11.4 Classes and per-section custom CSS (`core/src/export/htmlTransform.ts`, `scopeCss.ts`, `sectionCss.ts`, `document/frontmatter.ts`, `editor/sectionStyles.ts`, `editor/useSectionCss.ts`)

A note's custom CSS targets **two different renderers that don't share a DOM, and so don't share one class vocabulary**:
- **Export** (`toHtml`/`redlineHtml`) produces a real HTML tree with real tags, so a plain tag selector (`h1 { … }`) works directly, same as `theme.css`. Common elements additionally get a stable `md-<tag>` class for scoping/specificity beyond bare tags.
- **Live preview** is CodeMirror rendering markdown *source* with decorations, not a rendered HTML tree — a heading is a `<div class="cm-line cm-h1">`, never a real `<h1>` element. **A plain tag selector matches nothing in the live editor.** Target the `cm-*` class instead.

| Markdown construct | Export: tag + class | Live editor: class |
|---|---|---|
| Heading (`#`–`######`) | `h1`–`h6`, `.md-h1`–`.md-h6` | `.cm-h1`–`.cm-h6` (line) |
| Paragraph | `p`, `.md-p` | `.cm-paragraph` (line) |
| List item | `li`, `.md-li` | `.cm-li` (line) |
| List container | `ul`/`ol`, `.md-ul`/`.md-ol` | — (no container; each item is its own line) |
| Blockquote | `blockquote`, `.md-blockquote` | `.cm-quote` (line) |
| Fenced code block | `pre`/`code`, `.md-pre`/`.md-code` | `.cm-code-block` (line; fence lines also get `.cm-fence`) |
| Inline code | `code`, `.md-code` | `.cm-inline-code` (mark) |
| Table | `table`, `.md-table` | — (tables are shown as styled source, §1) |
| Link | `a`, `.md-link` | `.cm-link` (mark, text only — the URL is hidden) |
| Image | `img`, `.md-img` | `.cm-image` (the rendered `<img>` widget) |
| **Strong** / _Emphasis_ | `strong`/`em`, `.md-strong`/`.md-em` | `.cm-strong`/`.cm-em` (mark) |
| ~~Strikethrough~~ | `del` (no class) | `.cm-strike` (mark) |
| Frontmatter block | stripped before clean export; still literal text in redline export (§11.2's known gap) | `.cm-frontmatter` (line, dimmed) |

A note MAY declare per-section stylesheets in its frontmatter:
```yaml
---
sectionStyles:
  "Part One": styles/part-one.css
  Part Two: styles/part-two.css
---
```
Each key is an H1's exact heading text; the value is a CSS file path, resolved relative to the note's directory (same convention as image references, §11.2). Parsed by `parseSectionStyles` — a hand-rolled parser for exactly this one shape, not general YAML.

A note MAY also declare a single doc-wide stylesheet with a top-level `css:` key, covering the whole note rather than one section:
```yaml
---
css: styles/note.css
---
```
Parsed by `parseDocCss`. `css` and `sectionStyles` can both be present: the doc-wide stylesheet is included first, so a section's scoped rules win on equal specificity.

- **Section bounds:** a section runs from one H1 heading up to (not including) the next H1, or the end of the document. Content before the first H1 belongs to no section and gets no per-section CSS (but still gets any doc-wide `css`).
- **Export:** each section's top-level content is wrapped in `<div class="md-section" data-section="<slug>">` (`rehypeWrapSections`); a mapped stylesheet is read, scoped to `.md-section[data-section="<slug>"]` (`scopeCss`, a brace-depth-counting selector-prefixer — at-rules like `@media` are copied through unscoped, a known limitation), and inlined into the exported `<style>` tag alongside `theme.css`. The doc-wide `css` stylesheet is inlined as-is, unscoped — export is a standalone HTML document, so there's nothing else for it to leak into.
- **Live preview:** the same H1-to-next-H1 sections get a `cm-section-<slug>` line class in the editor (`editor/sectionStyles.ts`); a mapped stylesheet is read and scoped to `.cm-section-<slug>` instead, then injected as a `<style>` element in `EditorPane` (`editor/useSectionCss.ts`). The doc-wide `css` stylesheet is scoped to `.cm-editor` (CodeMirror's own root class) rather than left unscoped — unlike export, the live editor shares one DOM with the rest of the app, and an unscoped `<style>` tag would otherwise leak into the toolbar/sidebar/etc. `slugifyHeading` is shared between both paths so the slugs always match.
- A missing or unreadable stylesheet (doc-wide or per-section) is skipped silently in both paths (matches `embedImages.ts`'s handling of an unreadable image).

---

## 12. UI shell

- **Layout:** a left sidebar (the file tree, 240px, collapsible with Cmd+\); a center editor (max text width 760px, centered); a right sidebar (320px, collapsible with Cmd+Shift+\) with tabs **Comments | Changes | History**; a top toolbar; and a bottom status bar.
- **Toolbar:** file name, then Live/Source toggle, Comment, Compare toggle + base idea, Save idea, Snapshot, and Export.
- **Status bar:** idea (branch) button, save state, a merge-in-progress badge, and word count.
- **Empty states:** with no workspace open, a centered "Open folder" button; with no file open, "Select a note or press Cmd+N".
- **Styling:** plain CSS with variables in `app.css`, following the system light/dark mode through `prefers-color-scheme` (the editor theme too), and the system font for the UI.
- **Store** (zustand, `store.ts`): workspace, tree, openFile `{path, threads, dirty, lastSaved}`, currentBranch, mergeState, redline `{on, baseline}`, activeThreadId, and sidebar state. Keep the editor doc itself in CodeMirror, not the store.
- **Errors:** every thrown `GitError` or file error shows a dismissible toast with a one-line message and a "Details" expander showing the args and stderr.

---

## 13. Build phases & "Done when"

Each phase ends with `pnpm verify` passing, a commit, and `PROGRESS.md` updated.

### Phase 0: Scaffold + spikes
- Monorepo, ESLint boundary rules, root scripts, the Tauri app launching an empty React UI, and `CLAUDE.md`/`PROGRESS.md`/`DECISIONS.md`.
- **Spike A (PDF):** implement `pdf_render` (11.3) with a hardcoded 3-page HTML; confirm a multi-page PDF with correct margins. Use the fallback only if necessary.
- **Spike B (editor):** a CodeMirror editor with `milestones.ts` hiding tags plus a stub redline overlay on a generated 10,000-word doc. Measure typing latency. **Done when** a keystroke-to-paint time under 16 ms is typical, logged in `DECISIONS.md`.

### Phase 1: Core document + workspace + editor
Build `platform.ts`, `platform-node`, `platformTauri`, the Rust fs/watch/store/git commands, the workspace (section 6, excluding git features beyond init), the file tree, live preview (7.2), autosave writing files (no commits yet), and images.
**Done when:**
- `splitFile`/`joinFile`/escape tests pass, including the exact round-trip on 20+ fixture files (frontmatter, CRLF, unicode, a trailing file without a newline, a malformed block).
- `livePreview` unit tests pass (jsdom): markup is hidden on inactive lines and shown on active lines.
- The ESLint boundary test fails when a forbidden import is added to a fixture file (proving the rule works).

### Phase 2: Git versioning
Build `GitClient`, `saveCommit`, snapshots, branches, history, baseline resolution, the status bar, BranchMenu, and HistoryPanel.
**Done when** the platform-node integration tests (temp repos under `os.tmpdir()`) cover:
- Initializing a fresh folder.
- Save → exactly one commit; an identical second save → no commit.
- Snapshot create/list/restore (restore creates a new commit and history is intact).
- Idea create records `marginaliaBase`; rename moves snapshot tags; delete removes tags and config.
- Baseline resolution for all four kinds, including a file that doesn't exist at the baseline.
- History grouping of autosaves.

### Phase 3: Comments
Build milestones, highlights, gutter numbers, create/reply/resolve/edit/delete, orphaning and re-anchoring, and the clipboard.
**Done when:**
- A fuzz test passes: 1,000 random edit sequences (insert/delete at random offsets, including deleting whole tags) applied to a doc with 5 overlapping comment ranges never lose any comment body text, and reconciliation statuses always match the milestone state.
- Paste regenerates ids with no duplicates.
- Overlapping and cross-paragraph ranges render highlights correctly (jsdom test).

### Phase 4: Redline
Build cleanText, tokenize, wordDiff, the redline field and widgets, the Changes panel, the baseline picker, and revert.
**Done when:**
- The revert property test (10.4) passes with 500 cases.
- Adding or removing comments produces zero hunks.
- `cleanText` map tests pass.
- Recomputing the diff on a 10,000-word doc with 200 hunks takes under 50 ms (a benchmark test).

### Phase 5: Merge
Build `mergeThreads`, the merge flow, MergeView, and abort.
**Done when** integration tests cover:
- A clean merge.
- A text conflict resolved with ours/theirs/both.
- Both sides adding different threads (no conflict appears, and the result is their union).
- The same thread replied to on both sides (union of replies).
- A status change on one side with a later `updated` wins.
- Abort restores the pre-merge state.
- A non-md conflict with keep-theirs.
- Resuming a merge after restarting the app.

### Phase 6: PDF export
Build the export dialog, `toHtml`, `redlineHtml`, `theme.css`, and wire it to `pdf_render`.
**Done when:**
- A test asserts the exported HTML (clean and redline) contains no `comment-start`, `comment-end`, or `marginalia:comments` strings, and no comment body text.
- The redline HTML contains matching `<ins>`/`<del>` counts for a fixture.
- A manual-export smoke procedure is documented in `PROGRESS.md`.

### Phase 7: Polish
Build settings (autosave delay, default page size) stored in `AppStore`, a Cmd+/ keyboard shortcut sheet, the git-missing screen, the quit flush, and error toasts. Do a final pass through every `TODO` in the code, and either resolve each one or list it in `PROGRESS.md`.

---

## 14. Testing notes
- Use Vitest everywhere. UI tests use the `jsdom` environment and test CodeMirror through `EditorState`/`EditorView` directly. **No Playwright, no Tauri E2E.**
- Put logic in pure functions (core, or `ui/src/editor/*.ts` helpers) so it's testable without React.
- Integration tests use `platform-node` with temp git repos, configured with a local `user.name` and `user.email` so they don't depend on the machine's git config.
- Fixtures go in `packages/core/test/fixtures/`.

---

## 15. Glossary (UI wording)
| Internal | User-facing |
|---|---|
| branch | idea |
| annotated tag `snapshot/*` | snapshot |
| autosave commit | (hidden; grouped in History) |
| merge-base / `marginaliaBase` | "where this idea started" (Origin) |
| orphaned thread | "Detached comment" |