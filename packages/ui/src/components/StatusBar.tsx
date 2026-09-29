import { useStore } from "../store.js";
import { BranchMenu } from "./BranchMenu.js";

export function StatusBar() {
  const currentBranch = useStore((s) => s.currentBranch);
  const branchMenuOpen = useStore((s) => s.branchMenuOpen);
  const setBranchMenuOpen = useStore((s) => s.setBranchMenuOpen);
  const openFile = useStore((s) => s.openFile);

  const saveState = !openFile ? "" : openFile.dirty ? "Saving…" : "Saved";

  return (
    <div className="status-bar">
      <div className="status-bar-branch">
        <button type="button" onClick={() => setBranchMenuOpen(!branchMenuOpen)}>
          {"⌥ "}
          {currentBranch}
        </button>
        {branchMenuOpen && <BranchMenu onClose={() => setBranchMenuOpen(false)} />}
      </div>
      <div className="status-bar-save">{saveState}</div>
    </div>
  );
}
