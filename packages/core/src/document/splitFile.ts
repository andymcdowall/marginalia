import type { Comment, SplitFile, Thread, ThreadStatus } from "../comments/types.js";
import { unescapeCommentBody } from "../comments/escape.js";
import { reconcileThreads } from "../comments/reconcile.js";

const MARKER = "\n<!-- marginalia:comments\n";
const MALFORMED_WARNING = "Comment block could not be read; it was left in the file as text.";

// See SPEC.md §5.5. The comment block, if present, is the last thing in the file.
export function splitFile(raw: string): SplitFile {
  const idx = raw.lastIndexOf(MARKER);
  if (idx === -1) {
    return { body: raw, threads: reconcileThreads(raw, []), warnings: [] };
  }

  const tail = raw.slice(idx);
  if (!/-->\s*$/.test(tail)) {
    return { body: raw, threads: [], warnings: [MALFORMED_WARNING] };
  }

  const body = raw.slice(0, idx);
  const parsed = parseThreads(tail);
  const threads = reconcileThreads(body, parsed);
  return { body, threads, warnings: [] };
}

function parseAttrs(attrString: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of attrString.matchAll(/([\w-]+)="([^"]*)"/g)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

function parseThreads(blockText: string): Thread[] {
  const threads: Thread[] = [];
  for (const m of blockText.matchAll(/<thread\s+([^>]*)>([\s\S]*?)<\/thread>/g)) {
    const attrs = parseAttrs(m[1]!);
    threads.push({
      id: attrs.id ?? "",
      status: (attrs.status as ThreadStatus | undefined) ?? "open",
      updated: attrs.updated ?? "",
      comments: parseComments(m[2]!),
    });
  }
  return threads;
}

function parseComments(blockText: string): Comment[] {
  const comments: Comment[] = [];
  for (const m of blockText.matchAll(/<comment\s+([^>]*)>([\s\S]*?)<\/comment>/g)) {
    const attrs = parseAttrs(m[1]!);
    comments.push({
      id: attrs.id ?? "",
      created: attrs.created ?? "",
      body: unescapeCommentBody(m[2]!),
    });
  }
  return comments;
}

