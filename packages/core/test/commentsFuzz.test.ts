import { describe, expect, it } from "vitest";
import { reconcileThreads, isThreadRangeValid } from "../src/comments/reconcile.js";
import type { Thread } from "../src/comments/types.js";

const T = "2026-01-01T00:00:00Z";

function makeInitial(): { body: string; threads: Thread[] } {
  // 5 overlapping/interleaved ranges (a-b-c nest/interleave; d and e nest inside that).
  const body =
    'Start <comment-start id="aaaaaa"/>Alpha <comment-start id="bbbbbb"/>Beta ' +
    '<comment-start id="cccccc"/>Gamma<comment-end id="aaaaaa"/> continues ' +
    '<comment-start id="dddddd"/>Delta<comment-end id="bbbbbb"/> more ' +
    '<comment-start id="eeeeee"/>Epsilon<comment-end id="cccccc"/> end<comment-end id="dddddd"/> ' +
    "tail<comment-end id=\"eeeeee\"/>.\n";
  const ids = ["aaaaaa", "bbbbbb", "cccccc", "dddddd", "eeeeee"];
  const threads: Thread[] = ids.map((id, i) => ({
    id,
    status: "open",
    updated: T,
    comments: [{ id: `c${i}${i}${i}${i}${i}${i}`, created: T, body: `Comment for ${id}` }],
  }));
  return { body, threads };
}

// Deterministic PRNG so the fuzz run is reproducible across CI machines.
function xorshift(seed: number): () => number {
  let s = seed;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const INSERT_SNIPPETS = [
  "x",
  "hello",
  "\n\n",
  '<comment-start id="ffffff"/>',
  '<comment-end id="ffffff"/>',
  "world ",
  '<comment-start id="aaaaaa"/>', // duplicate of an existing id, on purpose
];

describe("comments fuzz: 1000 random edits never lose comment text, reconciliation stays correct", () => {
  it("survives 1000 random insert/delete sequences over 5 overlapping ranges", () => {
    const rand = xorshift(0x1234_5678);
    let { body, threads } = makeInitial();
    const originalCommentBodies = new Set(threads.flatMap((t) => t.comments.map((c) => c.body)));

    for (let i = 0; i < 1000; i++) {
      if (rand() < 0.5) {
        const pos = Math.floor(rand() * (body.length + 1));
        const snippet = INSERT_SNIPPETS[Math.floor(rand() * INSERT_SNIPPETS.length)]!;
        body = body.slice(0, pos) + snippet + body.slice(pos);
      } else {
        const pos = Math.floor(rand() * body.length);
        const len = Math.floor(rand() * 20); // long enough to delete a whole tag sometimes
        body = body.slice(0, pos) + body.slice(pos + len);
      }

      threads = reconcileThreads(body, threads);

      // Invariant 1: no comment body text is ever lost.
      const currentBodies = new Set(threads.flatMap((t) => t.comments.map((c) => c.body)));
      for (const original of originalCommentBodies) {
        expect(currentBodies.has(original)).toBe(true);
      }

      // Invariant 2: status always matches milestone validity.
      for (const t of threads) {
        const valid = isThreadRangeValid(body, t.id);
        if (valid) {
          expect(t.status).not.toBe("orphaned");
        } else {
          expect(t.status).toBe("orphaned");
        }
      }
    }

    // Sanity: the fuzzing actually exercised deletion of whole tags and orphan creation, not a
    // no-op loop.
    const hasOrphan = threads.some((t) => t.status === "orphaned");
    expect(hasOrphan).toBe(true);
  });
});
