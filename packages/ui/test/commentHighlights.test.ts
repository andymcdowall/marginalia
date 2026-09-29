// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import type { Thread } from "@marginalia/core";
import { commentHighlights, setActiveThreadId, setThreads, threadsField, activeThreadIdField } from "../src/editor/commentHighlights.js";

const T = "2026-01-01T00:00:00Z";

function makeView(doc: string, threads: Thread[]): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [markdown(), threadsField, activeThreadIdField, commentHighlights],
  });
  const view = new EditorView({ state, parent: document.body });
  view.dispatch({ effects: setThreads.of(threads) });
  return view;
}

describe("commentHighlights: overlapping and cross-paragraph ranges", () => {
  it("renders separate highlight marks for two overlapping ranges", () => {
    const doc = 'Text <comment-start id="aaaaaa"/>with an <comment-start id="bbbbbb"/>overlap<comment-end id="aaaaaa"/>ping pair<comment-end id="bbbbbb"/> here.';
    const threads: Thread[] = [
      { id: "aaaaaa", status: "open", updated: T, comments: [{ id: "c11111", created: T, body: "outer" }] },
      { id: "bbbbbb", status: "open", updated: T, comments: [{ id: "c22222", created: T, body: "inner" }] },
    ];
    const view = makeView(doc, threads);

    const marks = view.dom.querySelectorAll(".cm-comment");
    expect(marks.length).toBeGreaterThanOrEqual(2);
    // Both display numbers should render (1 and 2, in start-position order).
    const numbers = Array.from(view.dom.querySelectorAll(".cm-comment-number")).map((n) => n.textContent);
    expect(numbers).toEqual(["1", "2"]);
    view.destroy();
  });

  it("renders a highlight for a range spanning multiple paragraphs", () => {
    const doc = [
      'A <comment-start id="cccccc"/>range that starts here',
      "",
      "continues through a second paragraph",
      "",
      'and ends here<comment-end id="cccccc"/>.',
    ].join("\n");
    const threads: Thread[] = [
      { id: "cccccc", status: "open", updated: T, comments: [{ id: "c33333", created: T, body: "spans paragraphs" }] },
    ];
    const view = makeView(doc, threads);

    const marks = view.dom.querySelectorAll(".cm-comment");
    expect(marks.length).toBeGreaterThan(0);
    expect(view.dom.textContent ?? "").toContain("continues through a second paragraph");
    view.destroy();
  });

  it("gives the active thread an extra class and no highlight to a resolved thread", () => {
    const doc =
      'A <comment-start id="dddddd"/>open range<comment-end id="dddddd"/> and a ' +
      '<comment-start id="eeeeee"/>resolved range<comment-end id="eeeeee"/>.';
    const threads: Thread[] = [
      { id: "dddddd", status: "open", updated: T, comments: [{ id: "c44444", created: T, body: "open" }] },
      { id: "eeeeee", status: "resolved", updated: T, comments: [{ id: "c55555", created: T, body: "resolved" }] },
    ];
    const view = makeView(doc, threads);
    view.dispatch({ effects: setActiveThreadId.of("dddddd") });

    expect(view.dom.querySelectorAll(".cm-comment-active")).toHaveLength(1);
    // Both threads get a display number (only orphans don't, per SPEC.md §5.6)...
    expect(view.dom.querySelectorAll(".cm-comment-number")).toHaveLength(2);
    // ...but only the open thread gets a highlight mark (SPEC.md §8.1: resolved = no highlight).
    const marks = Array.from(view.dom.querySelectorAll(".cm-comment"));
    expect(marks.some((m) => m.textContent?.includes("resolved range"))).toBe(false);
    expect(marks.some((m) => m.textContent?.includes("open range"))).toBe(true);
    view.destroy();
  });
});
