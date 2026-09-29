import type { Thread } from "../comments/types.js";
import { escapeCommentBody } from "../comments/escape.js";
import { findMilestones } from "../comments/milestones.js";

// See SPEC.md §5.5. Threads are ordered by their start-milestone position, with orphans
// (threads whose id has no start milestone in the body) last, sorted by id.
export function joinFile(body: string, threads: Thread[]): string {
  if (threads.length === 0) return body;

  const startPos = new Map<string, number>();
  for (const m of findMilestones(body)) {
    if (m.kind === "start" && !startPos.has(m.id)) {
      startPos.set(m.id, m.from);
    }
  }

  const ordered = [...threads].sort((a, b) => {
    const pa = startPos.get(a.id);
    const pb = startPos.get(b.id);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const lines: string[] = ["<!-- marginalia:comments", "<comments>"];
  for (const thread of ordered) {
    lines.push(`  <thread id="${thread.id}" status="${thread.status}" updated="${thread.updated}">`);
    for (const c of thread.comments) {
      lines.push(`    <comment id="${c.id}" created="${c.created}">${escapeCommentBody(c.body)}</comment>`);
    }
    lines.push("  </thread>");
  }
  lines.push("</comments>");
  lines.push("-->");

  return body + "\n" + lines.join("\n");
}
