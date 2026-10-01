import { useCallback, useEffect, useRef } from "react";
import { GitClient, SaveCommit, currentBranch as gitCurrentBranch, getLastWorkspace, openWorkspace, resumeMerge } from "@marginalia/core";
import type { Platform } from "@marginalia/core";
import { usePlatform } from "./platformContext.js";
import { DEFAULT_SETTINGS, useStore } from "./store.js";
import { FileTree } from "./components/FileTree.js";
import { EditorPane } from "./components/EditorPane.js";
import { StatusBar } from "./components/StatusBar.js";
import { HistoryPanel } from "./components/HistoryPanel.js";
import { CommentsPanel } from "./components/CommentsPanel.js";
import { ChangesPanel } from "./components/ChangesPanel.js";
import { MergeView } from "./components/MergeView.js";
import { Toolbar } from "./components/Toolbar.js";
import { ToastContainer } from "./components/ToastContainer.js";
import { ShortcutsSheet } from "./components/ShortcutsSheet.js";
import { SettingsDialog } from "./components/SettingsDialog.js";
import { PromptDialogHost } from "./components/PromptDialogHost.js";
import { ChoiceDialogHost } from "./components/ChoiceDialogHost.js";
import { BasePane } from "./components/BasePane.js";
import { flushEverything, initCompare, saveIdea } from "./ideaActions.js";

async function openAndPrepare(platform: Platform, root: string) {
  const info = await openWorkspace(platform, root);
  const git = new GitClient(platform, info.gitRoot);
  const saveCommit = new SaveCommit(platform, git);
  const branch = await gitCurrentBranch(git);
  return { workspace: { ...info, git, saveCommit }, branch };
}

// SPEC.md §4.2: if no git binary resolved at Rust startup, `git_run` rejects every call with this
// exact message. platform.ts's interface MUST match spec verbatim (§2.3), so this is detected
// from the existing GitRunner contract rather than by adding a new Platform method.
function isGitMissingError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return message.includes("git is not available") || message.includes("ENOENT");
}

