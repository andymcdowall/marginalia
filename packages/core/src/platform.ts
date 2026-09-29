export type DirEntry = { name: string; path: string; kind: "file" | "dir" };
export type FsEvent = { kind: "create" | "modify" | "remove" | "rename"; paths: string[] };
export type Unsubscribe = () => void;

export interface FileSystem {
  // All paths are ABSOLUTE. Implementations MUST reject paths outside the open workspace root
  // (except the app config/cache dirs used by AppStore/PdfRenderer).
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  writeText(path: string, content: string): Promise<void>; // atomic: temp file + rename
  writeBinary(path: string, data: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<DirEntry[]>; // non-recursive
  mkdir(path: string): Promise<void>; // recursive
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>; // file or dir (recursive)
  watch(dir: string, cb: (e: FsEvent) => void): Unsubscribe; // recursive, debounced 200ms
}

export type GitResult = { stdout: string; stderr: string; code: number };
export interface GitRunner {
  run(cwd: string, args: string[], opts?: { stdin?: string }): Promise<GitResult>;
}

export type PdfOptions = { pageSize: "letter" | "a4"; marginPt: number };
export interface PdfRenderer {
  renderHtmlToPdf(html: string, outPath: string, opts: PdfOptions): Promise<void>;
}

export interface Dialogs {
  openFolder(): Promise<string | null>;
  saveFile(opts: { defaultName: string; extensions: string[] }): Promise<string | null>;
  confirm(message: string, opts?: { okLabel?: string; danger?: boolean }): Promise<boolean>;
}

export interface AppStore {
  // app-level settings, JSON in the app config dir
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface Platform {
  fs: FileSystem;
  git: GitRunner;
  pdf: PdfRenderer;
  dialogs: Dialogs;
  store: AppStore;
  resolveAssetUrl(absPath: string): string; // for <img src>, e.g. Tauri convertFileSrc
  openExternal(url: string): Promise<void>;
  onBeforeQuit(cb: () => Promise<void>): Unsubscribe;
}
