import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import { isSourceMode } from "./sourceMode.js";

// SPEC.md §7.2. Builds decorations from the syntax tree over the editor's visible ranges. Markup
// is hidden only on lines with no cursor/selection touching them ("active" lines show raw source).

export type LinkClickHandler = (url: string, event: MouseEvent) => void;

class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string
  ) {
    super();
  }
  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM(): HTMLElement {
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.style.maxWidth = "100%";
    return img;
  }
}

class HrWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    return document.createElement("hr");
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly markFrom: number,
    private readonly markTo: number
  ) {
    super();
  }
  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.markFrom === this.markFrom && other.markTo === this.markTo;
  }
  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.addEventListener("mousedown", (e) => e.preventDefault());
    input.addEventListener("change", () => {
      const replacement = this.checked ? "[ ]" : "[x]";
      view.dispatch({ changes: { from: this.markFrom, to: this.markTo, insert: replacement } });
    });
    return input;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

function activeLineNumbers(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const fromLine = view.state.doc.lineAt(range.from).number;
    const toLine = view.state.doc.lineAt(range.to).number;
    for (let l = fromLine; l <= toLine; l++) lines.add(l);
  }
  return lines;
}

type Entry = { from: number; to: number; decoration: Decoration };

function hideChildMarks(node: SyntaxNodeRef, markName: string, entries: Entry[]): void {
  const cursor = node.node.cursor();
  if (cursor.firstChild()) {
    do {
      if (cursor.name === markName) {
        entries.push({ from: cursor.from, to: cursor.to, decoration: Decoration.replace({}) });
      }
    } while (cursor.nextSibling());
  }
}

function headingLevel(nodeName: string): number | null {
  const m = /^ATXHeading([1-6])$/.exec(nodeName);
  return m ? Number(m[1]) : null;
}

export function buildLivePreviewDecorations(view: EditorView): DecorationSet {
  if (isSourceMode(view.state)) return Decoration.none;
  const entries: Entry[] = [];
  const active = activeLineNumbers(view);
  const doc = view.state.doc;
  const quoteLines = new Set<number>();
  const codeBlockLines = new Map<number, "fence" | "body">();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        const lineAtStart = doc.lineAt(node.from).number;
        const isActive = active.has(lineAtStart);
        const level = headingLevel(node.name);

        if (level !== null) {
          const lineStart = doc.lineAt(node.from).from;
          entries.push({ from: lineStart, to: lineStart, decoration: Decoration.line({ class: `cm-h${level}` }) });
          if (!isActive) {
            const marker = node.node.getChild("HeaderMark");
            if (marker) {
              let end = marker.to;
              if (doc.sliceString(end, end + 1) === " ") end += 1;
              entries.push({ from: marker.from, to: end, decoration: Decoration.replace({}) });
            }
          }
          return;
        }

        switch (node.name) {
          case "Emphasis":
            entries.push({ from: node.from, to: node.to, decoration: Decoration.mark({ class: "cm-em" }) });
            if (!isActive) hideChildMarks(node, "EmphasisMark", entries);
            break;
          case "StrongEmphasis":
            entries.push({ from: node.from, to: node.to, decoration: Decoration.mark({ class: "cm-strong" }) });
            if (!isActive) hideChildMarks(node, "EmphasisMark", entries);
            break;
          case "Strikethrough":
            entries.push({ from: node.from, to: node.to, decoration: Decoration.mark({ class: "cm-strike" }) });
            if (!isActive) hideChildMarks(node, "StrikethroughMark", entries);
            break;
          case "InlineCode":
            entries.push({ from: node.from, to: node.to, decoration: Decoration.mark({ class: "cm-inline-code" }) });
            if (!isActive) hideChildMarks(node, "CodeMark", entries);
            break;
          case "Link": {
            const urlNode = node.node.getChild("URL");
            const textFrom = urlNode ? node.from : node.from;
            const textTo = urlNode ? urlNode.from : node.to;
            entries.push({ from: textFrom, to: textTo, decoration: Decoration.mark({ class: "cm-link" }) });
            if (!isActive) {
              hideChildMarks(node, "LinkMark", entries);
              if (urlNode) {
                entries.push({ from: urlNode.from, to: urlNode.to, decoration: Decoration.replace({}) });
              }
            }
            break;
          }
          case "Image": {
            if (!isActive) {
              const urlNode = node.node.getChild("URL");
              const url = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : "";
              const altMatch = /!\[([^\]]*)\]/.exec(doc.sliceString(node.from, node.to));
              const alt = altMatch ? altMatch[1]! : "";
              entries.push({
                from: node.from,
                to: node.to,
                decoration: Decoration.replace({ widget: new ImageWidget(url, alt) }),
              });
            }
            break;
          }
          case "Blockquote": {
            const startLine = doc.lineAt(node.from).number;
            const endLine = doc.lineAt(node.to).number;
            for (let l = startLine; l <= endLine; l++) quoteLines.add(l);
            if (!isActive) hideChildMarks(node, "QuoteMark", entries);
            break;
          }
          case "FencedCode": {
            const startLine = doc.lineAt(node.from).number;
            const endLine = doc.lineAt(node.to).number;
            codeBlockLines.set(startLine, "fence");
            codeBlockLines.set(endLine, "fence");
            for (let l = startLine + 1; l < endLine; l++) {
              if (!codeBlockLines.has(l)) codeBlockLines.set(l, "body");
            }
            break;
          }
          case "HorizontalRule": {
            if (!isActive) {
              entries.push({ from: node.from, to: node.to, decoration: Decoration.replace({ widget: new HrWidget() }) });
            }
            break;
          }
          case "TaskMarker": {
            if (!isActive) {
              const text = doc.sliceString(node.from, node.to);
              const checked = /\[[xX]\]/.test(text);
              entries.push({
                from: node.from,
                to: node.to,
                decoration: Decoration.replace({ widget: new CheckboxWidget(checked, node.from, node.to) }),
              });
            }
            break;
          }
          default:
            break;
        }
      },
    });
  }

  for (const l of quoteLines) {
    const line = doc.line(l);
    entries.push({ from: line.from, to: line.from, decoration: Decoration.line({ class: "cm-quote" }) });
  }
  for (const [l, kind] of codeBlockLines) {
    const line = doc.line(l);
    const cls = kind === "fence" ? "cm-code-block cm-fence" : "cm-code-block";
    entries.push({ from: line.from, to: line.from, decoration: Decoration.line({ class: cls }) });
  }

  entries.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const e of entries) builder.add(e.from, e.to, e.decoration);
  return builder.finish();
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLivePreviewDecorations(view);
    }
    update(update: ViewUpdate): void {
      const hasEffects = update.transactions.some((tr) => tr.effects.length > 0);
      if (update.docChanged || update.viewportChanged || update.selectionSet || hasEffects) {
        this.decorations = buildLivePreviewDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  }
);
