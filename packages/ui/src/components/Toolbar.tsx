import { useState } from "react";
import { createSnapshot } from "@marginalia/core";
import { useStore } from "../store.js";
import { ExportDialog } from "./ExportDialog.js";
import { activeEditorView } from "./EditorPane.js";
import { setSourceMode } from "../editor/sourceMode.js";

// SPEC.md §12. File name, Live/Source toggle, Comment, Redline toggle + baseline label, Snapshot,
// Export.
export function Toolbar() {
  const openFile = useStore((s) => s.openFile);
  const sourceMode = useStore((s) => s.sourceMode);
  const toggleSourceMode = useStore((s) => s.toggleSourceMode);
  const redlineOn = useStore((s) => s.redlineOn);
  const setRedlineOn = useStore((s) => s.setRedlineOn);
  const baselineLabel = useStore((s) => s.baselineLabel);
  const workspace = useStore((s) => s.workspace);
  const currentBranch = useStore((s) => s.currentBranch);
  const [exportOpen, setExportOpen] = useState(false);

  const fileName = openFile ? openFile.path.slice(openFile.path.lastIndexOf("/") + 1) : "";

  function handleToggleSourceMode(): void {
    toggleSourceMode();
    const view = activeEditorView.current;
    if (view) view.dispatch({ effects: setSourceMode.of(!sourceMode) });
  }

  function handleComment(): void {
    const view = activeEditorView.current;
    if (!view) return;
    view.focus();
    // Simplest way to trigger EditorPane's own Cmd+Shift+M handler (which owns the CodeMirror
    // transaction + prompt flow) without duplicating that logic here.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "M", shiftKey: true, metaKey: true }));
  }

  async function handleSnapshot(): Promise<void> {
    if (!workspace) return;
    const name = window.prompt("Snapshot name:");
    if (!name) return;
    const note = window.prompt("Note (optional):") ?? "";
    await createSnapshot(workspace.git, workspace.saveCommit, currentBranch, name, note);
  }

  if (!openFile) return null;

  return (
    <div className="toolbar">
      <div className="toolbar-filename">{fileName}</div>
      <div className="toolbar-actions">
        <button type="button" onClick={handleToggleSourceMode}>
          {sourceMode ? "Source" : "Live"}
        </button>
        <button type="button" onClick={handleComment} title="Cmd+Shift+M">
          Comment
        </button>
        <button type="button" className={redlineOn ? "active" : ""} onClick={() => setRedlineOn(!redlineOn)} title="Cmd+Shift+R">
          {`Redline vs ${baselineLabel}`}
        </button>
        <button type="button" onClick={() => void handleSnapshot()}>
          Snapshot
        </button>
        <button type="button" onClick={() => setExportOpen(true)}>
          Export
        </button>
      </div>
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </div>
  );
}
