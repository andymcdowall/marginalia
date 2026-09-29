import { useStore } from "../store.js";
import { BranchMenu } from "./BranchMenu.js";

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function StatusBar() {
  const currentBranch = useStore((s) => s.currentBranch);
  const branchMenuOpen = useStore((s) => s.branchMenuOpen);
  const setBranchMenuOpen = useStore((s) => s.setBranchMenuOpen);
  const openFile = useStore((s) => s.openFile);
  const mergeResult = useStore((s) => s.mergeResult);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  const saveState = !openFile ? "" : openFile.dirty ? "Saving…" : "Saved";

  return (
    <div className="status-bar">
      <div className="status-bar-branch">
        <button type="button" onClick={() => setBranchMenuOpen(!branchMenuOpen)}>
          {"⌥ "}
          {currentBranch}
        </button>
        {branchMenuOpen && <BranchMenu onClose={() => setBranchMenuOpen(false)} />}
        {mergeResult && mergeResult.kind === "conflicts" && <span className="status-bar-merge-badge">Merging…</span>}
      </div>
      <div className="status-bar-right">
        {openFile && <span className="status-bar-wordcount">{wordCount(openFile.docText)} words</span>}
        <span className="status-bar-save">{saveState}</span>
        <button type="button" onClick={() => setSettingsOpen(true)} title="Settings">
          {"⚙"}
        </button>
      </div>
    </div>
  );
}
