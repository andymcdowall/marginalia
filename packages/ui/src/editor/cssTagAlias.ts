import { parseTopLevelCssRules } from "@marginalia/core";

// Maps a bare HTML tag name to the CodeMirror line/mark class the live editor actually renders
// for it (see livePreview.ts) — CodeMirror never creates real <h1>/<li>/<p>/... elements, it's a
// plain-text editor with decorations, so a bare tag selector (which already works against the
// exported HTML's real tags) would otherwise match nothing here. `code` maps to the inline-code
// mark, the more common case for a bare `code { }` rule; a code *block* is `.cm-code-block`/`pre`.
const TAG_TO_CM_CLASS: Record<string, string> = {
  h1: "cm-h1",
  h2: "cm-h2",
  h3: "cm-h3",
  h4: "cm-h4",
  h5: "cm-h5",
  h6: "cm-h6",
  p: "cm-paragraph",
  li: "cm-li",
  blockquote: "cm-quote",
  code: "cm-inline-code",
  pre: "cm-code-block",
  strong: "cm-strong",
  b: "cm-strong",
  em: "cm-em",
  i: "cm-em",
  del: "cm-strike",
  s: "cm-strike",
  a: "cm-link",
  img: "cm-image",
};

const BARE_TAG_RE = /^[a-zA-Z][a-zA-Z0-9-]*$/;

// For each top-level rule, adds the matching `.cm-*` selector alongside any bare-tag selector it
// finds (e.g. `h1, li { ... }` becomes `h1, li, .cm-h1, .cm-li { ... }`), so the same stylesheet
// a user already wrote for export (plain tags, real elements there) also has a chance to match
// in the live editor. A selector that isn't a single bare tag name — a class, an attribute
// selector, a combinator like `blockquote p`, a pseudo-class — is left untouched: there's no
// reliable live-editor equivalent for an arbitrary selector, since the editor's DOM doesn't
// mirror the exported HTML's nesting at all. Caller still runs the result through `scopeCss`.
export function aliasTagSelectors(css: string): string {
  let out = "";
  for (const { selectors, block } of parseTopLevelCssRules(css)) {
    if (selectors.startsWith("@")) {
      out += `${selectors} ${block}\n`;
      continue;
    }
    const parts = selectors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const combined = new Set(parts);
    for (const part of parts) {
      if (BARE_TAG_RE.test(part)) {
        const cls = TAG_TO_CM_CLASS[part.toLowerCase()];
        if (cls) combined.add(`.${cls}`);
      }
    }
    if (combined.size === 0) continue;
    out += `${[...combined].join(", ")} ${block}\n`;
  }
  return out;
}
