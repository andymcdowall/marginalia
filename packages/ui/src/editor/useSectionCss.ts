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

// Reads a note's frontmatter `css` key (doc-wide, unscoped) and `sectionStyles` map (scoped to
// each section's `cm-section-<slug>` line class — sectionStyles.ts) and returns the combined CSS
// for injection as a <style> tag in the live editor — the live-preview counterpart of
// `buildDocCss`/`buildSectionCss` (core/export/sectionCss.ts), which do the same for exported
// HTML's unscoped `<style>` content and `.md-section[data-section]` containers respectively.
// Re-reads the referenced files only when the frontmatter text or the open file changes, not on
// every keystroke, since `docText` otherwise mirrors every edit.
export function useSectionCss(platform: Platform, path: string | undefined, docText: string): string {
  const [css, setCss] = useState("");
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!path) {
      setCss("");
      return;
    }
    const { frontmatter } = splitFrontmatter(docText);
    const key = `${path}::${frontmatter ?? ""}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    const sectionStyles = parseSectionStyles(frontmatter);
    const docCssPath = parseDocCss(frontmatter);
    if (sectionStyles.size === 0 && !docCssPath) {
      setCss("");
      return;
    }

    const baseDir = path.slice(0, path.lastIndexOf("/"));
    let cancelled = false;
    void (async () => {
      let combined = "";
      if (docCssPath) {
        try {
          const absPath = resolveRelativePath(baseDir, docCssPath);
          combined += (await platform.fs.readText(absPath)) + "\n";
        } catch {
          // Missing/unreadable stylesheet — skip it, matching the export path's behavior.
        }
      }
      for (const [heading, relPath] of sectionStyles) {
        try {
          const absPath = resolveRelativePath(baseDir, relPath);
          const text = await platform.fs.readText(absPath);
          combined += scopeCss(text, `.cm-section-${slugifyHeading(heading)}`) + "\n";
        } catch {
          // Missing/unreadable stylesheet — skip it, matching the export path's behavior.
        }
      }
      if (!cancelled) setCss(combined);
    })();
    return () => {
      cancelled = true;
    };
  }, [platform, path, docText]);

  return css;
}
