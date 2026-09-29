import { useEffect, useState } from "react";
import { createBranch, deleteBranch, listBranches, renameBranch, switchBranch, startMerge, type BranchInfo } from "@marginalia/core";
import { usePlatform } from "../platformContext.js";
import { useStore } from "../store.js";

export function BranchMenu({ onClose }: { onClose: () => void }) {
  const platform = usePlatform();
  const workspace = useStore((s) => s.workspace);
  const currentBranch = useStore((s) => s.currentBranch);
  const setCurrentBranch = useStore((s) => s.setCurrentBranch);
  const closeFile = useStore((s) => s.closeFile);
  const setMerge = useStore((s) => s.setMerge);
  const [branches, setBranches] = useState<BranchInfo[]>([]);

  useEffect(() => {
    if (!workspace) return;
    void listBranches(workspace.git).then(setBranches);
  }, [workspace]);

  if (!workspace) return null;

  async function refresh(): Promise<void> {
    setBranches(await listBranches(workspace!.git));
  }

  async function handleSwitch(name: string): Promise<void> {
    if (name === currentBranch) return;
    await switchBranch(workspace!.git, workspace!.saveCommit, name);
    setCurrentBranch(name);
    closeFile(); // SPEC.md §9.3: reload the open file, or close it if absent on the new branch
    onClose();
  }

  async function handleNew(): Promise<void> {
    const name = window.prompt("Name this idea:");
    if (!name) return;
    try {
      await createBranch(workspace!.git, workspace!.saveCommit, name, "HEAD");
      setCurrentBranch(name);
      onClose();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRename(oldName: string): Promise<void> {
    const newName = window.prompt("Rename idea:", oldName);
    if (!newName || newName === oldName) return;
    await renameBranch(workspace!.git, oldName, newName);
    if (currentBranch === oldName) setCurrentBranch(newName);
    await refresh();
  }

  async function handleDelete(name: string): Promise<void> {
    const ok = await platform.dialogs.confirm(`Delete the idea "${name}"? This also deletes its snapshots.`, {
      danger: true,
    });
    if (!ok) return;
    await deleteBranch(workspace!.git, name);
    await refresh();
  }

  async function handleMerge(name: string): Promise<void> {
    onClose();
    await platform.store.set("mergeSource", name);
    const result = await startMerge(platform, workspace!.git, workspace!.saveCommit, name, currentBranch);
    setMerge(name, result);
  }

  return (
    <div className="branch-menu">
      <div className="branch-menu-list">
        {branches.map((b) => (
          <div key={b.name} className={`branch-menu-row${b.name === currentBranch ? " current" : ""}`}>
            <span className="branch-menu-name" onClick={() => void handleSwitch(b.name)} role="button" tabIndex={0}>
              {b.name}
            </span>
            <span className="branch-menu-actions">
              <button type="button" onClick={() => void handleRename(b.name)}>
                Rename
              </button>
              {b.name !== currentBranch && (
                <>
                  <button type="button" onClick={() => void handleMerge(b.name)}>
                    Merge into current
                  </button>
                  <button type="button" onClick={() => void handleDelete(b.name)}>
                    Delete
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      <button type="button" className="branch-menu-new" onClick={() => void handleNew()}>
        {"New idea…"}
      </button>
    </div>
  );
}
