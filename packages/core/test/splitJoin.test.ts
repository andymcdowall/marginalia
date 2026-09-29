import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { splitFile } from "../src/document/splitFile.js";
import { joinFile } from "../src/document/joinFile.js";
import { escapeCommentBody, unescapeCommentBody } from "../src/comments/escape.js";
import type { Thread } from "../src/comments/types.js";

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
// `roundTrip()` below writes fixtures synchronously while `describe()` callbacks are collected,
// which runs before any `beforeAll` hook — so the directory must exist at module-eval time.
fs.mkdirSync(FIXTURES_DIR, { recursive: true });

function writeFixture(name: string, raw: string): string {
  fs.writeFileSync(path.join(FIXTURES_DIR, `${name}.txt`), raw, "utf8");
  return raw;
}

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, `${name}.txt`), "utf8");
}

/**
 * Builds a fixture from `body`/`threads` via joinFile (so it's guaranteed to be "a file
 * previously produced by joinFile" per SPEC.md §5.5's round-trip guarantee), writes it to disk,
 * then asserts joinFile(splitFile(raw)) === raw and that parsing recovered the exact threads.
 */
function roundTrip(name: string, body: string, threads: Thread[]): void {
  writeFixture(name, joinFile(body, threads));
  it(`round-trips: ${name}`, () => {
    const onDisk = readFixture(name);
    const parsed = splitFile(onDisk);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.body).toBe(body);
    expect(parsed.threads).toEqual(threads);
    expect(joinFile(parsed.body, parsed.threads)).toBe(onDisk);
  });
}

const T = "2026-01-01T00:00:00-05:00";

