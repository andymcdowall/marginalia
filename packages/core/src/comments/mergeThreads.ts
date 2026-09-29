import type { Comment, Thread } from "./types.js";

function threadEquals(a: Thread, b: Thread): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function laterOf(a: string, b: string): "a" | "b" {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return ta >= tb ? "a" : "b";
}

function mergeExisting(ours: Thread, theirs: Thread): Thread {
  const byId = new Map<string, Comment>();
  for (const c of ours.comments) byId.set(c.id, c);
  for (const c of theirs.comments) {
    if (!byId.has(c.id)) byId.set(c.id, c); // ours wins if both sides edited the same comment id
  }
  const comments = Array.from(byId.values()).sort((a, b) => a.created.localeCompare(b.created));
  const winner = laterOf(ours.updated, theirs.updated);
  return {
    id: ours.id,
    status: winner === "a" ? ours.status : theirs.status,
    updated: winner === "a" ? ours.updated : theirs.updated,
    comments,
  };
}

// SPEC.md §9.4. Union of threads by id; when present on both sides, union of comments by id
// (ours wins on a same-id edit conflict), status from whichever side's `updated` is later. A
// thread present in base but missing on one side, unchanged on the other, stays deleted.
export function mergeThreads(base: Thread[], ours: Thread[], theirs: Thread[]): Thread[] {
  const baseById = new Map(base.map((t) => [t.id, t]));
  const oursById = new Map(ours.map((t) => [t.id, t]));
  const theirsById = new Map(theirs.map((t) => [t.id, t]));
  const allIds = new Set([...baseById.keys(), ...oursById.keys(), ...theirsById.keys()]);

  const result: Thread[] = [];
  for (const id of allIds) {
    const b = baseById.get(id);
    const o = oursById.get(id);
    const t = theirsById.get(id);

    if (o && t) {
      result.push(mergeExisting(o, t));
    } else if (o && !t) {
      if (b && threadEquals(b, o)) continue; // deleted on theirs, unchanged on ours -> stays deleted
      result.push(o);
    } else if (t && !o) {
      if (b && threadEquals(b, t)) continue; // deleted on ours, unchanged on theirs -> stays deleted
      result.push(t);
    }
    // neither side has it: deleted on both, drop.
  }
  return result;
}
