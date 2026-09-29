import { useState } from "react";
import {
  abortMerge,
  finishMerge,
  keepOursNonMd,
  keepTheirsNonMd,
  markResolved,
  parseDiff3,
  renderDiff3Resolution,
  countConflicts,
  type ConflictResolution,
  type PendingConflict,
} from "@marginalia/core";
import { useStore } from "../store.js";
import { usePlatform } from "../platformContext.js";

// SPEC.md §9.4. Replaces the editor area while a merge has unresolved conflicts.
function FileConflict({ conflict, onResolved }: { conflict: PendingConflict; onResolved: (file: string) => void }) {
  const platform = usePlatform();
  const workspace = useStore((s) => s.workspace);
  const segments = parseDiff3(conflict.mergedWithMarkers);
  const total = countConflicts(segments);
  const [resolutions, setResolutions] = useState<(ConflictResolution | undefined)[]>(new Array(total).fill(undefined));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  function setResolution(i: number, r: ConflictResolution): void {
    setResolutions((prev) => prev.map((p, idx) => (idx === i ? r : p)));
  }

  const allResolved = resolutions.every((r) => r !== undefined);
  let conflictIndex = -1;

  async function handleMarkResolved(): Promise<void> {
    if (!workspace || !allResolved) return;
    const resolved = renderDiff3Resolution(segments, resolutions as ConflictResolution[]);
    await markResolved(platform, workspace.git, conflict.file, resolved, conflict.threads);
    onResolved(conflict.file);
  }

  return (
    <div className="merge-file">
      <div className="merge-file-name">{conflict.file}</div>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return (
            <pre key={i} className="merge-text">
              {seg.text}
            </pre>
          );
        }
        conflictIndex++;
        const idx = conflictIndex;
        const chosen = resolutions[idx];
        return (
          <div key={i} className="merge-conflict">
            <div className="merge-conflict-side">
              <div className="merge-conflict-label">Ours</div>
              <pre>{seg.ours}</pre>
            </div>
            <div className="merge-conflict-side">
              <div className="merge-conflict-label">Theirs</div>
              <pre>{seg.theirs}</pre>
            </div>
            {editingIndex === idx ? (
              <div className="merge-conflict-edit">
                <textarea value={editText} onChange={(e) => setEditText(e.target.value)} />
                <button
                  type="button"
                  onClick={() => {
                    setResolution(idx, { kind: "edit", text: editText });
                    setEditingIndex(null);
                  }}
                >
                  Save edit
                </button>
              </div>
            ) : (
              <div className="merge-conflict-actions">
                <button type="button" className={chosen?.kind === "ours" ? "chosen" : ""} onClick={() => setResolution(idx, { kind: "ours" })}>
                  Take ours
                </button>
                <button type="button" className={chosen?.kind === "theirs" ? "chosen" : ""} onClick={() => setResolution(idx, { kind: "theirs" })}>
                  Take theirs
                </button>
                <button type="button" className={chosen?.kind === "both" ? "chosen" : ""} onClick={() => setResolution(idx, { kind: "both" })}>
                  Take both
                </button>
                <button
                  type="button"
                  className={chosen?.kind === "edit" ? "chosen" : ""}
                  onClick={() => {
                    setEditText(chosen?.kind === "edit" ? chosen.text : `${seg.ours}\n${seg.theirs}`);
                    setEditingIndex(idx);
                  }}
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" disabled={!allResolved} onClick={() => void handleMarkResolved()}>
        Mark resolved
      </button>
    </div>
  );
}

export function MergeView() {
  const workspace = useStore((s) => s.workspace);
  const mergeResult = useStore((s) => s.mergeResult);
  const mergeSource = useStore((s) => s.mergeSource);
  const currentBranch = useStore((s) => s.currentBranch);
  const setMerge = useStore((s) => s.setMerge);
  const [resolvedFiles, setResolvedFiles] = useState<Set<string>>(new Set());
  const [resolvedNonMd, setResolvedNonMd] = useState<Set<string>>(new Set());

  if (!workspace || !mergeResult || mergeResult.kind !== "conflicts") return null;

  const remainingMd = mergeResult.pending.filter((p) => !resolvedFiles.has(p.file));
  const remainingNonMd = mergeResult.nonMdConflicts.filter((f) => !resolvedNonMd.has(f));
  const allDone = remainingMd.length === 0 && remainingNonMd.length === 0;

  async function handleFinish(): Promise<void> {
    await finishMerge(workspace!.git, mergeSource ?? "idea", currentBranch);
    setMerge(null, null);
  }

  async function handleAbort(): Promise<void> {
    await abortMerge(workspace!.git);
    setMerge(null, null);
  }

  return (
    <div className="merge-view">
      <div className="merge-view-header">
        <h2>{`Merging "${mergeSource ?? "idea"}" into "${currentBranch}"`}</h2>
        <div>
          <button type="button" disabled={!allDone} onClick={() => void handleFinish()}>
            Finish merge
          </button>
          <button type="button" onClick={() => void handleAbort()}>
            Abort merge
          </button>
        </div>
      </div>
      {remainingMd.map((conflict) => (
        <FileConflict
          key={conflict.file}
          conflict={conflict}
          onResolved={(file) => setResolvedFiles((prev) => new Set(prev).add(file))}
        />
      ))}
      {remainingNonMd.map((file) => (
        <div key={file} className="merge-file">
          <div className="merge-file-name">{file}</div>
          <div className="merge-conflict-actions">
            <button
              type="button"
              onClick={async () => {
                await keepOursNonMd(workspace!.git, file);
                setResolvedNonMd((prev) => new Set(prev).add(file));
              }}
            >
              Keep ours
            </button>
            <button
              type="button"
              onClick={async () => {
                await keepTheirsNonMd(workspace!.git, file);
                setResolvedNonMd((prev) => new Set(prev).add(file));
              }}
            >
              Keep theirs
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
