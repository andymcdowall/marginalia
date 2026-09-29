import type { DirEntry, Platform } from "../platform.js";
import type { GitClient } from "../git/GitClient.js";

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

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

// Lazy, single-directory listing: folders, .md files, and images; dotfiles/dot-folders hidden;
// folders first, then case-insensitive by name (SPEC.md §6).
export async function listTree(platform: Platform, dir: string): Promise<DirEntry[]> {
  const entries = await platform.fs.list(dir);
  const visible = entries.filter((e) => {
    if (e.name.startsWith(".")) return false;
    if (e.kind === "dir") return true;
    const ext = extensionOf(e.name);
    return ext === "md" || IMAGE_EXTENSIONS.has(ext);
  });
  visible.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return visible;
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

// Each tree action is followed by a commit ("<action>: <path>", SPEC.md §6). `git diff --cached
// --quiet` first, since an empty new folder has nothing to add — git can't track empty
// directories at all, so that commit would otherwise fail with nothing staged.
async function commitPaths(git: GitClient, message: string, relPaths: string[]): Promise<void> {
  await git.must(["add", "-A", "--", ...relPaths]);
  const diff = await git.run(["diff", "--cached", "--quiet", "--", ...relPaths]);
  if (diff.code === 0) return; // nothing staged
  await git.must(["commit", "-m", message]);
}

export async function createNote(platform: Platform, git: GitClient, dir: string): Promise<string> {
  const existing = new Set((await platform.fs.list(dir)).map((e) => e.name));
  let name = "Untitled.md";
  for (let n = 2; existing.has(name); n++) {
    name = `Untitled ${n}.md`;
  }
  const filePath = joinPath(dir, name);
  await platform.fs.writeText(filePath, "");
  const rel = git.toRelative(filePath);
  await commitPaths(git, `new note: ${rel}`, [rel]);
  return filePath;
}

export async function createFolder(platform: Platform, git: GitClient, dir: string): Promise<string> {
  const existing = new Set((await platform.fs.list(dir)).map((e) => e.name));
  let name = "New Folder";
  for (let n = 2; existing.has(name); n++) {
    name = `New Folder ${n}`;
  }
  const folderPath = joinPath(dir, name);
  await platform.fs.mkdir(folderPath);
  const rel = git.toRelative(folderPath);
  await commitPaths(git, `new folder: ${rel}`, [rel]);
  return folderPath;
}

export async function renameEntry(platform: Platform, git: GitClient, fromPath: string, newName: string): Promise<string> {
  const dir = fromPath.slice(0, fromPath.lastIndexOf("/"));
  const toPath = joinPath(dir, newName);
  await platform.fs.rename(fromPath, toPath);
  const relFrom = git.toRelative(fromPath);
  const relTo = git.toRelative(toPath);
  await commitPaths(git, `rename: ${relFrom} to ${relTo}`, [relFrom, relTo]);
  return toPath;
}

export async function removeEntry(platform: Platform, git: GitClient, entryPath: string): Promise<void> {
  await platform.fs.remove(entryPath);
  const rel = git.toRelative(entryPath);
  await commitPaths(git, `delete: ${rel}`, [rel]);
}

export async function moveEntry(platform: Platform, git: GitClient, fromPath: string, toDir: string): Promise<string> {
  const name = fromPath.slice(fromPath.lastIndexOf("/") + 1);
  const toPath = joinPath(toDir, name);
  await platform.fs.rename(fromPath, toPath);
  const relFrom = git.toRelative(fromPath);
  const relTo = git.toRelative(toPath);
  await commitPaths(git, `move: ${relFrom} to ${relTo}`, [relFrom, relTo]);
  return toPath;
}
