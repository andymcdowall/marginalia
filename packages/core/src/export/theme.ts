// SPEC.md §11.2's theme.css, kept as a TS string constant rather than a standalone .css file:
// core is pure TS with no bundler and no node:fs, so it can't read an external asset file at
// runtime — see DECISIONS.md.
export const THEME_CSS = `
body { font-family: "Iowan Old Style", Georgia, serif; font-size: 11pt; line-height: 1.45; }
h1, h2, h3, h4, h5, h6 { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
code, pre { font-family: "SF Mono", Menlo, monospace; font-size: 9.5pt; background: #f5f5f5; }
img { max-width: 100%; }
ins { color: #1a7f37; text-decoration: underline; background: #e6ffec; }
del { color: #cf222e; text-decoration: line-through; background: #ffebe9; }
h1, h2, h3 { break-after: avoid; }
pre, img, table { break-inside: avoid; }
`.trim();