describe("splitFile / joinFile round-trip (fixtures)", () => {
  roundTrip("01-plain-no-threads", "# Hello\n\nJust text, no comments.\n", []);

  roundTrip(
    "02-single-thread-single-comment",
    'Some text with <comment-start id="aaaaaa"/>a highlighted range<comment-end id="aaaaaa"/> in it.\n',
    [{ id: "aaaaaa", status: "open", updated: T, comments: [{ id: "bbbbbb", created: T, body: "Is this right?" }] }]
  );

  roundTrip(
    "03-single-thread-multi-comment",
    'A <comment-start id="cccccc"/>range<comment-end id="cccccc"/> with replies.\n',
    [
      {
        id: "cccccc",
        status: "open",
        updated: T,
        comments: [
          { id: "d1d1d1", created: T, body: "First." },
          { id: "d2d2d2", created: T, body: "Second." },
          { id: "d3d3d3", created: T, body: "Third." },
        ],
      },
    ]
  );

  roundTrip(
    "04-multiple-threads-sequential",
    'One <comment-start id="e00001"/>range<comment-end id="e00001"/> then another <comment-start id="e00002"/>range<comment-end id="e00002"/>.\n',
    [
      { id: "e00001", status: "open", updated: T, comments: [{ id: "f00001", created: T, body: "First thread." }] },
      { id: "e00002", status: "open", updated: T, comments: [{ id: "f00002", created: T, body: "Second thread." }] },
    ]
  );

  roundTrip(
    "05-overlapping-threads",
    'Text <comment-start id="g00001"/>with an <comment-start id="g00002"/>overlapping<comment-end id="g00001"/> pair<comment-end id="g00002"/> of ranges.\n',
    [
      { id: "g00001", status: "open", updated: T, comments: [{ id: "h00001", created: T, body: "Outer." }] },
      { id: "g00002", status: "open", updated: T, comments: [{ id: "h00002", created: T, body: "Inner." }] },
    ]
  );

  roundTrip(
    "06-resolved-thread",
    'A <comment-start id="i00001"/>resolved range<comment-end id="i00001"/>.\n',
    [{ id: "i00001", status: "resolved", updated: T, comments: [{ id: "j00001", created: T, body: "Fixed." }] }]
  );

  roundTrip("07-orphaned-no-milestones", "Text with no milestones left at all.\n", [
    { id: "k00001", status: "orphaned", updated: T, comments: [{ id: "l00001", created: T, body: "Where did this go?" }] },
  ]);

  roundTrip(
    "08-orphaned-only-start-tag",
    'Text with a dangling <comment-start id="m00001"/>tag and nothing else.\n',
    [{ id: "m00001", status: "orphaned", updated: T, comments: [{ id: "n00001", created: T, body: "Missing end tag." }] }]
  );

  roundTrip(
    "09-orphaned-zero-length-range",
    'Text with <comment-start id="o00001"/><comment-end id="o00001"/> touching tags.\n',
    [{ id: "o00001", status: "orphaned", updated: T, comments: [{ id: "p00001", created: T, body: "Empty range." }] }]
  );

  roundTrip(
    "10-frontmatter",
    '---\ntitle: Fixture\ndate: 2026-01-01\n---\n\n# Doc\n\nA <comment-start id="q00001"/>range<comment-end id="q00001"/> after frontmatter.\n',
    [{ id: "q00001", status: "open", updated: T, comments: [{ id: "r00001", created: T, body: "Noted." }] }]
  );

  roundTrip(
    "11-crlf-line-endings",
    'Line one.\r\nLine two with <comment-start id="s00001"/>a range<comment-end id="s00001"/>.\r\nLine three.\r\n',
    [{ id: "s00001", status: "open", updated: T, comments: [{ id: "t00001", created: T, body: "CRLF preserved?" }] }]
  );

  roundTrip(
    "12-unicode",
    'Café, 日本語, emoji 🎉 and <comment-start id="u00001"/>a highlighted café menu 🍜<comment-end id="u00001"/> here.\n',
    [{ id: "u00001", status: "open", updated: T, comments: [{ id: "v00001", created: T, body: "コメント: 美味しい 🎉" }] }]
  );

  roundTrip(
    "13-trailing-no-newline",
    'Body with no trailing newline and a <comment-start id="w00001"/>range<comment-end id="w00001"/> in it',
    [{ id: "w00001", status: "open", updated: T, comments: [{ id: "x00001", created: T, body: "No trailing newline in body." }] }]
  );

  roundTrip(
    "14-escape-special-chars",
    'Some <comment-start id="y00001"/>range<comment-end id="y00001"/> with special comment text.\n',
    [
      {
        id: "y00001",
        status: "open",
        updated: T,
        comments: [
          { id: "z00001", created: T, body: 'Has & < > " chars.' },
          { id: "z00002", created: "2026-09-28T20:31:00-05:00", body: "Confirmed **March 14**.\n\nSecond paragraph." },
        ],
      },
    ]
  );

  roundTrip(
    "15-many-dashes",
    'A <comment-start id="a10001"/>range<comment-end id="a10001"/> with dashes in the reply.\n',
    [{ id: "a10001", status: "open", updated: T, comments: [{ id: "a10002", created: T, body: "---five---dashes---, and ----four more----." }] }]
  );

  roundTrip(
    "16-id-boundary-000000",
    'A <comment-start id="000000"/>range<comment-end id="000000"/> with the lowest id.\n',
    [{ id: "000000", status: "open", updated: T, comments: [{ id: "a20001", created: T, body: "Lowest id." }] }]
  );

  roundTrip(
    "17-id-boundary-zzzzzz",
    'A <comment-start id="zzzzzz"/>range<comment-end id="zzzzzz"/> with the highest id.\n',
    [{ id: "zzzzzz", status: "open", updated: T, comments: [{ id: "a30001", created: T, body: "Highest id." }] }]
  );

  roundTrip(
    "18-five-threads-mixed-status",
    [
      'Intro paragraph.',
      '<comment-start id="b10001"/>First range<comment-end id="b10001"/>.',
      '<comment-start id="b10002"/>Second range<comment-end id="b10002"/>.',
      '<comment-start id="b10003"/>Third range<comment-end id="b10003"/>.',
      '<comment-start id="b10004"/>Fourth range<comment-end id="b10004"/>.',
      "No milestones for the fifth thread anymore.",
    ].join("\n") + "\n",
    [
      { id: "b10001", status: "open", updated: T, comments: [{ id: "c10001", created: T, body: "One." }] },
      { id: "b10002", status: "resolved", updated: T, comments: [{ id: "c10002", created: T, body: "Two." }] },
      { id: "b10003", status: "open", updated: T, comments: [{ id: "c10003", created: T, body: "Three." }] },
      { id: "b10004", status: "resolved", updated: T, comments: [{ id: "c10004", created: T, body: "Four." }] },
      { id: "b10005", status: "orphaned", updated: T, comments: [{ id: "c10005", created: T, body: "Five, orphaned." }] },
    ]
  );

  roundTrip(
    "19-timezone-offsets",
    'A <comment-start id="d10001"/>range<comment-end id="d10001"/> with varied offsets.\n',
    [
      {
        id: "d10001",
        status: "open",
        updated: "2026-03-01T12:00:00Z",
        comments: [
          { id: "d10002", created: "2026-03-01T09:00:00-05:00", body: "Eastern." },
          { id: "d10003", created: "2026-03-01T22:30:00+05:30", body: "IST." },
          { id: "d10004", created: "2026-03-01T12:00:00Z", body: "UTC." },
        ],
      },
    ]
  );

  roundTrip(
    "20-multi-paragraph-range",
    [
      'A <comment-start id="e10001"/>range that starts here',
      "",
      "continues through a second paragraph",
      "",
      'and ends here<comment-end id="e10001"/>.',
    ].join("\n") + "\n",
    [{ id: "e10001", status: "open", updated: T, comments: [{ id: "e10002", created: T, body: "Spans paragraphs." }] }]
  );

  roundTrip(
    "21-adjacent-touching-threads",
    'Text <comment-start id="f10001"/>range A<comment-end id="f10001"/><comment-start id="f10002"/>range B<comment-end id="f10002"/> end.\n',
    [
      { id: "f10001", status: "open", updated: T, comments: [{ id: "f10003", created: T, body: "A." }] },
      { id: "f10002", status: "open", updated: T, comments: [{ id: "f10004", created: T, body: "B." }] },
    ]
  );

  roundTrip(
    "22-empty-thread-list-with-body-dashes",
    "A body with a lone --- dash sequence and no threads at all.\n",
    []
  );
});

