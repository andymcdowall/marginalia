import { useEffect, useState } from "react";
import { listBranches, listSnapshots, type BranchInfo, type SnapshotInfo } from "@marginalia/core";
import { useStore } from "../store.js";

// SPEC.md §10.3: Origin, snapshots, ideas, "Pick from history…". The last one is simplified to a
// raw-sha prompt rather than an inline commit browser — see DECISIONS.md.
export function BaselinePicker() {
  const workspace = useStore((s) => s.workspace);
  const currentBranch = useStore((s) => s.currentBranch);
  const setBaseline = useStore((s) => s.setBaseline);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);

  useEffect(() => {
    if (!workspace) return;
    void listSnapshots(workspace.git, currentBranch).then(setSnapshots);
    void listBranches(workspace.git).then(setBranches);
  }, [workspace, currentBranch]);

  function handleChange(value: string): void {
    if (value === "origin") {
      setBaseline({ kind: "origin" }, "Origin");
      return;
    }
    if (value === "pick-commit") {
      const sha = window.prompt("Commit SHA to use as baseline:");
      if (sha) setBaseline({ kind: "commit", sha: sha.trim() }, sha.trim().slice(0, 7));
      return;
    }
    if (value.startsWith("snapshot:")) {
      const tag = value.slice("snapshot:".length);
      const snap = snapshots.find((s) => s.tag === tag);
      setBaseline({ kind: "snapshot", tag }, snap?.subject ?? tag);
      return;
    }
    if (value.startsWith("branch:")) {
      const name = value.slice("branch:".length);
      setBaseline({ kind: "branch", name }, name);
    }
  }

  return (
    <select className="baseline-picker" onChange={(e) => handleChange(e.target.value)} defaultValue="origin">
      <option value="origin">Origin</option>
      {snapshots.length > 0 && (
        <optgroup label="Snapshots">
          {snapshots.map((s) => (
            <option key={s.tag} value={`snapshot:${s.tag}`}>
              {s.subject}
            </option>
          ))}
        </optgroup>
      )}
      {branches.length > 0 && (
        <optgroup label="Ideas">
          {branches.map((b) => (
            <option key={b.name} value={`branch:${b.name}`}>
              {b.name}
            </option>
          ))}
        </optgroup>
      )}
      <option value="pick-commit">{"Pick from history…"}</option>
    </select>
  );
}
