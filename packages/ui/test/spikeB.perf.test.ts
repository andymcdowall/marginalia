// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { milestonesField } from "../src/editor/milestones.js";
import { redlineField, redline, setRedlineOn, setBaselineClean } from "../src/editor/redline.js";

function generateDoc(words: number): string {
  const parts: string[] = [];
  let id = 0;
  for (let i = 0; i < words; i++) {
    if (i > 0 && i % 40 === 0) {
      const tag = (id++ % 46656).toString(36).padStart(6, "0");
      parts.push(`<comment-start id="${tag}"/>`);
    }
    parts.push(`word${i}`);
    if (i > 0 && i % 40 === 20) {
      const tag = ((id - 1) % 46656).toString(36).padStart(6, "0");
      parts.push(`<comment-end id="${tag}"/>`);
    }
    if (i % 12 === 0) parts.push("\n\n");
  }
  return parts.join(" ");
}

describe("Spike B: editor perf on a 10,000-word doc", () => {
  it("recomputes milestone + redline decorations for a keystroke in well under a frame budget", () => {
    const doc = generateDoc(10000);
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [markdown(), milestonesField, redlineField, redline],
      }),
    });
    // Turn redline on against a slightly-different baseline, so every keystroke below actually
    // exercises a real diff recompute, not a no-op (on: false) path.
    view.dispatch({ effects: [setRedlineOn.of(true), setBaselineClean.of(doc.replace(/word1(\d\d\d)/g, "word2$1"))] });

    const samples: number[] = [];
    let pos = Math.floor(doc.length / 2);
    for (let i = 0; i < 50; i++) {
      const start = performance.now();
      view.dispatch({ changes: { from: pos, insert: "x" } });
      const elapsed = performance.now() - start;
      samples.push(elapsed);
      pos += 1;
    }

    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;
    const p95 = samples[Math.floor(samples.length * 0.95)]!;

    // jsdom has no real compositor, so this measures decoration/state recompute cost only
    // (not actual browser paint) — a lower-bound proxy. See DECISIONS.md for the logged numbers.
    console.log(`spikeB: median=${median.toFixed(2)}ms p95=${p95.toFixed(2)}ms`);

    expect(median).toBeLessThan(16);
    view.destroy();
  });
});
