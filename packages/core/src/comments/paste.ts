import type { Thread } from "./types.js";
import { generateId } from "./ids.js";
import { findMilestones, MILESTONE_RE } from "./milestones.js";

// SPEC.md §8.4: on paste of a `application/x-marginalia` slice, every id found in the slice (both
// the milestone tags and the thread/comment ids) is regenerated, with no duplicates — thread and
// comment ids share one namespace.
export function regenerateIds(rawBody: string, threads: Thread[]): { body: string; threads: Thread[] } {
  const milestoneIds = new Set(findMilestones(rawBody).map((m) => m.id));
  const threadIds = new Set(threads.map((t) => t.id));
  const allOldIds = new Set<string>([...milestoneIds, ...threadIds]);

  const usedIds = new Set<string>();
  function nextId(): string {
    const id = generateId(usedIds);
    usedIds.add(id);
    return id;
  }

  const idMap = new Map<string, string>();
  for (const oldId of allOldIds) {
    idMap.set(oldId, nextId());
  }

  const body = rawBody.replace(MILESTONE_RE, (_match, kind: string, id: string) => {
    return `<comment-${kind} id="${idMap.get(id) ?? id}"/>`;
  });

  const newThreads: Thread[] = threads.map((t) => ({
    ...t,
    id: idMap.get(t.id) ?? t.id,
    comments: t.comments.map((c) => ({ ...c, id: nextId() })),
  }));

  return { body, threads: newThreads };
}
