import type { Thread } from "./types.js";
import { findMilestones } from "./milestones.js";

// SPEC.md §5.6: order threads by start position, assign 1..n. Orphans get no number. Computed at
// runtime, never stored.
export function computeDisplayNumbers(body: string, threads: Thread[]): Map<string, number> {
  const startPos = new Map<string, number>();
  for (const m of findMilestones(body)) {
    if (m.kind === "start" && !startPos.has(m.id)) startPos.set(m.id, m.from);
  }

  const numbered = threads
    .filter((t) => t.status !== "orphaned" && startPos.has(t.id))
    .sort((a, b) => startPos.get(a.id)! - startPos.get(b.id)!);

  const out = new Map<string, number>();
  numbered.forEach((t, i) => out.set(t.id, i + 1));
  return out;
}
