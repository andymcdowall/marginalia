import type { GitClient } from "../git/GitClient.js";

export type Baseline =
  | { kind: "origin" }
  | { kind: "snapshot"; tag: string }
  | { kind: "branch"; name: string } // re-resolved after every commit by the caller
  | { kind: "commit"; sha: string };

// SPEC.md §9.6.
export async function resolveBaselineSha(git: GitClient, baseline: Baseline, currentBranchName: string): Promise<string> {
  switch (baseline.kind) {
    case "origin": {
      const configured = await git.run(["config", `branch.${currentBranchName}.marginaliaBase`]);
      if (configured.code === 0 && configured.stdout.trim()) return configured.stdout.trim();

      const mergeBase = await git.run(["merge-base", "HEAD", "main"]);
      if (mergeBase.code === 0 && mergeBase.stdout.trim()) return mergeBase.stdout.trim();

      const root = await git.must(["rev-list", "--max-parents=0", "HEAD"]);
      const lines = root.stdout.trim().split("\n").filter(Boolean);
      return lines[lines.length - 1]!;
    }
    case "snapshot":
      return (await git.must(["rev-parse", `${baseline.tag}^{commit}`])).stdout.trim();
    case "branch":
      return (await git.must(["rev-parse", baseline.name])).stdout.trim();
    case "commit":
      return baseline.sha;
  }
}

// Returns "" if the file didn't exist at that point in history.
export async function baselineText(git: GitClient, sha: string, relPath: string): Promise<string> {
  const result = await git.run(["show", `${sha}:${relPath}`]);
  return result.code === 0 ? result.stdout : "";
}
