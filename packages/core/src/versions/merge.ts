import type { Platform } from "../platform.js";
import type { GitClient } from "../git/GitClient.js";
import type { SaveCommit } from "./saveCommit.js";
import type { Thread } from "../comments/types.js";
import { splitFile } from "../document/splitFile.js";
import { joinFile } from "../document/joinFile.js";
import { mergeThreads } from "../comments/mergeThreads.js";

export type PendingConflict = { file: string; mergedWithMarkers: string; threads: Thread[] };

export type MergeResult =
  | { kind: "committed" }
  | { kind: "conflicts"; pending: PendingConflict[]; nonMdConflicts: string[] };

const MERGE_DIR = ".git/marginalia/merge";

async function showAt(git: GitClient, stage: 1 | 2 | 3, file: string): Promise<string> {
  const result = await git.run(["show", `:${stage}:${file}`]);
  return result.code === 0 ? result.stdout : "";
}

async function resolveConflicts(platform: Platform, git: GitClient): Promise<{ pending: PendingConflict[]; nonMdConflicts: string[] }> {
  const conflictedResult = await git.must(["diff", "--name-only", "--diff-filter=U"]);
  const conflicted = conflictedResult.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const mdFiles = conflicted.filter((f) => f.endsWith(".md"));
  const nonMdConflicts = conflicted.filter((f) => !f.endsWith(".md"));
  const pending: PendingConflict[] = [];

  if (mdFiles.length > 0) {
    await platform.fs.mkdir(git.toAbsolute(MERGE_DIR));
  }

  for (const f of mdFiles) {
    const baseRaw = await showAt(git, 1, f);
    const oursRaw = await showAt(git, 2, f);
    const theirsRaw = await showAt(git, 3, f);

    const B = splitFile(baseRaw);
    const O = splitFile(oursRaw);
    const T = splitFile(theirsRaw);
    const threads = mergeThreads(B.threads, O.threads, T.threads);

    const oursPath = git.toAbsolute(`${MERGE_DIR}/ours`);
    const basePath = git.toAbsolute(`${MERGE_DIR}/base`);
    const theirsPath = git.toAbsolute(`${MERGE_DIR}/theirs`);
    await platform.fs.writeText(oursPath, O.body);
    await platform.fs.writeText(basePath, B.body);
    await platform.fs.writeText(theirsPath, T.body);

    const r = await git.run([
      "merge-file",
      "-p",
      "--diff3",
      "-L",
      "ours",
      "-L",
      "base",
      "-L",
      "theirs",
      oursPath,
      basePath,
      theirsPath,
    ]);

    if (r.code === 0) {
      await platform.fs.writeText(git.toAbsolute(f), joinFile(r.stdout, threads));
      await git.must(["add", "--", f]);
    } else {
      pending.push({ file: f, mergedWithMarkers: r.stdout, threads });
    }
  }

  return { pending, nonMdConflicts };
}

async function finalizeIfClean(git: GitClient, result: { pending: PendingConflict[]; nonMdConflicts: string[] }, commitMessage: string): Promise<MergeResult> {
  if (result.pending.length === 0 && result.nonMdConflicts.length === 0) {
    await git.must(["commit", "-m", commitMessage]);
    return { kind: "committed" };
  }
  return { kind: "conflicts", pending: result.pending, nonMdConflicts: result.nonMdConflicts };
}

// SPEC.md §9.4.
export async function startMerge(
  platform: Platform,
  git: GitClient,
  saveCommit: SaveCommit,
  source: string,
  current: string
): Promise<MergeResult> {
  await saveCommit.flush();
  await git.run(["merge", "--no-ff", "--no-commit", source]);
  const result = await resolveConflicts(platform, git);
  return finalizeIfClean(git, result, `merge: ${source} into ${current}`);
}

// Re-derives conflict state from git directly (SPEC.md §9.4's "resuming a merge after
// restarting the app") rather than relying on any persisted app state. The caller (UI) is
// responsible for knowing which idea it was merging — e.g. by keeping it in AppStore, since git
// itself doesn't expose the source branch name once mid-merge, only MERGE_HEAD's commit sha.
export async function resumeMerge(platform: Platform, git: GitClient, source: string, current: string): Promise<MergeResult> {
  const result = await resolveConflicts(platform, git);
  return finalizeIfClean(git, result, `merge: ${source} into ${current}`);
}

export async function finishMerge(git: GitClient, source: string, current: string): Promise<void> {
  await git.must(["commit", "-m", `merge: ${source} into ${current}`]);
}

export async function abortMerge(git: GitClient): Promise<void> {
  await git.must(["merge", "--abort"]);
}

export async function keepOursNonMd(git: GitClient, file: string): Promise<void> {
  await git.must(["checkout", "--ours", "--", file]);
  await git.must(["add", "--", file]);
}

export async function keepTheirsNonMd(git: GitClient, file: string): Promise<void> {
  await git.must(["checkout", "--theirs", "--", file]);
  await git.must(["add", "--", file]);
}

export async function markResolved(platform: Platform, git: GitClient, file: string, resolvedBody: string, threads: Thread[]): Promise<void> {
  await platform.fs.writeText(git.toAbsolute(file), joinFile(resolvedBody, threads));
  await git.must(["add", "--", file]);
}
