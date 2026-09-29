import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import type { Platform } from "../platform.js";
import { cleanText } from "../diff/cleanText.js";
import { embedImages } from "./embedImages.js";
import { THEME_CSS } from "./theme.js";

export function wrapExportDocument(bodyHtml: string, headerHtml = ""): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${THEME_CSS}</style>
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
export async function toHtml(platform: Platform, baseDir: string, body: string): Promise<string> {
  const clean = cleanText(body).text;
  const withImages = await embedImages(platform, baseDir, clean);
  const file = await unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify).process(withImages);
  return wrapExportDocument(String(file));
}
