import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { computeDisplayNumbers, findMilestones, type Thread } from "@marginalia/core";

// SPEC.md §8.1: highlights (a yellow background) for each open thread with valid milestones, plus
// a superscript display-number widget right after the end tag. Resolved/orphaned threads get no
// highlight. The active thread gets an extra class.

export const setThreads = StateEffect.define<Thread[]>();
export const setActiveThreadId = StateEffect.define<string | null>();
export const activateThreadEffect = StateEffect.define<string>(); // fired by the widget's click

export const threadsField = StateField.define<Thread[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setThreads)) value = e.value;
    return value;
  },
});

export const activeThreadIdField = StateField.define<string | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setActiveThreadId)) value = e.value;
      if (e.is(activateThreadEffect)) value = e.value;
    }
    return value;
  },
});

class ThreadNumberWidget extends WidgetType {
  constructor(
    private readonly threadId: string,
    private readonly display: number
  ) {
    super();
  }
  eq(other: ThreadNumberWidget): boolean {
    return other.threadId === this.threadId && other.display === this.display;
  }
  toDOM(view: EditorView): HTMLElement {
    const sup = document.createElement("sup");
    sup.className = "cm-comment-number";
    sup.textContent = String(this.display);
    sup.addEventListener("mousedown", (e) => e.preventDefault());
    sup.addEventListener("click", () => {
      view.dispatch({ effects: activateThreadEffect.of(this.threadId) });
    });
    return sup;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

type Entry = { from: number; to: number; decoration: Decoration };

function build(doc: string, threads: Thread[], activeId: string | null): DecorationSet {
  const milestones = findMilestones(doc);
  const startById = new Map<string, number>();
  const pairById = new Map<string, { start: number; startTo: number; end: number }>();
  for (const m of milestones) {
    if (m.kind === "start") {
      startById.set(m.id, m.from);
      const existing = pairById.get(m.id) ?? { start: -1, startTo: -1, end: -1 };
      existing.start = m.from;
      existing.startTo = m.to;
      pairById.set(m.id, existing);
    } else {
      const existing = pairById.get(m.id) ?? { start: -1, startTo: -1, end: -1 };
      existing.end = m.from;
      pairById.set(m.id, existing);
    }
  }

  const displayNumbers = computeDisplayNumbers(doc, threads);
  const entries: Entry[] = [];

  for (const thread of threads) {
    if (thread.status === "orphaned") continue;
    const pair = pairById.get(thread.id);
    if (!pair || pair.start < 0 || pair.end < 0 || pair.end - pair.startTo <= 0) continue;

    // Highlight (the yellow background) is open-threads only; resolved threads still get a
    // gutter number (SPEC.md §5.6 numbers everything but orphans) but no highlight (§8.1).
    if (thread.status === "open") {
      const cls = thread.id === activeId ? "cm-comment cm-comment-active" : "cm-comment";
      entries.push({ from: pair.startTo, to: pair.end, decoration: Decoration.mark({ class: cls }) });
    }

    const display = displayNumbers.get(thread.id);
    if (display !== undefined) {
      entries.push({
        from: pair.end,
        to: pair.end,
        decoration: Decoration.widget({ widget: new ThreadNumberWidget(thread.id, display), side: 1 }),
      });
    }
  }

  entries.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const e of entries) builder.add(e.from, e.to, e.decoration);
  return builder.finish();
}

export const commentHighlights = EditorView.decorations.compute(
  [threadsField, activeThreadIdField, "doc"],
  (state) => build(state.doc.toString(), state.field(threadsField), state.field(activeThreadIdField))
);