export function App() {
  const platform = usePlatform();
  const workspace = useStore((s) => s.workspace);
  const setWorkspace = useStore((s) => s.setWorkspace);
  const setCurrentBranch = useStore((s) => s.setCurrentBranch);
  const sidebarRightCollapsed = useStore((s) => s.sidebarRightCollapsed);
  const sidebarTab = useStore((s) => s.sidebarTab);
  const setSidebarTab = useStore((s) => s.setSidebarTab);
  const mergeResult = useStore((s) => s.mergeResult);
  const setMerge = useStore((s) => s.setMerge);
  const gitMissing = useStore((s) => s.gitMissing);
  const setGitMissing = useStore((s) => s.setGitMissing);
  const setSettings = useStore((s) => s.setSettings);
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const addToast = useStore((s) => s.addToast);
  const redlineOn = useStore((s) => s.redlineOn);
  const openFile = useStore((s) => s.openFile);
  const deletedView = useStore((s) => s.deletedView);
  const baseline = useStore((s) => s.baseline);
  const currentBranch = useStore((s) => s.currentBranch);
  const draftDirty = useStore((s) => s.draftDirty);
  const compareLayout = useStore((s) => s.compareLayout);

  const handleOpenFolderRef = useRef<() => Promise<void>>(async () => {});

  async function checkForInProgressMerge(platform: Platform, ws: { git: GitClient }, branch: string): Promise<void> {
    if (!(await ws.git.isMergeInProgress())) return;
    const source = (await platform.store.get<string>("mergeSource")) ?? "idea";
    const result = await resumeMerge(platform, ws.git, source, branch);
    setMerge(source, result);
  }

  useEffect(() => {
    // SPEC.md §12 "Errors": catch what would otherwise be a silent unhandled rejection from any
    // of the app's many fire-and-forget `void someAsyncAction()` call sites, and surface it as a
    // dismissible toast instead — cheaper and more complete than wrapping every call site.
    function handleRejection(event: PromiseRejectionEvent): void {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const gitError = reason as { args?: string[]; stderr?: string; code?: number };
      const details = gitError?.args ? `git ${gitError.args.join(" ")}\n(exit ${gitError.code})\n${gitError.stderr ?? ""}` : undefined;
      addToast(message, details);
    }
    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, [addToast]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setShortcutsOpen]);

  // Native File menu (apps/desktop forwards clicks as a DOM event; Cmd+S/O/Shift+E are its accelerators).
  useEffect(() => {
    function handleMenu(e: Event): void {
      const id = (e as CustomEvent<string>).detail;
      if (id === "open-folder") void handleOpenFolderRef.current();
      else if (id === "save-idea") void saveIdea();
      else if (id === "toggle-compare") useStore.getState().setRedlineOn(!useStore.getState().redlineOn);
      else if (id === "export-pdf" && useStore.getState().openFile) useStore.getState().setExportOpen(true);
    }
    window.addEventListener("marginalia:menu", handleMenu);
    return () => window.removeEventListener("marginalia:menu", handleMenu);
  }, []);

  // Keep the View > Compare checkmark in step with the store (main.tsx relays this to Rust).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("marginalia:compare-state", { detail: redlineOn }));
  }, [redlineOn]);

  useEffect(() => {
    void (async () => {
      const stored = await platform.store.get<typeof DEFAULT_SETTINGS>("settings");
      if (stored) setSettings({ ...DEFAULT_SETTINGS, ...stored });

      const last = await getLastWorkspace(platform);
      if (!last) return;
      try {
        const { workspace: ws, branch } = await openAndPrepare(platform, last);
        setWorkspace(ws);
        setCurrentBranch(branch);
        await initCompare();
        await checkForInProgressMerge(platform, ws, branch);
      } catch (e) {
        if (isGitMissingError(e)) setGitMissing(true);
        // otherwise: the remembered workspace is gone or declined re-init; let the user pick again.
      }
    })();
  }, []);

  const handleOpenFolder = useCallback(async () => {
    // Leaving a vault keeps its draft on disk; just make sure pending edits are written first.
    await flushEverything();
    const root = await platform.dialogs.openFolder();
    if (!root) return;
    try {
      const { workspace: ws, branch } = await openAndPrepare(platform, root);
      setWorkspace(ws);
      setCurrentBranch(branch);
      await initCompare();
      await checkForInProgressMerge(platform, ws, branch);
    } catch (e) {
      if (isGitMissingError(e)) setGitMissing(true);
      else throw e;
    }
  }, [platform, setWorkspace, setCurrentBranch]);

  handleOpenFolderRef.current = handleOpenFolder;

  if (gitMissing) {
    return (
      <div className="app-shell">
        <div className="empty-state git-missing">
          <h2>Git is required</h2>
          <p>
            Install Xcode Command Line Tools (<code>xcode-select --install</code>) or Homebrew git, then restart
            Marginalia.
          </p>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="app-shell">
        <div className="empty-state">
          <button type="button" onClick={() => void handleOpenFolder()}>
            Open folder
          </button>
        </div>
        <ToastContainer />
        {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
      </div>
    );
  }

  if (mergeResult && mergeResult.kind === "conflicts") {
    return (
      <div className="app-root">
        <MergeView />
        <StatusBar />
        <ToastContainer />
        <PromptDialogHost />
      </div>
    );
  }

  return (
    <div className="app-root">
      <Toolbar />
      <div className="app-shell">
        <div className="sidebar-left">
          <FileTree root={workspace.root} />
        </div>
        <div className="editor-area">
          {redlineOn && (openFile || deletedView) && (
            // Mounted even in redline layout: it also resolves the base text the inline marks use.
            <BasePane
              label={baseline.kind === "branch" ? baseline.name : currentBranch}
              hidden={compareLayout === "redline" && !deletedView}
            />
          )}
          {deletedView ? (
            <div className="compare-deleted">{`Deleted in ${currentBranch}${draftDirty ? " (unsaved changes)" : ""}`}</div>
          ) : (
            <EditorPane />
          )}
        </div>
        {!sidebarRightCollapsed && (
          <div className="sidebar-right">
            <div className="sidebar-tabs">
              <button type="button" className={sidebarTab === "comments" ? "active" : ""} onClick={() => setSidebarTab("comments")}>
                Comments
              </button>
              <button type="button" className={sidebarTab === "changes" ? "active" : ""} onClick={() => setSidebarTab("changes")}>
                Changes
              </button>
              <button type="button" className={sidebarTab === "history" ? "active" : ""} onClick={() => setSidebarTab("history")}>
                History
              </button>
            </div>
            {sidebarTab === "comments" && <CommentsPanel />}
            {sidebarTab === "changes" && <ChangesPanel />}
            {sidebarTab === "history" && <HistoryPanel />}
          </div>
        )}
      </div>
      <StatusBar />
      <ToastContainer />
      <PromptDialogHost />
      <ChoiceDialogHost />
      {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
