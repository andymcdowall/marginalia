import { EditorState, StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

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

export const setSourceMode = StateEffect.define<boolean>();

function buildDecorations(state: EditorState, sourceMode: boolean): DecorationSet {
  if (sourceMode) return Decoration.none;
  const doc = state.doc.toString();
  const milestones = findMilestones(doc);
  const builder = new RangeSetBuilder<Decoration>();
  for (const m of milestones) {
    builder.add(m.from, m.to, Decoration.replace({}));
  }
  return builder.finish();
}

export const milestonesField = StateField.define<{ sourceMode: boolean; decorations: DecorationSet }>({
  create(state) {
    const sourceMode = false;
    return { sourceMode, decorations: buildDecorations(state, sourceMode) };
  },
  update(value, tr) {
    let sourceMode = value.sourceMode;
    for (const effect of tr.effects) {
      if (effect.is(setSourceMode)) sourceMode = effect.value;
    }
    if (!tr.docChanged && sourceMode === value.sourceMode) {
      return value;
    }
    return { sourceMode, decorations: buildDecorations(tr.state, sourceMode) };
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).decorations),
  ],
});
