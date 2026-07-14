/* ══════════════════════════════════════════════════════════════════════════
   helm — INTEGRATION CONTRACT (the frozen seam between the two build tracks)

   Track A (functionality / Rust) and Track B (UI / React) share NOTHING but the
   names in this file. Refine once during scaffold, then HOLD STABLE. Domain
   types live here; Zustand stores in ../store bind to these shapes; the typed
   Tauri command wrappers in ./commands.ts implement the calls below.
   OSC channel spec: docs/ARCHITECTURE.md §4.
   ══════════════════════════════════════════════════════════════════════════ */

/** Which program identity a pane carries. Drives color-coding (DESIGN.md §4.3). */
export type AgentKind = "claude" | "opus" | "codex" | "shell";

/** Run state of a pane / session (DESIGN.md §4.4). */
export type PaneState = "running" | "idle" | "needs-input" | "error" | "done";

/* ─────────────────────────── OSC 5379 channel ──────────────────────────────
   The differentiator. A program inside a pane emits  ESC ]5379;<json> BEL  and
   helm surfaces it as a Stage widget instead of scrollback. Code 5379 is
   private-safe (avoids 7/8/52/133/633/777/1337). */
export const OSC_CODE = 5379;
/** Claude Code hook terminalSequence only permits a small OSC allowlist. */
export const CLAUDE_HOOK_OSC_CODE = 777;

export interface OscCopy   { v: 1; t: "copy"; text: string; label?: string }
export interface OscLink   { v: 1; t: "link"; url: string; label?: string }
/** path → Rust reads the file; b64 is the remote/SSH fallback. */
export interface OscImg    { v: 1; t: "img"; path?: string; b64?: string; mime?: string }
export interface OscWidget { v: 1; t: "widget"; html: string }
export interface OscConfirm { v: 1; t: "confirm"; prompt: string; yes?: string; no?: string; id?: string }
export interface OscChoice { v: 1; t: "choice"; prompt: string; options: { label: string; send: string }[]; id?: string }
export interface OscAsk { v: 1; t: "ask"; prompt: string; placeholder?: string; id?: string }
/** INTERNAL detector-only artifact. osc.ts deliberately rejects command OSC,
    detection never executes it, and any future Run action must require a click
    before writing this exact command back to the same pane. */
export interface OscCommand { v: 1; t: "command"; command: string; label?: string; caution?: boolean }
/** INTERNAL widget (FilesView → Stage text/file preview). Not part of the
    external OSC 5379 spec (§4.1) — osc.ts does not accept it from programs. */
export interface OscFile   { v: 1; t: "file"; path: string }
export type OscPayload = OscCopy | OscLink | OscImg | OscWidget | OscConfirm | OscChoice | OscAsk | OscCommand | OscFile;

/* ─────────────────────────── Tauri command I/O ─────────────────────────────
   Signatures are documented here; ./commands.ts is the typed invoke() surface.
   Track A implements the matching  #[tauri::command]  on the Rust side. */

export interface PtySpawnOpts {
  paneId: string;
  command: string;
  args?: string[];
  /** Run `command` through the user's login shell. Required for aliases,
      functions, and profile commands such as `cx-opus-route`. */
  launchViaShell?: boolean;
  cwd?: string;
  cols: number;
  rows: number;
  /** Extra env; helm always injects HELM=1, HELM_PANE=<id>, HELM_VERSION, PATH+=shim. */
  env?: Record<string, string>;
}

export interface DirEntry { name: string; path: string; dir: boolean }
/** size = real total bytes on disk; truncated = only the head was read (the
    Rust side caps reads so a multi-GB file can't freeze the thread / OOM). */
export interface FileRead { text?: string; b64?: string; mime: string; size: number; truncated: boolean }
export interface ImageRead { b64: string; mime: string; w: number; h: number }

/** Real environment facts from Rust (sys::env_info). null = truly unknown. */
export interface EnvInfo {
  home: string | null;
  shell: string | null;
  cwd: string | null;
  wslDistro: string | null;
}

/** Real git state from Rust (sys::git_status). The command returns null when
    the cwd is not a git work tree — consumers OMIT git segments, never fake. */
export interface GitEntry {
  path: string;
  /** Index status from porcelain v2 ("." means unchanged). */
  x: string;
  /** Worktree status from porcelain v2 ("." means unchanged). */
  y: string;
  renamedFrom: string | null;
}
export interface GitStatus {
  branch: string | null;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  staged: GitEntry[];
  unstaged: GitEntry[];
  untracked: GitEntry[];
}
export interface GitBranchList {
  branches: string[];
  current: string | null;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
}

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
  /** When true the command is evaluated by the user's login shell instead of
      being treated as a direct executable path. */
  launchViaShell?: boolean;
  agent: AgentKind;
  model?: string;       // only set when a real source reports it — never guessed
  title: string;        // short display name (= launch command basename)
  cwd: string;
  state: PaneState;
  focused: boolean;
  /** Real exit code from the PTY (set on exit; null = killed by signal). */
  exitCode?: number | null;
}

export type SplitDir = "none" | "horizontal" | "vertical";

export interface Tab {
  id: string;
  title: string;
  paneIds: string[];    // >1 = split
  activePaneId: string;
  split: SplitDir;
  /** Per-pane flex ratios (parallel to paneIds); absent = equal split. */
  sizes?: number[];
}

/** Roster session — DERIVED from panes (single source of truth = usePanes). */
export interface RosterSession {
  id: string;           // = paneId
  agent: AgentKind;
  model?: string;
  command: string;
  title: string;
  state: PaneState;
  elapsedMs?: number;
  detail?: string;      // e.g. "exit 1", cwd — always from a real source
}

export type StageWidgetType = "copy" | "link" | "img" | "widget" | "confirm" | "choice" | "ask" | "command" | "file";

export interface StageWidget {
  id: string;
  paneId: string;       // pane that surfaced it (pane-association is free via OSC)
  /** Source agent for the card-src chip. Absent for widgets the USER surfaced
      (FilesView preview) — the card then shows no agent attribution. */
  agent?: AgentKind;
  type: StageWidgetType;
  payload: OscPayload;
  answered?: boolean;   // interactive widgets accept at most one response
  ts: number;           // epoch ms
}

/** Which panel the left sidebar shows (null = collapsed). */
export type SidebarView = "files" | "roster" | null;

/** Rail views (the activity bar). */
export type RailView = "files" | "roster" | "search" | "scm" | "settings";
