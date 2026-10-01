import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { rehypeAddClasses } from "./htmlTransform.js";

// Renders a standalone markdown fragment (e.g. one list, sliced straight out of the live
// editor's doc) to an HTML string, synchronously. `processSync` works here because
// remark-parse/remark-gfm/remark-rehype/rehype-stringify are all synchronous-capable, which
// matters because the live editor's decoration-building (livePreview.ts) runs synchronously —
// it can't await a Promise. `rehypeAddClasses` is the same pass `toHtml`/`redlineHtml` use, so
// the output carries the same `md-*` classes as full-document export.
// Used by the live editor's list widget (ui/src/editor/listWidget.ts) to render a real
// <ol>/<ul> — with real nested inline formatting and real nested sub-lists — for a list that
// isn't currently being edited (SPEC.md §7.2).
export function renderMarkdownFragmentSync(markdown: string): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeAddClasses)
    .use(rehypeStringify)
    .processSync(markdown);
  return String(file);
}
