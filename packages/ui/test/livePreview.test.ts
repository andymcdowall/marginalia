// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { livePreview } from "../src/editor/livePreview.js";

function makeView(doc: string, cursor: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor, head: cursor },
    extensions: [markdown(), livePreview],
  });
  return new EditorView({ state, parent: document.body });
}

describe("livePreview: markup hidden on inactive lines, shown on active lines", () => {
  it("hides heading markup when the cursor is elsewhere", () => {
    const doc = "# Hello\n\nOther line";
    const view = makeView(doc, doc.length);
    const text = view.dom.textContent ?? "";
    expect(text).not.toContain("# Hello");
    expect(text).toContain("Hello");
    view.destroy();
  });

  it("shows heading markup when the cursor is on that line", () => {
    const doc = "# Hello\n\nOther line";
    const view = makeView(doc, 2);
    expect(view.dom.textContent ?? "").toContain("# Hello");
    view.destroy();
  });

  it("applies the cm-h1 line class to a heading line", () => {
    const view = makeView("# Hello", 3);
    expect(view.dom.querySelector(".cm-h1")).not.toBeNull();
    view.destroy();
  });

  it("hides emphasis markers when inactive, shows them when active", () => {
    const doc = "Some *em* text\n\nOther";

    const inactive = makeView(doc, doc.length);
    expect(inactive.dom.textContent ?? "").not.toContain("*em*");
    expect(inactive.dom.textContent ?? "").toContain("em");
    inactive.destroy();

    const active = makeView(doc, 6);
    expect(active.dom.textContent ?? "").toContain("*em*");
    active.destroy();
  });

  it("hides inline code markers when inactive, shows them when active", () => {
    const doc = "Some `code` text\n\nOther";

    const inactive = makeView(doc, doc.length);
    expect(inactive.dom.textContent ?? "").not.toContain("`code`");
    inactive.destroy();

    const active = makeView(doc, 6);
    expect(active.dom.textContent ?? "").toContain("`code`");
    active.destroy();
  });

  it("hides blockquote markers when inactive, shows them when active, and always applies cm-quote", () => {
    const doc = "> quoted line\n\nOther";

    const inactive = makeView(doc, doc.length);
    expect(inactive.dom.textContent ?? "").not.toContain(">");
    expect(inactive.dom.querySelector(".cm-quote")).not.toBeNull();
    inactive.destroy();

    const active = makeView(doc, 1);
    expect(active.dom.textContent ?? "").toContain(">");
    expect(active.dom.querySelector(".cm-quote")).not.toBeNull();
    active.destroy();
  });

  it("hides link markup and URL when inactive, shows full source when active", () => {
    const doc = "See [text](https://example.com) here.\n\nOther";

    const inactive = makeView(doc, doc.length);
    const inactiveText = inactive.dom.textContent ?? "";
    expect(inactiveText).toContain("text");
    expect(inactiveText).not.toContain("https://example.com");
    inactive.destroy();

    const active = makeView(doc, 5);
    expect(active.dom.textContent ?? "").toContain("https://example.com");
    active.destroy();
  });

  it("applies the cm-li line class to list item lines", () => {
    const view = makeView("- one\n- two", 0);
    expect(view.dom.querySelectorAll(".cm-li").length).toBe(2);
    view.destroy();
  });
});
