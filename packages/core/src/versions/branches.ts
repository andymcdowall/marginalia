import type { GitClient } from "../git/GitClient.js";
import type { SaveCommit } from "./saveCommit.js";
import { listSnapshots } from "./snapshots.js";

export type BranchInfo = { name: string; sha: string; committerDate: string };

const FS = "\x1f";
const RS = "\x1e";

function parseRecords(stdout: string, fieldCount: number): string[][] {
  const out: string[][] = [];
  for (const rawRecord of stdout.split(RS)) {
    const record = rawRecord.replace(/^\n+/, "").trim();
    if (!record) continue;
    const fields = record.split(FS);
    if (fields.length < fieldCount || !fields[0]) continue;
    out.push(fields);
  }
  return out;
}

// SPEC.md §9.3.
export async function listBranches(git: GitClient): Promise<BranchInfo[]> {
  const format = ["%(refname:short)", "%(objectname)", "%(committerdate:iso-strict)"].join(FS) + RS;
  const result = await git.must(["for-each-ref", "refs/heads", `--format=${format}`]);
  return parseRecords(result.stdout, 3).map(([name, sha, committerDate]) => ({
    name: name!,
    sha: sha ?? "",
    committerDate: committerDate ?? "",
  }));
}

export async function currentBranch(git: GitClient): Promise<string> {
  const result = await git.must(["branch", "--show-current"]);
  return result.stdout.trim();
}

export async function createBranch(
  git: GitClient,
  saveCommit: SaveCommit,
  name: string,
  start: string
): Promise<void> {
  const check = await git.run(["check-ref-format", "--branch", name]);
  if (check.code !== 0) {
    throw new Error(`"${name}" is not a valid idea name.`);
  }
  await saveCommit.flush();
  const sha = (await git.must(["rev-parse", `${start}^{commit}`])).stdout.trim();
  await git.must(["switch", "-c", name, sha]);
  await git.must(["config", `branch.${name}.marginaliaBase`, sha]);
}

export async function switchBranch(git: GitClient, saveCommit: SaveCommit, name: string): Promise<void> {
  await saveCommit.flush();
  await git.must(["switch", name]);
}

export async function renameBranch(git: GitClient, oldName: string, newName: string): Promise<void> {
  await git.must(["branch", "-m", oldName, newName]);
  const tags = await listSnapshots(git, oldName);
  for (const tag of tags) {
    const message = tag.body ? `${tag.subject}\n\n${tag.body}` : tag.subject;
    const newTag = `snapshot/${newName}/${tag.slug}`;
    await git.must(["tag", "-a", newTag, "-m", message, tag.objectName]);
    await git.must(["tag", "-d", tag.tag]);
  }
}

// Confirming with the user (and listing the branch's snapshots to them) is a UI-level concern;
// this just performs the deletion once confirmed. Never allowed for the current branch — the
// caller must check that first.
export async function deleteBranch(git: GitClient, name: string): Promise<void> {
  await git.must(["branch", "-D", name]);
  const tags = await listSnapshots(git, name);
  for (const tag of tags) {
    await git.run(["tag", "-d", tag.tag]);
  }
  await git.run(["config", "--remove-section", `branch.${name}`]); // ignore errors
}
