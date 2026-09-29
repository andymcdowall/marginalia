import type { Platform } from "../platform.js";
import type { GitClient } from "../git/GitClient.js";

// SPEC.md §9.1. Saves are serialized through a single promise queue per instance, so git commands
// never overlap.
export class SaveCommit {
  private readonly lastSaved = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly platform: Platform,
    private readonly git: GitClient
  ) {}

  // Lets a caller (e.g. after opening a file) record what's already on disk without writing or
  // committing, so the next real save can correctly detect "no change."
  primeLastSaved(path: string, content: string): void {
    this.lastSaved.set(path, content);
  }

  save(path: string, content: string, message?: string): Promise<void> {
    this.queue = this.queue.then(() => this.doSave(path, content, message));
    return this.queue;
  }

  // Waits for any in-flight save to finish. Version-affecting actions (snapshot, branch switch,
  // etc.) call this first so they never race an autosave commit.
  flush(): Promise<void> {
    return this.queue;
  }

  private async doSave(path: string, content: string, message?: string): Promise<void> {
    if (this.lastSaved.get(path) === content) return;

    await this.platform.fs.writeText(path, content);
    this.lastSaved.set(path, content);

    if (await this.git.isMergeInProgress()) return;

    const rel = this.git.toRelative(path);
    await this.git.must(["add", "--", rel]);

    const diff = await this.git.run(["diff", "--cached", "--quiet", "--", rel]);
    if (diff.code === 0) return; // nothing staged

    await this.git.must(["commit", "-m", message ?? `autosave: ${rel}`, "--", rel]);
  }
}
