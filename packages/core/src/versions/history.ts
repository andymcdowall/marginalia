import type { GitClient } from "../git/GitClient.js";
import type { SnapshotInfo } from "./snapshots.js";

export type CommitEntry = { sha: string; parents: string[]; date: string; subject: string };

export type HistoryRow =
  | { kind: "commit"; commit: CommitEntry }
  | { kind: "autosave-group"; commits: CommitEntry[]; firstDate: string; lastDate: string }
  | { kind: "snapshot"; commit: CommitEntry; snapshot: SnapshotInfo }
  | { kind: "merge"; commit: CommitEntry };

const FS = "\x1f";
const RS = "\x1e";

// SPEC.md §9.5.
export async function fileHistory(git: GitClient, relPath: string): Promise<CommitEntry[]> {
  const format = ["%H", "%P", "%aI", "%s"].join(FS) + RS;
  const result = await git.must(["log", `--format=${format}`, "--", relPath]);

  const out: CommitEntry[] = [];
  for (const rawRecord of result.stdout.split(RS)) {
    const record = rawRecord.replace(/^\n+/, "").trim();
    if (!record) continue;
    const [sha, parents, date, subject] = record.split(FS);
    if (!sha) continue;
    out.push({ sha, parents: parents ? parents.split(" ").filter(Boolean) : [], date: date ?? "", subject: subject ?? "" });
  }
  return out;
}

// Groups consecutive `autosave:` commits into one row, marks snapshots (by peeled sha) and merge
// commits (2+ parents). `commits` must be in git log's default newest-first order.
export function groupHistory(commits: CommitEntry[], snapshotsBySha: ReadonlyMap<string, SnapshotInfo>): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let buffer: CommitEntry[] = [];

  function flush(): void {
    if (buffer.length === 0) return;
    if (buffer.length === 1) {
      rows.push({ kind: "commit", commit: buffer[0]! });
    } else {
      rows.push({
        kind: "autosave-group",
        commits: buffer,
        firstDate: buffer[buffer.length - 1]!.date,
        lastDate: buffer[0]!.date,
      });
    }
    buffer = [];
  }

  for (const commit of commits) {
    const snapshot = snapshotsBySha.get(commit.sha);
    if (snapshot) {
      flush();
      rows.push({ kind: "snapshot", commit, snapshot });
      continue;
    }
    if (commit.parents.length >= 2) {
      flush();
      rows.push({ kind: "merge", commit });
      continue;
    }
    if (commit.subject.startsWith("autosave:")) {
      buffer.push(commit);
      continue;
    }
    flush();
    rows.push({ kind: "commit", commit });
  }
  flush();
  return rows;
}
