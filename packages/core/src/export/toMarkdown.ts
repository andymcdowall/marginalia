import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { cleanText } from "../diff/cleanText.js";
import { splitFrontmatter } from "../document/frontmatter.js";

// Minimal mdast node shape — same reasoning as htmlTransform.ts's HastNode.
type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

const HTML_COMMENT_RE = /^<!--(?:(?!-->)[\s\S])*-->$/;

// Markdown export: the note as plain markdown with everything that never renders stripped —
// comment milestones (cleanText), the frontmatter block (Marginalia's `css`/`sectionStyles`
// config), and `<!-- … -->` HTML comments. The comment block was never part of `body` (SPEC.md
// §7.1: the editor doc is body-only). HTML comments are found via the remark parse tree rather
// than a regex over the text, so a `<!--` inside a code span/block is left alone.
export function toMarkdown(body: string): string {
  const { body: withoutFrontmatter } = splitFrontmatter(body);
  const clean = cleanText(withoutFrontmatter).text;
  const tree = unified().use(remarkParse).use(remarkGfm).parse(clean) as MdastNode;

  const ranges: Array<{ from: number; to: number }> = [];
  const visit = (node: MdastNode, isTopLevel: boolean): void => {
    if (node.type === "html" && HTML_COMMENT_RE.test((node.value ?? "").trim())) {
      const from = node.position?.start.offset;
      let to = node.position?.end.offset;
      if (from === undefined || to === undefined) return;
      // A block-level comment owns its lines: drop the blank lines after it too, so removing it
      // doesn't leave a widened gap between the paragraphs around it.
      if (isTopLevel) to += /^[ \t]*(?:\r?\n[ \t]*)*(?:\r?\n|$)/.exec(clean.slice(to))![0].length;
      ranges.push({ from, to });
      return;
    }
    for (const child of node.children ?? []) visit(child, node.type === "root");
  };
  visit(tree, false);

  let out = "";
  let pos = 0;
  for (const r of ranges) {
    out += clean.slice(pos, r.from);
    pos = r.to;
  }
  out += clean.slice(pos);
  return out.replace(/^\s*\n/, "").replace(/\s*$/, "\n");
}
