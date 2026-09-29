import { RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

// SPEC.md §7.2: if the doc starts with "---\n", lines through the next "---" line get class
// cm-frontmatter. No parsing of the contents.
function buildFrontmatterDecorations(doc: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  if (!doc.startsWith("---\n")) return builder.finish();

  const closeIdx = doc.indexOf("\n---", 4);
  if (closeIdx === -1) return builder.finish();

  const closeLineEnd = doc.indexOf("\n", closeIdx + 1);
  const end = closeLineEnd === -1 ? doc.length : closeLineEnd;

  let pos = 0;
  const deco = Decoration.line({ class: "cm-frontmatter" });
  while (pos <= end) {
    const nextNewline = doc.indexOf("\n", pos);
    builder.add(pos, pos, deco);
    if (nextNewline === -1 || nextNewline >= end) break;
    pos = nextNewline + 1;
  }
  return builder.finish();
}

export const frontmatterField = StateField.define<DecorationSet>({
  create(state) {
    return buildFrontmatterDecorations(state.doc.toString());
  },
  update(value, tr) {
    if (!tr.docChanged) return value;
    return buildFrontmatterDecorations(tr.state.doc.toString());
  },
  provide: (field) => EditorView.decorations.from(field),
});
