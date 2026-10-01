import { WidgetType } from "@codemirror/view";
import { renderMarkdownFragmentSync } from "@marginalia/core";

// Renders a whole top-level list (ordered or unordered — including nested sub-lists, task
// checkboxes, and inline formatting) as a real <ol>/<ul>, via the same remark/rehype pipeline
// export uses. Real tags mean a stylesheet written with plain selectors (`ol { list-style-type:
// upper-roman; }`) or the `md-*` classes just works here too, with no `cssTagAlias` needed —
// unlike the rest of the live editor, this is genuine HTML, not CodeMirror line/mark classes.
// Only shown while the cursor isn't inside the list (livePreview.ts falls back to raw source
// while actively editing it, same as headings/blockquotes).
export class ListWidget extends WidgetType {
  constructor(private readonly markdown: string) {
    super();
  }
  eq(other: ListWidget): boolean {
    return other.markdown === this.markdown;
  }
  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-rendered-list";
    // Rendering (not just DOM construction) happens here, in toDOM, rather than in the
    // constructor: CodeMirror skips calling toDOM again for a widget whose `eq()` says it's
    // unchanged, so an inactive list whose text hasn't changed since the last keystroke doesn't
    // re-run the remark/rehype pipeline on every recompute — only an actually-changed list does.
    wrapper.innerHTML = renderMarkdownFragmentSync(this.markdown);
    // A real <a href> inside the rendered list would otherwise navigate the webview on click;
    // the rest of the live editor's links don't navigate either (clicking cm-link text just
    // moves the cursor), so this keeps that the same rather than introducing new navigation.
    wrapper.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a")) e.preventDefault();
    });
    return wrapper;
  }
}
