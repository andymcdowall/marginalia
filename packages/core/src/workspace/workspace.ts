import type { DirEntry, Platform } from "../platform.js";

export type WorkspaceInfo = {
  root: string; // the folder the user opened (tree root, may be a subfolder of the repo)
  gitRoot: string; // toplevel of the git repository
};

function gitArgs(args: string[]): string[] {
  return ["-c", "core.quotepath=false", "-c", "color.ui=never", ...args];
}

async function runGit(platform: Platform, cwd: string, args: string[]) {
  return platform.git.run(cwd, gitArgs(args));
}

// SPEC.md §6 "Open folder", excluding the git-versioning behaviors that belong to later phases
// (external-change sync commits, merge-in-progress detection — Phase 2+).
export async function openWorkspace(platform: Platform, root: string): Promise<WorkspaceInfo> {
  const toplevel = await runGit(platform, root, ["rev-parse", "--show-toplevel"]);
  let gitRoot: string;

  if (toplevel.code !== 0) {
    const proceed = await platform.dialogs.confirm("Initialize version history in this folder?");
    if (!proceed) {
      throw new Error("A workspace needs version history. Initialization was declined.");
    }
    await runGit(platform, root, ["init", "-b", "main"]);
    gitRoot = root;
  } else {
    gitRoot = toplevel.stdout.trim();
  }

  const userName = await runGit(platform, gitRoot, ["config", "user.name"]);
  if (userName.stdout.trim() === "") {
    await runGit(platform, gitRoot, ["config", "user.name", "Marginalia"]);
    await runGit(platform, gitRoot, ["config", "user.email", "marginalia@localhost"]);
  }

  const hasCommits = await runGit(platform, gitRoot, ["log", "-1"]);
  if (hasCommits.code !== 0) {
    await runGit(platform, gitRoot, ["add", "-A"]);
    await runGit(platform, gitRoot, ["commit", "--allow-empty", "-m", "Initial commit"]);
    const head = await runGit(platform, gitRoot, ["rev-parse", "HEAD"]);
    await runGit(platform, gitRoot, ["config", "branch.main.marginaliaBase", head.stdout.trim()]);
  }

  await platform.store.set("lastWorkspace", root);

  return { root, gitRoot };
}

export async function getLastWorkspace(platform: Platform): Promise<string | undefined> {
  return platform.store.get<string>("lastWorkspace");
}

// `.git` is the one thing never shown: it's git's own plumbing (huge, and exposing it would let
// tree actions — rename/delete/drag-move — touch it, risking the repo itself). Everything else
// is shown, including other dotfiles/dot-folders and every file extension, not just .md/images —
// opening a file the editor can't display falls to `FileTree`'s "File not readable in Marginalia"
// message rather than being hidden from the tree.
const ALWAYS_HIDDEN_DIRS = new Set([".git"]);

// Lazy, single-directory listing: folders first, then case-insensitive by name (SPEC.md §6).
export async function listTree(platform: Platform, dir: string): Promise<DirEntry[]> {
  const entries = await platform.fs.list(dir);
  const visible = entries.filter((e) => !(e.kind === "dir" && ALWAYS_HIDDEN_DIRS.has(e.name)));
  visible.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return visible;
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

// Tree actions only touch the working tree; they become part of the current draft and are
// committed when the user saves the idea (SPEC.md §6).
export async function createNote(platform: Platform, dir: string): Promise<string> {
  const existing = new Set((await platform.fs.list(dir)).map((e) => e.name));
  let name = "Untitled.md";
  for (let n = 2; existing.has(name); n++) {
    name = `Untitled ${n}.md`;
  }
  const filePath = joinPath(dir, name);
  await platform.fs.writeText(filePath, "");
  return filePath;
}

export async function createFolder(platform: Platform, dir: string): Promise<string> {
  const existing = new Set((await platform.fs.list(dir)).map((e) => e.name));
  let name = "New Folder";
  for (let n = 2; existing.has(name); n++) {
    name = `New Folder ${n}`;
  }
  const folderPath = joinPath(dir, name);
  await platform.fs.mkdir(folderPath);
  return folderPath;
}

export async function renameEntry(platform: Platform, fromPath: string, newName: string): Promise<string> {
  const dir = fromPath.slice(0, fromPath.lastIndexOf("/"));
  const toPath = joinPath(dir, newName);
  await platform.fs.rename(fromPath, toPath);
  return toPath;
}

export async function removeEntry(platform: Platform, entryPath: string): Promise<void> {
  await platform.fs.remove(entryPath);
}

export async function moveEntry(platform: Platform, fromPath: string, toDir: string): Promise<string> {
  const name = fromPath.slice(fromPath.lastIndexOf("/") + 1);
  const toPath = joinPath(toDir, name);
  await platform.fs.rename(fromPath, toPath);
  return toPath;
}
