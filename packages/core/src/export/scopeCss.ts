// Turns an H1's heading text into a stable, CSS-safe identifier, used both for the exported
// HTML's `data-section` attribute and the live editor's `cm-section-<slug>` line class, so the
// two stay in sync without sharing anything but this function.
export function slugifyHeading(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

// Naively scopes a stylesheet to a container selector by prefixing every selector of every
// top-level rule with `scopeSelector`. This is a brace-depth-counting string transform, not a
// real CSS parser: an at-rule (`@media`, `@font-face`, ...) is copied through verbatim,
// including any rules nested inside it, rather than having its own contents scoped — so a
// `@media` block's selectors stay unscoped. Logged as a known limitation rather than pulling in
// a CSS parser, which isn't in SPEC.md §3.1's allowed dependency list.
export function scopeCss(css: string, scopeSelector: string): string {
  let out = "";
  let i = 0;
  const n = css.length;
  while (i < n) {
    while (i < n && /\s/.test(css[i]!)) i++;
    if (i >= n) break;
    const selectorStart = i;
    while (i < n && css[i] !== "{" && css[i] !== "}") i++;
    if (i >= n) break; // trailing text with no block — ignore
    if (css[i] === "}") {
      i++; // stray closing brace — skip it
      continue;
    }
    const selectors = css.slice(selectorStart, i).trim();
    const blockStart = i;
    let depth = 0;
    do {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    } while (i < n && depth > 0);
    const block = css.slice(blockStart, i);
    if (!selectors) continue;
    if (selectors.startsWith("@")) {
      out += `${selectors} ${block}\n`;
      continue;
    }
    const scoped = selectors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `${scopeSelector} ${s}`)
      .join(", ");
    if (!scoped) continue;
    out += `${scoped} ${block}\n`;
  }
  return out;
}
