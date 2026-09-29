import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createNodePlatform } from "@marginalia/platform-node";
import { openWorkspace } from "../src/workspace/workspace.js";
import { GitClient } from "../src/git/GitClient.js";
import { SaveCommit } from "../src/versions/saveCommit.js";
import { createBranch, switchBranch } from "../src/versions/branches.js";
import { startMerge, resumeMerge, abortMerge, finishMerge, keepTheirsNonMd, markResolved } from "../src/versions/merge.js";
import { splitFile } from "../src/document/splitFile.js";
import { joinFile } from "../src/document/joinFile.js";
import type { Thread } from "../src/comments/types.js";

async function freshRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "marginalia-merge-"));
  const platform = createNodePlatform(path.join(dir, "store.json"));
  const withConfirm = { ...platform, dialogs: { ...platform.dialogs, confirm: async () => true } };
  await openWorkspace(withConfirm, dir);
  const git = new GitClient(platform, dir);
  const saveCommit = new SaveCommit(platform, git);
  return { dir, git, platform, saveCommit };
}

const T = "2026-01-01T00:00:00Z";
const LATER = "2026-01-02T00:00:00Z";

describe("merge: clean merge", () => {
  it("merges a non-conflicting change and produces one merge commit", async () => {
    const { dir, git, saveCommit, platform } = await freshRepo();
    const notePath = path.join(dir, "note.md");
    await saveCommit.save(notePath, "Line one.\n");

    await createBranch(git, saveCommit, "idea1", "HEAD");
    await saveCommit.save(notePath, "Line one.\nLine two.\n");
    await switchBranch(git, saveCommit, "main");
    await saveCommit.save(path.join(dir, "other.md"), "Other file.\n");

    const result = await startMerge(platform, git, saveCommit, "idea1", "main");
    expect(result.kind).toBe("committed");
    const content = await fs.readFile(notePath, "utf8");
    expect(content).toContain("Line two.");
  });
});

describe("merge: text conflicts, resolved with ours / theirs / both", () => {
  async function setupConflict() {
    const { dir, git, platform, saveCommit } = await freshRepo();
    const notePath = path.join(dir, "note.md");
    await saveCommit.save(notePath, "original\n");
    await createBranch(git, saveCommit, "idea1", "HEAD");
    await saveCommit.save(notePath, "ours version\n");
    await switchBranch(git, saveCommit, "main");
    await saveCommit.save(notePath, "theirs version\n");
    return { dir, git, platform, saveCommit, notePath };
  }

  it("reports a pending conflict with diff3 markers for a real text conflict", async () => {
    const { git, saveCommit, platform } = await setupConflict();
    const result = await startMerge(platform, git, saveCommit, "idea1", "main");
    expect(result.kind).toBe("conflicts");
    if (result.kind !== "conflicts") throw new Error("unreachable");
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0]!.file).toBe("note.md");
    expect(result.pending[0]!.mergedWithMarkers).toContain("<<<<<<< ours");
    expect(result.pending[0]!.mergedWithMarkers).toContain("ours version");
    expect(result.pending[0]!.mergedWithMarkers).toContain("theirs version");
    expect(result.pending[0]!.mergedWithMarkers).toContain(">>>>>>> theirs");
    await abortMerge(git);
  });

  it("resolves by taking ours", async () => {
    const { git, saveCommit, platform, notePath } = await setupConflict();
    const result = await startMerge(platform, git, saveCommit, "idea1", "main");
    if (result.kind !== "conflicts") throw new Error("expected conflicts");
    await markResolved(platform, git, "note.md", "ours version\n", result.pending[0]!.threads);
    await finishMerge(git, "idea1", "main");
    expect(await fs.readFile(notePath, "utf8")).toBe("ours version\n");
  });

  it("resolves by taking theirs", async () => {
    const { git, saveCommit, platform, notePath } = await setupConflict();
    const result = await startMerge(platform, git, saveCommit, "idea1", "main");
    if (result.kind !== "conflicts") throw new Error("expected conflicts");
    await markResolved(platform, git, "note.md", "theirs version\n", result.pending[0]!.threads);
    await finishMerge(git, "idea1", "main");
    expect(await fs.readFile(notePath, "utf8")).toBe("theirs version\n");
  });

  it("resolves by taking both (ours then theirs)", async () => {
    const { git, saveCommit, platform, notePath } = await setupConflict();
    const result = await startMerge(platform, git, saveCommit, "idea1", "main");
    if (result.kind !== "conflicts") throw new Error("expected conflicts");
    await markResolved(platform, git, "note.md", "ours version\ntheirs version\n", result.pending[0]!.threads);
    await finishMerge(git, "idea1", "main");
    expect(await fs.readFile(notePath, "utf8")).toBe("ours version\ntheirs version\n");
  });
});

