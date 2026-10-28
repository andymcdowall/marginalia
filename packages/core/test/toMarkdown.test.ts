import { describe, expect, it } from "vitest";
import { splitFile } from "../src/document/splitFile.js";
import { joinFile } from "../src/document/joinFile.js";
import { toMarkdown } from "../src/export/toMarkdown.js";
import type { Thread } from "../src/comments/types.js";

const T = "2026-01-01T00:00:00Z";
const SECRET_COMMENT_BODY = "SECRET_REVIEWER_ONLY_TEXT_12345";

describe("toMarkdown", () => {
  it("never contains milestones, the comment block, or comment text", () => {
    const body = 'The quick <comment-start id="aaaaaa"/>brown fox<comment-end id="aaaaaa"/> jumps.\n';
    const threads: Thread[] = [
      { id: "aaaaaa", status: "open", updated: T, comments: [{ id: "c11111", created: T, body: SECRET_COMMENT_BODY }] },
    ];
    const md = toMarkdown(splitFile(joinFile(body, threads)).body);
    expect(md).toBe("The quick brown fox jumps.\n");
    expect(md).not.toContain(SECRET_COMMENT_BODY);
    expect(md).not.toContain("marginalia:comments");
  });

  it("strips frontmatter", () => {
    expect(toMarkdown("---\ncss: note.css\n---\n# Title\n\nText\n")).toBe("# Title\n\nText\n");
  });

  it("strips block and inline HTML comments without widening gaps", () => {
    expect(toMarkdown("One\n\n<!-- hidden -->\n\nTwo <!-- inline --> three\n")).toBe("One\n\nTwo  three\n");
    expect(toMarkdown("<!-- multi\nline -->\n\nBody\n")).toBe("Body\n");
    expect(toMarkdown("Body\n\n<!-- trailing -->\n")).toBe("Body\n");
  });

  it("leaves comment-like text in code alone", () => {
    const src = "Use `<!-- x -->` here.\n\n```html\n<!-- kept -->\n```\n";
    expect(toMarkdown(src)).toBe(src);
  });

  it("keeps other markdown and HTML as-is", () => {
    const src = "# H\n\n- a\n- b\n\n<!-- c --><br>\n\n![img](pic.png)\n";
    expect(toMarkdown(src)).toBe(src);
  });
});
