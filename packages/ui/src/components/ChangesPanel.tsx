import { useEffect, useState } from "react";
import { listChangedFiles, splitFile, type ChangedFile, type Hunk } from "@marginalia/core";
import { computeRedlineHunks } from "../editor/redline.js";
import { activeEditorView } from "./EditorPane.js";
import { usePlatform } from "../platformContext.js";
import { useStore } from "../store.js";
import { CompareBar } from "./CompareBar.js";
import { saveIdea } from "../ideaActions.js";

function excerpt(s: string, n = 40): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n)}…` : clean;
}

function jumpTo(hunk: Hunk, toDoc: Int32Array): void {
  const view = activeEditorView.current;
  if (!view) return;
  const from = toDoc[hunk.curFrom]!;
  const to = toDoc[hunk.curTo]! || from;
  view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
  view.focus();
}

const STATUS_TITLE = { M: "Modified", A: "Added", D: "Deleted" } as const;

// SPEC.md §10.3, reworked: the two dropdowns (base idea, changes idea), the list of files that
// differ between them (orange = modified, green = added, red = deleted), and — for the open
// file — its individual changes. Clicking a file opens it in the side-by-side compare view.
export function ChangesPanel() {
  const platform = usePlatform();
  const workspace = useStore((s) => s.workspace);
  const openFile = useStore((s) => s.openFile);
  const deletedView = useStore((s) => s.deletedView);
  const redlineOn = useStore((s) => s.redlineOn);
  const setRedlineOn = useStore((s) => s.setRedlineOn);
  const baseline = useStore((s) => s.baseline);
  const currentBranch = useStore((s) => s.currentBranch);
  const draftDirty = useStore((s) => s.draftDirty);
  const draftVersion = useStore((s) => s.draftVersion);
  const baselineCleanText = useStore((s) => s.baselineCleanText);
  const activeHunkIndex = useStore((s) => s.activeHunkIndex);
  const setActiveHunkIndex = useStore((s) => s.setActiveHunkIndex);
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [hunks, setHunks] = useState<Hunk[]>([]);
  const [toDoc, setToDoc] = useState<Int32Array>(new Int32Array());

  const baseName = baseline.kind === "branch" ? baseline.name : currentBranch;

  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    listChangedFiles(workspace.git, baseName)
      .then((list) => {
        if (!cancelled) setFiles(list);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, baseName, currentBranch, draftVersion]);

  useEffect(() => {
    if (!redlineOn || !openFile) {
      setHunks([]);
      return;
    }
    const result = computeRedlineHunks(openFile.docText, baselineCleanText);
    setHunks(result.hunks);
    setToDoc(result.toDoc);
  }, [redlineOn, openFile, openFile?.docText, baselineCleanText]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!e.altKey || hunks.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = (activeHunkIndex + 1) % hunks.length;
        setActiveHunkIndex(next);
        jumpTo(hunks[next]!, toDoc);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = (activeHunkIndex - 1 + hunks.length) % hunks.length;
        setActiveHunkIndex(prev);
        jumpTo(hunks[prev]!, toDoc);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hunks, toDoc, activeHunkIndex, setActiveHunkIndex]);

  async function openChanged(file: ChangedFile): Promise<void> {
    if (!workspace) return;
    const abs = workspace.git.toAbsolute(file.path);
    if (!file.path.endsWith(".md")) {
      useStore.getState().addToast(`${file.path} isn't a note, so it can't be compared side by side.`);
      return;
    }
    await workspace.saveCommit.flush();
    if (file.status === "D") {
      useStore.getState().setDeletedView(abs);
    } else {
      const raw = await platform.fs.readText(abs);
      workspace.saveCommit.primeLastSaved(abs, raw);
      useStore.getState().openFileAt(abs, splitFile(raw).threads, raw);
    }
    setRedlineOn(true);
  }

  const activePath = openFile?.path ?? deletedView;

  return (
    <div className="changes-panel">
      <CompareBar />
      <div className="changes-panel-actions">
        <button type="button" disabled={!draftDirty} onClick={() => void saveIdea()}>
          Save idea
        </button>
        <label>
          <input type="checkbox" checked={redlineOn} onChange={(e) => setRedlineOn(e.target.checked)} />
          {" Side by side"}
        </label>
      </div>

      <div className="changes-panel-count">
        {files.length === 0 ? "No differences" : `${files.length} changed file${files.length === 1 ? "" : "s"}`}
      </div>
      {files.map((f) => {
        const abs = workspace?.git.toAbsolute(f.path);
        const slash = f.path.lastIndexOf("/");
        return (
          <div
            key={f.path}
            className={`changes-file changes-file-${f.status}${abs === activePath ? " active" : ""}`}
            title={`${STATUS_TITLE[f.status]}: ${f.path}`}
            onClick={() => void openChanged(f)}
            role="button"
            tabIndex={0}
          >
            <span className="changes-file-name">{f.path.slice(slash + 1)}</span>
            {slash >= 0 && <span className="changes-file-dir">{f.path.slice(0, slash)}</span>}
            <span className="changes-file-status">{f.status}</span>
          </div>
        );
      })}

      {redlineOn && openFile && (
        <>
          <div className="changes-panel-count">{hunks.length} changes in this file</div>
          <div className="changes-panel-nav">
            <button
              type="button"
              disabled={hunks.length === 0}
              onClick={() => {
                const prev = (activeHunkIndex - 1 + hunks.length) % hunks.length;
                setActiveHunkIndex(prev);
                jumpTo(hunks[prev]!, toDoc);
              }}
            >
              {"↑ Prev"}
            </button>
            <button
              type="button"
              disabled={hunks.length === 0}
              onClick={() => {
                const next = (activeHunkIndex + 1) % hunks.length;
                setActiveHunkIndex(next);
                jumpTo(hunks[next]!, toDoc);
              }}
            >
              {"↓ Next"}
            </button>
          </div>
          {hunks.map((h, i) => (
            <div
              key={h.id}
              className={`changes-hunk${i === activeHunkIndex ? " active" : ""}`}
              onClick={() => {
                setActiveHunkIndex(i);
                jumpTo(h, toDoc);
              }}
            >
              {h.deleted && <span className="changes-hunk-del">{excerpt(h.deleted)}</span>}
              {h.deleted && h.inserted && " → "}
              {h.inserted && <span className="changes-hunk-ins">{excerpt(h.inserted)}</span>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
