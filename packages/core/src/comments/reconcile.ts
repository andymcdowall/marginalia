import type { Thread } from "./types.js";
import { generateId } from "./ids.js";
import { findMilestones, type Milestone } from "./milestones.js";

type MilestonePair = { start?: Milestone; end?: Milestone };

function isRangeValid(pair: MilestonePair | undefined): boolean {
  if (!pair?.start || !pair.end) return false;
  if (pair.end.from < pair.start.from) return false;
  return pair.end.from - pair.start.to > 0;
}

// SPEC.md §5.5 / §8.1: fixes up thread statuses against the actual milestones found in `body`,
// and synthesizes orphaned threads for milestones that reference no known thread. Never changes
// `updated` on existing threads. Used both when parsing a file (splitFile.ts) and live, after
// every editor transaction that changes the doc (SPEC.md §8.1).
export function reconcileThreads(body: string, threads: Thread[]): Thread[] {
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

// Is this specific thread's range currently valid (non-orphaned)? Exposed for re-anchoring UI,
// which needs to check validity without running full reconciliation.
export function isThreadRangeValid(body: string, threadId: string): boolean {
  const milestones = findMilestones(body);
  const pair: MilestonePair = {};
  for (const m of milestones) {
    if (m.id !== threadId) continue;
    if (m.kind === "start") pair.start = m;
    else pair.end = m;
  }
  return isRangeValid(pair);
}
