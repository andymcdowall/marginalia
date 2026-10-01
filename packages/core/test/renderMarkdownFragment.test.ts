import { describe, expect, it } from "vitest";
import { renderMarkdownFragmentSync } from "../src/export/renderMarkdownFragment.js";

describe("renderMarkdownFragmentSync", () => {
  it("renders an ordered list as a real <ol><li>, with md-* classes", () => {
    const html = renderMarkdownFragmentSync("1. one\n2. two\n");
    expect(html).toContain('<ol class="md-ol">');
    expect(html).toContain('<li class="md-li">one</li>');
    expect(html).toContain('<li class="md-li">two</li>');
  });

  it("respects a non-1 start number", () => {
    const html = renderMarkdownFragmentSync("5. five\n6. six\n");
    expect(html).toContain('start="5"');
  });

  it("renders an unordered list as <ul><li>", () => {
    const html = renderMarkdownFragmentSync("- one\n- two\n");
    expect(html).toContain('<ul class="md-ul">');
    expect(html).toContain('<li class="md-li">one</li>');
  });

  it("renders nested sub-lists", () => {
    const html = renderMarkdownFragmentSync("1. one\n   - nested a\n   - nested b\n2. two\n");
    expect(html).toContain('<li class="md-li">one');
    expect(html).toContain('<ul class="md-ul">');
    expect(html).toContain('<li class="md-li">nested a</li>');
  });

  it("renders inline formatting inside a list item", () => {
    const html = renderMarkdownFragmentSync("1. **bold** and [a link](https://example.com) and `code`\n");
    expect(html).toContain('<strong class="md-strong">bold</strong>');
    expect(html).toContain('<a href="https://example.com" class="md-link">a link</a>');
    expect(html).toContain('<code class="md-code">code</code>');
  });

  it("renders GFM task list items as checkboxes", () => {
    const html = renderMarkdownFragmentSync("- [ ] todo\n- [x] done\n");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });
});
