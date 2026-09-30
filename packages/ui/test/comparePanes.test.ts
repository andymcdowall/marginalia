// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { computeRedlineHunks, redlineField, redline, setBaselineClean, setRedlineOn } from "../src/editor/redline.js";
import { baseExtensions, setDeletedRanges } from "../src/editor/basePane.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 250));

describe("compare view: base and changes panes", () => {
  it("base pane strikes through removed text and is read-only", () => {
    const base = "The quick brown fox.";
    const current = "The slow brown fox.";
    const ranges = computeRedlineHunks(current, base)
      .hunks.filter((h) => h.deleted)
      .map((h) => ({ from: h.baseFrom, to: h.baseTo }));

    const view = new EditorView({ state: EditorState.create({ doc: base, extensions: baseExtensions() }), parent: document.body });
    view.dispatch({ effects: setDeletedRanges.of(ranges) });

    const struck = [...view.dom.querySelectorAll(".cm-del")].map((el) => el.textContent).join("");
    expect(struck).toBe("quick");
    expect(view.state.readOnly).toBe(true);
  });

  it("changes pane marks only insertions (no inline deletion widgets)", async () => {
    const view = new EditorView({
      state: EditorState.create({ doc: "The slow brown fox.", extensions: [redlineField, redline] }),
      parent: document.body,
    });
    view.dispatch({ effects: [setRedlineOn.of(true), setBaselineClean.of("The quick brown fox.")] });
    await flush();

    expect([...view.dom.querySelectorAll(".cm-ins")].map((el) => el.textContent).join("")).toBe("slow");
    expect(view.dom.querySelectorAll(".cm-del")).toHaveLength(0);
  });
});
