import * as fsp from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type {
  AppStore,
  Dialogs,
  DirEntry,
  FileSystem,
  FsEvent,
  GitResult,
  GitRunner,
  PdfRenderer,
  Platform,
  Unsubscribe,
} from "@marginalia/core";

const NOT_SUPPORTED = "not supported in tests";

async function atomicWrite(filePath: string, data: Uint8Array | string): Promise<void> {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${Math.random().toString(36).slice(2)}`);
  if (typeof data === "string") {
    await fsp.writeFile(tmp, data, "utf8");
  } else {
    await fsp.writeFile(tmp, data);
  }
  await fsp.rename(tmp, filePath);
}

class NodeFileSystem implements FileSystem {
  async readText(p: string): Promise<string> {
    return fsp.readFile(p, "utf8");
  }
  async readBinary(p: string): Promise<Uint8Array> {
    return new Uint8Array(await fsp.readFile(p));
  }
  async writeText(p: string, content: string): Promise<void> {
    await atomicWrite(p, content);
  }
  async writeBinary(p: string, data: Uint8Array): Promise<void> {
    await atomicWrite(p, data);
  }
  async exists(p: string): Promise<boolean> {
    try {
      await fsp.access(p);
      return true;
    } catch {
      return false;
    }
  }
  async list(dir: string): Promise<DirEntry[]> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      path: path.join(dir, e.name),
      kind: e.isDirectory() ? "dir" : "file",
    }));
  }
  async mkdir(p: string): Promise<void> {
    await fsp.mkdir(p, { recursive: true });
  }
  async rename(from: string, to: string): Promise<void> {
    await fsp.rename(from, to);
  }
  async remove(p: string): Promise<void> {
    await fsp.rm(p, { recursive: true, force: true });
  }
  watch(dir: string, cb: (e: FsEvent) => void): Unsubscribe {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: Set<string> = new Set();
    const watcher = fsSync.watch(dir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      pending.add(path.join(dir, filename.toString()));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const paths = Array.from(pending);
        pending = new Set();
        cb({ kind: "modify", paths });
      }, 200);
    });
    return () => {
      if (timer) clearTimeout(timer);
      watcher.close();
    };
  }
}

class NodeGitRunner implements GitRunner {
  async run(cwd: string, args: string[], opts?: { stdin?: string }): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", args, {
        cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", reject);
      child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
      if (opts?.stdin !== undefined) {
        child.stdin.write(opts.stdin);
      }
      child.stdin.end();
    });
  }
}

class NodeAppStore implements AppStore {
  constructor(private readonly filePath: string) {}
  private async readAll(): Promise<Record<string, unknown>> {
    try {
      const text = await fsp.readFile(this.filePath, "utf8");
      return text.trim() ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  }
  async get<T>(key: string): Promise<T | undefined> {
    const all = await this.readAll();
    return all[key] as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    const all = await this.readAll();
    all[key] = value;
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    await atomicWrite(this.filePath, JSON.stringify(all, null, 2));
  }
}

class UnsupportedPdfRenderer implements PdfRenderer {
  async renderHtmlToPdf(): Promise<void> {
    throw new Error(NOT_SUPPORTED);
  }
}

class UnsupportedDialogs implements Dialogs {
  async openFolder(): Promise<string | null> {
    throw new Error(NOT_SUPPORTED);
  }
  async saveFile(): Promise<string | null> {
    throw new Error(NOT_SUPPORTED);
  }
  async confirm(): Promise<boolean> {
    throw new Error(NOT_SUPPORTED);
  }
}

export function createNodePlatform(storePath: string): Platform {
  return {
    fs: new NodeFileSystem(),
    git: new NodeGitRunner(),
    pdf: new UnsupportedPdfRenderer(),
    dialogs: new UnsupportedDialogs(),
    store: new NodeAppStore(storePath),
    resolveAssetUrl(): string {
      throw new Error(NOT_SUPPORTED);
    },
    async openExternal(): Promise<void> {
      throw new Error(NOT_SUPPORTED);
    },
    onBeforeQuit(_cb: () => Promise<void>): Unsubscribe {
      return () => {};
    },
  };
}
