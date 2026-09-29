import { create } from "zustand";
import type { Baseline, DirEntry, GitClient, SaveCommit, Thread } from "@marginalia/core";

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
  redlineOn: boolean;
  baseline: Baseline;
  baselineLabel: string;
  baselineCleanText: string;
  activeHunkIndex: number;

  setWorkspace: (ws: WorkspaceState | null) => void;
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
  setBaseline: (baseline: Baseline, label: string) => void;
  setBaselineCleanText: (text: string) => void;
  setActiveHunkIndex: (i: number) => void;
  toggleSidebarLeft: () => void;
  toggleSidebarRight: () => void;
  toggleSourceMode: () => void;
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
  baseline: { kind: "origin" },
  baselineLabel: "Origin",
  baselineCleanText: "",
  activeHunkIndex: -1,

  setWorkspace: (ws) => set({ workspace: ws, tree: {}, expandedDirs: new Set(), openFile: null }),
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
      baseline: { kind: "origin" },
      baselineLabel: "Origin",
      baselineCleanText: "",
      activeHunkIndex: -1,
    }),
  closeFile: () => set({ openFile: null, activeThreadId: null, draftThreadId: null }),
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
  setBaseline: (baseline, label) => set({ baseline, baselineLabel: label }),
  setBaselineCleanText: (text) => set({ baselineCleanText: text }),
  setActiveHunkIndex: (i) => set({ activeHunkIndex: i }),
  toggleSidebarLeft: () => set((s) => ({ sidebarLeftCollapsed: !s.sidebarLeftCollapsed })),
  toggleSidebarRight: () => set((s) => ({ sidebarRightCollapsed: !s.sidebarRightCollapsed })),
  toggleSourceMode: () => set((s) => ({ sourceMode: !s.sourceMode })),
}));