describe("splitFile: malformed block handling", () => {
  it("preserves the whole file as body and warns when the block doesn't close", () => {
    const raw = writeFixture(
      "23-malformed-block",
      'Body text.\n<!-- marginalia:comments\n<comments>\n  <thread id="aaaaaa" status="open" updated="2026-01-01T00:00:00Z">\n    <comment id="bbbbbb" created="2026-01-01T00:00:00Z">Hi</comment>\n  </thread>\n</comments>\n'
      // no closing "-->"
    );
    const parsed = splitFile(raw);
    expect(parsed.body).toBe(raw);
    expect(parsed.threads).toEqual([]);
    expect(parsed.warnings).toEqual(["Comment block could not be read; it was left in the file as text."]);
  });

  it("has no comment block at all", () => {
    const raw = "Just a plain file with a -- double dash but no block.\n";
    const parsed = splitFile(raw);
    expect(parsed.body).toBe(raw);
    expect(parsed.threads).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });
});

describe("splitFile: reconciliation synthesizes orphans for unknown milestone ids", () => {
  it("creates an orphaned thread with a placeholder comment for a milestone with no thread block", () => {
    const body = 'Text with a <comment-start id="g20001"/>stray range<comment-end id="g20001"/> and no thread data.\n';
    const raw = body; // no comment block at all — pure body with an orphaned inline range
    const parsed = splitFile(raw);
    expect(parsed.threads).toHaveLength(1);
    const thread = parsed.threads[0]!;
    expect(thread.id).toBe("g20001");
    expect(thread.status).toBe("orphaned");
    expect(thread.comments).toHaveLength(1);
    expect(thread.comments[0]!.body).toBe("(comment text missing)");
  });
});

describe("escapeCommentBody / unescapeCommentBody round-trip (property test)", () => {
  it("round-trips a fixed set of tricky strings exactly", () => {
    const cases = [
      "",
      "plain text",
      "&",
      "<",
      ">",
      '"',
      "-",
      "--",
      "---",
      "----",
      "-----",
      "a-b--c---d",
      "&amp;",
      "&lt;",
      "&<>\"-\n\r",
      "line1\nline2\r\nline3",
      "emoji 🎉 café 日本語",
      '**bold** and "quoted" & <tag>',
      "-".repeat(50),
    ];
    for (const s of cases) {
      expect(unescapeCommentBody(escapeCommentBody(s))).toBe(s);
    }
  });

  it("round-trips 500 random strings exactly and never emits a literal '--'", () => {
    const alphabet = 'abc&<>"-\n\r \t💥日';
    let seed = 42;
    function rand(): number {
      // xorshift32, deterministic across runs
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) % 1000) / 1000;
    }
    for (let i = 0; i < 500; i++) {
      const length = Math.floor(rand() * 40);
      let s = "";
      for (let j = 0; j < length; j++) {
        s += alphabet[Math.floor(rand() * alphabet.length)];
      }
      const escaped = escapeCommentBody(s);
      expect(escaped.includes("--")).toBe(false);
      expect(unescapeCommentBody(escaped)).toBe(s);
    }
  });
});
