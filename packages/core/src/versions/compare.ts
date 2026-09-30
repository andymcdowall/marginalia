import type { GitClient } from "../git/GitClient.js";
import { resolveBaselineSha, baselineText } from "./baseline.js";

export type ChangeStatus = "M" | "A" | "D";
export type ChangedFile = { path: string; status: ChangeStatus }; // path is repo-relative

function isHidden(rel: string): boolean {
  return rel.split("/").some((segment) => segment.startsWith("."));
}

// Files that differ between an idea's latest commit (`baseIdea`) and the working tree, i.e. the
// checked-out idea plus its unsaved draft. This is a direct (two-dot) comparison: "what is
// different between these two", not a merge-base / pull-request style diff.
export async function listChangedFiles(git: GitClient, baseIdea: string): Promise<ChangedFile[]> {
  const sha = await resolveBaselineSha(git, { kind: "branch", name: baseIdea }, "");
  const byPath = new Map<string, ChangeStatus>();

  const diff = await git.must(["diff", "--name-status", "--no-renames", "-z", sha]);
  const tokens = diff.stdout.split("\0").filter((t) => t !== "");
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const code = tokens[i]![0];
    const rel = tokens[i + 1]!;
    if (code === "A" || code === "D" || code === "M") byPath.set(rel, code);
    else if (code === "T") byPath.set(rel, "M");
  }

  // `git diff <commit>` ignores untracked files, which is how a brand-new note first appears.
  const untracked = await git.must(["ls-files", "--others", "--exclude-standard", "-z"]);
  for (const rel of untracked.stdout.split("\0").filter((t) => t !== "")) {
    if (byPath.has(rel)) continue;
    const inBase = (await git.run(["cat-file", "-e", `${sha}:${rel}`])).code === 0;
    byPath.set(rel, inBase ? "M" : "A");
  }

  return [...byPath.entries()]
    .filter(([rel]) => !isHidden(rel))
    .map(([path, status]) => ({ path, status }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// A file's text at an idea's latest commit; "" if it didn't exist there.
export async function ideaFileText(git: GitClient, idea: string, rel: string): Promise<string> {
  const sha = await resolveBaselineSha(git, { kind: "branch", name: idea }, "");
  return baselineText(git, sha, rel);
}

// The left-hand default: `main` when it exists, otherwise the checked-out idea itself.
export function defaultCompareBase(ideas: readonly string[], current: string): string {
  return ideas.includes("main") ? "main" : current;
}
