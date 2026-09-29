import { findMilestones } from "../comments/milestones.js";

export type CleanText = { text: string; toDoc: Int32Array }; // toDoc has length text.length + 1

// SPEC.md §10.1: strips milestone tags so comment changes never produce diff hunks. `toDoc[i]` is
// the doc offset of clean char `i`; `toDoc[text.length]` is the doc length.
export function cleanText(body: string): CleanText {
  const milestones = findMilestones(body);
  const segments: string[] = [];
  const toDocArr: number[] = [];
  let pos = 0;

  for (const m of milestones) {
    if (m.from > pos) {
      const seg = body.slice(pos, m.from);
      segments.push(seg);
      for (let k = 0; k < seg.length; k++) toDocArr.push(pos + k);
    }
    pos = m.to;
  }
  if (pos < body.length) {
    const seg = body.slice(pos);
    segments.push(seg);
    for (let k = 0; k < seg.length; k++) toDocArr.push(pos + k);
  }
  toDocArr.push(body.length);

  return { text: segments.join(""), toDoc: Int32Array.from(toDocArr) };
}
