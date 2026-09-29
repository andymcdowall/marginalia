import type { GitResult, Platform } from "../platform.js";

export type GitError = Error & { args: string[]; code: number; stderr: string };

export function makeGitError(args: string[], code: number, stderr: string): GitError {
  const err = new Error(`git ${args.join(" ")} failed (${code}): ${stderr.trim()}`) as GitError;
  err.name = "GitError";
  err.args = args;
  err.code = code;
  err.stderr = stderr;
  return err;
}

// SPEC.md §9: wraps platform.git.run with the standard flags, and throws GitError on unexpected
// non-zero exits. `run()` never throws — callers that expect specific non-zero codes (existence
// checks, etc.) use it directly; `must()` is for commands that should always succeed.
export class GitClient {
  constructor(
    private readonly platform: Platform,
    public readonly repoRoot: string
  ) {}

  async run(args: string[], opts?: { stdin?: string }): Promise<GitResult> {
    return this.platform.git.run(this.repoRoot, ["-c", "core.quotepath=false", "-c", "color.ui=never", ...args], opts);
  }

  async must(args: string[], opts?: { stdin?: string }): Promise<GitResult> {
    const result = await this.run(args, opts);
    if (result.code !== 0) throw makeGitError(args, result.code, result.stderr);
    return result;
  }

  // Absolute paths in, repo-relative paths out (macOS only, forward slashes — SPEC.md §2.1).
  toRelative(absPath: string): string {
    const root = this.repoRoot.endsWith("/") ? this.repoRoot : `${this.repoRoot}/`;
    if (!absPath.startsWith(root)) {
      throw new Error(`path ${absPath} is not inside repo root ${this.repoRoot}`);
    }
    return absPath.slice(root.length);
  }

  toAbsolute(relPath: string): string {
    const root = this.repoRoot.endsWith("/") ? this.repoRoot : `${this.repoRoot}/`;
    return `${root}${relPath}`;
  }

  async isMergeInProgress(): Promise<boolean> {
    return this.platform.fs.exists(this.toAbsolute(".git/MERGE_HEAD"));
  }
}
