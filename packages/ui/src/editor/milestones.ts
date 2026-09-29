import { EditorState, StateField, RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { findMilestones } from "@marginalia/core";
import { isSourceMode } from "./sourceMode.js";

export { setSourceMode } from "./sourceMode.js";

function buildDecorations(state: EditorState): DecorationSet {
  if (isSourceMode(state)) return Decoration.none;
  const doc = state.doc.toString();
  const milestones = findMilestones(doc);
  const builder = new RangeSetBuilder<Decoration>();
  for (const m of milestones) {
    builder.add(m.from, m.to, Decoration.replace({}));
  }
  return builder.finish();
}

export const milestonesField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(value, tr) {
    if (!tr.docChanged && !tr.effects.length) return value;
    return buildDecorations(tr.state);
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});
