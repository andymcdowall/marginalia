import { useEffect } from "react";
import { listTree, splitFile } from "@marginalia/core";
import { usePlatform } from "../platformContext.js";
import { useStore } from "../store.js";

function Node({ dir, path, name, depth }: { dir: boolean; path: string; name: string; depth: number }) {
  const platform = usePlatform();
  const expanded = useStore((s) => s.expandedDirs.has(path));
  const children = useStore((s) => s.tree[path]);
  const toggleDir = useStore((s) => s.toggleDir);
  const setTreeEntries = useStore((s) => s.setTreeEntries);
  const openFileAt = useStore((s) => s.openFileAt);

  useEffect(() => {
    if (dir && expanded && !children) {
      listTree(platform, path).then((entries) => setTreeEntries(path, entries));
    }
  }, [dir, expanded, children, path, platform, setTreeEntries]);

  async function handleClick(): Promise<void> {
    if (dir) {
      toggleDir(path);
      return;
    }
    const raw = await platform.fs.readText(path);
    const parsed = splitFile(raw);
    openFileAt(path, parsed.threads, raw);
  }

  return (
    <div>
      <div
        className="file-tree-row"
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={handleClick}
        role="button"
        tabIndex={0}
      >
        {dir ? (expanded ? "▾ " : "▸ ") : " "}
        {name}
      </div>
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
  const rootEntries = useStore((s) => s.tree[root]);
  const setTreeEntries = useStore((s) => s.setTreeEntries);

  useEffect(() => {
    if (!rootEntries) {
      listTree(platform, root).then((entries) => setTreeEntries(root, entries));
    }
  }, [root, rootEntries, platform, setTreeEntries]);

  if (!rootEntries) return <div className="file-tree-empty">Loading…</div>;

  return (
    <div className="file-tree">
      {rootEntries.map((entry) => (
        <Node key={entry.path} dir={entry.kind === "dir"} path={entry.path} name={entry.name} depth={0} />
      ))}
    </div>
  );
}
