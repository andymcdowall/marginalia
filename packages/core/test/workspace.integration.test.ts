import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createNodePlatform } from "@marginalia/platform-node";
import { openWorkspace, listTree, createNote, createFolder, renameEntry, removeEntry } from "../src/workspace/workspace.js";

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
  it("lists folders first (hiding only .git) and shows every file, hidden or not", async () => {
    const dir = await tempDir();
    const platform = createNodePlatform(path.join(dir, "store.json"));

    await platform.fs.mkdir(path.join(dir, "zzz-folder"));
    await platform.fs.mkdir(path.join(dir, ".hidden-folder"));
    await platform.fs.mkdir(path.join(dir, ".git"));
    await platform.fs.writeText(path.join(dir, "Apple.md"), "");
    await platform.fs.writeText(path.join(dir, "banana.md"), "");
    await platform.fs.writeText(path.join(dir, ".hidden.md"), "");
    await platform.fs.writeText(path.join(dir, "notes.txt"), "");
    await platform.fs.writeText(path.join(dir, "style.css"), "");
    await platform.fs.writeBinary(path.join(dir, "image.png"), new Uint8Array([1, 2, 3]));

    const entries = await listTree(platform, dir);
    const names = entries.map((e) => e.name);
    expect(names).not.toContain(".git");
    expect(names).toEqual([".hidden-folder", "zzz-folder", ".hidden.md", "Apple.md", "banana.md", "image.png", "notes.txt", "style.css"]);
  });

  it("createNote avoids name collisions and leaves the file uncommitted", async () => {
    const dir = await tempDir();
    const platform = platformWithConfirm(path.join(dir, "store.json"));
    await openWorkspace(platform, dir);

    const first = await createNote(platform, dir);
    const second = await createNote(platform, dir);
    expect(first).toContain("Untitled.md");
    expect(second).toContain("Untitled 2.md");

    // Tree actions are part of the current draft, not commits.
    const log = await platform.git.run(dir, ["log", "--oneline"]);
    expect(log.stdout.trim().split("\n")).toHaveLength(1);
    const status = await platform.git.run(dir, ["status", "--porcelain"]);
    expect(status.stdout).toContain("Untitled.md");
  });

  it("createFolder avoids name collisions", async () => {
    const dir = await tempDir();
    const platform = platformWithConfirm(path.join(dir, "store.json"));
    await openWorkspace(platform, dir);

    const first = await createFolder(platform, dir);
    const second = await createFolder(platform, dir);
    expect(first).toContain("New Folder");
    expect(second).toContain("New Folder 2");
  });

  it("renameEntry and removeEntry move/delete on disk without committing", async () => {
    const dir = await tempDir();
    const platform = platformWithConfirm(path.join(dir, "store.json"));
    await openWorkspace(platform, dir);

    const notePath = await createNote(platform, dir);
    const renamed = await renameEntry(platform, notePath, "Renamed.md");
    expect(renamed).toContain("Renamed.md");
    expect(await platform.fs.exists(renamed)).toBe(true);
    expect(await platform.fs.exists(notePath)).toBe(false);

    await removeEntry(platform, renamed);
    expect(await platform.fs.exists(renamed)).toBe(false);

    const log = await platform.git.run(dir, ["log", "--oneline"]);
    expect(log.stdout.trim().split("\n")).toHaveLength(1);
  });
});
