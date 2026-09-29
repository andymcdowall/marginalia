import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createNodePlatform } from "@marginalia/platform-node";
import { openWorkspace, listTree, createNote, createFolder, renameEntry, removeEntry } from "../src/workspace/workspace.js";
import { GitClient } from "../src/git/GitClient.js";

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "marginalia-ws-"));
}

// platform-node's Dialogs throw "not supported" — openWorkspace only calls confirm() when a
// folder isn't already a git repo, so a Platform whose confirm() answers `true` covers that path.
function platformWithConfirm(storePath: string) {
  const platform = createNodePlatform(storePath);
  return {
    ...platform,
    dialogs: { ...platform.dialogs, confirm: async () => true },
  };
}

describe("workspace: openWorkspace", () => {
  it("initializes a fresh folder as a git repo with an initial commit", async () => {
    const dir = await tempDir();
    const platform = platformWithConfirm(path.join(dir, "store.json"));

    const info = await openWorkspace(platform, dir);
    // macOS's /tmp resolves through a /private symlink; git and fs.realpath don't always agree
    // on which form to report, so compare basenames rather than exact paths.
    expect(path.basename(info.gitRoot)).toBe(path.basename(dir));

    const log = await platform.git.run(dir, ["log", "--oneline"]);
    expect(log.code).toBe(0);
    expect(log.stdout).toContain("Initial commit");

    const base = await platform.git.run(dir, ["config", "branch.main.marginaliaBase"]);
    expect(base.code).toBe(0);
    expect(base.stdout.trim()).not.toBe("");
  });

  it("does not create a second initial commit on a workspace that's already a repo", async () => {
    const dir = await tempDir();
    const platform = platformWithConfirm(path.join(dir, "store.json"));
    await openWorkspace(platform, dir);

    await platform.fs.writeText(path.join(dir, "note.md"), "hello\n");
    await platform.git.run(dir, ["add", "-A"]);
    await platform.git.run(dir, ["commit", "-m", "add note"]);

    await openWorkspace(platform, dir);
    const log = await platform.git.run(dir, ["log", "--oneline"]);
    expect(log.stdout.trim().split("\n")).toHaveLength(2);
  });
});

describe("workspace: file tree", () => {
  it("lists folders first, hides dotfiles, and filters to md/images", async () => {
    const dir = await tempDir();
    const platform = createNodePlatform(path.join(dir, "store.json"));

    await platform.fs.mkdir(path.join(dir, "zzz-folder"));
    await platform.fs.mkdir(path.join(dir, ".hidden-folder"));
    await platform.fs.writeText(path.join(dir, "Apple.md"), "");
    await platform.fs.writeText(path.join(dir, "banana.md"), "");
    await platform.fs.writeText(path.join(dir, ".hidden.md"), "");
    await platform.fs.writeText(path.join(dir, "notes.txt"), "");
    await platform.fs.writeBinary(path.join(dir, "image.png"), new Uint8Array([1, 2, 3]));

    const entries = await listTree(platform, dir);
    expect(entries.map((e) => e.name)).toEqual(["zzz-folder", "Apple.md", "banana.md", "image.png"]);
  });

  it("createNote avoids name collisions and commits each one", async () => {
    const dir = await tempDir();
    const platform = platformWithConfirm(path.join(dir, "store.json"));
    await openWorkspace(platform, dir);
    const git = new GitClient(platform, dir);

    const first = await createNote(platform, git, dir);
    const second = await createNote(platform, git, dir);
    expect(first).toContain("Untitled.md");
    expect(second).toContain("Untitled 2.md");

    const log = await git.must(["log", "--oneline"]);
    expect(log.stdout).toContain("new note: Untitled.md");
    expect(log.stdout).toContain("new note: Untitled 2.md");
  });

  it("createFolder avoids name collisions (and does not commit an empty folder)", async () => {
    const dir = await tempDir();
    const platform = platformWithConfirm(path.join(dir, "store.json"));
    await openWorkspace(platform, dir);
    const git = new GitClient(platform, dir);

    const first = await createFolder(platform, git, dir);
    const second = await createFolder(platform, git, dir);
    expect(first).toContain("New Folder");
    expect(second).toContain("New Folder 2");

    // git can't track an empty directory, so nothing should have been committed for either.
    const log = await git.must(["log", "--oneline"]);
    expect(log.stdout).not.toContain("new folder");
  });

  it("renameEntry and removeEntry each commit", async () => {
    const dir = await tempDir();
    const platform = platformWithConfirm(path.join(dir, "store.json"));
    await openWorkspace(platform, dir);
    const git = new GitClient(platform, dir);

    const notePath = await createNote(platform, git, dir);
    const renamed = await renameEntry(platform, git, notePath, "Renamed.md");
    expect(renamed).toContain("Renamed.md");
    let log = await git.must(["log", "--oneline"]);
    expect(log.stdout).toContain("rename: Untitled.md to Renamed.md");

    await removeEntry(platform, git, renamed);
    log = await git.must(["log", "--oneline"]);
    expect(log.stdout).toContain("delete: Renamed.md");
  });
});
