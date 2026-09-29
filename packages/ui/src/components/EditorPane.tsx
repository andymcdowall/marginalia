import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { cleanText, joinFile, resolveBaselineSha, baselineText, splitFile, type Thread } from "@marginalia/core";
import { editorSetup } from "../editor/setup.js";
import { setThreads, setActiveThreadId } from "../editor/commentHighlights.js";
import { insertCommentTags, removeCommentTags } from "../editor/comments.js";
import { clipboardHandlers } from "../editor/clipboard.js";
import { setRedlineOn, setBaselineClean } from "../editor/redline.js";
import { usePlatform } from "../platformContext.js";
import { useStore } from "../store.js";

const AUTOSAVE_DEBOUNCE_MS = 1500;

// A pragmatic escape hatch for the few actions (re-anchor) that other sidebar panels need to run
// directly against the live CodeMirror view, rather than plumbing a ref through context for one
// use — see DECISIONS.md.
export const activeEditorView: { current: EditorView | null } = { current: null };

export function EditorPane() {
  const platform = usePlatform();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const openFile = useStore((s) => s.openFile);
  const markDirty = useStore((s) => s.markDirty);
  const markSaved = useStore((s) => s.markSaved);

  useEffect(() => {
    const path = openFile?.path;
    if (!path || !containerRef.current) return;

    let cancelled = false;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeQuit: (() => void) | null = null;

    async function doSave(): Promise<void> {
      const view = viewRef.current;
      const current = useStore.getState().openFile;
      const workspace = useStore.getState().workspace;
      if (!view || !current || !workspace || current.path !== path) return;
      const body = view.state.doc.toString();
      const content = joinFile(body, current.threads);
      if (content === current.lastSaved) return;
      await workspace.saveCommit.save(path, content);
      markSaved(content);
    }

    function scheduleSave(): void {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void doSave(), AUTOSAVE_DEBOUNCE_MS);
    }

    function handleCreateComment(): void {
      const view = viewRef.current;
      if (!view || view.state.selection.main.empty) return;
      // Simplified from SPEC.md §8.2's "focus a draft textarea in the Comments panel": that needs
      // live cross-component focus coordination this pass doesn't build. A synchronous prompt
      // gets the same create/cancel-removes-tags behavior with far less plumbing — see
      // DECISIONS.md.
      const body = window.prompt("Comment:");
      const id = insertCommentTags(view);
      if (!id) return;
      if (!body) {
        removeCommentTags(view, id);
        return;
      }
      const now = new Date().toISOString();
      const newThread: Thread = { id, status: "open", updated: now, comments: [{ id: `${id}-c1`, created: now, body }] };
      const current = useStore.getState().openFile;
      if (current) useStore.getState().setThreads([...current.threads, newThread]);
      useStore.getState().setActiveThreadId(id);
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimer) clearTimeout(saveTimer);
        void doSave();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        handleCreateComment();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        useStore.getState().setRedlineOn(!useStore.getState().redlineOn);
      }
    }
    function handleBlur(): void {
      if (saveTimer) clearTimeout(saveTimer);
      void doSave();
    }

    async function resolveAndApplyBaseline(): Promise<void> {
      const view = viewRef.current;
      const workspace = useStore.getState().workspace;
      if (!view || !workspace || !path) return;
      const { baseline } = useStore.getState();
      const branch = useStore.getState().currentBranch;
      const sha = await resolveBaselineSha(workspace.git, baseline, branch);
      const rel = workspace.git.toRelative(path);
      const text = await baselineText(workspace.git, sha, rel);
      const clean = cleanText(text).text;
      viewRef.current?.dispatch({ effects: setBaselineClean.of(clean) });
      useStore.getState().setBaselineCleanText(clean);
    }

    void (async () => {
      const raw = await platform.fs.readText(path);
      if (cancelled) return;
      const parsed = splitFile(raw);
      const workspace = useStore.getState().workspace;
      workspace?.saveCommit.primeLastSaved(path, raw);

      const state = EditorState.create({
        doc: parsed.body,
        extensions: [
          ...editorSetup(parsed.threads),
          clipboardHandlers(
            () => useStore.getState().openFile?.threads ?? [],
            (pastedThreads) => {
              const current = useStore.getState().openFile;
              if (current) useStore.getState().setThreads([...current.threads, ...pastedThreads]);
            }
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              markDirty(true);
              scheduleSave();
              useStore.getState().setDocText(update.state.doc.toString());
            }
          }),
        ],
      });
      viewRef.current = new EditorView({ state, parent: containerRef.current! });
      activeEditorView.current = viewRef.current;
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("blur", handleBlur);
      unsubscribeQuit = platform.onBeforeQuit(doSave);

      if (useStore.getState().redlineOn) {
        viewRef.current.dispatch({ effects: setRedlineOn.of(true) });
        void resolveAndApplyBaseline();
      }
    })();

    // Pushes external thread/active-thread/redline changes (from CommentsPanel/HistoryPanel/
    // ChangesPanel actions) into the live CodeMirror state without remounting the editor.
    const unsubscribeStore = useStore.subscribe((state, prevState) => {
      const view = viewRef.current;
      if (!view) return;
      const effects = [];
      if (state.openFile?.threads !== prevState.openFile?.threads) {
        effects.push(setThreads.of(state.openFile?.threads ?? []));
      }
      if (state.activeThreadId !== prevState.activeThreadId) {
        effects.push(setActiveThreadId.of(state.activeThreadId));
      }
      if (state.redlineOn !== prevState.redlineOn) {
        effects.push(setRedlineOn.of(state.redlineOn));
      }
      if (effects.length) view.dispatch({ effects });
      if (state.redlineOn && (state.baseline !== prevState.baseline || (state.redlineOn && !prevState.redlineOn))) {
        void resolveAndApplyBaseline();
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
      unsubscribeQuit?.();
      unsubscribeStore();
      if (saveTimer) clearTimeout(saveTimer);
      void doSave();
      viewRef.current?.destroy();
      viewRef.current = null;
      activeEditorView.current = null;
    };
  }, [openFile?.path]);

  if (!openFile) {
    return <div className="empty-state">Select a note or press Cmd+N</div>;
  }

  return <div className="editor-pane" ref={containerRef} />;
}
