import { create } from "zustand";
import type { Baseline, DirEntry, GitClient, MergeResult, SaveCommit, Thread } from "@marginalia/core";

export type OpenFile = {
  path: string;
  threads: Thread[];
  dirty: boolean;
  lastSaved: string; // last content written to disk, for external-change comparison
  docText: string; // read-only mirror of the CodeMirror doc, for cross-component display only
  // (excerpts, display numbers). CodeMirror remains the source of truth for saving.
};

export type WorkspaceState = {
  root: string;
  gitRoot: string;
  git: GitClient;
  saveCommit: SaveCommit;
};

type TreeState = Record<string, DirEntry[]>; // dir path -> its direct children
export type CommentFilter = "open" | "all";

export type Settings = { autosaveDelayMs: number; defaultPageSize: "letter" | "a4" };
export const DEFAULT_SETTINGS: Settings = { autosaveDelayMs: 1500, defaultPageSize: "letter" };

export type Toast = { id: number; message: string; details?: string };
let nextToastId = 1;

// In-app replacement for `window.prompt()`, which Tauri's macOS WebView never implements (see
// DECISIONS.md). `showPrompt` (prompt.ts) resolves this once <PromptDialogHost/> settles it.
export type PromptRequest = { title: string; defaultValue: string; resolve: (value: string | null) => void };

// A modal with several labelled buttons (e.g. carry over / discard / cancel). Resolves to the chosen
// option's `value`, or null if dismissed. Rendered by <ChoiceDialogHost/>.
export type ChoiceOption = { value: string; label: string; danger?: boolean };
export type ChoiceRequest = {
  title: string;
  message: string;
  options: ChoiceOption[];
  resolve: (value: string | null) => void;
};

type Store = {
  workspace: WorkspaceState | null;
  tree: TreeState;
  expandedDirs: Set<string>;
  openFile: OpenFile | null;
  sidebarLeftCollapsed: boolean;
  sidebarRightCollapsed: boolean;
  sourceMode: boolean;
  currentBranch: string;
  branchMenuOpen: boolean;
  activeThreadId: string | null;
  draftThreadId: string | null;
  commentFilter: CommentFilter;
  sidebarTab: "comments" | "history" | "changes";
  // "Compare view" on/off. (Named `redlineOn` from when this was an inline redline; it now drives
  // the side-by-side base | changes view.)
  redlineOn: boolean;
  // How the compare view is drawn: base pane next to the editor, or one pane with deletions inline.
  compareLayout: "side-by-side" | "redline";
  // The LEFT dropdown: always `{ kind: "branch", name }` in the UI, i.e. an idea's latest commit.
  baseline: Baseline;
  baselineLabel: string;
  baselineCleanText: string;
  activeHunkIndex: number;
  mergeSource: string | null;
  mergeResult: MergeResult | null;
  settings: Settings;
  settingsOpen: boolean;
  gitMissing: boolean;
  toasts: Toast[];
  shortcutsOpen: boolean;
  promptRequest: PromptRequest | null;
  choiceRequest: ChoiceRequest | null;
  // True when the working tree differs from the checked-out idea's latest commit.
  draftDirty: boolean;
  // Bumped whenever the draft or an idea's tip may have changed, so dependents re-read git.
  draftVersion: number;
  // Absolute path of a file that exists on the left but was deleted on the right (compare view).
  deletedView: string | null;

  setWorkspace: (ws: WorkspaceState | null) => void;
  setMerge: (source: string | null, result: MergeResult | null) => void;
  setSettings: (settings: Settings) => void;
  setSettingsOpen: (open: boolean) => void;
  setGitMissing: (missing: boolean) => void;
  addToast: (message: string, details?: string) => void;
  dismissToast: (id: number) => void;
  setShortcutsOpen: (open: boolean) => void;
  exportOpen: boolean;
  setExportOpen: (open: boolean) => void;
  setCurrentBranch: (name: string) => void;
  setBranchMenuOpen: (open: boolean) => void;
  setTreeEntries: (dir: string, entries: DirEntry[]) => void;
  toggleDir: (dir: string) => void;
  openFileAt: (path: string, threads: Thread[], content: string) => void;
  closeFile: () => void;
  markDirty: (dirty: boolean) => void;
  markSaved: (content: string) => void;
  setThreads: (threads: Thread[]) => void;
  setDocText: (text: string) => void;
  setActiveThreadId: (id: string | null) => void;
  setDraftThreadId: (id: string | null) => void;
  setCommentFilter: (filter: CommentFilter) => void;
  setSidebarTab: (tab: "comments" | "history" | "changes") => void;
  setRedlineOn: (on: boolean) => void;
  setCompareLayout: (layout: "side-by-side" | "redline") => void;
  setBaseline: (baseline: Baseline, label: string) => void;
  setBaselineCleanText: (text: string) => void;
  setActiveHunkIndex: (i: number) => void;
  toggleSidebarLeft: () => void;
  toggleSidebarRight: () => void;
  toggleSourceMode: () => void;
  requestPrompt: (title: string, defaultValue: string, resolve: (value: string | null) => void) => void;
  settlePrompt: (value: string | null) => void;
  requestChoice: (request: Omit<ChoiceRequest, "resolve">, resolve: (value: string | null) => void) => void;
  settleChoice: (value: string | null) => void;
  setDraftDirty: (dirty: boolean) => void;
  bumpDraftVersion: () => void;
  setDeletedView: (path: string | null) => void;
};

