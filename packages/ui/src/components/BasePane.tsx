import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { baselineText, cleanText, resolveBaselineSha, splitFile } from "@marginalia/core";
import { baseExtensions, setDeletedRanges } from "../editor/basePane.js";
import { computeRedlineHunks } from "../editor/redline.js";
import { useStore } from "../store.js";
import { activeEditorView } from "./EditorPane.js";

// Left half of the compare view. Shows the base idea's version of the open file (or of a file
// deleted on the right), read-only, with removed text struck through; scrolls with the editor.
export function BasePane({ label }: { label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const workspace = useStore((s) => s.workspace);
  const baseline = useStore((s) => s.baseline);
  const currentBranch = useStore((s) => s.currentBranch);
  const draftVersion = useStore((s) => s.draftVersion);
  const setBaselineCleanText = useStore((s) => s.setBaselineCleanText);
  const baseText = useStore((s) => s.baselineCleanText);
  const docText = useStore((s) => s.openFile?.docText);
  const hasOpenFile = useStore((s) => s.openFile !== null);
  const path = useStore((s) => s.openFile?.path ?? s.deletedView);

  useEffect(() => {
    if (!containerRef.current) return;
    viewRef.current = new EditorView({
      state: EditorState.create({ doc: "", extensions: baseExtensions() }),
      parent: containerRef.current,
    });
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  // Read the base idea's version of the file. The editor's redline marks and the hunk list
  // subscribe to `baselineCleanText` in the store. Re-read after any commit/checkout/base change.
  useEffect(() => {
    if (!workspace || !path) return;
    let cancelled = false;
    void (async () => {
      const sha = await resolveBaselineSha(workspace.git, baseline, currentBranch);
      const text = await baselineText(workspace.git, sha, workspace.git.toRelative(path));
      if (!cancelled) setBaselineCleanText(cleanText(splitFile(text).body).text);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace, baseline, currentBranch, draftVersion, path, setBaselineCleanText]);

  // Base text + removed ranges. A file deleted on the right has no editor doc, so everything in
  // the base counts as removed.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    const changes = current === baseText ? undefined : { from: 0, to: current.length, insert: baseText };
    const ranges = hasOpenFile
      ? computeRedlineHunks(docText ?? "", baseText).hunks.filter((h) => h.deleted).map((h) => ({ from: h.baseFrom, to: h.baseTo }))
      : [{ from: 0, to: baseText.length }];
    view.dispatch({ changes, effects: setDeletedRanges.of(ranges) });
  }, [baseText, docText, hasOpenFile, path]);

  // Keep the two panes scrolled together (proportionally, since their heights differ).
  useEffect(() => {
    let detach: (() => void) | null = null;
    let tries = 0;
    // The editor mounts asynchronously (it reads the file first), so retry briefly.
    function attach(): void {
      const left = viewRef.current?.scrollDOM;
      const right = activeEditorView.current?.scrollDOM;
      if (!left || !right) {
        if (tries++ < 20) retryTimer = setTimeout(attach, 50);
        return;
      }
      detach = link(left, right);
    }
    let retryTimer: ReturnType<typeof setTimeout> | null = setTimeout(attach, 0);
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      detach?.();
    };
  }, [path, hasOpenFile]);

  return (
    <div className="compare-base">
      <div className="compare-pane-label">{label}</div>
      <div className="compare-pane-body" ref={containerRef} />
    </div>
  );
}

function link(left: HTMLElement, right: HTMLElement): () => void {
  let syncing = false;
  function follow(from: HTMLElement, to: HTMLElement): void {
    if (syncing) return;
    syncing = true;
    const fromMax = from.scrollHeight - from.clientHeight;
    const toMax = to.scrollHeight - to.clientHeight;
    to.scrollTop = fromMax > 0 ? (from.scrollTop / fromMax) * toMax : 0;
    requestAnimationFrame(() => {
      syncing = false;
    });
  }
  const onLeft = () => follow(left, right);
  const onRight = () => follow(right, left);
  left.addEventListener("scroll", onLeft);
  right.addEventListener("scroll", onRight);
  return () => {
    left.removeEventListener("scroll", onLeft);
    right.removeEventListener("scroll", onRight);
  };
}