describe("merge: comment threads", () => {
  it("both sides adding different threads produces their union with no surfaced conflict", async () => {
    const { dir, git, saveCommit, platform } = await freshRepo();
    const notePath = path.join(dir, "note.md");
    // git's `merge-file` diffs line-by-line, and needs unchanged *context* lines between two
    // edits to treat them as independent (non-conflicting) hunks — with zero buffer between them
    // it conservatively treats adjacent changed lines as one conflict region even when the edits
    // themselves don't overlap. Keep an untouched line between the two edits.
    await saveCommit.save(notePath, "First sentence.\nUnchanged middle sentence.\nThird sentence.\n");

    await createBranch(git, saveCommit, "idea1", "HEAD");
    const theirsThread: Thread = { id: "aaaaaa", status: "open", updated: T, comments: [{ id: "c11111", created: T, body: "idea1's comment" }] };
    await saveCommit.save(
      notePath,
      joinFile(
        '<comment-start id="aaaaaa"/>First sentence.<comment-end id="aaaaaa"/>\nUnchanged middle sentence.\nThird sentence.\n',
        [theirsThread]
      )
    );

    await switchBranch(git, saveCommit, "main");
    const oursThread: Thread = { id: "bbbbbb", status: "open", updated: T, comments: [{ id: "c22222", created: T, body: "main's comment" }] };
    await saveCommit.save(
      notePath,
      joinFile(
        'First sentence.\nUnchanged middle sentence.\n<comment-start id="bbbbbb"/>Third sentence.<comment-end id="bbbbbb"/>\n',
        [oursThread]
      )
    );

    const result = await startMerge(platform, git, saveCommit, "idea1", "main");
    expect(result.kind).toBe("committed");

    const finalRaw = await fs.readFile(notePath, "utf8");
    const parsed = splitFile(finalRaw);
    expect(parsed.threads.map((t) => t.id).sort()).toEqual(["aaaaaa", "bbbbbb"]);
    expect(parsed.body).toContain('id="aaaaaa"');
    expect(parsed.body).toContain('id="bbbbbb"');
  });

  it("the same thread replied to on both sides unions the replies", async () => {
    const { dir, git, saveCommit, platform } = await freshRepo();
    const notePath = path.join(dir, "note.md");
    const body = 'A <comment-start id="cccccc"/>range<comment-end id="cccccc"/> here.\n';
    const baseThread: Thread = { id: "cccccc", status: "open", updated: T, comments: [{ id: "c00000", created: T, body: "original" }] };
    await saveCommit.save(notePath, joinFile(body, [baseThread]));

    // idea1 is git's "theirs" here (it's the branch being merged INTO main); give its reply the
    // earlier timestamp so the union order is deterministic regardless of ours/theirs handling.
    await createBranch(git, saveCommit, "idea1", "HEAD");
    const theirsThread: Thread = {
      ...baseThread,
      comments: [...baseThread.comments, { id: "c11111", created: T, body: "idea1 reply" }],
    };
    await saveCommit.save(notePath, joinFile(body, [theirsThread]));

    await switchBranch(git, saveCommit, "main");
    const oursThread: Thread = {
      ...baseThread,
      comments: [...baseThread.comments, { id: "c22222", created: LATER, body: "main reply" }],
    };
    await saveCommit.save(notePath, joinFile(body, [oursThread]));

    const result = await startMerge(platform, git, saveCommit, "idea1", "main");
    expect(result.kind).toBe("committed");

    const parsed = splitFile(await fs.readFile(notePath, "utf8"));
    expect(parsed.threads).toHaveLength(1);
    const bodies = parsed.threads[0]!.comments.map((c) => c.body);
    expect(bodies).toEqual(["original", "idea1 reply", "main reply"]);
  });

  it("a status change with a later `updated` wins", async () => {
    const { dir, git, saveCommit, platform } = await freshRepo();
    const notePath = path.join(dir, "note.md");
    const body = 'A <comment-start id="dddddd"/>range<comment-end id="dddddd"/> here.\n';
    const baseThread: Thread = { id: "dddddd", status: "open", updated: T, comments: [{ id: "c00000", created: T, body: "x" }] };
    await saveCommit.save(notePath, joinFile(body, [baseThread]));

    await createBranch(git, saveCommit, "idea1", "HEAD");
    await saveCommit.save(notePath, joinFile(body, [{ ...baseThread, status: "resolved", updated: T }]));

    await switchBranch(git, saveCommit, "main");
    // Later `updated` on main's side (still "open", but the more recent edit) should win.
    await saveCommit.save(notePath, joinFile(body, [{ ...baseThread, status: "open", updated: LATER }]));

    const result = await startMerge(platform, git, saveCommit, "idea1", "main");
    expect(result.kind).toBe("committed");
    const parsed = splitFile(await fs.readFile(notePath, "utf8"));
    expect(parsed.threads[0]!.status).toBe("open");
  });
});

