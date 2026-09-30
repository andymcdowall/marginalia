import { RangeSetBuilder, StateField, type EditorState, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { Tree } from "@lezer/common";
import { slugifyHeading } from "@marginalia/core";

export type Section = { title: string; from: number; to: number };

// A section runs from one H1 (ATXHeading1) to the start of the next H1, or the end of the
// document — matching what a note's frontmatter `sectionStyles` map targets by heading text.
// Content before the first H1 belongs to no section.
export function computeSections(doc: Text, tree: Tree): Section[] {
  const headings: { title: string; from: number }[] = [];
  tree.iterate({
    enter(node) {
      if (node.name === "ATXHeading1") {
        const lineStart = doc.lineAt(node.from).from;
        const title = doc
          .sliceString(node.from, node.to)
          .replace(/^#\s*/, "")
          .trim();
        headings.push({ title, from: lineStart });
      }
    },
  });
  return headings.map((h, i) => ({
    title: h.title,
    from: h.from,
    to: i + 1 < headings.length ? headings[i + 1]!.from : doc.length,
  }));
}

function buildSectionDecorations(doc: Text, sections: Section[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const lines: { from: number; cls: string }[] = [];
  for (const section of sections) {
    const cls = `cm-section-${slugifyHeading(section.title)}`;
    const startLine = doc.lineAt(section.from).number;
    const endLine = doc.lineAt(Math.max(section.from, section.to - 1)).number;
    for (let l = startLine; l <= endLine; l++) lines.push({ from: doc.line(l).from, cls });
  }
  lines.sort((a, b) => a.from - b.from);
  for (const { from, cls } of lines) builder.add(from, from, Decoration.line({ class: cls }));
  return builder.finish();
}

type SectionsValue = { sections: Section[]; decorations: DecorationSet };

function build(state: EditorState): SectionsValue {
  const sections = computeSections(state.doc, syntaxTree(state));
  return { sections, decorations: buildSectionDecorations(state.doc, sections) };
}

// Provides `cm-section-<slug>` line decorations so a note's per-section stylesheet (loaded and
// scoped in EditorPane via `useSectionCss`) has something to attach to in the live preview, the
// same way `.md-section[data-section="<slug>"]` does in exported HTML.
export const sectionsField = StateField.define<SectionsValue>({
  create: build,
  update(value, tr) {
    return tr.docChanged ? build(tr.state) : value;
  },
  provide: (field) => EditorView.decorations.from(field, (v) => v.decorations),
});
