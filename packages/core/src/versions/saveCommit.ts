import type { Platform } from "../platform.js";
import type { GitClient } from "../git/GitClient.js";

// SPEC.md §9.1. Autosave (`save`) only writes the file: edits stay in the "current draft" (the
// working tree) until the user saves the idea (`commitDraft`), which is what creates a commit.
// All operations are serialized through a single promise queue per instance, so git commands
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

  // Writes the file to disk. Never commits.
  save(path: string, content: string): Promise<void> {
    return this.enqueue(() => this.doWrite(path, content));
  }

  // Writes the file and commits just that file. Used by tests and by restore-style actions that
  // want a single-file commit; ordinary editing goes through `save` + `commitDraft`.
  saveAndCommit(path: string, content: string, message?: string): Promise<void> {
    return this.enqueue(async () => {
      await this.doWrite(path, content);
      if (await this.git.isMergeInProgress()) return; // no commits during a merge
      const rel = this.git.toRelative(path);
      await this.git.must(["add", "--", rel]);
      const diff = await this.git.run(["diff", "--cached", "--quiet", "--", rel]);
      if (diff.code === 0) return; // nothing staged
      await this.git.must(["commit", "-m", message ?? `autosave: ${rel}`, "--", rel]);
    });
  }

  // "Save idea": commits the whole current draft (every change in the working tree, including new
  // and deleted files). Returns false if there was nothing to commit.
  commitDraft(message: string): Promise<boolean> {
    let committed = false;
    return this.enqueue(async () => {
      if (await this.git.isMergeInProgress()) return; // the merge flow owns its own commit
      await this.git.must(["add", "-A"]);
      const diff = await this.git.run(["diff", "--cached", "--quiet"]);
      if (diff.code === 0) return;
      await this.git.must(["commit", "-m", message]);
      committed = true;
    }).then(() => committed);
  }

  // Forget what we believe is on disk. Call after anything that rewrites files behind our back
  // (checkout, discard, stash pop), otherwise a later save could be skipped as "unchanged."
  clearLastSaved(): void {
    this.lastSaved.clear();
  }

  // Waits for any in-flight save to finish. Version-affecting actions (snapshot, branch switch,
  // etc.) call this first so they never race an autosave.
  flush(): Promise<void> {
    return this.queue;
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    // A failed task must not poison the queue for the next one.
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async doWrite(path: string, content: string): Promise<void> {
    if (this.lastSaved.get(path) === content) return;
    await this.platform.fs.writeText(path, content);
    this.lastSaved.set(path, content);
  }
}
