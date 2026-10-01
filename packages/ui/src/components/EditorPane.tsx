import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { joinFile, splitFile, type Thread } from "@marginalia/core";
import { editorSetup } from "../editor/setup.js";
import { setThreads, setActiveThreadId } from "../editor/commentHighlights.js";
import { insertCommentTags } from "../editor/comments.js";
import { clipboardHandlers } from "../editor/clipboard.js";
import { setRedlineOn, setBaselineClean, setInlineDeletions } from "../editor/redline.js";
import { setSourceMode } from "../editor/sourceMode.js";
import { useSectionCss } from "../editor/useSectionCss.js";
import { usePlatform } from "../platformContext.js";
import { useStore } from "../store.js";
import { editorBridge } from "../editorBridge.js";
import { refreshDraft } from "../ideaActions.js";

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
  const sectionCss = useSectionCss(platform, openFile?.path, openFile?.docText ?? "");

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
      await workspace.saveCommit.save(path, content); // writes the file; committing is "Save idea"
      markSaved(content);
      void refreshDraft();
    }

    function scheduleSave(): void {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void doSave(), useStore.getState().settings.autosaveDelayMs);
    }

    function handleCreateComment(): void {
      const view = viewRef.current;
      if (!view || view.state.selection.main.empty) return;
      const id = insertCommentTags(view);
      if (!id) return;
      const now = new Date().toISOString();
      const newThread: Thread = { id, status: "open", updated: now, comments: [] };
      const current = useStore.getState().openFile;
      if (current) useStore.getState().setThreads([...current.threads, newThread]);
      useStore.getState().setActiveThreadId(id);
      // Per SPEC.md §8.2: focus a draft textarea in the Comments panel (CommentsPanel owns the
      // input; it removes both tags and the thread if the draft is cancelled or submitted empty).
      useStore.getState().setDraftThreadId(id);
      useStore.getState().setSidebarTab("comments");
      if (useStore.getState().sidebarRightCollapsed) useStore.getState().toggleSidebarRight();
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        handleCreateComment();
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        const next = !useStore.getState().sourceMode;
        useStore.getState().toggleSourceMode();
        viewRef.current?.dispatch({ effects: setSourceMode.of(next) });
      }
    }
    function handleBlur(): void {
      if (saveTimer) clearTimeout(saveTimer);
      void doSave();
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

      editorBridge.flush = async () => {
        if (saveTimer) clearTimeout(saveTimer);
        await doSave();
      };

      if (useStore.getState().redlineOn) {
        viewRef.current.dispatch({
          effects: [
            setRedlineOn.of(true),
            setInlineDeletions.of(useStore.getState().compareLayout === "redline"),
            setBaselineClean.of(useStore.getState().baselineCleanText),
          ],
        });
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
      if (state.compareLayout !== prevState.compareLayout) {
        effects.push(setInlineDeletions.of(state.compareLayout === "redline"));
      }
      // The base text is resolved by BasePane (compare view); just mirror it into the editor.
      if (state.baselineCleanText !== prevState.baselineCleanText) {
        effects.push(setBaselineClean.of(state.baselineCleanText));
      }
      if (effects.length) view.dispatch({ effects });
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
      editorBridge.flush = null;
    };
  }, [openFile?.path]);

  if (!openFile) {
    return <div className="empty-state">Select a note or press Cmd+N</div>;
  }

  return (
    <>
      {sectionCss && <style>{sectionCss}</style>}
      <div className="editor-pane" ref={containerRef} />
    </>
  );
}
