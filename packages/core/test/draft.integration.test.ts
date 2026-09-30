import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createNodePlatform } from "@marginalia/platform-node";
import { openWorkspace } from "../src/workspace/workspace.js";
import { GitClient } from "../src/git/GitClient.js";
import { SaveCommit } from "../src/versions/saveCommit.js";
import { createBranch, currentBranch } from "../src/versions/branches.js";
import { discardDraft, draftSummary, hasDraftChanges, switchIdea } from "../src/versions/draft.js";
import { defaultCompareBase, ideaFileText, listChangedFiles } from "../src/versions/compare.js";

async function freshRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "marginalia-draft-"));
  const platform = createNodePlatform(path.join(await fs.mkdtemp(path.join(os.tmpdir(), "marginalia-store-")), "store.json"));
  await openWorkspace({ ...platform, dialogs: { ...platform.dialogs, confirm: async () => true } }, dir);
  const git = new GitClient(platform, dir);
  const saveCommit = new SaveCommit(platform, git);
  return { dir, git, platform, saveCommit };
}

const commitCount = async (git: GitClient) => (await git.must(["rev-list", "--count", "HEAD"])).stdout.trim();

describe("draft: autosave writes files, saving the idea commits", () => {
  it("save() never commits; commitDraft() commits everything once", async () => {
    const { dir, git, saveCommit } = await freshRepo();
    await saveCommit.save(path.join(dir, "a.md"), "one\n");
    await saveCommit.save(path.join(dir, "b.md"), "two\n");
    expect(await commitCount(git)).toBe("1");
    expect(await hasDraftChanges(git)).toBe(true);

    expect(await saveCommit.commitDraft("Add notes")).toBe(true);
    expect(await commitCount(git)).toBe("2");
    expect(await hasDraftChanges(git)).toBe(false);
    expect((await git.must(["log", "-1", "--format=%s"])).stdout.trim()).toBe("Add notes");

    expect(await saveCommit.commitDraft("Nothing")).toBe(false);
    expect(await commitCount(git)).toBe("2");
  });

  it("summarizes the draft as a one-line message", async () => {
    const { dir, git, saveCommit } = await freshRepo();
    await saveCommit.save(path.join(dir, "a.md"), "1\n");
    expect(await draftSummary(git)).toBe("Update a.md");
    for (const n of ["b", "c", "d", "e"]) await saveCommit.save(path.join(dir, `${n}.md`), "x\n");
    expect(await draftSummary(git)).toBe("Update a.md, b.md, c.md and 2 more");
  });

  it("commits deletions too", async () => {
    const { dir, git, saveCommit } = await freshRepo();
    await saveCommit.saveAndCommit(path.join(dir, "a.md"), "one\n");
    await fs.rm(path.join(dir, "a.md"));
    expect(await saveCommit.commitDraft("Remove a")).toBe(true);
    expect((await git.must(["ls-files"])).stdout).not.toContain("a.md");
  });
});

describe("draft: listChangedFiles", () => {
  it("reports modified, added (incl. untracked) and deleted files against another idea", async () => {
    const { dir, git, saveCommit } = await freshRepo();
    await saveCommit.saveAndCommit(path.join(dir, "keep.md"), "same\n");
    await saveCommit.saveAndCommit(path.join(dir, "edit.md"), "before\n");
    await saveCommit.saveAndCommit(path.join(dir, "gone.md"), "bye\n");

    await createBranch(git, saveCommit, "idea", "HEAD");
    await saveCommit.save(path.join(dir, "edit.md"), "after\n"); // modified (unsaved)
    await saveCommit.save(path.join(dir, "new.md"), "hi\n"); // untracked
    await fs.rm(path.join(dir, "gone.md")); // deleted
    await saveCommit.save(path.join(dir, ".hidden.md"), "x\n"); // hidden, ignored

    const files = await listChangedFiles(git, "main");
    expect(files).toEqual([
      { path: "edit.md", status: "M" },
      { path: "gone.md", status: "D" },
      { path: "new.md", status: "A" },
    ]);
    expect(await ideaFileText(git, "main", "edit.md")).toBe("before\n");
    expect(await ideaFileText(git, "main", "new.md")).toBe("");
  });

  it("compares an idea with itself as tip vs. draft", async () => {
    const { dir, git, saveCommit } = await freshRepo();
    await saveCommit.saveAndCommit(path.join(dir, "a.md"), "v1\n");
    await saveCommit.save(path.join(dir, "a.md"), "v2\n");
    expect(await listChangedFiles(git, "main")).toEqual([{ path: "a.md", status: "M" }]);
  });

  it("picks main as the default base when it exists", () => {
    expect(defaultCompareBase(["idea", "main"], "idea")).toBe("main");
    expect(defaultCompareBase(["idea"], "idea")).toBe("idea");
  });
});

