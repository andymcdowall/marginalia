import { describe, expect, it } from "vitest";
import { splitFrontmatter, parseSectionStyles, parseDocCss } from "../src/document/frontmatter.js";

describe("splitFrontmatter", () => {
  it("splits a frontmatter block off the body", () => {
    const raw = '---\nsectionStyles:\n  "Part One": styles/part-one.css\n---\n# Part One\n\nBody text.\n';
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toBe('sectionStyles:\n  "Part One": styles/part-one.css');
    expect(body).toBe("# Part One\n\nBody text.\n");
  });

  it("handles CRLF line endings", () => {
    const raw = "---\r\nkey: value\r\n---\r\nbody\r\n";
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toBe("key: value");
    expect(body).toBe("body\r\n");
  });

  it("returns null frontmatter when there's no opening marker", () => {
    const raw = "# Just a heading\n\nNo frontmatter here.\n";
    expect(splitFrontmatter(raw)).toEqual({ frontmatter: null, body: raw });
  });

  it("returns null frontmatter when the block is never closed", () => {
    const raw = "---\nkey: value\n\n# Heading\n";
    expect(splitFrontmatter(raw)).toEqual({ frontmatter: null, body: raw });
  });
});

describe("parseSectionStyles", () => {
  it("parses quoted and unquoted heading keys", () => {
    const fm = 'sectionStyles:\n  "Part One": styles/part-one.css\n  Part Two: styles/part-two.css\n';
    const map = parseSectionStyles(fm);
    expect(map.get("Part One")).toBe("styles/part-one.css");
    expect(map.get("Part Two")).toBe("styles/part-two.css");
  });

  it("stops at a dedented line, ignoring an unrelated key after the block", () => {
    const fm = "sectionStyles:\n  \"Part One\": a.css\nother: ignored\n";
    const map = parseSectionStyles(fm);
    expect(map.size).toBe(1);
    expect(map.get("Part One")).toBe("a.css");
  });

  it("returns an empty map with no frontmatter or no sectionStyles key", () => {
    expect(parseSectionStyles(null).size).toBe(0);
    expect(parseSectionStyles("title: My Note").size).toBe(0);
  });
});

describe("parseDocCss", () => {
  it("reads a top-level css key, quoted or not", () => {
    expect(parseDocCss("css: styles/note.css")).toBe("styles/note.css");
    expect(parseDocCss('css: "styles/note.css"')).toBe("styles/note.css");
  });

  it("ignores an indented css key nested under something else", () => {
    expect(parseDocCss("other:\n  css: nope.css")).toBeNull();
  });

  it("returns null with no frontmatter or no css key", () => {
    expect(parseDocCss(null)).toBeNull();
    expect(parseDocCss("title: My Note")).toBeNull();
  });

  it("coexists with a sectionStyles block", () => {
    const fm = 'css: styles/note.css\nsectionStyles:\n  "Part One": styles/part-one.css\n';
    expect(parseDocCss(fm)).toBe("styles/note.css");
    expect(parseSectionStyles(fm).get("Part One")).toBe("styles/part-one.css");
  });
});
