import { describe, expect, it } from "vitest";
import { parseDiff3, renderDiff3Resolution, countConflicts } from "../src/versions/diff3.js";

const SAMPLE =
  "Intro line.\n" +
  "<<<<<<< ours\n" +
  "ours version\n" +
  "||||||| base\n" +
  "base version\n" +
  "=======\n" +
  "theirs version\n" +
  ">>>>>>> theirs\n" +
  "Outro line.";

describe("parseDiff3 / renderDiff3Resolution", () => {
  it("parses text and conflict segments", () => {
    const segments = parseDiff3(SAMPLE);
    expect(countConflicts(segments)).toBe(1);
    const conflict = segments.find((s) => s.kind === "conflict");
    expect(conflict).toMatchObject({ kind: "conflict", ours: "ours version", base: "base version", theirs: "theirs version" });
  });

  it("renders 'ours', 'theirs', 'both', and a custom edit", () => {
    const segments = parseDiff3(SAMPLE);
    expect(renderDiff3Resolution(segments, [{ kind: "ours" }])).toBe("Intro line.\nours version\nOutro line.");
    expect(renderDiff3Resolution(segments, [{ kind: "theirs" }])).toBe("Intro line.\ntheirs version\nOutro line.");
    expect(renderDiff3Resolution(segments, [{ kind: "both" }])).toBe("Intro line.\nours version\ntheirs version\nOutro line.");
    expect(renderDiff3Resolution(segments, [{ kind: "edit", text: "custom" }])).toBe("Intro line.\ncustom\nOutro line.");
  });

  it("handles multiple conflicts in one file", () => {
    const text = `${SAMPLE}\n${SAMPLE.replace(/ours version/g, "ours2").replace(/theirs version/g, "theirs2").replace(/base version/g, "base2")}`;
    const segments = parseDiff3(text);
    expect(countConflicts(segments)).toBe(2);
    const rendered = renderDiff3Resolution(segments, [{ kind: "ours" }, { kind: "theirs" }]);
    expect(rendered).toContain("ours version");
    expect(rendered).toContain("theirs2");
  });

  it("returns the text unchanged when there are no conflicts", () => {
    const segments = parseDiff3("plain\ntext\n");
    expect(countConflicts(segments)).toBe(0);
    expect(renderDiff3Resolution(segments, [])).toBe("plain\ntext\n");
  });
});
