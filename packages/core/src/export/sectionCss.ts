import type { Platform } from "../platform.js";
import { resolveRelativePath } from "./embedImages.js";
import { scopeCss, slugifyHeading } from "./scopeCss.js";

// Reads each stylesheet referenced by a note's frontmatter `sectionStyles` map (heading text ->
// CSS file path, relative to the note's directory) and scopes it to that heading's exported
// section container (`.md-section[data-section="<slug>"]`, written by rehypeWrapSections).
// A missing or unreadable file is skipped silently, matching embedImages.ts's handling of an
// unreadable image reference during export — one bad stylesheet shouldn't fail the whole export.
export async function buildSectionCss(
  platform: Platform,
  baseDir: string,
  sectionStyles: Map<string, string>
): Promise<string> {
  let css = "";
  for (const [heading, relPath] of sectionStyles) {
    try {
      const absPath = resolveRelativePath(baseDir, relPath);
      const text = await platform.fs.readText(absPath);
      css += scopeCss(text, `.md-section[data-section="${slugifyHeading(heading)}"]`) + "\n";
    } catch {
      // Unreadable stylesheet — skip it.
    }
  }
  return css;
}

// Reads the stylesheet referenced by a note's frontmatter `css` key (doc-wide, unscoped —
// unlike `buildSectionCss`), or returns "" if there's no `css` key or it can't be read.
export async function buildDocCss(platform: Platform, baseDir: string, docCssPath: string | null): Promise<string> {
  if (!docCssPath) return "";
  try {
    const absPath = resolveRelativePath(baseDir, docCssPath);
    return (await platform.fs.readText(absPath)) + "\n";
  } catch {
    return "";
  }
}
