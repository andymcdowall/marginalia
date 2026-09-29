import { useEffect, useState } from "react";
import { listTree, splitFile, createNote, createFolder, renameEntry, removeEntry, moveEntry } from "@marginalia/core";
import { usePlatform } from "../platformContext.js";
import { useStore } from "../store.js";

function dirOf(p: string): string {
  return p.slice(0, p.lastIndexOf("/"));
}

function Node({ dir, path, name, depth }: { dir: boolean; path: string; name: string; depth: number }) {
  const platform = usePlatform();
  const workspace = useStore((s) => s.workspace);
  const expanded = useStore((s) => s.expandedDirs.has(path));
  const children = useStore((s) => s.tree[path]);
  const toggleDir = useStore((s) => s.toggleDir);
  const setTreeEntries = useStore((s) => s.setTreeEntries);
  const openFileAt = useStore((s) => s.openFileAt);
  const openFile = useStore((s) => s.openFile);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (dir && expanded && !children) {
      void listTree(platform, path).then((entries) => setTreeEntries(path, entries));
    }
  }, [dir, expanded, children, path, platform, setTreeEntries]);

  async function refreshParent(): Promise<void> {
    const parent = dirOf(path);
    setTreeEntries(parent, await listTree(platform, parent));
  }

  async function handleClick(): Promise<void> {
    if (dir) {
      toggleDir(path);
      return;
    }
    const raw = await platform.fs.readText(path);
    const parsed = splitFile(raw);
    openFileAt(path, parsed.threads, raw);
  }

  async function handleRename(): Promise<void> {
    setMenuOpen(false);
    if (!workspace) return;
    const newName = window.prompt("Rename to:", name);
    if (!newName || newName === name) return;
    await renameEntry(platform, workspace.git, path, newName);
    await refreshParent();
  }

  async function handleDelete(): Promise<void> {
    setMenuOpen(false);
    if (!workspace) return;
    const ok = await platform.dialogs.confirm(`Delete "${name}"?`, { danger: true });
    if (!ok) return;
    await removeEntry(platform, workspace.git, path);
    if (openFile?.path === path) useStore.getState().closeFile();
    await refreshParent();
  }

  function handleDragStart(e: React.DragEvent): void {
    e.dataTransfer.setData("text/marginalia-path", path);
  }

  async function handleDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault();
    setDragOver(false);
    if (!dir || !workspace) return;
    const draggedPath = e.dataTransfer.getData("text/marginalia-path");
    if (!draggedPath || draggedPath === path) return;
    await moveEntry(platform, workspace.git, draggedPath, path);
    await Promise.all([refreshParent(), listTree(platform, path).then((entries) => setTreeEntries(path, entries))]);
  }

  return (
    <div>
      <div
        className={`file-tree-row${dragOver ? " drag-over" : ""}`}
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={() => void handleClick()}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={(e) => {
          if (dir) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => void handleDrop(e)}
        role="button"
        tabIndex={0}
      >
        {dir ? (expanded ? "▾ " : "▸ ") : " "}
        {name}
      </div>
      {menuOpen && (
        <div className="file-tree-context-menu" style={{ paddingLeft: `${depth * 16 + 16}px` }}>
          <button type="button" onClick={() => void handleRename()}>
            Rename
          </button>
          <button type="button" onClick={() => void handleDelete()}>
            Delete
          </button>
          <button type="button" onClick={() => setMenuOpen(false)}>
            Cancel
          </button>
        </div>
      )}
      {dir && expanded && children && (
        <div>
          {children.map((c) => (
            <Node key={c.path} dir={c.kind === "dir"} path={c.path} name={c.name} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ root }: { root: string }) {
  const platform = usePlatform();
  const workspace = useStore((s) => s.workspace);
  const rootEntries = useStore((s) => s.tree[root]);
  const setTreeEntries = useStore((s) => s.setTreeEntries);
  const openFileAt = useStore((s) => s.openFileAt);

  useEffect(() => {
    if (!rootEntries) {
      void listTree(platform, root).then((entries) => setTreeEntries(root, entries));
    }
  }, [root, rootEntries, platform, setTreeEntries]);

  async function refreshRoot(): Promise<void> {
    setTreeEntries(root, await listTree(platform, root));
  }

  async function handleNewNote(): Promise<void> {
    if (!workspace) return;
    const filePath = await createNote(platform, workspace.git, root);
    await refreshRoot();
    openFileAt(filePath, [], "");
  }

  async function handleNewFolder(): Promise<void> {
    if (!workspace) return;
    await createFolder(platform, workspace.git, root);
    await refreshRoot();
  }

  if (!rootEntries) return <div className="file-tree-empty">Loading…</div>;

  return (
    <div className="file-tree">
      <div className="file-tree-toolbar">
        <button type="button" onClick={() => void handleNewNote()} title="New note">
          {"+ Note"}
        </button>
        <button type="button" onClick={() => void handleNewFolder()} title="New folder">
          {"+ Folder"}
        </button>
      </div>
      {rootEntries.map((entry) => (
        <Node key={entry.path} dir={entry.kind === "dir"} path={entry.path} name={entry.name} depth={0} />
      ))}
    </div>
  );
}
