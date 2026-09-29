import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createNodePlatform } from "@marginalia/platform-node";
import { openWorkspace } from "../src/workspace/workspace.js";
import { GitClient } from "../src/git/GitClient.js";
import { SaveCommit } from "../src/versions/saveCommit.js";
import { createSnapshot, listSnapshots, restoreToVersion, slugify } from "../src/versions/snapshots.js";
import { createBranch, currentBranch, deleteBranch, listBranches, renameBranch, switchBranch } from "../src/versions/branches.js";
import { resolveBaselineSha, baselineText } from "../src/versions/baseline.js";
import { fileHistory, groupHistory } from "../src/versions/history.js";

async function freshRepo(): Promise<{ dir: string; git: GitClient; platform: ReturnType<typeof createNodePlatform> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "marginalia-git-"));
  const platform = createNodePlatform(path.join(dir, "store.json"));
  const withConfirm = { ...platform, dialogs: { ...platform.dialogs, confirm: async () => true } };
  await openWorkspace(withConfirm, dir);
  const git = new GitClient(platform, dir);
  return { dir, git, platform };
}

describe("versions: initializing a fresh folder", () => {
  it("is a repo with one commit after openWorkspace", async () => {
    const { git } = await freshRepo();
    const log = await git.must(["log", "--oneline"]);
    expect(log.stdout.trim().split("\n")).toHaveLength(1);
  });
});

describe("versions: saveCommit", () => {
  it("produces exactly one commit per real change, and none for an identical re-save", async () => {
    const { dir, git, platform } = await freshRepo();
    const saveCommit = new SaveCommit(platform, git);
    const filePath = path.join(dir, "note.md");

    await saveCommit.save(filePath, "hello\n");
    const log1 = await git.must(["log", "--oneline"]);
    expect(log1.stdout.trim().split("\n")).toHaveLength(2); // initial + this save

    await saveCommit.save(filePath, "hello\n");
    const log2 = await git.must(["log", "--oneline"]);
    expect(log2.stdout.trim().split("\n")).toHaveLength(2); // unchanged

    await saveCommit.save(filePath, "hello again\n");
    const log3 = await git.must(["log", "--oneline"]);
    expect(log3.stdout.trim().split("\n")).toHaveLength(3);
  });

  it("serializes concurrent saves without overlapping git commands", async () => {
    const { dir, git, platform } = await freshRepo();
    const saveCommit = new SaveCommit(platform, git);
    const filePath = path.join(dir, "note.md");

    await Promise.all([
      saveCommit.save(filePath, "a\n"),
      saveCommit.save(filePath, "ab\n"),
      saveCommit.save(filePath, "abc\n"),
    ]);

    const content = await fs.readFile(filePath, "utf8");
    expect(content).toBe("abc\n");
    const log = await git.must(["log", "--oneline"]);
    // at most one commit per distinct save (some may have been superseded before their turn ran)
    expect(log.stdout.trim().split("\n").length).toBeGreaterThanOrEqual(2);
  });
});

describe("versions: snapshots", () => {
  it("creates, lists, and restores a snapshot", async () => {
    const { dir, git, platform } = await freshRepo();
    const saveCommit = new SaveCommit(platform, git);
    const filePath = path.join(dir, "note.md");

    await saveCommit.save(filePath, "version one\n");
    const tag = await createSnapshot(git, saveCommit, "main", "My Snapshot!", "a note");
    expect(tag).toBe("snapshot/main/my-snapshot");

    await saveCommit.save(filePath, "version two\n");

    const snapshots = await listSnapshots(git, "main");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.subject).toBe("My Snapshot!");
    expect(snapshots[0]!.body).toBe("a note");

    await restoreToVersion(git, saveCommit, filePath, snapshots[0]!.objectName, "My Snapshot!");
    const content = await fs.readFile(filePath, "utf8");
    expect(content).toBe("version one\n");

    const log = await git.must(["log", "--oneline"]);
    expect(log.stdout).toContain("restore: note.md to My Snapshot!");
    // history is intact: nothing was reset, so "version two" is still in the log
    const historyContainingV2 = await git.run(["log", "--all", "-p", "--", "note.md"]);
    expect(historyContainingV2.stdout).toContain("version two");
  });

  it("slugifies names and disambiguates collisions", async () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("  ---trim---  ")).toBe("trim");
    expect(slugify("x".repeat(50))).toHaveLength(40);

    const { git, platform, dir } = await freshRepo();
    const saveCommit = new SaveCommit(platform, git);
    await saveCommit.save(path.join(dir, "note.md"), "v1\n");

    const first = await createSnapshot(git, saveCommit, "main", "Same Name", "");
    await saveCommit.save(path.join(dir, "note.md"), "v2\n");
    const second = await createSnapshot(git, saveCommit, "main", "Same Name", "");
    expect(first).toBe("snapshot/main/same-name");
    expect(second).toBe("snapshot/main/same-name-2");
  });
});

