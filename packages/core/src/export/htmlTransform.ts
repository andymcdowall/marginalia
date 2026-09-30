import { slugifyHeading } from "./scopeCss.js";

// Minimal hast node shape — only what these two transforms touch. Not the real `hast` package's
// types (not an allowed dependency beyond what unified/rehype already pull in transitively), and
// not worth widening `unified().use()`'s inference for.
type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};

const CLASS_BY_TAG: Record<string, string> = {
  h1: "md-h1",
  h2: "md-h2",
  h3: "md-h3",
  h4: "md-h4",
  h5: "md-h5",
  h6: "md-h6",
  p: "md-p",
  li: "md-li",
  ul: "md-ul",
  ol: "md-ol",
  blockquote: "md-blockquote",
  pre: "md-pre",
  code: "md-code",
  table: "md-table",
  a: "md-link",
  img: "md-img",
  strong: "md-strong",
  em: "md-em",
};

function addClasses(node: HastNode): void {
  if (node.type === "element" && node.tagName) {
    const cls = CLASS_BY_TAG[node.tagName];
    if (cls) {
      const existing = node.properties?.className;
      const classes = Array.isArray(existing) ? existing : typeof existing === "string" ? [existing] : [];
      node.properties = { ...node.properties, className: [...classes, cls] };
    }
  }
  for (const child of node.children ?? []) addClasses(child);
}

// Adds a `md-<tag>` class to common structural elements (headings, list items, paragraphs, etc.)
// so exported CSS — the built-in theme or a per-section stylesheet — has stable hooks beyond bare
// tag selectors. Walks the hast tree by hand rather than via `unist-util-visit`: that package
// isn't in SPEC.md §3.1's allowed dependency list (see embedImages.ts for the same call).
export function rehypeAddClasses() {
  return (tree: HastNode): void => {
    addClasses(tree);
  };
}

function textContent(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textContent).join("");
}

// Groups the document's top-level nodes into `<div class="md-section" data-section="...">`
// wrappers, one per H1: a section runs from one H1 heading up to (not including) the next H1, or
// the end of the document. Content before the first H1 is left unwrapped. `data-section` is the
// heading's slug (slugifyHeading), matched against a note's frontmatter `sectionStyles` map by
// `sectionCss.ts` so a per-section stylesheet can be scoped to exactly this container.
export function rehypeWrapSections() {
  return (tree: HastNode): void => {
    const children = tree.children ?? [];
    const out: HastNode[] = [];
    let current: HastNode | null = null;
    for (const node of children) {
      if (node.type === "element" && node.tagName === "h1") {
        current = {
          type: "element",
          tagName: "div",
          properties: { className: ["md-section"], "data-section": slugifyHeading(textContent(node)) },
          children: [],
        };
        out.push(current);
      }
      if (current) current.children!.push(node);
      else out.push(node);
    }
    tree.children = out;
  };
}
