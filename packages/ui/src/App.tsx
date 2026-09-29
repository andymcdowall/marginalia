import { useCallback, useEffect } from "react";
import { GitClient, SaveCommit, currentBranch as gitCurrentBranch, getLastWorkspace, openWorkspace } from "@marginalia/core";
import type { Platform } from "@marginalia/core";
import { usePlatform } from "./platformContext.js";
import { useStore } from "./store.js";
import { FileTree } from "./components/FileTree.js";
import { EditorPane } from "./components/EditorPane.js";
import { StatusBar } from "./components/StatusBar.js";
import { HistoryPanel } from "./components/HistoryPanel.js";
import { CommentsPanel } from "./components/CommentsPanel.js";

async function openAndPrepare(platform: Platform, root: string) {
  const info = await openWorkspace(platform, root);
  const git = new GitClient(platform, info.gitRoot);
  const saveCommit = new SaveCommit(platform, git);
  const branch = await gitCurrentBranch(git);
  return { workspace: { ...info, git, saveCommit }, branch };
}

export function App() {
  const platform = usePlatform();
  const workspace = useStore((s) => s.workspace);
  const setWorkspace = useStore((s) => s.setWorkspace);
  const setCurrentBranch = useStore((s) => s.setCurrentBranch);
  const sidebarRightCollapsed = useStore((s) => s.sidebarRightCollapsed);
  const sidebarTab = useStore((s) => s.sidebarTab);
  const setSidebarTab = useStore((s) => s.setSidebarTab);

  useEffect(() => {
    void (async () => {
      const last = await getLastWorkspace(platform);
      if (!last) return;
      try {
        const { workspace: ws, branch } = await openAndPrepare(platform, last);
        setWorkspace(ws);
        setCurrentBranch(branch);
      } catch {
        // The remembered workspace is gone or declined re-init; let the user pick again.
      }
    })();
  }, []);

  const handleOpenFolder = useCallback(async () => {
    const root = await platform.dialogs.openFolder();
    if (!root) return;
    const { workspace: ws, branch } = await openAndPrepare(platform, root);
    setWorkspace(ws);
    setCurrentBranch(branch);
  }, [platform, setWorkspace, setCurrentBranch]);

  if (!workspace) {
    return (
      <div className="app-shell">
        <div className="empty-state">
          <button type="button" onClick={() => void handleOpenFolder()}>
            Open folder
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <div className="app-shell">
        <div className="sidebar-left">
          <FileTree root={workspace.root} />
        </div>
        <div className="editor-area">
          <EditorPane />
        </div>
        {!sidebarRightCollapsed && (
          <div className="sidebar-right">
            <div className="sidebar-tabs">
              <button type="button" className={sidebarTab === "comments" ? "active" : ""} onClick={() => setSidebarTab("comments")}>
                Comments
              </button>
              <button type="button" className={sidebarTab === "history" ? "active" : ""} onClick={() => setSidebarTab("history")}>
                History
              </button>
            </div>
            {sidebarTab === "comments" ? <CommentsPanel /> : <HistoryPanel />}
          </div>
        )}
      </div>
      <StatusBar />
    </div>
  );
}
