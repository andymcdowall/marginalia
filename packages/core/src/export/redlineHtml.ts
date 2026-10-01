import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import type { Platform } from "../platform.js";
import { cleanText } from "../diff/cleanText.js";
import { wordDiff } from "../diff/wordDiff.js";
import { splitFrontmatter, parseSectionStyles, parseDocCss } from "../document/frontmatter.js";
import { embedImages } from "./embedImages.js";
import { rehypeAddClasses, rehypeWrapSections } from "./htmlTransform.js";
import { buildDocCss, buildSectionCss } from "./sectionCss.js";
import { wrapExportDocument } from "./toHtml.js";

// SPEC.md §11.2 "Redline": diff against the baseline, wrap insertions as <ins> and deletions as
// <del> in the merged markdown at their clean-text positions, then render with
// allowDangerousHtml so those raw tags survive. Known limitation (logged, not fixed, per spec): a
// hunk crossing markdown syntax (e.g. half of a `**bold**`) may render imperfectly.
export async function redlineHtml(
  platform: Platform,
  baseDir: string,
  currentBody: string,
  baselineClean: string,
  baselineLabel: string,
  ideaLabel: string
): Promise<string> {
  // Extracted purely to find a sectionStyles/css map — the diff itself still runs against
  // currentBody's full clean text (frontmatter included) to match baselineClean's own
  // preparation upstream, so this doesn't change hunk offsets or counts.
  const { frontmatter } = splitFrontmatter(currentBody);
  const sectionStyles = parseSectionStyles(frontmatter);
  const docCssPath = parseDocCss(frontmatter);

  const curClean = cleanText(currentBody).text;
  const hunks = wordDiff(baselineClean, curClean);

  let merged = "";
  let pos = 0;
  for (const h of hunks) {
    merged += curClean.slice(pos, h.curFrom);
    if (h.deleted) merged += `<del>${h.deleted}</del>`;
    if (h.inserted) merged += `<ins>${curClean.slice(h.curFrom, h.curTo)}</ins>`;
    pos = h.curTo;
  }
  merged += curClean.slice(pos);

  const withImages = await embedImages(platform, baseDir, merged);
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeWrapSections)
    .use(rehypeAddClasses)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(withImages);

  const date = new Date().toISOString().slice(0, 10);
  const header = `<p class="redline-header">Changes from ${baselineLabel} to ${ideaLabel} — ${date}</p>\n`;
  const docCss = await buildDocCss(platform, baseDir, docCssPath);
  const sectionCss = await buildSectionCss(platform, baseDir, sectionStyles);
  return wrapExportDocument(String(file), header, docCss + sectionCss);
}
