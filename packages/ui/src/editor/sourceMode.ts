import { type EditorState, StateEffect, StateField } from "@codemirror/state";

// Toggled by Cmd+E / a toolbar button (SPEC.md §7.2). When true, livePreview and milestone-tag
// hiding are both disabled, so the raw body is shown.
export const setSourceMode = StateEffect.define<boolean>();

export const sourceModeField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSourceMode)) value = effect.value;
    }
    return value;
  },
});

export function isSourceMode(state: EditorState): boolean {
  return state.field(sourceModeField, false) ?? false;
}
