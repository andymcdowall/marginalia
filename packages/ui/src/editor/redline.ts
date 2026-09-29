import { StateField, RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

// Phase 0 spike stub: approximates Phase 4's redline decoration cost (roughly one hunk per
// ~50 words) so Spike B's typing-latency measurement reflects realistic combined overhead.
// TODO(Phase 4): replace with the real cleanText/wordDiff-driven hunk field (SPEC.md §10.3).
function buildStubHunks(doc: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const re = /\S+/g;
  let count = 0;
  for (const m of doc.matchAll(re)) {
    count++;
    if (count % 50 === 0) {
      const from = m.index!;
      const to = from + m[0].length;
      builder.add(from, to, Decoration.mark({ class: "cm-ins" }));
    }
  }
  return builder.finish();
}

export const redlineStubField = StateField.define<DecorationSet>({
  create(state) {
    return buildStubHunks(state.doc.toString());
  },
  update(value, tr) {
    if (!tr.docChanged) return value;
    return buildStubHunks(tr.state.doc.toString());
  },
  provide: (field) => EditorView.decorations.from(field),
});