describe("draft: switching ideas", () => {
  async function twoIdeas() {
    const ctx = await freshRepo();
    const { dir, git, saveCommit } = ctx;
    await saveCommit.saveAndCommit(path.join(dir, "a.md"), "line\n");
    await createBranch(git, saveCommit, "idea", "HEAD");
    await saveCommit.saveAndCommit(path.join(dir, "b.md"), "on idea\n");
    await git.must(["switch", "main"]);
    saveCommit.clearLastSaved();
    return ctx;
  }

  it("discard drops modified and untracked files before switching", async () => {
    const { dir, git, saveCommit } = await twoIdeas();
    await saveCommit.save(path.join(dir, "a.md"), "changed\n");
    await saveCommit.save(path.join(dir, "fresh.md"), "new\n");
    const outcome = await switchIdea(git, saveCommit, "idea", "discard");
    expect(outcome).toEqual({ kind: "switched", carried: false });
    expect(await currentBranch(git)).toBe("idea");
    expect(await fs.readFile(path.join(dir, "a.md"), "utf8")).toBe("line\n");
    await expect(fs.stat(path.join(dir, "fresh.md"))).rejects.toThrow();
    expect(await hasDraftChanges(git)).toBe(false);
  });

  it("carry stashes, switches and re-applies modified + untracked files", async () => {
    const { dir, git, saveCommit } = await twoIdeas();
    await saveCommit.save(path.join(dir, "a.md"), "carried edit\n");
    await saveCommit.save(path.join(dir, "fresh.md"), "new\n");
    const outcome = await switchIdea(git, saveCommit, "idea", "carry");
    expect(outcome).toEqual({ kind: "switched", carried: true });
    expect(await currentBranch(git)).toBe("idea");
    expect(await fs.readFile(path.join(dir, "a.md"), "utf8")).toBe("carried edit\n");
    expect(await fs.readFile(path.join(dir, "fresh.md"), "utf8")).toBe("new\n");
    expect((await git.must(["stash", "list"])).stdout.trim()).toBe("");
  });

  it("carry that conflicts returns to the original idea with the draft intact", async () => {
    const { dir, git, saveCommit } = await freshRepo();
    await saveCommit.saveAndCommit(path.join(dir, "a.md"), "base\n");
    await createBranch(git, saveCommit, "idea", "HEAD");
    await saveCommit.saveAndCommit(path.join(dir, "a.md"), "idea version\n");
    await git.must(["switch", "main"]);
    saveCommit.clearLastSaved();

    await saveCommit.save(path.join(dir, "a.md"), "main draft\n");
    const outcome = await switchIdea(git, saveCommit, "idea", "carry");
    expect(outcome.kind).toBe("carry-failed");
    expect(await currentBranch(git)).toBe("main");
    expect(await fs.readFile(path.join(dir, "a.md"), "utf8")).toBe("main draft\n");
    expect((await git.must(["stash", "list"])).stdout.trim()).toBe("");
  });

  it("discardDraft resets the tree", async () => {
    const { dir, git, saveCommit } = await freshRepo();
    await saveCommit.saveAndCommit(path.join(dir, "a.md"), "v1\n");
    await saveCommit.save(path.join(dir, "a.md"), "v2\n");
    await discardDraft(git, saveCommit);
    expect(await fs.readFile(path.join(dir, "a.md"), "utf8")).toBe("v1\n");
    // a later save of "v2" must not be skipped by a stale cache
    await saveCommit.save(path.join(dir, "a.md"), "v2\n");
    expect(await fs.readFile(path.join(dir, "a.md"), "utf8")).toBe("v2\n");
  });
});
