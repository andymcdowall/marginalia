import {
  currentBranch as gitCurrentBranch,
  defaultCompareBase,
  draftSummary,
  hasDraftChanges,
  listBranches,
  splitFile,
  switchIdea,
  type Platform,
  type SwitchMode,
} from "@marginalia/core";
import { useStore, fileKindFor } from "./store.js";
import { showPrompt } from "./prompt.js";
import { showChoice } from "./choice.js";
import { editorBridge } from "./editorBridge.js";

const store = () => useStore.getState();

// Re-reads whether the working tree differs from the idea's latest commit, and tells dependents
// (the changed-files list, the compare base text) to re-read git.
export async function refreshDraft(): Promise<void> {
  const ws = store().workspace;
  if (!ws) return;
  const dirty = await hasDraftChanges(ws.git);
  if (store().draftDirty !== dirty) store().setDraftDirty(dirty);
  store().bumpDraftVersion();
}

// Called once per opened workspace: pick the default left-hand idea and read the draft state.
export async function initCompare(): Promise<void> {
  const ws = store().workspace;
  if (!ws) return;
  const names = (await listBranches(ws.git)).map((b) => b.name);
  const base = defaultCompareBase(names, store().currentBranch);
  store().setBaseline({ kind: "branch", name: base }, base);
  await refreshDraft();
}

export async function flushEverything(): Promise<void> {
  await editorBridge.flush?.();
  await store().workspace?.saveCommit.flush();
}

// "Save idea": commit the whole current draft. Returns false if cancelled or blocked.
export async function saveIdea(): Promise<boolean> {
  const ws = store().workspace;
  if (!ws) return false;
  await flushEverything();
  if (await ws.git.isMergeInProgress()) {
    store().addToast("Finish or abort the merge before saving the idea.");
    return false;
  }
  if (await hasDraftChanges(ws.git)) {
    const message = await showPrompt("Save idea — describe your changes:", await draftSummary(ws.git));
    if (!message) return false;
    await ws.saveCommit.commitDraft(message.replace(/\s+/g, " ").trim());
  }
  await refreshDraft();
  return true;
}

async function reopen(platform: Platform, path: string | null): Promise<void> {
  if (!path || !(await platform.fs.exists(path))) return;
  const kind = fileKindFor(path);
  if (kind === "unreadable") {
    store().setUnreadableFile(path);
    return;
  }
  const raw = await platform.fs.readText(path);
  store().workspace?.saveCommit.primeLastSaved(path, raw);
  store().openFileAt(path, kind === "markdown" ? splitFile(raw).threads : [], raw, kind);
}

// The right-hand dropdown: check out another idea. Unsaved changes can be carried over (stash →
// switch → pop) or discarded; a conflicting carry-over falls back to staying put with the draft
// intact.
export async function switchToIdea(platform: Platform, name: string): Promise<void> {
  const ws = store().workspace;
  const from = store().currentBranch;
  if (!ws || name === from) return;

  await flushEverything();
  if (await ws.git.isMergeInProgress()) {
    store().addToast("Finish or abort the merge before switching ideas.");
    return;
  }

  let mode: SwitchMode = "clean";
  if (await hasDraftChanges(ws.git)) {
    const choice = await showChoice(
      "Unsaved changes",
      `"${from}" has unsaved changes. Carry them over to "${name}" (this can conflict), or discard them?`,
      [
        { value: "carry", label: "Carry over" },
        { value: "discard", label: "Discard changes", danger: true },
      ]
    );
    if (choice !== "carry" && choice !== "discard") return;
    mode = choice;
  }

  const openPath = store().openFile?.path ?? store().deletedView;
  store().closeFile();
  // Let React unmount the old editor before files change underneath it.
  await new Promise((resolve) => setTimeout(resolve, 0));
  try {
    const outcome = await switchIdea(ws.git, ws.saveCommit, name, mode);
    if (outcome.kind === "carry-failed") {
      store().addToast(`Couldn't carry your changes over to "${name}"; they are still on "${from}".`, outcome.reason);
    }
  } finally {
    store().setCurrentBranch(await gitCurrentBranch(ws.git));
    await refreshDraft();
    await reopen(platform, openPath);
  }
}
