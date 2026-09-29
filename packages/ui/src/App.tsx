import { useCallback, useEffect } from "react";
import { getLastWorkspace, openWorkspace } from "@marginalia/core";
import { usePlatform } from "./platformContext.js";
import { useStore } from "./store.js";
import { FileTree } from "./components/FileTree.js";
import { EditorPane } from "./components/EditorPane.js";

export function App() {
  const platform = usePlatform();
  const workspace = useStore((s) => s.workspace);
  const setWorkspace = useStore((s) => s.setWorkspace);

  useEffect(() => {
    void (async () => {
      const last = await getLastWorkspace(platform);
      if (last) {
        try {
          const info = await openWorkspace(platform, last);
          setWorkspace(info);
        } catch {
          // The remembered workspace is gone or declined re-init; let the user pick again.
        }
      }
    })();
  }, []);

  const handleOpenFolder = useCallback(async () => {
    const root = await platform.dialogs.openFolder();
    if (!root) return;
    const info = await openWorkspace(platform, root);
    setWorkspace(info);
  }, [platform, setWorkspace]);

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
    <div className="app-shell">
      <div className="sidebar-left">
        <FileTree root={workspace.root} />
      </div>
      <div className="editor-area">
        <EditorPane />
      </div>
    </div>
  );
}
