import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { joinFile, splitFile } from "@marginalia/core";
import { editorSetup } from "../editor/setup.js";
import { usePlatform } from "../platformContext.js";
import { useStore } from "../store.js";

const AUTOSAVE_DEBOUNCE_MS = 1500;

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

    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimer) clearTimeout(saveTimer);
        void doSave();
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
          ...editorSetup(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              markDirty(true);
              scheduleSave();
            }
          }),
        ],
      });
      viewRef.current = new EditorView({ state, parent: containerRef.current! });
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("blur", handleBlur);
      unsubscribeQuit = platform.onBeforeQuit(doSave);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
      unsubscribeQuit?.();
      if (saveTimer) clearTimeout(saveTimer);
      void doSave();
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [openFile?.path]);

  if (!openFile) {
    return <div className="empty-state">Select a note or press Cmd+N</div>;
  }

  return <div className="editor-pane" ref={containerRef} />;
}
