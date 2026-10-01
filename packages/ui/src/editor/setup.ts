import { EditorSelection, type Extension } from "@codemirror/state";
import { EditorView, keymap, type KeyBinding } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import type { Thread } from "@marginalia/core";
import { milestonesField } from "./milestones.js";
import { livePreview } from "./livePreview.js";
import { frontmatterField } from "./frontmatter.js";
import { sectionsField } from "./sectionStyles.js";
import { listRenderField } from "./listRenderField.js";
import { editorTheme } from "./theme.js";
import { sourceModeField } from "./sourceMode.js";
import { threadsField, activeThreadIdField, commentHighlights } from "./commentHighlights.js";
import { redlineField, redline } from "./redline.js";

function wrapSelection(before: string, after: string): (view: EditorView) => boolean {
  return (view) => {
    view.dispatch(
      view.state.changeByRange((range) => {
        const changes = [
          { from: range.from, insert: before },
          { from: range.to, insert: after },
        ];
        const from = range.from + before.length;
        const to = range.to + before.length;
        return { changes, range: EditorSelection.range(from, to) };
      })
    );
    return true;
  };
}

function insertLink(view: EditorView): boolean {
  view.dispatch(
    view.state.changeByRange((range) => {
      const text = view.state.sliceDoc(range.from, range.to);
      const insert = `[${text}]()`;
      const cursor = range.from + insert.length - 1; // inside the ()
      return {
        changes: [{ from: range.from, to: range.to, insert }],
        range: EditorSelection.cursor(cursor),
      };
    })
  );
  return true;
}

const formattingKeymap: KeyBinding[] = [
  { key: "Mod-b", run: wrapSelection("**", "**") },
  { key: "Mod-i", run: wrapSelection("*", "*") },
  { key: "Mod-k", run: insertLink },
];

export function markdownExtensions(): Extension {
  return markdown({ base: markdownLanguage, codeLanguages: languages, extensions: [GFM] });
}

export function editorSetup(initialThreads: Thread[] = []): Extension[] {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...formattingKeymap]),
    search(),
    EditorView.lineWrapping,
    markdownExtensions(),
    sourceModeField,
    frontmatterField,
    sectionsField,
    milestonesField,
    threadsField.init(() => initialThreads),
    activeThreadIdField,
    commentHighlights,
    redlineField,
    redline,
    livePreview,
    listRenderField,
    editorTheme,
  ];
}
