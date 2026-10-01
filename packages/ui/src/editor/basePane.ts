import { EditorState, RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { frontmatterField } from "./frontmatter.js";
import { sectionsField } from "./sectionStyles.js";
import { livePreview } from "./livePreview.js";
import { sourceModeField } from "./sourceMode.js";
import { editorTheme } from "./theme.js";
import { markdownExtensions } from "./setup.js";

// The left (base) side of the compare view: a read-only rendering of an idea's text with the
// removed ranges struck through. Positions are offsets into the comment-free clean text.
export type DeletedRange = { from: number; to: number };

export const setDeletedRanges = StateEffect.define<DeletedRange[]>();

const deletedField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setDeletedRanges)) continue;
      const builder = new RangeSetBuilder<Decoration>();
      const docLength = tr.state.doc.length;
      const ranges = [...e.value].sort((a, b) => a.from - b.from);
      for (const r of ranges) {
        const from = Math.min(r.from, docLength);
        const to = Math.min(r.to, docLength);
        if (to > from) builder.add(from, to, Decoration.mark({ class: "cm-del" }));
      }
      value = builder.finish();
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function baseExtensions(): Extension[] {
  return [
    EditorView.lineWrapping,
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    markdownExtensions(),
    sourceModeField,
    frontmatterField,
    sectionsField,
    deletedField,
    livePreview,
    editorTheme,
  ];
}
