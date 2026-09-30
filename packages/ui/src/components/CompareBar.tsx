import { useEffect, useState } from "react";
import { listBranches } from "@marginalia/core";
import { usePlatform } from "../platformContext.js";
import { useStore } from "../store.js";
import { switchToIdea } from "../ideaActions.js";

// Two dropdowns, PR-style. Left = base: an idea's latest commit; only changes the diff. Right =
// changes: the checked-out idea plus its unsaved draft; choosing another idea checks it out.
export function CompareBar() {
  const platform = usePlatform();
  const workspace = useStore((s) => s.workspace);
  const currentBranch = useStore((s) => s.currentBranch);
  const baseline = useStore((s) => s.baseline);
  const setBaseline = useStore((s) => s.setBaseline);
  const draftDirty = useStore((s) => s.draftDirty);
  const draftVersion = useStore((s) => s.draftVersion);
  const [ideas, setIdeas] = useState<string[]>([]);

  useEffect(() => {
    if (!workspace) return;
    void listBranches(workspace.git).then((list) => setIdeas(list.map((b) => b.name)));
  }, [workspace, draftVersion, currentBranch]);

  const baseName = baseline.kind === "branch" ? baseline.name : currentBranch;
  const baseOptions = ideas.includes(baseName) ? ideas : [baseName, ...ideas];

  return (
    <div className="compare-bar">
      <label className="compare-bar-side">
        <span>Base</span>
        <select value={baseName} onChange={(e) => setBaseline({ kind: "branch", name: e.target.value }, e.target.value)}>
          {baseOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="compare-bar-side">
        <span>Changes</span>
        <select value={currentBranch} onChange={(e) => void switchToIdea(platform, e.target.value)}>
          {ideas.map((name) => (
            <option key={name} value={name}>
              {name === currentBranch && draftDirty ? `${name} (unsaved changes)` : name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
