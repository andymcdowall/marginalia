import type { Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

// Don't collapse a list into the rendered widget (listRenderField.ts) if it contains a comment
// milestone: the widget's remark/rehype pipeline (without allowDangerousHtml) just drops the
// literal `<comment-start id="..."/>` tag text, but the separate comment-highlight decoration
// (commentHighlights.ts) would still try to mark that same, now block-replaced, range.
const MILESTONE_RE = /<comment-(start|end) id="[a-z0-9]{6}"\/>/;

export function rangeActive(doc: Text, active: Set<number>, from: number, to: number): boolean {
  const startLine = doc.lineAt(from).number;
  const endLine = doc.lineAt(to).number;
  for (let l = startLine; l <= endLine; l++) {
    if (active.has(l)) return true;
  }
  return false;
}

// Whether a list node should be collapsed into the rendered <ol>/<ul> widget
// (listRenderField.ts) rather than shown as plain per-item source (livePreview.ts). Both modules
// call this exact function so they always agree on which lines each one is responsible for —
// listRenderField only emits a block decoration when this is true, and livePreview only skips
// generating its own per-item decorations when this is true, so the two providers never both
// try to cover the same lines.
//
// Only a TOP-LEVEL list (direct child of Document) is ever eligible — a list nested inside a
// Blockquote is left alone entirely. Lezer's grammar interleaves continuation QuoteMarks as the
// *list's own* children in some blockquote+list shapes (verified directly against the parse
// tree while building this), so a nested list's own range can't be sliced and re-parsed on its
// own without risking mangled output.
//
// Compare mode (redline) marks insertions/deletions as inline decorations over raw doc offsets —
// the same risk as a comment milestone — if those offsets fall inside a block-replaced list.
// Simplest safe rule: no list collapses at all while compare mode is on, rather than checking
// each list for an overlapping hunk.
export function isCollapsibleList(node: SyntaxNode, doc: Text, active: Set<number>, redlineOn: boolean): boolean {
  if (node.parent?.name !== "Document") return false;
  if (redlineOn) return false;
  if (rangeActive(doc, active, node.from, node.to)) return false;
  const sourceText = doc.sliceString(node.from, node.to);
  return !MILESTONE_RE.test(sourceText);
}
