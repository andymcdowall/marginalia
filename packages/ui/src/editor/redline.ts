import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { cleanText, wordDiff, type Hunk } from "@marginalia/core";

// SPEC.md §10.3: recomputed 150ms after doc changes, or immediately on toggle or baseline change.
// This MUST actually be debounced, not just reactive — measured: a synchronous per-keystroke
// recompute on a 10,000-word doc takes ~1s (Spike B's benchmark caught this). See DECISIONS.md.

export const setRedlineOn = StateEffect.define<boolean>();
export const setBaselineClean = StateEffect.define<string>();
const setDecorations = StateEffect.define<DecorationSet>();

type RedlineValue = { on: boolean; baselineClean: string; decorations: DecorationSet };

export const redlineField = StateField.define<RedlineValue>({
  create: () => ({ on: false, baselineClean: "", decorations: Decoration.none }),
  update(value, tr) {
    let { on, baselineClean, decorations } = value;
    decorations = decorations.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setRedlineOn)) on = e.value;
      if (e.is(setBaselineClean)) baselineClean = e.value;
      if (e.is(setDecorations)) decorations = e.value;
    }
    if (!on) decorations = Decoration.none;
    return { on, baselineClean, decorations };
  },
  provide: (field) => EditorView.decorations.from(field, (v) => v.decorations),
});

class DeletedTextWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }
  eq(other: DeletedTextWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-del";
    span.textContent = this.text;
    return span;
  }
}

type Entry = { from: number; to: number; decoration: Decoration };

// Exposed separately so the Changes panel can get the same hunk list (in doc coordinates)
// without duplicating this logic or waiting on the debounce.
export function computeRedlineHunks(doc: string, baselineClean: string): { hunks: Hunk[]; toDoc: Int32Array } {
  const clean = cleanText(doc);
  return { hunks: wordDiff(baselineClean, clean.text), toDoc: clean.toDoc };
}

function buildDecorations(doc: string, baselineClean: string): DecorationSet {
  const { hunks, toDoc } = computeRedlineHunks(doc, baselineClean);
  const entries: Entry[] = [];
  for (const h of hunks) {
    if (h.inserted) {
      entries.push({ from: toDoc[h.curFrom]!, to: toDoc[h.curTo]!, decoration: Decoration.mark({ class: "cm-ins" }) });
    }
    if (h.deleted) {
      const at = toDoc[h.curFrom]!;
      entries.push({ from: at, to: at, decoration: Decoration.widget({ widget: new DeletedTextWidget(h.deleted), side: -1 }) });
    }
  }
  entries.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const e of entries) builder.add(e.from, e.to, e.decoration);
  return builder.finish();
}

const DEBOUNCE_MS = 150;

export const redline = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | null = null;

    constructor(view: EditorView) {
      if (view.state.field(redlineField).on) this.schedule(view, 0);
    }

    update(update: ViewUpdate): void {
      const { on } = update.state.field(redlineField);
      if (!on) {
        this.clear();
        return;
      }
      const toggledOnOrBaselineChanged = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(setRedlineOn) || e.is(setBaselineClean))
      );
      if (toggledOnOrBaselineChanged) {
        this.schedule(update.view, 0);
      } else if (update.docChanged) {
        this.schedule(update.view, DEBOUNCE_MS);
      }
    }

    schedule(view: EditorView, delay: number): void {
      this.clear();
      this.timer = setTimeout(() => {
        this.timer = null;
        const { on, baselineClean } = view.state.field(redlineField);
        if (!on) return;
        const decorations = buildDecorations(view.state.doc.toString(), baselineClean);
        view.dispatch({ effects: setDecorations.of(decorations) });
      }, delay);
    }

    clear(): void {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    }

    destroy(): void {
      this.clear();
    }
  }
);