describe("merge: abort", () => {
  it("restores the pre-merge state", async () => {
    const { dir, git, saveCommit, platform } = await freshRepo();
    const notePath = path.join(dir, "note.md");
    await saveCommit.save(notePath, "original\n");
    await createBranch(git, saveCommit, "idea1", "HEAD");
    await saveCommit.save(notePath, "ours version\n");
    await switchBranch(git, saveCommit, "main");
    await saveCommit.save(notePath, "theirs version\n");

    const beforeLog = (await git.must(["rev-parse", "HEAD"])).stdout.trim();
    const result = await startMerge(platform, git, saveCommit, "idea1", "main");
    expect(result.kind).toBe("conflicts");

    await abortMerge(git);

    const afterLog = (await git.must(["rev-parse", "HEAD"])).stdout.trim();
    expect(afterLog).toBe(beforeLog);
    expect(await git.isMergeInProgress()).toBe(false);
    expect(await fs.readFile(notePath, "utf8")).toBe("theirs version\n");
  });
});

describe("merge: non-md conflicts", () => {
  it("keep-theirs resolves a binary/non-md conflict", async () => {
    const { dir, git, saveCommit, platform } = await freshRepo();
    const imgPath = path.join(dir, "image.txt"); // plain text stand-in; only the extension matters here
    await saveCommit.save(imgPath, "original\n");
    // idea1 is git's "theirs" (merged INTO main, which is "ours") — name the content to match.
    await createBranch(git, saveCommit, "idea1", "HEAD");
    await saveCommit.save(imgPath, "theirs\n");
    await switchBranch(git, saveCommit, "main");
    await saveCommit.save(imgPath, "ours\n");

    const result = await startMerge(platform, git, saveCommit, "idea1", "main");
    expect(result.kind).toBe("conflicts");
    if (result.kind !== "conflicts") throw new Error("expected conflicts");
    expect(result.nonMdConflicts).toEqual(["image.txt"]);

    await keepTheirsNonMd(git, "image.txt");
    await finishMerge(git, "idea1", "main");
    expect(await fs.readFile(imgPath, "utf8")).toBe("theirs\n");
  });
});

describe("merge: resuming after an app restart", () => {
  it("re-derives the same pending conflict from git state alone", async () => {
    const { dir, git, saveCommit, platform } = await freshRepo();
    const notePath = path.join(dir, "note.md");
    await saveCommit.save(notePath, "original\n");
    await createBranch(git, saveCommit, "idea1", "HEAD");
    await saveCommit.save(notePath, "ours version\n");
    await switchBranch(git, saveCommit, "main");
    await saveCommit.save(notePath, "theirs version\n");

    const first = await startMerge(platform, git, saveCommit, "idea1", "main");
    expect(first.kind).toBe("conflicts");
    expect(await git.isMergeInProgress()).toBe(true);

    // Simulate an app restart: build fresh GitClient/SaveCommit instances against the same repo,
    // with no in-memory state carried over, and resume purely from git's on-disk merge state.
    const freshGit = new GitClient(platform, dir);
    const resumed = await resumeMerge(platform, freshGit, "idea1", "main");
    expect(resumed.kind).toBe("conflicts");
    if (resumed.kind !== "conflicts") throw new Error("expected conflicts");
    expect(resumed.pending[0]!.file).toBe("note.md");
    expect(resumed.pending[0]!.mergedWithMarkers).toContain("<<<<<<< ours");

    await markResolved(platform, freshGit, "note.md", "resumed resolution\n", resumed.pending[0]!.threads);
    await finishMerge(freshGit, "idea1", "main");
    expect(await fs.readFile(notePath, "utf8")).toBe("resumed resolution\n");
  });
});
