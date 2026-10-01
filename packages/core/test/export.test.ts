import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createNodePlatform } from "@marginalia/platform-node";
import { splitFile } from "../src/document/splitFile.js";
import { joinFile } from "../src/document/joinFile.js";
import { toHtml } from "../src/export/toHtml.js";
import { redlineHtml } from "../src/export/redlineHtml.js";
import { cleanText } from "../src/diff/cleanText.js";
import type { Thread } from "../src/comments/types.js";

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "marginalia-export-"));
}

const T = "2026-01-01T00:00:00Z";
const SECRET_COMMENT_BODY = "SECRET_REVIEWER_ONLY_TEXT_12345";

async function makeDocumentWithComments() {
  const dir = await tempDir();
  const platform = createNodePlatform(path.join(dir, "store.json"));
  const body =
    'The quick <comment-start id="aaaaaa"/>brown fox<comment-end id="aaaaaa"/> jumps over the lazy dog.\n\n' +
    "## Heading\n\nSome *emphasis* and a [link](https://example.com).\n";
  const threads: Thread[] = [
    { id: "aaaaaa", status: "open", updated: T, comments: [{ id: "c11111", created: T, body: SECRET_COMMENT_BODY }] },
  ];
  const raw = joinFile(body, threads);
  const parsed = splitFile(raw);
  return { platform, dir, body: parsed.body };
}

describe("SPEC.md §11.2: exported HTML never contains milestones, comment block, or comment text", () => {
  it("clean export", async () => {
    const { platform, dir, body } = await makeDocumentWithComments();
    const html = await toHtml(platform, dir, body);
    expect(html).not.toContain("comment-start");
    expect(html).not.toContain("comment-end");
    expect(html).not.toContain("marginalia:comments");
    expect(html).not.toContain(SECRET_COMMENT_BODY);
    expect(html).toContain('<h2 class="md-h2">Heading</h2>');
    expect(html).toContain("brown fox");
  });

  it("redline export", async () => {
    const { platform, dir, body } = await makeDocumentWithComments();
    const baseline = cleanText(body.replace("brown fox", "brown")).text;
    const html = await redlineHtml(platform, dir, body, baseline, "Origin", "idea-1");
    expect(html).not.toContain("comment-start");
    expect(html).not.toContain("comment-end");
    expect(html).not.toContain("marginalia:comments");
    expect(html).not.toContain(SECRET_COMMENT_BODY);
  });
});

describe("SPEC.md §11.2: redline HTML <ins>/<del> counts match the fixture's hunks", () => {
  it("one replaced word produces one <ins> and one <del>", async () => {
    const dir = await tempDir();
    const platform = createNodePlatform(path.join(dir, "store.json"));
    const baseline = "The quick brown fox jumps.";
    const current = "The quick red fox jumps.";

    const html = await redlineHtml(platform, dir, current, baseline, "Origin", "idea-1");
    const insCount = (html.match(/<ins>/g) ?? []).length;
    const delCount = (html.match(/<del>/g) ?? []).length;
    expect(insCount).toBe(1);
    expect(delCount).toBe(1);
    expect(html).toContain("<ins>red</ins>");
    expect(html).toContain("<del>brown</del>");
  });

  it("two independent edits produce two of each", async () => {
    const dir = await tempDir();
    const platform = createNodePlatform(path.join(dir, "store.json"));
    const baseline = "One two three four five six seven.";
    const current = "One TWO three four FIVE six seven.";

    const html = await redlineHtml(platform, dir, current, baseline, "Origin", "idea-1");
    const insCount = (html.match(/<ins>/g) ?? []).length;
    const delCount = (html.match(/<del>/g) ?? []).length;
    expect(insCount).toBe(delCount);
    expect(insCount).toBe(2);
  });

  it("no changes produces no <ins>/<del>", async () => {
    const dir = await tempDir();
    const platform = createNodePlatform(path.join(dir, "store.json"));
    const text = "Nothing changed here at all.";
    const html = await redlineHtml(platform, dir, text, text, "Origin", "idea-1");
    expect(html).not.toContain("<ins>");
    expect(html).not.toContain("<del>");
  });
});

describe("Per-section custom CSS (frontmatter sectionStyles)", () => {
  it("adds md-* classes and wraps each H1 section, scoping its mapped stylesheet", async () => {
    const dir = await tempDir();
    const platform = createNodePlatform(path.join(dir, "store.json"));
    await fs.writeFile(path.join(dir, "part-one.css"), "h1 { color: purple; }\n");

    const body =
      '---\nsectionStyles:\n  "Part One": part-one.css\n---\n' +
      "# Part One\n\nSome *text* and a list:\n\n- one\n- two\n\n" +
      "# Part Two\n\nOther text.\n";

    const html = await toHtml(platform, dir, body);

    // frontmatter itself never leaks into the rendered body
    expect(html).not.toContain("sectionStyles");
    // common structures get stable classes
    expect(html).toContain('<h1 class="md-h1">Part One</h1>');
    expect(html).toContain('<li class="md-li">one</li>');
    expect(html).toContain('<em class="md-em">text</em>');
    // each H1 starts its own scoped section container
    expect(html).toContain('<div class="md-section" data-section="part-one">');
    expect(html).toContain('<div class="md-section" data-section="part-two">');
    // the mapped stylesheet is scoped to Part One's section only
    expect(html).toContain('.md-section[data-section="part-one"] h1 { color: purple; }');
  });

  it("skips a stylesheet that can't be read instead of failing the export", async () => {
    const dir = await tempDir();
    const platform = createNodePlatform(path.join(dir, "store.json"));
    const body = '---\nsectionStyles:\n  "Part One": missing.css\n---\n# Part One\n\nText.\n';
    const html = await toHtml(platform, dir, body);
    expect(html).toContain('<h1 class="md-h1">Part One</h1>');
  });
});
