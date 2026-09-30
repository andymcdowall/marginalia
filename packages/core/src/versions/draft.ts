import type { GitClient } from "../git/GitClient.js";
import type { SaveCommit } from "./saveCommit.js";

// The "current draft" is whatever differs between the working tree and the checked-out idea's
// latest commit (modified, added, deleted, and untracked files).
export async function hasDraftChanges(git: GitClient): Promise<boolean> {
  const result = await git.must(["status", "--porcelain"]);
  return result.stdout.trim() !== "";
}

// A one-line default commit message naming the changed files, e.g. "Update a.md, b.md and 2 more".
export async function draftSummary(git: GitClient): Promise<string> {
  const result = await git.must(["status", "--porcelain", "-uall"]);
  const names = result.stdout
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => {
      const p = line.slice(3).replace(/^"|"$/g, "");
      return p.slice(p.lastIndexOf("/") + 1);
    });
  if (names.length === 0) return "Update";
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `Update ${shown} and ${names.length - 3} more` : `Update ${shown}`;
}

// Throws away every uncommitted change, including untracked files. Destructive — callers confirm
// with the user first.
export async function discardDraft(git: GitClient, saveCommit: SaveCommit): Promise<void> {
  await saveCommit.flush();
  await git.must(["reset", "--hard", "HEAD"]);
  await git.must(["clean", "-fd"]);
  saveCommit.clearLastSaved();
}

export type SwitchMode = "clean" | "carry" | "discard";

export type SwitchOutcome =
  // `carried` is true when the draft was stashed and re-applied on the target idea.
  | { kind: "switched"; carried: boolean }
  // Carrying the draft over conflicted: we went back to the original idea with the draft intact.
  | { kind: "carry-failed"; reason: string };

// Switches the checked-out idea. The caller has already flushed pending autosaves.
//  - "clean":   the working tree has no changes (plain `git switch`).
//  - "discard": drop the draft first.
//  - "carry":   `git stash push -u`, switch, `git stash pop`. If the pop conflicts, undo the
//               switch and restore the draft on the original idea rather than leaving conflict
//               markers behind — the draft must never be lost.
export async function switchIdea(
  git: GitClient,
  saveCommit: SaveCommit,
  target: string,
  mode: SwitchMode
): Promise<SwitchOutcome> {
  await saveCommit.flush();
  if (mode === "discard") await discardDraft(git, saveCommit);

  if (mode !== "carry") {
    await git.must(["switch", target]);
    saveCommit.clearLastSaved();
    return { kind: "switched", carried: false };
  }

  const original = (await git.must(["branch", "--show-current"])).stdout.trim();
  await git.must(["stash", "push", "-u", "-m", "marginalia: carry draft"]);
  const switched = await git.run(["switch", target]);
  if (switched.code !== 0) {
    await git.must(["stash", "pop"]);
    saveCommit.clearLastSaved();
    return { kind: "carry-failed", reason: switched.stderr.trim() };
  }

  const popped = await git.run(["stash", "pop"]);
  if (popped.code === 0) {
    saveCommit.clearLastSaved();
    return { kind: "switched", carried: true };
  }

  // The tree was clean before the pop, so resetting returns it to exactly the target's tip. The
  // stash entry is kept by git on a failed pop.
  await git.must(["reset", "--hard", "HEAD"]);
  await git.must(["clean", "-fd"]);
  await git.must(["switch", original]);
  await git.must(["stash", "pop"]);
  saveCommit.clearLastSaved();
  return { kind: "carry-failed", reason: popped.stderr.trim() || popped.stdout.trim() };
}
