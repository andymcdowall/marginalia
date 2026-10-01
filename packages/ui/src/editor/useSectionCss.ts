import { useEffect, useRef, useState } from "react";
import {
  splitFrontmatter,
  parseSectionStyles,
  parseDocCss,
  resolveRelativePath,
  scopeCss,
  slugifyHeading,
} from "@marginalia/core";
import type { Platform } from "@marginalia/core";
import { aliasTagSelectors } from "./cssTagAlias.js";

// How often to re-read the referenced stylesheet(s) from disk while a note that uses them is
// open. Polling, not watching: SPEC.md §6 describes reacting to `platform.fs.watch` events, but
// nothing in the UI actually calls `fs.watch` anywhere yet, so there's no existing wiring to hook
// into — building that out is a bigger lift than "the live editor should pick up a saved
// stylesheet within a second or two" (the user's own ask) needs. A short poll of a couple of
// small text files is cheap, and only runs while a note with `css`/`sectionStyles` is open.
const POLL_MS = 1000;

export async function buildCombinedCss(
  platform: Platform,
  baseDir: string,
  docCssPath: string | null,
  sectionStyles: Map<string, string>
): Promise<string> {
  let combined = "";
  if (docCssPath) {
    try {
      const absPath = resolveRelativePath(baseDir, docCssPath);
      const text = await platform.fs.readText(absPath);
      combined += scopeCss(aliasTagSelectors(text), ".cm-editor") + "\n";
    } catch {
      // Missing/unreadable stylesheet — skip it, matching the export path's behavior.
    }
  }
  for (const [heading, relPath] of sectionStyles) {
    try {
      const absPath = resolveRelativePath(baseDir, relPath);
      const text = await platform.fs.readText(absPath);
      combined += scopeCss(aliasTagSelectors(text), `.cm-section-${slugifyHeading(heading)}`) + "\n";
    } catch {
      // Missing/unreadable stylesheet — skip it, matching the export path's behavior.
    }
  }
  return combined;
}

// Reads a note's frontmatter `css` key and `sectionStyles` map and returns the combined CSS for
// injection as a <style> tag in the live editor — the live-preview counterpart of
// `buildDocCss`/`buildSectionCss` (core/export/sectionCss.ts), which do the same for exported
// HTML. Three differences from the export path:
// - Every stylesheet is run through `aliasTagSelectors` first, so a bare-tag rule (`h1 { }`)
//   also matches the live editor's `cm-*` classes — the editor has no real <h1>/<li>/... tags
//   for a plain tag selector to match otherwise (SPEC.md §11.4).
// - `css` is NOT left unscoped here: a plain <style> tag affects the whole DOM regardless of
//   where React renders it, so an unscoped doc-wide stylesheet would leak out of the note and
//   into the rest of the app's chrome (toolbar, sidebar, ...). It's scoped to `.cm-editor`
//   (CodeMirror's own root class) instead, which still covers the whole note as rendered, just
//   not anything outside it.
// - The referenced stylesheet(s) are re-read on a short poll (`POLL_MS`), not only when the
//   note's own path/frontmatter changes, so editing and saving a `.css` file is reflected in any
//   open note that references it within a second or two, without needing to switch away and back.
export function useSectionCss(platform: Platform, path: string | undefined, docText: string): string {
  const [css, setCss] = useState("");
  const docTextRef = useRef(docText);
  const cssRef = useRef("");
  docTextRef.current = docText;

  useEffect(() => {
    if (!path) {
      cssRef.current = "";
      setCss("");
      return;
    }

    let cancelled = false;

    async function refresh(): Promise<void> {
      const { frontmatter } = splitFrontmatter(docTextRef.current);
      const sectionStyles = parseSectionStyles(frontmatter);
      const docCssPath = parseDocCss(frontmatter);
      if (sectionStyles.size === 0 && !docCssPath) {
        if (cssRef.current !== "") {
          cssRef.current = "";
          if (!cancelled) setCss("");
        }
        return;
      }
      const baseDir = path!.slice(0, path!.lastIndexOf("/"));
      const combined = await buildCombinedCss(platform, baseDir, docCssPath, sectionStyles);
      if (cancelled || combined === cssRef.current) return;
      cssRef.current = combined;
      setCss(combined);
    }

    void refresh(); // immediately, so opening the note doesn't wait a full poll interval
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // Deliberately NOT keyed on `docText`: polling runs independently of typing, re-reading
    // whatever's currently in `docTextRef` on each tick instead. Keying on path/platform only
    // means the interval survives every keystroke instead of being torn down and rebuilt by one.
  }, [platform, path]);

  return css;
}
