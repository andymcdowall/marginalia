import { type EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { redlineField } from "./redline.js";
import { isCollapsibleList } from "./listEligibility.js";
import { ListWidget } from "./listWidget.js";
import { isSourceMode } from "./sourceMode.js";

function activeLineNumbers(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(range.to).number;
    for (let l = fromLine; l <= toLine; l++) lines.add(l);
  }
  return lines;
}

function build(state: EditorState): DecorationSet {
  if (isSourceMode(state)) return Decoration.none;
  const doc = state.doc;
  const active = activeLineNumbers(state);
  const redlineOn = state.field(redlineField, false)?.on ?? false;
  const entries: { from: number; to: number; widget: ListWidget }[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "OrderedList" && node.name !== "BulletList") return;
      if (!isCollapsibleList(node.node, doc, active, redlineOn)) return;
      const startLine = doc.lineAt(node.from);
      const endLine = doc.lineAt(node.to);
      entries.push({ from: startLine.from, to: endLine.to, widget: new ListWidget(doc.sliceString(node.from, node.to)) });
      return false; // nested sub-lists render as part of this one widget; no need to visit them
    },
  });

  const builder = new RangeSetBuilder<Decoration>();
  for (const e of entries) builder.add(e.from, e.to, Decoration.replace({ widget: e.widget, block: true }));
  return builder.finish();
}

// Collapses each eligible top-level list into a real <ol>/<ul> widget (listWidget.ts) while the
// cursor isn't inside it — SPEC.md §7.2. This MUST be a StateField, not part of the `livePreview`
// ViewPlugin: CodeMirror throws "Block decorations may not be specified via plugins" if a
// ViewPlugin's decorations include `block: true`. `livePreview.ts` independently computes the
// same eligibility (`isCollapsibleList`, shared in listEligibility.ts) and skips generating its
// own per-item decorations for a list that's collapsible here, so the two providers never both
// try to cover the same lines.
// Unlike `livePreview`, this walks the WHOLE document on every relevant change, not just the
// visible range — StateFields don't have access to the view's viewport, only ViewPlugins do.
// The expensive part (actually rendering a list's markdown to HTML) only runs inside
// `ListWidget.toDOM()`, which CodeMirror skips calling again for a widget whose `eq()` says it's
// unchanged, so re-walking the tree here is comparatively cheap — no benchmark was written for
// this, logged as a thing to revisit on a very large document with many lists if it's ever slow.
export const listRenderField = StateField.define<DecorationSet>({
  create: build,
  update(value, tr) {
    if (!tr.docChanged && tr.startState.selection.eq(tr.state.selection) && tr.effects.length === 0) return value;
    return build(tr.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});
