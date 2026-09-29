import { useEffect, useState } from "react";
import {
  createBranch,
  fileHistory,
  groupHistory,
  listSnapshots,
  restoreToVersion,
  splitFile,
  type HistoryRow,
} from "@marginalia/core";
import { useStore } from "../store.js";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function HistoryPanel() {
  const workspace = useStore((s) => s.workspace);
  const openFile = useStore((s) => s.openFile);
  const currentBranch = useStore((s) => s.currentBranch);
  const setCurrentBranch = useStore((s) => s.setCurrentBranch);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [viewingSha, setViewingSha] = useState<string | null>(null);
  const [viewingText, setViewingText] = useState<string>("");

  const relPath = workspace && openFile ? workspace.git.toRelative(openFile.path) : null;

  useEffect(() => {
    if (!workspace || !relPath) {
      setRows([]);
      return;
    }
    void (async () => {
      const commits = await fileHistory(workspace.git, relPath);
      const snapshots = await listSnapshots(workspace.git, currentBranch);
      const bySha = new Map(snapshots.map((s) => [s.objectName, s]));
      setRows(groupHistory(commits, bySha));
    })();
  }, [workspace, relPath, currentBranch, openFile?.dirty]);

  if (!workspace || !openFile || !relPath) {
    return <div className="history-panel-empty">No file open.</div>;
  }

  async function handleView(sha: string): Promise<void> {
    if (viewingSha === sha) {
      setViewingSha(null);
      return;
    }
    const result = await workspace!.git.run(["show", `${sha}:${relPath}`]);
    setViewingText(result.code === 0 ? splitFile(result.stdout).body : "(file did not exist at this version)");
    setViewingSha(sha);
  }

  async function handleRestore(sha: string, label: string): Promise<void> {
    const ok = await window.confirm(`Restore ${relPath} to "${label}"? This creates a new commit.`);
    if (!ok) return;
    await restoreToVersion(workspace!.git, workspace!.saveCommit, openFile!.path, sha, label);
    window.location.reload();
  }

  async function handleStartIdea(sha: string): Promise<void> {
    const name = window.prompt("Name the new idea:");
    if (!name) return;
    await createBranch(workspace!.git, workspace!.saveCommit, name, sha);
    setCurrentBranch(name);
  }

  return (
    <div className="history-panel">
      <div className="history-panel-title">History</div>
      {rows.length === 0 && <div className="history-panel-empty">No history yet.</div>}
      {rows.map((row, i) => {
        if (row.kind === "autosave-group") {
          const head = row.commits[0]!;
          return (
            <div key={head.sha} className="history-row history-row-autosave">
              <div>
                {row.commits.length} autosaves, {formatDate(row.firstDate)}
                {" – "}
                {formatDate(row.lastDate)}
              </div>
              <RowActions
                sha={head.sha}
                label="autosaves"
                onView={handleView}
                onRestore={handleRestore}
                onStartIdea={handleStartIdea}
              />
              {viewingSha === head.sha && <pre className="history-preview">{viewingText}</pre>}
            </div>
          );
        }
        if (row.kind === "snapshot") {
          return (
            <div key={row.commit.sha} className="history-row history-row-snapshot">
              <div>
                {"📷 "}
                {row.snapshot.subject}
              </div>
              <RowActions
                sha={row.commit.sha}
                label={row.snapshot.subject}
                onView={handleView}
                onRestore={handleRestore}
                onStartIdea={handleStartIdea}
              />
              {viewingSha === row.commit.sha && <pre className="history-preview">{viewingText}</pre>}
            </div>
          );
        }
        if (row.kind === "merge") {
          return (
            <div key={row.commit.sha} className="history-row history-row-merge">
              <div>
                {"⎇ "}
                {row.commit.subject}
              </div>
            </div>
          );
        }
        return (
          <div key={row.commit.sha ?? i} className="history-row">
            <div>{row.commit.subject}</div>
            <RowActions
              sha={row.commit.sha}
              label={row.commit.subject}
              onView={handleView}
              onRestore={handleRestore}
              onStartIdea={handleStartIdea}
            />
            {viewingSha === row.commit.sha && <pre className="history-preview">{viewingText}</pre>}
          </div>
        );
      })}
    </div>
  );
}

function RowActions({
  sha,
  label,
  onView,
  onRestore,
  onStartIdea,
}: {
  sha: string;
  label: string;
  onView: (sha: string) => void;
  onRestore: (sha: string, label: string) => void;
  onStartIdea: (sha: string) => void;
}) {
  return (
    <div className="history-row-actions">
      <button type="button" onClick={() => onView(sha)}>
        View
      </button>
      <button type="button" onClick={() => onRestore(sha, label)}>
        Restore
      </button>
      <button type="button" onClick={() => onStartIdea(sha)}>
        Start new idea from here
      </button>
    </div>
  );
}
