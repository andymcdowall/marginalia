import { create } from "zustand";
import type { DirEntry, Thread } from "@marginalia/core";

export type OpenFile = {
  path: string;
  threads: Thread[];
  dirty: boolean;
  lastSaved: string; // last content written to disk, for external-change comparison
};

export type WorkspaceState = {
  root: string;
  gitRoot: string;
};

type TreeState = Record<string, DirEntry[]>; // dir path -> its direct children

type Store = {
  workspace: WorkspaceState | null;
  tree: TreeState;
  expandedDirs: Set<string>;
  openFile: OpenFile | null;
  sidebarLeftCollapsed: boolean;
  sidebarRightCollapsed: boolean;
  sourceMode: boolean;

  setWorkspace: (ws: WorkspaceState | null) => void;
  setTreeEntries: (dir: string, entries: DirEntry[]) => void;
  toggleDir: (dir: string) => void;
  openFileAt: (path: string, threads: Thread[], content: string) => void;
  closeFile: () => void;
  markDirty: (dirty: boolean) => void;
  markSaved: (content: string) => void;
  setThreads: (threads: Thread[]) => void;
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

  setWorkspace: (ws) => set({ workspace: ws, tree: {}, expandedDirs: new Set(), openFile: null }),
  setTreeEntries: (dir, entries) => set((s) => ({ tree: { ...s.tree, [dir]: entries } })),
  toggleDir: (dir) =>
    set((s) => {
      const next = new Set(s.expandedDirs);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return { expandedDirs: next };
    }),
  openFileAt: (path, threads, content) => set({ openFile: { path, threads, dirty: false, lastSaved: content } }),
  closeFile: () => set({ openFile: null }),
  markDirty: (dirty) => set((s) => (s.openFile ? { openFile: { ...s.openFile, dirty } } : {})),
  markSaved: (content) =>
    set((s) => (s.openFile ? { openFile: { ...s.openFile, dirty: false, lastSaved: content } } : {})),
  setThreads: (threads) => set((s) => (s.openFile ? { openFile: { ...s.openFile, threads } } : {})),
  toggleSidebarLeft: () => set((s) => ({ sidebarLeftCollapsed: !s.sidebarLeftCollapsed })),
  toggleSidebarRight: () => set((s) => ({ sidebarRightCollapsed: !s.sidebarRightCollapsed })),
  toggleSourceMode: () => set((s) => ({ sourceMode: !s.sourceMode })),
}));
