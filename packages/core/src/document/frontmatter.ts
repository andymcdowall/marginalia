export type FrontmatterSplit = { frontmatter: string | null; body: string };

const OPEN_RE = /^---[ \t]*\r?\n/;
const CLOSE_RE = /\r?\n---[ \t]*(?=\r?\n|$)/;

// Splits a leading `---\n...\n---\n` frontmatter block off the front of a document. Doesn't parse
// the frontmatter's contents (that's `parseSectionStyles` below, for the one key this app reads);
// a missing or unterminated block just means `frontmatter` is null and `body` is the input as-is.
export function splitFrontmatter(raw: string): FrontmatterSplit {
  const openMatch = OPEN_RE.exec(raw);
  if (!openMatch) return { frontmatter: null, body: raw };
  const rest = raw.slice(openMatch[0].length);
  const closeMatch = CLOSE_RE.exec(rest);
  if (!closeMatch) return { frontmatter: null, body: raw };
  const frontmatter = rest.slice(0, closeMatch.index);
  let bodyStart = closeMatch.index + closeMatch[0].length;
  if (rest.startsWith("\r\n", bodyStart)) bodyStart += 2;
  else if (rest[bodyStart] === "\n") bodyStart += 1;
  return { frontmatter, body: rest.slice(bodyStart) };
}

// Reads a `sectionStyles:` mapping out of frontmatter text, e.g.
//   sectionStyles:
//     "Part One": styles/part-one.css
//     Part Two: styles/part-two.css
// Maps an H1's exact heading text to a CSS file path (resolved relative to the note's directory).
// This is a hand-rolled parser for exactly this one shape, not a general YAML parser — YAML
// libraries aren't in SPEC.md §3.1's allowed dependency list, and the rest of the app already
// prefers small hand-rolled parsers over pulling in a library for one narrow shape (see
// comments/escape.ts, embedImages.ts).
export function parseSectionStyles(frontmatter: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!frontmatter) return map;
  const lines = frontmatter.split(/\r?\n/);
  let inBlock = false;
  let blockIndent = -1;
  for (const line of lines) {
    if (!inBlock) {
      if (/^sectionStyles:\s*$/.test(line)) inBlock = true;
      continue;
    }
    if (line.trim() === "") continue;
    const indent = line.length - line.trimStart().length;
    if (blockIndent === -1) blockIndent = indent;
    if (indent < blockIndent) {
      inBlock = false;
      continue;
    }
    const entry = line.trim();
    const m = /^(?:"([^"]*)"|'([^']*)'|([^:]+)):\s*(.+)$/.exec(entry);
    if (!m) continue;
    const key = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    const value = m[4]!.trim().replace(/^["']|["']$/g, "");
    if (key) map.set(key, value);
  }
  return map;
}

// Reads a top-level `css:` key out of frontmatter, e.g. `css: styles/note.css`. Applies to the
// whole note (export and live preview), unscoped — unlike `sectionStyles`, which only covers one
// H1's section. Only a top-level (unindented) `css:` line counts, so a `css:` key nested under
// something else (there currently isn't one, but just in case) isn't mistaken for this one.
export function parseDocCss(frontmatter: string | null): string | null {
  if (!frontmatter) return null;
  for (const line of frontmatter.split(/\r?\n/)) {
    const m = /^css:\s*(.+)$/.exec(line);
    if (m) return m[1]!.trim().replace(/^["']|["']$/g, "");
  }
  return null;
}
