import { useEffect, useState } from "react";
import { createBranch, deleteBranch, listBranches, renameBranch, startMerge, type BranchInfo } from "@marginalia/core";
import { usePlatform } from "../platformContext.js";
import { useStore } from "../store.js";
import { showPrompt } from "../prompt.js";
import { refreshDraft, saveIdea, switchToIdea } from "../ideaActions.js";

export function BranchMenu({ onClose }: { onClose: () => void }) {
  const platform = usePlatform();
  const workspace = useStore((s) => s.workspace);
  const currentBranch = useStore((s) => s.currentBranch);
  const setCurrentBranch = useStore((s) => s.setCurrentBranch);
  const setMerge = useStore((s) => s.setMerge);
  const addToast = useStore((s) => s.addToast);
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
    onClose();
    await switchToIdea(platform, name); // handles unsaved changes; reopens the file if it still exists
  }

  async function handleNew(): Promise<void> {
    const name = await showPrompt("Name this idea:");
    if (!name) return;
    try {
      await createBranch(workspace!.git, workspace!.saveCommit, name, "HEAD"); // keeps the draft
      setCurrentBranch(name);
      await refreshDraft();
      onClose();
    } catch (e) {
      addToast(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRename(oldName: string): Promise<void> {
    const newName = await showPrompt("Rename idea:", oldName);
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
    // A merge needs a clean tree, so the draft has to be saved (committed) first.
    if (useStore.getState().draftDirty && !(await saveIdea())) return;
    await platform.store.set("mergeSource", name);
    const result = await startMerge(platform, workspace!.git, workspace!.saveCommit, name, currentBranch);
    setMerge(name, result);
    await refreshDraft();
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
