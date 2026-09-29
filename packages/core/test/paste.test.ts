import { describe, expect, it } from "vitest";
import { regenerateIds } from "../src/comments/paste.js";
import { findMilestones } from "../src/comments/milestones.js";
import type { Thread } from "../src/comments/types.js";

const T = "2026-01-01T00:00:00Z";

describe("regenerateIds (paste)", () => {
  it("regenerates every milestone id, thread id, and comment id with no duplicates", () => {
    const rawSlice =
      'A <comment-start id="aaaaaa"/>range<comment-end id="aaaaaa"/> and ' +
      '<comment-start id="bbbbbb"/>another<comment-end id="bbbbbb"/>.';
    const threads: Thread[] = [
      { id: "aaaaaa", status: "open", updated: T, comments: [{ id: "c11111", created: T, body: "one" }] },
      {
        id: "bbbbbb",
        status: "resolved",
        updated: T,
        comments: [
          { id: "c22222", created: T, body: "two" },
          { id: "c33333", created: T, body: "three" },
        ],
      },
    ];

    const result = regenerateIds(rawSlice, threads);

    // Body text (minus milestone ids) is preserved.
    expect(result.body.replace(/id="[a-z0-9]{6}"/g, 'id="X"')).toBe(
      rawSlice.replace(/id="[a-z0-9]{6}"/g, 'id="X"')
    );

    // No old id survives anywhere.
    const oldIds = ["aaaaaa", "bbbbbb", "c11111", "c22222", "c33333"];
    for (const old of oldIds) {
      expect(result.body).not.toContain(old);
      expect(JSON.stringify(result.threads)).not.toContain(old);
    }

    // Milestone tags in the new body reference the new thread ids, still paired start/end.
    const milestones = findMilestones(result.body);
    expect(milestones).toHaveLength(4);
    const newThreadIds = new Set(result.threads.map((t) => t.id));
    for (const m of milestones) {
      expect(newThreadIds.has(m.id)).toBe(true);
    }

    // No duplicate ids anywhere (thread ids and comment ids share one namespace).
    const allNewIds = [
      ...result.threads.map((t) => t.id),
      ...result.threads.flatMap((t) => t.comments.map((c) => c.id)),
    ];
    expect(new Set(allNewIds).size).toBe(allNewIds.length);

    // Non-id fields (status, comment bodies) are preserved.
    expect(result.threads[0]!.status).toBe("open");
    expect(result.threads[1]!.status).toBe("resolved");
    expect(result.threads.flatMap((t) => t.comments.map((c) => c.body))).toEqual(["one", "two", "three"]);
  });

  it("assigns unique ids across many threads/comments in a single large slice", () => {
    // Spec's guarantee is per-paste (ids "found in the slice" share one namespace and must not
    // collide with each other), not across separate, independent paste operations.
    let rawSlice = "";
    const threads: Thread[] = [];
    for (let i = 0; i < 30; i++) {
      const id = i.toString(36).padStart(6, "0");
      rawSlice += `<comment-start id="${id}"/>t${i}<comment-end id="${id}"/> `;
      threads.push({
        id,
        status: "open",
        updated: T,
        comments: Array.from({ length: 5 }, (_, j) => ({
          id: `${i}${j}`.padStart(6, "0"),
          created: T,
          body: `comment ${i}-${j}`,
        })),
      });
    }

    const result = regenerateIds(rawSlice, threads);
    const allIds = [
      ...result.threads.map((t) => t.id),
      ...result.threads.flatMap((t) => t.comments.map((c) => c.id)),
    ];
    expect(allIds).toHaveLength(30 + 30 * 5);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
