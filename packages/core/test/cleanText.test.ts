import { describe, expect, it } from "vitest";
import { cleanText } from "../src/diff/cleanText.js";

describe("cleanText", () => {
  it("returns the body unchanged when there are no milestones", () => {
    const body = "Hello world.\n";
    const { text, toDoc } = cleanText(body);
    expect(text).toBe(body);
    expect(toDoc.length).toBe(text.length + 1);
    for (let i = 0; i < text.length; i++) expect(toDoc[i]).toBe(i);
    expect(toDoc[text.length]).toBe(body.length);
  });

  it("strips milestone tags and maps clean offsets back to doc offsets", () => {
    const body = 'A <comment-start id="aaaaaa"/>range<comment-end id="aaaaaa"/> here.';
    const { text, toDoc } = cleanText(body);
    expect(text).toBe("A range here.");
    // "range" starts right after "A " in clean text (offset 2) and after the start tag in doc.
    const startTagLen = '<comment-start id="aaaaaa"/>'.length;
    expect(toDoc[2]).toBe(2 + startTagLen);
    expect(toDoc[text.length]).toBe(body.length);

    // Every clean char maps to the doc char with the same content.
    for (let i = 0; i < text.length; i++) {
      expect(body[toDoc[i]!]).toBe(text[i]);
    }
  });

  it("handles a milestone tag at the very start and end of the body", () => {
    const body = '<comment-start id="bbbbbb"/>middle<comment-end id="bbbbbb"/>';
    const { text, toDoc } = cleanText(body);
    expect(text).toBe("middle");
    expect(toDoc[text.length]).toBe(body.length);
  });

  it("handles adjacent tags with no text between them", () => {
    const body = 'x<comment-start id="cccccc"/><comment-end id="cccccc"/>y';
    const { text, toDoc } = cleanText(body);
    expect(text).toBe("xy");
    expect(toDoc[0]).toBe(0);
    expect(toDoc[1]).toBe(body.length - 1);
    expect(toDoc[2]).toBe(body.length);
  });
});
