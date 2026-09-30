// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { computeSections, sectionsField } from "../src/editor/sectionStyles.js";

function makeState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown(), sectionsField] });
}

describe("computeSections", () => {
  it("splits the document into H1-to-next-H1 sections", () => {
    const doc = "# Part One\n\nSome text.\n\n# Part Two\n\nMore text.\n";
    const state = makeState(doc);
    const sections = computeSections(state.doc, syntaxTree(state));
    expect(sections.map((s) => s.title)).toEqual(["Part One", "Part Two"]);
    expect(sections[0]!.to).toBe(sections[1]!.from);
    expect(sections[1]!.to).toBe(doc.length);
  });

  it("returns no sections when there's no H1", () => {
    const state = makeState("## Just an H2\n\nText.\n");
    expect(computeSections(state.doc, syntaxTree(state))).toEqual([]);
  });
});

describe("sectionsField", () => {
  it("applies a cm-section-<slug> line class across a section's lines", () => {
    const doc = "# Part One\n\nBody line.\n\n# Part Two\n\nOther.";
    const view = new EditorView({ state: makeState(doc), parent: document.body });
    expect(view.dom.querySelectorAll(".cm-section-part-one").length).toBeGreaterThan(0);
    expect(view.dom.querySelectorAll(".cm-section-part-two").length).toBeGreaterThan(0);
    view.destroy();
  });
});
