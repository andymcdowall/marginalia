// Inline range markers in the document body (SPEC.md §5.2). Pure text scanning — no DOM — so this
// lives in core and packages/ui's editor code imports it rather than re-implementing the regex.
export const MILESTONE_RE = /<comment-(start|end) id="([a-z0-9]{6})"\/>/g;

export type Milestone = { kind: "start" | "end"; id: string; from: number; to: number };

export function findMilestones(doc: string): Milestone[] {
  const out: Milestone[] = [];
  for (const m of doc.matchAll(MILESTONE_RE)) {
    const kind = m[1] as "start" | "end";
    const id = m[2]!;
    const from = m.index!;
    out.push({ kind, id, from, to: from + m[0].length });
  }
  return out;
}
