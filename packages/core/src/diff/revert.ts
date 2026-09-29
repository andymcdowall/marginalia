import type { CleanText } from "./cleanText.js";
import { findMilestones } from "../comments/milestones.js";
import type { Hunk } from "./hunks.js";

export type DocChange = { from: number; to: number; insert: string };

// SPEC.md §10.4. Pure function — the caller applies the change as one normal (undoable)
// transaction. Milestone tags found inside the reverted range are preserved, appended after the
// restored text, so comment anchors inside a reverted insertion survive (possibly becoming empty
// and therefore orphaned, which is acceptable).
export function revertHunk(doc: string, clean: CleanText, hunk: Hunk): DocChange {
  const from = clean.toDoc[hunk.curFrom]!;
  const to = clean.toDoc[hunk.curTo]!;
  const slice = doc.slice(from, to);
  const tags = findMilestones(slice)
    .map((m) => slice.slice(m.from, m.to))
    .join("");
  return { from, to, insert: hunk.deleted + tags };
}