describe("versions: branches (ideas)", () => {
  it("records marginaliaBase on create", async () => {
    const { git, platform, dir } = await freshRepo();
    const saveCommit = new SaveCommit(platform, git);
    await saveCommit.save(path.join(dir, "note.md"), "on main\n");

    await createBranch(git, saveCommit, "my-idea", "HEAD");
    expect(await currentBranch(git)).toBe("my-idea");

    const base = await git.must(["config", "branch.my-idea.marginaliaBase"]);
    const head = await git.must(["rev-parse", "HEAD"]);
    expect(base.stdout.trim()).toBe(head.stdout.trim());

    const branches = await listBranches(git);
    expect(branches.map((b) => b.name).sort()).toEqual(["main", "my-idea"]);
  });

  it("moves snapshot tags on rename", async () => {
    const { git, platform, dir } = await freshRepo();
    const saveCommit = new SaveCommit(platform, git);
    await saveCommit.save(path.join(dir, "note.md"), "v1\n");
    await createSnapshot(git, saveCommit, "main", "Keep Me", "note body");

    await renameBranch(git, "main", "renamed");

    const oldSnapshots = await listSnapshots(git, "main");
    const newSnapshots = await listSnapshots(git, "renamed");
    expect(oldSnapshots).toHaveLength(0);
    expect(newSnapshots).toHaveLength(1);
    expect(newSnapshots[0]!.subject).toBe("Keep Me");
    expect(newSnapshots[0]!.body).toBe("note body");
  });

  it("removes tags and config on delete", async () => {
    const { git, platform, dir } = await freshRepo();
    const saveCommit = new SaveCommit(platform, git);
    await saveCommit.save(path.join(dir, "note.md"), "on main\n");
    await createBranch(git, saveCommit, "throwaway", "HEAD");
    await saveCommit.save(path.join(dir, "note.md"), "on throwaway\n");
    await createSnapshot(git, saveCommit, "throwaway", "Temp", "");
    await switchBranch(git, saveCommit, "main");

    await deleteBranch(git, "throwaway");

    const branches = await listBranches(git);
    expect(branches.map((b) => b.name)).toEqual(["main"]);
    const tags = await git.must(["tag", "-l", "snapshot/throwaway/*"]);
    expect(tags.stdout.trim()).toBe("");
    const config = await git.run(["config", "--get-regexp", "^branch.throwaway."]);
    expect(config.code).not.toBe(0);
  });
});

describe("versions: baseline resolution", () => {
  it("resolves all four kinds, including a file missing at the baseline", async () => {
    const { git, platform, dir } = await freshRepo();
    const saveCommit = new SaveCommit(platform, git);
    const filePath = path.join(dir, "note.md");

    const originSha = await resolveBaselineSha(git, { kind: "origin" }, "main");
    expect(originSha).toMatch(/^[0-9a-f]{40}$/);
    // note.md doesn't exist at the very first commit
    expect(await baselineText(git, originSha, "note.md")).toBe("");

    await saveCommit.save(filePath, "first content\n");
    const commitSha = (await git.must(["rev-parse", "HEAD"])).stdout.trim();
    expect(await resolveBaselineSha(git, { kind: "commit", sha: commitSha }, "main")).toBe(commitSha);
    expect(await baselineText(git, commitSha, "note.md")).toBe("first content\n");

    const tag = await createSnapshot(git, saveCommit, "main", "Snap", "");
    expect(await resolveBaselineSha(git, { kind: "snapshot", tag }, "main")).toBe(commitSha);

    await createBranch(git, saveCommit, "idea-1", "HEAD");
    expect(await resolveBaselineSha(git, { kind: "branch", name: "main" }, "idea-1")).toBe(commitSha);

    const ideaBase = await resolveBaselineSha(git, { kind: "origin" }, "idea-1");
    expect(ideaBase).toBe(commitSha); // marginaliaBase recorded at branch creation
  });
});

describe("versions: history grouping", () => {
  it("groups consecutive autosaves and tags snapshots", async () => {
    const { git, platform, dir } = await freshRepo();
    const saveCommit = new SaveCommit(platform, git);
    const filePath = path.join(dir, "note.md");

    // The snapshot tags whatever commit is HEAD at that moment, so that commit becomes its own
    // "snapshot" row rather than joining a group — save an extra commit first so both the leading
    // and trailing autosave runs still have 2+ commits each.
    await saveCommit.save(filePath, "v1\n");
    await saveCommit.save(filePath, "v2\n");
    await saveCommit.save(filePath, "v3\n");
    const tag = await createSnapshot(git, saveCommit, "main", "Mid", "");
    await saveCommit.save(filePath, "v4\n");
    await saveCommit.save(filePath, "v5\n");

    const commits = await fileHistory(git, "note.md");
    const snapshots = await listSnapshots(git, "main");
    const bySha = new Map(snapshots.map((s) => [s.objectName, s]));
    const rows = groupHistory(commits, bySha);

    const kinds = rows.map((r) => r.kind);
    expect(kinds).toEqual(["autosave-group", "snapshot", "autosave-group"]);
    const snapshotRow = rows.find((r) => r.kind === "snapshot");
    expect(snapshotRow && snapshotRow.kind === "snapshot" && snapshotRow.snapshot.tag).toBe(tag);
  });
});
