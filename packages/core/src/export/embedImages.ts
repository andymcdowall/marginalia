import type { Platform } from "../platform.js";

const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function mimeFromPath(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

// Joins an absolute directory with a relative path (macOS only, forward slashes). Exported for
// reuse anywhere else a note-relative reference needs resolving against the note's directory —
// currently `sectionCss.ts` (core) and the live-preview section-CSS loader (ui).
export function resolveRelativePath(baseDir: string, rel: string): string {
  if (rel.startsWith("/")) return rel;
  const parts = baseDir.split("/").filter(Boolean);
  for (const part of rel.split("/")) {
    if (part === "" || part === ".") continue;
    else if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

// SPEC.md §11.2: images are embedded as data: URIs. Operates on the markdown *text* (a simple
// regex pass) rather than the parsed AST, since core has no unist-util-visit (not in the allowed
// dependency list — SPEC.md §3.1) and this avoids needing one.
export async function embedImages(platform: Platform, baseDir: string, markdown: string): Promise<string> {
  const matches = Array.from(markdown.matchAll(IMAGE_RE));
  if (matches.length === 0) return markdown;

  let output = "";
  let lastIndex = 0;
  for (const m of matches) {
    const full = m[0];
    const alt = m[1] ?? "";
    const src = m[2] ?? "";
    const start = m.index!;
    output += markdown.slice(lastIndex, start);
    lastIndex = start + full.length;

    if (/^(https?:|data:)/i.test(src)) {
      output += full;
      continue;
    }
    try {
      const absPath = resolveRelativePath(baseDir, src);
      const bytes = await platform.fs.readBinary(absPath);
      const dataUri = `data:${mimeFromPath(src)};base64,${bytesToBase64(bytes)}`;
      output += `![${alt}](${dataUri})`;
    } catch {
      output += full; // unreadable image — leave the original reference rather than fail export
    }
  }
  output += markdown.slice(lastIndex);
  return output;
}
