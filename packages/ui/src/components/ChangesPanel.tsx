import { useEffect, useState } from "react";
import { computeRedlineHunks } from "../editor/redline.js";
import { activeEditorView } from "./EditorPane.js";
import { useStore } from "../store.js";
import { BaselinePicker } from "./BaselinePicker.js";
import type { Hunk } from "@marginalia/core";

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

export function ChangesPanel() {
  const openFile = useStore((s) => s.openFile);
  const redlineOn = useStore((s) => s.redlineOn);
  const setRedlineOn = useStore((s) => s.setRedlineOn);
  const baselineLabel = useStore((s) => s.baselineLabel);
  const baselineCleanText = useStore((s) => s.baselineCleanText);
  const activeHunkIndex = useStore((s) => s.activeHunkIndex);
  const setActiveHunkIndex = useStore((s) => s.setActiveHunkIndex);
  const [hunks, setHunks] = useState<Hunk[]>([]);
  const [toDoc, setToDoc] = useState<Int32Array>(new Int32Array());

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

  if (!openFile) return <div className="changes-panel-empty">No file open.</div>;

  return (
    <div className="changes-panel">
      <div className="changes-panel-toggle">
        <label>
          <input type="checkbox" checked={redlineOn} onChange={(e) => setRedlineOn(e.target.checked)} />
          {` Redline vs ${baselineLabel}`}
        </label>
      </div>
      {redlineOn && <BaselinePicker />}
      {redlineOn && (
        <>
          <div className="changes-panel-count">{hunks.length} changes</div>
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
