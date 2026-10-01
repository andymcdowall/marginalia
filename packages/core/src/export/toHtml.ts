import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import type { Platform } from "../platform.js";
import { cleanText } from "../diff/cleanText.js";
import { splitFrontmatter, parseSectionStyles, parseDocCss } from "../document/frontmatter.js";
import { embedImages } from "./embedImages.js";
import { rehypeAddClasses, rehypeWrapSections } from "./htmlTransform.js";
import { buildDocCss, buildSectionCss } from "./sectionCss.js";
import { THEME_CSS } from "./theme.js";

export function wrapExportDocument(bodyHtml: string, headerHtml = "", extraCss = ""): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${THEME_CSS}
${extraCss}</style>
</head>
<body>
${headerHtml}${bodyHtml}
</body>
</html>`;
}

// SPEC.md §11.2 "Clean" export: cleanText -> remark-parse+gfm -> remark-rehype -> rehype-stringify,
// with images embedded as data: URIs. The exported HTML never contains milestones, the comment
// block, or comment text — cleanText already stripped the milestones, and the comment block was
// never part of `body` to begin with (SPEC.md §7.1: the editor doc is body-only).
//
// A note's frontmatter `css` key (doc-wide, unscoped) and `sectionStyles` map (heading text ->
// CSS file path, scoped to that H1's section via rehypeWrapSections/buildSectionCss) both bring
// a stylesheet into the exported `<style>` tag — doc-wide CSS first, so a section's scoped rules
// win on equal specificity. rehypeAddClasses adds `md-*` classes to common elements so both have
// stable hooks beyond bare tag selectors.
export async function toHtml(platform: Platform, baseDir: string, body: string): Promise<string> {
  const { frontmatter, body: withoutFrontmatter } = splitFrontmatter(body);
  const sectionStyles = parseSectionStyles(frontmatter);
  const docCssPath = parseDocCss(frontmatter);
  const clean = cleanText(withoutFrontmatter).text;
  const withImages = await embedImages(platform, baseDir, clean);
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeWrapSections)
    .use(rehypeAddClasses)
    .use(rehypeStringify)
    .process(withImages);
  const docCss = await buildDocCss(platform, baseDir, docCssPath);
  const sectionCss = await buildSectionCss(platform, baseDir, sectionStyles);
  return wrapExportDocument(String(file), "", docCss + sectionCss);
}
