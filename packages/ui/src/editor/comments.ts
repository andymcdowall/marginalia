import type { EditorView } from "@codemirror/view";
import { findMilestones, generateId } from "@marginalia/core";

// SPEC.md §8.2: inserts both tags in one transaction. Returns the new thread's id, or null if the
// selection was empty.
export function insertCommentTags(view: EditorView): string | null {
  const sel = view.state.selection.main;
  if (sel.empty) return null;
  const existing = new Set(findMilestones(view.state.doc.toString()).map((m) => m.id));
  const id = generateId(existing);
  view.dispatch({
    changes: [
      { from: sel.to, insert: `<comment-end id="${id}"/>` },
      { from: sel.from, insert: `<comment-start id="${id}"/>` },
    ],
  });
  return id;
}

// Removes both milestone tags for a thread (draft cancelled, or "Delete thread").
export function removeCommentTags(view: EditorView, threadId: string): void {
  const tags = findMilestones(view.state.doc.toString()).filter((m) => m.id === threadId);
  if (tags.length === 0) return;
  view.dispatch({ changes: tags.map((m) => ({ from: m.from, to: m.to, insert: "" })) });
}

// SPEC.md §8.3 "Re-anchor": inserts new tags with the SAME id around the current selection.
export function reAnchorThread(view: EditorView, threadId: string): boolean {
  const sel = view.state.selection.main;
  if (sel.empty) return false;
  view.dispatch({
    changes: [
      { from: sel.to, insert: `<comment-end id="${threadId}"/>` },
      { from: sel.from, insert: `<comment-start id="${threadId}"/>` },
    ],
  });
  return true;
}
