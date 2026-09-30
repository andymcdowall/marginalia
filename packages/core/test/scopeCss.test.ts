import { describe, expect, it } from "vitest";
import { scopeCss, slugifyHeading } from "../src/export/scopeCss.js";

describe("slugifyHeading", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyHeading("Part One")).toBe("part-one");
  });

  it("strips punctuation and collapses runs of separators", () => {
    expect(slugifyHeading("  Part -- One!! ")).toBe("part-one");
  });

  it("falls back to 'section' for an empty/all-punctuation heading", () => {
    expect(slugifyHeading("")).toBe("section");
    expect(slugifyHeading("***")).toBe("section");
  });
});

describe("scopeCss", () => {
  it("prefixes every selector of every rule", () => {
    const css = "h1 { color: red; }\nli, p { margin: 0; }";
    const out = scopeCss(css, ".scope");
    expect(out).toContain(".scope h1 { color: red; }");
    expect(out).toContain(".scope li, .scope p { margin: 0; }");
  });

  it("leaves at-rules unscoped", () => {
    const css = '@media print { h1 { color: blue; } }';
    const out = scopeCss(css, ".scope");
    expect(out.trim().startsWith("@media")).toBe(true);
  });
});