export const useStore = create<Store>((set) => ({
  workspace: null,
  tree: {},
  expandedDirs: new Set(),
  openFile: null,
  sidebarLeftCollapsed: false,
  sidebarRightCollapsed: false,
  sourceMode: false,
  currentBranch: "main",
  branchMenuOpen: false,
  activeThreadId: null,
  draftThreadId: null,
  commentFilter: "open",
  sidebarTab: "comments",
  redlineOn: false,
  compareLayout: "side-by-side",
  baseline: { kind: "branch", name: "main" },
  baselineLabel: "main",
  baselineCleanText: "",
  activeHunkIndex: -1,
  mergeSource: null,
  mergeResult: null,
  settings: DEFAULT_SETTINGS,
  settingsOpen: false,
  gitMissing: false,
  toasts: [],
  shortcutsOpen: false,
  exportOpen: false,
  promptRequest: null,
  choiceRequest: null,
  draftDirty: false,
  draftVersion: 0,
  deletedView: null,

  setWorkspace: (ws) => set({ workspace: ws, tree: {}, expandedDirs: new Set(), openFile: null }),
  setMerge: (source, result) => set({ mergeSource: source, mergeResult: result }),
  setSettings: (settings) => set({ settings }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setGitMissing: (missing) => set({ gitMissing: missing }),
  addToast: (message, details) => set((s) => ({ toasts: [...s.toasts, { id: nextToastId++, message, details }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setExportOpen: (open) => set({ exportOpen: open }),
  setCurrentBranch: (name) => set({ currentBranch: name }),
  setBranchMenuOpen: (open) => set({ branchMenuOpen: open }),
  setTreeEntries: (dir, entries) => set((s) => ({ tree: { ...s.tree, [dir]: entries } })),
  toggleDir: (dir) =>
    set((s) => {
      const next = new Set(s.expandedDirs);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return { expandedDirs: next };
    }),
  openFileAt: (path, threads, content) =>
    set({
      openFile: { path, threads, dirty: false, lastSaved: content, docText: content },
      activeThreadId: null,
      draftThreadId: null,
      deletedView: null,
      // The compare base (left dropdown) deliberately survives opening another file.
      baselineCleanText: "",
      activeHunkIndex: -1,
    }),
  closeFile: () => set({ openFile: null, deletedView: null, activeThreadId: null, draftThreadId: null }),
  markDirty: (dirty) => set((s) => (s.openFile ? { openFile: { ...s.openFile, dirty } } : {})),
  markSaved: (content) =>
    set((s) => (s.openFile ? { openFile: { ...s.openFile, dirty: false, lastSaved: content } } : {})),
  setThreads: (threads) => set((s) => (s.openFile ? { openFile: { ...s.openFile, threads } } : {})),
  setDocText: (text) => set((s) => (s.openFile ? { openFile: { ...s.openFile, docText: text } } : {})),
  setActiveThreadId: (id) => set({ activeThreadId: id }),
  setDraftThreadId: (id) => set({ draftThreadId: id }),
  setCommentFilter: (filter) => set({ commentFilter: filter }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setRedlineOn: (on) => set({ redlineOn: on }),
  setCompareLayout: (layout) => set({ compareLayout: layout }),
  setBaseline: (baseline, label) => set({ baseline, baselineLabel: label }),
  setBaselineCleanText: (text) => set({ baselineCleanText: text }),
  setActiveHunkIndex: (i) => set({ activeHunkIndex: i }),
  toggleSidebarLeft: () => set((s) => ({ sidebarLeftCollapsed: !s.sidebarLeftCollapsed })),
  toggleSidebarRight: () => set((s) => ({ sidebarRightCollapsed: !s.sidebarRightCollapsed })),
  toggleSourceMode: () => set((s) => ({ sourceMode: !s.sourceMode })),
  requestPrompt: (title, defaultValue, resolve) => set({ promptRequest: { title, defaultValue, resolve } }),
  settlePrompt: (value) =>
    set((s) => {
      s.promptRequest?.resolve(value);
      return { promptRequest: null };
    }),
  requestChoice: (request, resolve) => set({ choiceRequest: { ...request, resolve } }),
  settleChoice: (value) =>
    set((s) => {
      s.choiceRequest?.resolve(value);
      return { choiceRequest: null };
    }),
  setDraftDirty: (dirty) => set({ draftDirty: dirty }),
  bumpDraftVersion: () => set((s) => ({ draftVersion: s.draftVersion + 1 })),
  setDeletedView: (path) => set(path ? { deletedView: path, openFile: null } : { deletedView: null }),
}));
