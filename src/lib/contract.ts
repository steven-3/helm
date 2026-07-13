/* ══════════════════════════════════════════════════════════════════════════
   helm — INTEGRATION CONTRACT (the frozen seam between the two build tracks)

   Track A (functionality / Rust) and Track B (UI / React) share NOTHING but the
   names in this file. Refine once during scaffold, then HOLD STABLE. Domain
   types live here; Zustand stores in ../store bind to these shapes; the typed
   Tauri command wrappers in ./commands.ts implement the calls below.
   OSC channel spec: docs/ARCHITECTURE.md §4.
   ══════════════════════════════════════════════════════════════════════════ */

/** Which program identity a pane carries. Drives color-coding (DESIGN.md §4.3). */
export type AgentKind = "claude" | "codex" | "shell";

/** Run state of a pane / session (DESIGN.md §4.4). */
export type PaneState = "running" | "idle" | "needs-input" | "error" | "done";

/* ─────────────────────────── OSC 5379 channel ──────────────────────────────
   The differentiator. A program inside a pane emits  ESC ]5379;<json> BEL  and
   helm surfaces it as a Stage widget instead of scrollback. Code 5379 is
   private-safe (avoids 7/8/52/133/633/777/1337). */
export const OSC_CODE = 5379;

export interface OscCopy   { v: 1; t: "copy"; text: string; label?: string }
export interface OscLink   { v: 1; t: "link"; url: string; label?: string }
/** path → Rust reads the file; b64 is the remote/SSH fallback. */
export interface OscImg    { v: 1; t: "img"; path?: string; b64?: string; mime?: string }
export interface OscWidget { v: 1; t: "widget"; html: string }
export type OscPayload = OscCopy | OscLink | OscImg | OscWidget;

/* ─────────────────────────── Tauri command I/O ─────────────────────────────
   Signatures are documented here; ./commands.ts is the typed invoke() surface.
   Track A implements the matching  #[tauri::command]  on the Rust side. */

export interface PtySpawnOpts {
  paneId: string;
  command: string;
  args?: string[];
  cwd?: string;
  cols: number;
  rows: number;
  /** Extra env; helm always injects HELM=1, HELM_PANE=<id>, HELM_VERSION, PATH+=shim. */
  env?: Record<string, string>;
}

export interface DirEntry { name: string; path: string; dir: boolean }
export interface FileRead { text?: string; b64?: string; mime: string }
export interface ImageRead { b64: string; mime: string; w: number; h: number }

/** PTY output streams webview-ward over a per-spawn Tauri Channel. Track A MUST
    emit exactly these tagged variants so ./commands.ts can decode them. */
export type PtyEvent =
  | { type: "data"; bytes: number[] }
  | { type: "exit"; code: number | null };

/* ─────────────────────────── Domain model (store shapes) ───────────────────
   The Zustand stores in ../store are the seam Track B renders and Track A fills.
   Keep these shapes stable. */

export interface Pane {
  id: string;
  tabId: string;
  command: string;      // launch command (the switcher sets this)
  agent: AgentKind;
  model?: string;       // e.g. "opus-4.8", "gpt-5.6"
  title: string;        // short display name, e.g. "pty-stream"
  cwd: string;
  state: PaneState;
  focused: boolean;
}

export type SplitDir = "none" | "horizontal" | "vertical";

export interface Tab {
  id: string;
  title: string;
  paneIds: string[];    // >1 = split
  activePaneId: string;
  split: SplitDir;
}

/** Roster session — DERIVED from panes (single source of truth = usePanes). */
export interface RosterSession {
  id: string;           // = paneId
  agent: AgentKind;
  model?: string;
  title: string;
  state: PaneState;
  elapsedMs?: number;
  detail?: string;      // e.g. "exit 1", cwd
}

export type StageWidgetType = "copy" | "link" | "img" | "widget";

export interface StageWidget {
  id: string;
  paneId: string;       // pane that surfaced it (pane-association is free via OSC)
  agent: AgentKind;     // source agent, for the card-src chip
  type: StageWidgetType;
  payload: OscPayload;
  ts: number;           // epoch ms
}

/** Which panel the left sidebar shows (null = collapsed). */
export type SidebarView = "files" | "roster" | null;

/** Rail views (the activity bar). */
export type RailView = "files" | "roster" | "search" | "scm" | "settings";
