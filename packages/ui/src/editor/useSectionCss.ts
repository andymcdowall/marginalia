import { useEffect, useRef, useState } from "react";
import { splitFrontmatter, parseSectionStyles, resolveRelativePath, scopeCss, slugifyHeading } from "@marginalia/core";
import type { Platform } from "@marginalia/core";

// Reads a note's frontmatter `sectionStyles` map and returns the combined CSS, scoped to each
// section's `cm-section-<slug>` line class (sectionStyles.ts), for injection as a <style> tag in
// the live editor — the live-preview counterpart of `buildSectionCss` (core/export/sectionCss.ts),
// which does the same thing for exported HTML's `.md-section[data-section]` containers.
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
    if (sectionStyles.size === 0) {
      setCss("");
      return;
    }

    const baseDir = path.slice(0, path.lastIndexOf("/"));
    let cancelled = false;
    void (async () => {
      let combined = "";
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
