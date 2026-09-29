import { EditorView } from "@codemirror/view";
import { findMilestones, MILESTONE_RE, regenerateIds, type Thread } from "@marginalia/core";

const MIME = "application/x-marginalia";

function cleanText(rawSlice: string): string {
  return rawSlice.replace(MILESTONE_RE, "");
}

function threadsFullyInside(threads: Thread[], rawSlice: string): Thread[] {
  const kindsById = new Map<string, Set<"start" | "end">>();
  for (const m of findMilestones(rawSlice)) {
    const set = kindsById.get(m.id) ?? new Set<"start" | "end">();
    set.add(m.kind);
    kindsById.set(m.id, set);
  }
  return threads.filter((t) => {
    const kinds = kindsById.get(t.id);
    return kinds?.has("start") && kinds.has("end");
  });
}

function handleCopy(event: ClipboardEvent, view: EditorView, getThreads: () => Thread[]): boolean {
  const sel = view.state.selection.main;
  if (sel.empty || !event.clipboardData) return false;
  const rawSlice = view.state.sliceDoc(sel.from, sel.to);
  event.clipboardData.setData("text/plain", cleanText(rawSlice));
  event.clipboardData.setData(MIME, JSON.stringify({ body: rawSlice, threads: threadsFullyInside(getThreads(), rawSlice) }));
  event.preventDefault();
  return true;
}

// SPEC.md §8.4. `onPasteThreads` is called with the freshly-id-regenerated threads to merge into
// the store; the editor transaction itself only inserts text.
export function clipboardHandlers(getThreads: () => Thread[], onPasteThreads: (threads: Thread[]) => void) {
  return EditorView.domEventHandlers({
    copy(event, view) {
      return handleCopy(event, view, getThreads);
    },
    cut(event, view) {
      const handled = handleCopy(event, view, getThreads);
      if (handled) view.dispatch(view.state.replaceSelection(""));
      return handled;
    },
    paste(event, view) {
      const custom = event.clipboardData?.getData(MIME);
      if (!custom) return false; // fall back to default plain-text paste
      event.preventDefault();
      try {
        const parsed = JSON.parse(custom) as { body: string; threads: Thread[] };
        const { body, threads } = regenerateIds(parsed.body, parsed.threads);
        view.dispatch(view.state.replaceSelection(body));
        if (threads.length > 0) onPasteThreads(threads);
      } catch {
        // Malformed clipboard payload — nothing pasted rather than corrupting the doc.
      }
      return true;
    },
  });
}
