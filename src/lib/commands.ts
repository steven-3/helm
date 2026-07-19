/* ══════════════════════════════════════════════════════════════════════════
   helm — typed Tauri command surface (the invoke() seam).

   Track A implements the matching #[tauri::command] on the Rust side. INTEROP
   RULES Track A must honor:
   • Command arg keys here are camelCase; Tauri v2 auto-maps them to snake_case
     Rust params (paneId → pane_id).
   • The `opts`/`PtySpawnOpts` STRUCT is serde-deserialized, NOT arg-mapped — so
     its Rust struct needs  #[serde(rename_all = "camelCase")]  to accept paneId.
   • pty output rides a per-spawn Channel<PtyEvent>; Rust must send exactly the
     tagged {type:"data",bytes:[…]} / {type:"exit",code} variants (contract.ts).
   clipboard + opener are backed by official Tauri plugins (cross-platform), so
   Track A does NOT need Rust commands for them — the seam is the fn names below.
   ══════════════════════════════════════════════════════════════════════════ */
import { Channel, invoke } from "@tauri-apps/api/core";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  PtySpawnOpts,
  PtyEvent,
  DirEntry,
  FileRead,
  ImageRead,
  EnvInfo,
  GitStatus,
} from "./contract";

/** Handle returned by ptySpawn so callers write/resize/kill by paneId. */
export interface PtyHandle {
  paneId: string;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  kill: () => Promise<void>;
}

export async function ptySpawn(
  opts: PtySpawnOpts,
  onData: (bytes: Uint8Array) => void,
  onExit?: (code: number | null) => void,
): Promise<PtyHandle> {
  const channel = new Channel<PtyEvent>();
  channel.onmessage = (msg) => {
    if (msg.type === "data") onData(Uint8Array.from(msg.bytes));
    else if (msg.type === "exit") onExit?.(msg.code);
  };
  await invoke("pty_spawn", { opts, onEvent: channel });
  return {
    paneId: opts.paneId,
    write: (data) => ptyWrite(opts.paneId, data),
    resize: (cols, rows) => ptyResize(opts.paneId, cols, rows),
    kill: () => ptyKill(opts.paneId),
  };
}

export const ptyWrite = (paneId: string, data: string) =>
  invoke<void>("pty_write", { paneId, data });
export const ptyResize = (paneId: string, cols: number, rows: number) =>
  invoke<void>("pty_resize", { paneId, cols, rows });
export const ptyKill = (paneId: string) =>
  invoke<void>("pty_kill", { paneId });
export const bridgeRespond = (requestId: string, response: string) =>
  invoke<boolean>("bridge_respond", { requestId, response });

export const fsReadDir = (path: string) =>
  invoke<DirEntry[]>("fs_read_dir", { path });
export const fsReadFile = (path: string) =>
  invoke<FileRead>("fs_read_file", { path });
export const fsExists = (path: string) =>
  invoke<boolean>("fs_exists", { path });
export const imageRead = (path: string) =>
  invoke<ImageRead>("image_read", { path });

/* ── search_project / read_file_base64 (Rust: search.rs / fs.rs) ──────────
   Types live here (not contract.ts) because they are owned by this seam.
   column/matchStart/matchEnd are UTF-16 code units — safe for .slice(). */
export interface SearchHit {
  /** Path relative to the search root. */
  path: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column (UTF-16 units) of the match in the full original line. */
  column: number;
  /** The matched line, windowed to ≤300 chars around the match. */
  lineText: string;
  /** Match offsets WITHIN lineText (UTF-16 units) — use for highlighting. */
  matchStart: number;
  matchEnd: number;
}
export interface SearchResults {
  results: SearchHit[];
  /** True when the walk stopped early at maxResults — results are partial. */
  truncated: boolean;
}
export interface SearchProjectOpts {
  root: string;
  query: string;
  caseSensitive?: boolean;
  /** Treat query as a regex; an invalid pattern rejects with an error string. */
  regex?: boolean;
  /** Only search files matching this glob (e.g. "*.ts", "src/**"). */
  includeGlob?: string;
  /** Hard result cap (default 500). */
  maxResults?: number;
}
export const searchProject = (opts: SearchProjectOpts) =>
  invoke<SearchResults>("search_project", {
    root: opts.root,
    query: opts.query,
    caseSensitive: opts.caseSensitive ?? false,
    regex: opts.regex ?? false,
    includeGlob: opts.includeGlob ?? null,
    maxResults: opts.maxResults ?? null,
  });

export interface FileBase64 {
  base64: string;
  /** From extension (png/jpg/jpeg/gif/webp/svg/bmp/ico/avif); otherwise
      application/octet-stream. */
  mime: string;
  byteLen: number;
}
/** Whole-file base64 read for image preview. Rejects (does not truncate)
    when the file exceeds maxBytes (default 10 MB). */
export const readFileBase64 = (path: string, maxBytes?: number) =>
  invoke<FileBase64>("read_file_base64", { path, maxBytes: maxBytes ?? null });

export const envInfo = () => invoke<EnvInfo>("env_info");
export const gitStatus = (path: string) =>
  invoke<GitStatus | null>("git_status", { path });

export const clipboardRead = (): Promise<string> => readText();
export const clipboardWrite = (text: string): Promise<void> => writeText(text);
export const openerOpen = (url: string): Promise<void> => openUrl(url);
