import { describe, expect, it } from "vitest";
import { aliasTagSelectors } from "../src/editor/cssTagAlias.js";

describe("aliasTagSelectors", () => {
  it("adds the matching .cm-* class alongside a bare tag selector", () => {
    const out = aliasTagSelectors("h1 { color: red; }");
    expect(out).toContain("h1, .cm-h1 { color: red; }");
  });

  it("aliases each bare tag in a comma-separated list independently", () => {
    const out = aliasTagSelectors("h1, li { margin: 0; }");
    expect(out).toContain("h1, li, .cm-h1, .cm-li { margin: 0; }");
  });

  it("leaves a selector that isn't a single bare tag name untouched", () => {
    const out = aliasTagSelectors(".foo { color: blue; } blockquote p { color: green; }");
    expect(out).toContain(".foo { color: blue; }");
    expect(out).toContain("blockquote p { color: green; }");
    expect(out).not.toContain(".cm-quote p");
  });

  it("is case-insensitive on the tag name", () => {
    const out = aliasTagSelectors("H1 { color: red; }");
    expect(out).toContain(".cm-h1");
  });

  it("leaves at-rules unscoped/untouched", () => {
    const out = aliasTagSelectors("@media print { h1 { color: blue; } }");
    expect(out.trim().startsWith("@media")).toBe(true);
  });

  it("covers every mapped tag", () => {
    const tags = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "code", "pre", "strong", "em", "del", "a", "img"];
    for (const tag of tags) {
      const out = aliasTagSelectors(`${tag} { color: red; }`);
      expect(out, `expected an alias for <${tag}>`).toMatch(/\.cm-/);
    }
  });
});
