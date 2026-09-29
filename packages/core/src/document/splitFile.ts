import type { Comment, SplitFile, Thread, ThreadStatus } from "../comments/types.js";
import { unescapeCommentBody } from "../comments/escape.js";
import { generateId } from "../comments/ids.js";
import { findMilestones, type Milestone } from "../comments/milestones.js";

const MARKER = "\n<!-- marginalia:comments\n";
const MALFORMED_WARNING = "Comment block could not be read; it was left in the file as text.";

// See SPEC.md §5.5. The comment block, if present, is the last thing in the file.
export function splitFile(raw: string): SplitFile {
  const idx = raw.lastIndexOf(MARKER);
  if (idx === -1) {
    return { body: raw, threads: reconcile(raw, []), warnings: [] };
  }

  const tail = raw.slice(idx);
  if (!/-->\s*$/.test(tail)) {
    return { body: raw, threads: [], warnings: [MALFORMED_WARNING] };
  }

  const body = raw.slice(0, idx);
  const parsed = parseThreads(tail);
  const threads = reconcile(body, parsed);
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

type MilestonePair = { start?: Milestone; end?: Milestone };

function isRangeValid(pair: MilestonePair | undefined): boolean {
  if (!pair?.start || !pair.end) return false;
  if (pair.end.from < pair.start.from) return false;
  return pair.end.from - pair.start.to > 0;
}

// Reconciliation: fixes up thread statuses against the actual milestones found in the body, and
// synthesizes orphaned threads for milestones that reference no known thread. Never changes
// `updated` on existing threads (SPEC.md §5.5).
function reconcile(body: string, threads: Thread[]): Thread[] {
  const milestones = findMilestones(body);
  const byId = new Map<string, MilestonePair>();
  for (const m of milestones) {
    const entry = byId.get(m.id) ?? {};
    if (m.kind === "start") entry.start = m;
    else entry.end = m;
    byId.set(m.id, entry);
  }

  const knownIds = new Set(threads.map((t) => t.id));
  const usedIds = new Set(knownIds);
  for (const thread of threads) {
    for (const c of thread.comments) usedIds.add(c.id);
  }
  for (const id of byId.keys()) usedIds.add(id);

  const result: Thread[] = threads.map((thread) => {
    const valid = isRangeValid(byId.get(thread.id));
    let status = thread.status;
    if (!valid) {
      status = "orphaned";
    } else if (status === "orphaned") {
      status = "open";
    }
    return status === thread.status ? thread : { ...thread, status };
  });

  for (const [id, pair] of byId) {
    if (knownIds.has(id)) continue;
    void pair; // an id present only as a lone start or end tag also gets a stub thread
    const now = new Date().toISOString();
    const commentId = generateId(usedIds);
    usedIds.add(commentId);
    result.push({
      id,
      status: "orphaned",
      updated: now,
      comments: [{ id: commentId, created: now, body: "(comment text missing)" }],
    });
  }

  return result;
}
