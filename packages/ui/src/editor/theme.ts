import { EditorView } from "@codemirror/view";

// Plain CSS-variable-driven theme so light/dark follow the app's own variables (app.css) rather
// than a separate CodeMirror theme system (SPEC.md §12).
export const editorTheme = EditorView.theme({
  "&": {
    color: "var(--fg)",
    backgroundColor: "var(--bg)",
    height: "100%",
    fontSize: "15px",
  },
  ".cm-content": {
    fontFamily: '"Iowan Old Style", Georgia, serif',
    maxWidth: "760px",
    margin: "0 auto",
    padding: "24px 0",
  },
  ".cm-scroller": { overflow: "auto" },
  "&.cm-focused": { outline: "none" },
  ".cm-h1, .cm-h2, .cm-h3, .cm-h4, .cm-h5, .cm-h6": {
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: "600",
  },
  ".cm-h1": { fontSize: "1.8em" },
  ".cm-h2": { fontSize: "1.5em" },
  ".cm-h3": { fontSize: "1.25em" },
  ".cm-em": { fontStyle: "italic" },
  ".cm-strong": { fontWeight: "700" },
  ".cm-strike": { textDecoration: "line-through" },
  ".cm-inline-code": {
    fontFamily: '"SF Mono", Menlo, monospace',
    fontSize: "0.9em",
    background: "var(--border)",
    borderRadius: "3px",
    padding: "0 3px",
  },
  ".cm-link": { color: "var(--accent)", textDecoration: "underline" },
  ".cm-quote": {
    borderLeft: "3px solid var(--border)",
    paddingLeft: "12px",
    color: "var(--fg)",
    opacity: "0.85",
  },
  ".cm-code-block": {
    fontFamily: '"SF Mono", Menlo, monospace',
    fontSize: "0.9em",
    background: "var(--border)",
  },
  ".cm-fence": { opacity: "0.55" },
  ".cm-frontmatter": {
    fontFamily: '"SF Mono", Menlo, monospace',
    fontSize: "0.85em",
    opacity: "0.6",
  },
  ".cm-comment": { backgroundColor: "rgba(240, 200, 0, 0.25)" },
  ".cm-comment-active": { backgroundColor: "rgba(240, 160, 0, 0.4)" },
  ".cm-comment-number": {
    cursor: "pointer",
    color: "var(--accent)",
    fontWeight: "600",
    marginLeft: "1px",
  },
  ".cm-ins": {
    textDecoration: "underline",
    textDecorationColor: "#1a7f37",
    backgroundColor: "rgba(26, 127, 55, 0.12)",
  },
  ".cm-del": {
    textDecoration: "line-through",
    color: "#cf222e",
    backgroundColor: "rgba(207, 34, 46, 0.08)",
  },
});
