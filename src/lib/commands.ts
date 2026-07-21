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

/* ───────────────────── app command registry / shell seam ─────────────────── */

export type SurfaceId =
  | "board" | "swarm" | "memory" | "attention" | "prompts" | "skills" | "agents"
  | "templates" | "quick-open" | "theme-gallery" | "dispatch-card"
  | "settings.appearance" | "settings.terminal" | "settings.profiles"
  | "settings.performance" | "settings.modelhub" | "settings.voice" | "settings.updates";

export interface AppCommand {
  id: string;
  label: string;
  category: "Fleet" | "Workspace" | "Tools" | "Settings";
  keywords?: string;
  shortcut?: string;
  run: () => void | Promise<void>;
}

export type CommandRegistrationFn = (command: AppCommand) => void | (() => void);
export type SurfaceHandler = (surfaceId: SurfaceId) => void;

const appCommands = new Map<string, AppCommand>();
let surfaceHandler: SurfaceHandler | null = null;

export function registerCommand(command: AppCommand): () => void {
  appCommands.set(command.id, command);
  return () => {
    if (appCommands.get(command.id) === command) appCommands.delete(command.id);
  };
}

export function getCommandList(): AppCommand[] {
  return [...appCommands.values()];
}

export function runCommand(id: string): void {
  const command = appCommands.get(id);
  if (!command) {
    console.warn(`[helm] command not registered: ${id}`);
    return;
  }
  void command.run();
}

/** Wave-2 shell registers one router when it mounts the surfaces. */
export function registerSurfaceHandler(handler: SurfaceHandler): () => void {
  surfaceHandler = handler;
  return () => {
    if (surfaceHandler === handler) surfaceHandler = null;
  };
}

export function openSurface(surfaceId: SurfaceId): void {
  if (surfaceHandler) surfaceHandler(surfaceId);
  else console.warn(`[helm] surface handler not registered: ${surfaceId}`);
}

/* ── project-folder flow (Fleet Home recents + the palette share it) ─────────
   The explorer root flow existed but was undiscoverable: this is the one seam.
   explorer.openFolder sets the tree root AND records the path in
   settings.recentProjects (store contract), then the Files surface is revealed
   the way FleetHome's browse button always did it. */

/** Point the explorer at a project folder and reveal the Files surface. */
export async function revealProjectInFiles(path: string): Promise<void> {
  const { useExplorer } = await import("../store/explorer");
  useExplorer.getState().openFolder(path);
  const { useLayout } = await import("../store/layout");
  const layout = useLayout.getState();
  layout.setWorkspaceView("terminal");
  layout.setRailView("files");
  if (layout.sidebar === null) layout.setSidebar("files");
}

/** Native folder dialog → revealProjectInFiles. Resolves false on cancel and
    in browser dev (no Tauri dialog), so callers can fall back gracefully. */
export async function openProjectFolderDialog(): Promise<boolean> {
  try {
    const { openFolderDialog } = await import("./ipc");
    const path = await openFolderDialog();
    if (!path) return false;
    await revealProjectInFiles(path);
    return true;
  } catch {
    return false;
  }
}

const WAVE_COMMANDS: readonly AppCommand[] = [
  { id: "board.open", label: "Open Board", category: "Fleet", keywords: "kanban tasks dispatch", shortcut: "mod+shift+b", run: () => openSurface("board") },
  { id: "swarm.open", label: "Open Swarm", category: "Fleet", keywords: "mission agents roles", shortcut: "mod+shift+w", run: () => openSurface("swarm") },
  { id: "memory.open", label: "Open Memory", category: "Fleet", keywords: "knowledge graph shared", shortcut: "mod+shift+m", run: () => openSurface("memory") },
  { id: "attention.open", label: "Open Attention inbox", category: "Fleet", keywords: "asks blocked approvals", shortcut: "ctrl+shift+a", run: () => openSurface("attention") },
  { id: "dispatch.card", label: "Dispatch card", category: "Fleet", keywords: "board task agent", run: () => openSurface("dispatch-card") },
  { id: "prompts.open", label: "Open Prompts library", category: "Tools", keywords: "saved reusable insert", shortcut: "mod+shift+o", run: () => openSurface("prompts") },
  { id: "skills.open", label: "Open Skills", category: "Tools", keywords: "slash commands drag", shortcut: "mod+shift+l", run: () => openSurface("skills") },
  { id: "agents.open", label: "Open Agents page", category: "Fleet", keywords: "custom seat launcher", shortcut: "mod+shift+g", run: () => openSurface("agents") },
  { id: "templates.open", label: "Open Template picker", category: "Workspace", keywords: "grid panes layout preset", shortcut: "mod+shift+t", run: () => openSurface("templates") },
  { id: "quick-open", label: "Quick Open", category: "Tools", keywords: "file fuzzy search", shortcut: "mod+p", run: () => openSurface("quick-open") },
  { id: "pane.new-from-template", label: "New pane from template", category: "Workspace", keywords: "grid workspace layout", run: () => openSurface("templates") },
  { id: "theme.gallery", label: "Open Theme gallery", category: "Settings", keywords: "appearance colors", run: () => openSurface("theme-gallery") },
  { id: "settings.appearance", label: "Settings: Appearance", category: "Settings", run: () => openSurface("settings.appearance") },
  { id: "settings.terminal", label: "Settings: Terminal", category: "Settings", run: () => openSurface("settings.terminal") },
  { id: "settings.profiles", label: "Settings: Agent profiles", category: "Settings", run: () => openSurface("settings.profiles") },
  { id: "settings.performance", label: "Settings: Performance", category: "Settings", run: () => openSurface("settings.performance") },
  { id: "settings.modelhub", label: "Settings: Model Hub", category: "Settings", run: () => openSurface("settings.modelhub") },
  { id: "settings.voice", label: "Settings: Voice", category: "Settings", run: () => openSurface("settings.voice") },
  { id: "settings.updates", label: "Settings: Updates", category: "Settings", run: () => openSurface("settings.updates") },
  { id: "updates.check", label: "Check for updates", category: "Settings", keywords: "download version release", run: async () => { const { useUpdater } = await import("../store/updater"); await useUpdater.getState().check(); } },
  { id: "voice.toggle", label: "Voice push-to-talk", category: "Tools", keywords: "microphone dictate prompt", shortcut: "mod+shift+v", run: async () => {
    const [{ useVoice }, { deliverVoiceResult }] = await Promise.all([
      import("../store/voice"),
      import("./voice-delivery"),
    ]);
    const voice = useVoice.getState();
    if (voice.phase === "recording") await voice.stop();
    else await voice.start({ onText: (result) => { void deliverVoiceResult(result); } });
  } },
  // v0.5 — broadcast demoted from per-tab chrome to a command; the store keeps
  // the capability (toggleBroadcast guards: active tab with ≥2 panes only).
  { id: "tab.toggleBroadcast", label: "Toggle broadcast to all panes in tab", category: "Workspace", keywords: "broadcast mirror typing splits input", run: async () => { const { usePanes } = await import("../store/panes"); usePanes.getState().toggleBroadcast(); } },
  { id: "project.openFolder", label: "Open project folder…", category: "Workspace", keywords: "folder project browse explorer recent", run: () => openProjectFolderDialog() },
];

/** Registers the v0.4 command catalog into the supplied palette/shell registry. */
export function registerWaveCommands(register: CommandRegistrationFn = registerCommand): () => void {
  const disposers = WAVE_COMMANDS.map((command) => register(command)).filter((dispose): dispose is () => void => typeof dispose === "function");
  return () => disposers.forEach((dispose) => dispose());
}

registerWaveCommands();
