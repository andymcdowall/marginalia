import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { usePlatform } from "../platformContext.js";
import { useStore } from "../store.js";
import { editorBridge } from "../editorBridge.js";
import { refreshDraft } from "../ideaActions.js";

// A plain-text editor for .css files — the per-section/doc-wide stylesheets a note's frontmatter
// can reference (SPEC.md §11.4). No comments/threads/milestones/live-preview/redline: those are
// markdown-only concepts, so a `.css` file (`OpenFile.kind === "css"`) is routed here instead of
// EditorPane (see App.tsx). Autosave mirrors EditorPane's save flow (write-only; "Save idea"
// still does the actual commit) but skips splitFile/joinFile entirely — a .css file has no
// comment block to round-trip.
export function CssEditorPane() {
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
      const content = view.state.doc.toString();
      if (content === current.lastSaved) return;
      await workspace.saveCommit.save(path, content);
      markSaved(content);
      void refreshDraft();
    }

    function scheduleSave(): void {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void doSave(), useStore.getState().settings.autosaveDelayMs);
    }

    function handleBlur(): void {
      if (saveTimer) clearTimeout(saveTimer);
      void doSave();
    }

    void (async () => {
      const raw = await platform.fs.readText(path);
      if (cancelled) return;
      useStore.getState().workspace?.saveCommit.primeLastSaved(path, raw);

      const state = EditorState.create({
        doc: raw,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          search(),
          EditorView.lineWrapping,
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
      window.addEventListener("blur", handleBlur);
      unsubscribeQuit = platform.onBeforeQuit(doSave);
      editorBridge.flush = async () => {
        if (saveTimer) clearTimeout(saveTimer);
        await doSave();
      };
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("blur", handleBlur);
      unsubscribeQuit?.();
      if (saveTimer) clearTimeout(saveTimer);
      void doSave();
      viewRef.current?.destroy();
      viewRef.current = null;
      editorBridge.flush = null;
    };
  }, [openFile?.path]);

  if (!openFile) return null;

  return <div className="editor-pane css-editor-pane" ref={containerRef} />;
}
