import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, save as saveDialog, confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  AppStore,
  Dialogs,
  DirEntry,
  FileSystem,
  FsEvent,
  GitResult,
  GitRunner,
  PdfOptions,
  PdfRenderer,
  Platform,
  Unsubscribe,
} from "@marginalia/core";

class TauriFileSystem implements FileSystem {
  async readText(path: string): Promise<string> {
    return invoke("fs_read_text", { path });
  }
  async readBinary(path: string): Promise<Uint8Array> {
    const bytes = await invoke<number[]>("fs_read_binary", { path });
    return new Uint8Array(bytes);
  }
  async writeText(path: string, content: string): Promise<void> {
    await invoke("fs_write_text", { path, content });
  }
  async writeBinary(path: string, data: Uint8Array): Promise<void> {
    await invoke("fs_write_binary", { path, content: Array.from(data) });
  }
  async writeExportText(path: string, content: string): Promise<void> {
    await invoke("fs_write_export_text", { path, content });
  }
  async exists(path: string): Promise<boolean> {
    return invoke("fs_exists", { path });
  }
  async list(dir: string): Promise<DirEntry[]> {
    return invoke("fs_list", { dir });
  }
  async mkdir(path: string): Promise<void> {
    await invoke("fs_mkdir", { path });
  }
  async rename(from: string, to: string): Promise<void> {
    await invoke("fs_rename", { from, to });
  }
  async remove(path: string): Promise<void> {
    await invoke("fs_remove", { path });
  }
  watch(dir: string, cb: (e: FsEvent) => void): Unsubscribe {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    invoke("watch_start", { root: dir }).catch(() => {});
    listen<FsEvent>("fs-change", (event) => cb(event.payload)).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
      invoke("watch_stop").catch(() => {});
    };
  }
}

class TauriGitRunner implements GitRunner {
  async run(cwd: string, args: string[], opts?: { stdin?: string }): Promise<GitResult> {
    return invoke("git_run", { cwd, args, stdin: opts?.stdin });
  }
}

class TauriAppStore implements AppStore {
  async get<T>(key: string): Promise<T | undefined> {
    const value = await invoke<T | null>("store_get", { key });
    return value ?? undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    await invoke("store_set", { key, value });
  }
}

class TauriPdfRenderer implements PdfRenderer {
  async renderHtmlToPdf(html: string, outPath: string, opts: PdfOptions): Promise<void> {
    await invoke("pdf_render", { html, outPath, pageSize: opts.pageSize, marginPt: opts.marginPt });
  }
}

export async function setWorkspaceRoot(root: string): Promise<void> {
  await invoke("set_workspace", { root });
}

class TauriDialogs implements Dialogs {
  async openFolder(): Promise<string | null> {
    const result = await openDialog({ directory: true, multiple: false });
    if (typeof result !== "string") return null;
    await setWorkspaceRoot(result);
    return result;
  }
  async saveFile(opts: { defaultName: string; extensions: string[] }): Promise<string | null> {
    const result = await saveDialog({
      defaultPath: opts.defaultName,
      filters: [{ name: "Export", extensions: opts.extensions }],
    });
    return result ?? null;
  }
  async confirm(message: string, opts?: { okLabel?: string; danger?: boolean }): Promise<boolean> {
    return confirmDialog(message, {
      okLabel: opts?.okLabel,
      kind: opts?.danger ? "warning" : "info",
    });
  }
}

export function createTauriPlatform(): Platform {
  const beforeQuitCallbacks: Array<() => Promise<void>> = [];
  let listening = false;

  function ensureBeforeQuitListener(): void {
    if (listening) return;
    listening = true;
    listen("before-quit", () => {
      void (async () => {
        for (const cb of beforeQuitCallbacks) {
          await cb();
        }
        await invoke("quit_now");
      })();
    });
  }

  return {
    fs: new TauriFileSystem(),
    git: new TauriGitRunner(),
    pdf: new TauriPdfRenderer(),
    dialogs: new TauriDialogs(),
    store: new TauriAppStore(),
    resolveAssetUrl(absPath: string): string {
      return convertFileSrc(absPath);
    },
    async openExternal(url: string): Promise<void> {
      await openUrl(url);
    },
    onBeforeQuit(cb: () => Promise<void>): Unsubscribe {
      ensureBeforeQuitListener();
      beforeQuitCallbacks.push(cb);
      return () => {
        const i = beforeQuitCallbacks.indexOf(cb);
        if (i !== -1) beforeQuitCallbacks.splice(i, 1);
      };
    },
  };
}
