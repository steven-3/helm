/* ══════════════════════════════════════════════════════════════════════════
   Phase-3 integration core (owned by the integrator).

   attachPtyToTerminal wires a live xterm instance to a real PTY:
     • registerOscHandler(5379) → parse → useStage.push  (widgets, never scrollback)
     • pty_spawn → stream bytes → the CURRENT term
     • term.onData (keystrokes) → pty_write
     • term.onResize → pty_resize

   The PTY outlives any single xterm instance: a pane can unmount + remount (tab
   switch, focus) and get a brand-new Terminal. So the byte sink writes through a
   mutable termRef and the input handlers rebind to the live term on re-attach —
   the native process is spawned exactly once and never orphaned to a disposed
   term.

   Pane STATE follows real session signals: terminal activity → running; a quiet
   period → idle; an agent bell → needs-input; exit code 0/null → done; nonzero
   → error. Each spawn carries a GENERATION number so a stale exit event from a
   killed PTY (agent switch = kill + respawn) can never clobber the replacement.
   ══════════════════════════════════════════════════════════════════════════ */
import type { Terminal, IDisposable, ITheme } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { clipboardRead, clipboardWrite, ptySpawn, type PtyHandle } from "./commands";
import { parseOsc } from "./osc";
import { disposeDetector, onDetectorLine } from "./stage-detect";
import { disposeBlockTracking, markAgentTurn, registerBlockTracking } from "./blocks";
import { helmTerminalTheme } from "./terminal-theme";
import { CLAUDE_HOOK_OSC_CODE, OSC_CODE } from "./contract";
import { usePanes } from "../store/panes";
import { useSettings } from "../store/settings";
import { useStage } from "../store/stage";
import { useSearch } from "../store/search";
import { useNotifications, type NotificationKind } from "../store/notifications";
import { recordPaneInput, recordPaneOutput } from "../store/recorder";

interface Session {
  handle: PtyHandle;
  termRef: { current: Terminal };
  inputs: IDisposable[]; // OSC + onData + onResize, bound to the CURRENT term
}

interface SpawnAttempt {
  generation: number;
  termRef: { current: Terminal };
  exited: boolean;
  exitCode: number | null;
  /** Set only after the handle is installed in `sessions`. */
  session?: Session;
}

const sessions = new Map<string, Session>();
const paneSearchAddons = new Map<string, { term: Terminal; addon: SearchAddon }>();
const searchDecorations = {
  matchBackground: helmTerminalTheme.selectionBackground,
  matchBorder: helmTerminalTheme.brightBlack,
  matchOverviewRuler: helmTerminalTheme.blue as string,
  activeMatchBackground: helmTerminalTheme.blue,
  activeMatchBorder: helmTerminalTheme.brightBlue,
  activeMatchColorOverviewRuler: helmTerminalTheme.brightBlue as string,
};
/** Last term/fit each pane mounted — lets respawnPty reuse the live xterm. */
const mounts = new Map<string, { term: Terminal; fit?: FitAddon }>();

/** Repaint every mounted xterm after the app theme changes. */
export function applyMountedTerminalTheme(theme: ITheme): void {
  for (const { term } of mounts.values()) {
    try {
      term.options.theme = theme;
      if (term.rows > 0) term.refresh(0, term.rows - 1);
    } catch {
      // A terminal can dispose while a pane closes during the theme update.
    }
  }
}

/** Spawn generation per pane — stale exit events (from a killed PTY) no-op. */
const generations = new Map<string, number>();
/** Spawn attempts are tracked before `ptySpawn` resolves so a remount can move
    their output sink and an early exit cannot later install a zombie session. */
const attempts = new Map<string, SpawnAttempt>();
/** Every lifecycle mutation for one pane runs in order. Different panes remain
    independent, while attach/detach/respawn for the same Rust pane id cannot
    overlap and accidentally kill a newer process. */
const lifecycleTails = new Map<string, Promise<void>>();
const activityTimers = new Map<string, number>();
const ACTIVITY_IDLE_MS = 4_000;

function clearActivityTimer(paneId: string): void {
  const timer = activityTimers.get(paneId);
  if (timer != null) window.clearTimeout(timer);
  activityTimers.delete(paneId);
}

function markActivity(paneId: string): void {
  const pane = usePanes.getState().panes[paneId];
  if (!pane || pane.state === "done" || pane.state === "error") return;
  if (pane.state !== "running") usePanes.getState().setPaneState(paneId, "running");

  clearActivityTimer(paneId);
  const timer = window.setTimeout(() => {
    if (activityTimers.get(paneId) !== timer) return;
    activityTimers.delete(paneId);
    if (usePanes.getState().panes[paneId]?.state === "running") {
      usePanes.getState().setPaneState(paneId, "idle");
    }
  }, ACTIVITY_IDLE_MS);
  activityTimers.set(paneId, timer);
}

function markNeedsInput(paneId: string): void {
  const pane = usePanes.getState().panes[paneId];
  if (!pane || pane.agent === "shell" || pane.state === "done" || pane.state === "error") return;
  clearActivityTimer(paneId);
  if (pane.state !== "needs-input") usePanes.getState().setPaneState(paneId, "needs-input");
}

function serializeLifecycle<T>(paneId: string, operation: () => Promise<T>): Promise<T> {
  const previous = lifecycleTails.get(paneId) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const tail = result.then(() => undefined, () => undefined);
  lifecycleTails.set(paneId, tail);
  void tail.then(() => {
    if (lifecycleTails.get(paneId) === tail) lifecycleTails.delete(paneId);
  });
  return result;
}

function invalidateGeneration(paneId: string): number {
  const generation = (generations.get(paneId) ?? 0) + 1;
  generations.set(paneId, generation);
  return generation;
}

const currentGeneration = (paneId: string): number => generations.get(paneId) ?? 0;

function disposeInputs(inputs: IDisposable[]): void {
  for (const input of inputs) {
    try { input.dispose(); } catch { /* an already-disposed xterm is harmless */ }
  }
}

/** Complete an exit only for the process represented by this attempt. Session
    resources are always released; pane state changes only if no newer request
    has invalidated the generation. */
function finishExit(paneId: string, attempt: SpawnAttempt, code: number | null): void {
  const session = attempt.session;
  if (session && sessions.get(paneId) === session) {
    sessions.delete(paneId);
    disposeInputs(session.inputs);
  }
  if (attempts.get(paneId) === attempt) attempts.delete(paneId);
  if (generations.get(paneId) === attempt.generation) {
    clearActivityTimer(paneId);
    disposeDetector(paneId);
    usePanes.getState().setPaneExit(paneId, code);
  }
}

function ensurePaneSearch(paneId: string, term: Terminal): void {
  if (paneSearchAddons.get(paneId)?.term === term) return;
  const addon = new SearchAddon();
  term.loadAddon(addon);
  paneSearchAddons.set(paneId, { term, addon });
}

function writePaneInput(paneId: string, handle: PtyHandle, input: string): Promise<void> {
  const submitted = input.includes("\r") || input.includes("\n");
  if (submitted) markActivity(paneId);

  const writes = [handle.write(input)];
  for (const targetPaneId of usePanes.getState().getBroadcastTargets(paneId)) {
    const target = sessions.get(targetPaneId);
    if (!target) continue;
    if (submitted) markActivity(targetPaneId);
    writes.push(target.handle.write(input));
  }
  return Promise.all(writes).then(() => undefined);
}

/** Bind OSC dispatch + keystroke/resize forwarding to a specific term instance. */
function wireTerm(paneId: string, term: Terminal, handle: PtyHandle): IDisposable[] {
  const pushOsc = (data: string, kind: Extract<NotificationKind, "card" | "hook">) => {
    const payload = parseOsc(data);
    if (payload) {
      const pane = usePanes.getState().panes[paneId];
      useStage.getState().push({ paneId, agent: pane?.agent ?? "shell", payload });
      if (pane?.agent && pane.agent !== "shell") {
        const label = kind === "hook" ? "Agent hook" : `Agent ${payload.t}`;
        markAgentTurn(paneId, term, label);
      }
      useNotifications.getState().notify({
        kind,
        title: kind === "hook" ? "Agent hook activity" : "New Stage card",
        body: "label" in payload && payload.label ? payload.label : payload.t,
        paneId,
        ts: Date.now(),
      });
    }
  };
  const blockTracking = registerBlockTracking(paneId, term);
  const unsubscribeStage = useStage.subscribe((state, previous) => {
    if (state.widgets === previous.widgets) return;
    const previousIds = new Set(previous.widgets.map((widget) => widget.id));
    const signal = state.widgets.find((widget) => widget.paneId === paneId && !previousIds.has(widget.id));
    const pane = usePanes.getState().panes[paneId];
    if (signal && pane?.agent && pane.agent !== "shell") {
      markAgentTurn(paneId, term, `Agent ${signal.type}`);
    }
  });
  const stageSignals: IDisposable = { dispose: unsubscribeStage };
  const osc = term.parser.registerOscHandler(OSC_CODE, (data) => {
    pushOsc(data, "card");
    return true; // consume valid AND malformed 5379 — never render to scrollback
  });
  const hookOsc = term.parser.registerOscHandler(CLAUDE_HOOK_OSC_CODE, (data) => {
    const prefix = "helm;";
    if (!data.startsWith(prefix)) return false; // leave other OSC 777 users untouched
    pushOsc(data.slice(prefix.length), "hook");
    return true; // consume malformed helm payloads so they never reach scrollback
  });
  const bell = term.onBell(() => {
    markNeedsInput(paneId);
    const pane = usePanes.getState().panes[paneId];
    useNotifications.getState().notify({
      kind: "bell",
      title: pane ? `${pane.title} needs attention` : "Terminal needs attention",
      paneId,
      ts: Date.now(),
    });
  });
  const feed = term.onLineFeed(() => {
    if (!useSettings.getState().stageDetect) return;
    const buf = term.buffer.active;
    if (buf.type === "alternate") return;
    const row = buf.getLine(buf.baseY + buf.cursorY - 1);
    if (row) onDetectorLine(paneId, row.translateToString(true));
  });
  const data = term.onData((input) => {
    if (input.includes("\r") || input.includes("\n")) recordPaneInput(paneId, term.buffer.active.getLine(term.buffer.active.baseY + term.buffer.active.cursorY)?.translateToString(true) ?? "");
    void writePaneInput(paneId, handle, input).catch(() => {});
  });

  // Capture every browser/webview paste path before xterm reads ClipboardEvent
  // data, then fetch the authoritative system clipboard through Tauri instead.
  const terminalElement = term.element;
  const pasteHandler = (event: ClipboardEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (term.textarea) term.textarea.value = "";
    void clipboardRead()
      .then((text) => {
        if (!text) return;
        term.paste(text);
      })
      .catch(() => {});
  };
  terminalElement?.addEventListener("paste", pasteHandler, true);
  const paste: IDisposable = {
    dispose: () => terminalElement?.removeEventListener("paste", pasteHandler, true),
  };

  // Clipboard keys share the existing custom handler. Plain Ctrl+C copies only
  // when a selection exists; otherwise xterm keeps its normal ETX/SIGINT path.
  // Ctrl+Shift+C is always a copy command. Paste shortcuts return false without
  // preventDefault so the webview emits one DOM paste event handled above.
  //
  // Shift+Enter must INSERT a newline in agent composers (Claude Code / Codex),
  // not submit. A legacy PTY can't distinguish Enter from Shift+Enter — both are
  // CR (\r) — and helm reports TERM_PROGRAM=helm, which isn't on Claude's
  // kitty-protocol allow-list, so its own Shift+Enter path never engages. We
  // translate Shift+Enter to LF (\n, i.e. Ctrl+J): the terminal-agnostic
  // "newline, don't submit" that Claude Code and Codex both accept. Plain Enter
  // still sends CR and submits. A bare newline isn't a submission, so it stays
  // out of markActivity — the pane remains idle/needs-input while composing.
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown") return true;
    const key = event.key.toLowerCase();

    // Ctrl+F / Cmd+F opens helm's in-pane find bar (VS Code-style). Swallow it so
    // ^F (ACK) never reaches the PTY; the search <input> — not the terminal — then
    // receives keystrokes. Ctrl+Shift+F is left free for a future project search.
    if (key === "f" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      useSearch.getState().open(paneId);
      return false;
    }

    if (key === "c" && event.ctrlKey && !event.altKey && !event.metaKey) {
      const hasSelection = term.hasSelection();
      if (event.shiftKey || hasSelection) {
        event.preventDefault();
        if (hasSelection) void clipboardWrite(term.getSelection()).catch(() => {});
        return false;
      }
    }

    if (
      (key === "v" && event.ctrlKey && !event.altKey && !event.metaKey) ||
      (key === "insert" &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey)
    ) {
      return false;
    }

    if (
      key === "enter" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      void writePaneInput(paneId, handle, "\n").catch(() => {});
      return false; // stop xterm from emitting the default CR
    }
    return true;
  });

  let pendingSize: { cols: number; rows: number } | null = null;
  let resizeTimer: number | null = null;
  const flushResize = () => {
    resizeTimer = null;
    const size = pendingSize;
    pendingSize = null;
    if (size) void handle.resize(size.cols, size.rows).catch(() => {});
  };
  const resizeSubscription = term.onResize(({ cols, rows }) => {
    pendingSize = { cols, rows };
    // Coalesce rapid font/window/layout changes. Divider drags are already
    // suspended at the renderer layer, but native window resizes can also emit
    // several grid changes in one gesture.
    if (resizeTimer == null) resizeTimer = window.setTimeout(flushResize, 60);
  });
  const resize: IDisposable = {
    dispose: () => {
      resizeSubscription.dispose();
      if (resizeTimer != null) window.clearTimeout(resizeTimer);
      pendingSize = null;
    },
  };
  return [...blockTracking, stageSignals, osc, hookOsc, bell, feed, data, paste, resize];
}

async function attachCurrentMount(
  paneId: string,
  request: { expectedGeneration: number; spawnGeneration?: number },
): Promise<PtyHandle | null> {
  // The attach may have been queued before a detach/respawn reserved a newer
  // generation. Never let that older mount request start another process.
  if (currentGeneration(paneId) !== request.expectedGeneration) return null;
  const mount = mounts.get(paneId);
  if (!mount) return null;
  const { term, fit } = mount;

  const existing = sessions.get(paneId);
  if (existing) {
    // Remount — re-point the byte sink + rebind input handlers to the live term.
    disposeInputs(existing.inputs);
    existing.termRef.current = term;
    existing.inputs = wireTerm(paneId, term, existing.handle);
    try { fit?.fit(); } catch { /* not measured yet */ }
    void existing.handle.resize(term.cols, term.rows).catch(() => {});
    return existing.handle;
  }

  const pane = usePanes.getState().panes[paneId];
  if (!pane) return null;

  // No live session AND the pane already ran to completion ("done"/"error") —
  // a bare remount (tab round-trip) must NOT silently relaunch the process. Only
  // an "idle" pane may spawn: a fresh pane (bootstrap/addTab/splitPane) or a
  // deliberate respawn (setPaneAgent resets state to "idle" before respawnPty).
  if (pane.state !== "idle") {
    term.write("\r\n\x1b[38;2;126;132;140m[helm] session ended — switch agent to start a new one\x1b[0m\r\n");
    return null;
  }

  try { fit?.fit(); } catch { /* host not laid out yet */ }

  const gen = request.spawnGeneration ?? invalidateGeneration(paneId);
  // A newer detach/respawn request may have been made while this operation was
  // waiting its turn in the pane's queue.
  if (generations.get(paneId) !== gen) return null;

  const termRef = { current: term };
  const attempt: SpawnAttempt = {
    generation: gen,
    termRef,
    exited: false,
    exitCode: null,
  };
  attempts.set(paneId, attempt);
  let handle: PtyHandle;
  try {
    handle = await ptySpawn(
      {
        paneId,
        command: pane.command,
        args: [],
        launchViaShell: pane.launchViaShell,
        cwd: pane.cwd,
        cols: term.cols,
        rows: term.rows,
      },
      (bytes) => {
        if (generations.get(paneId) !== gen) return;
        markActivity(paneId);
        recordPaneOutput(paneId, new TextDecoder().decode(bytes));
        try { termRef.current.write(bytes); } catch { /* term disposed between unmount+remount */ }
      },
      (code) => {
        attempt.exited = true;
        attempt.exitCode = code;
        // The channel can report exit before `invoke("pty_spawn")` resolves.
        // In that case attachCurrentMount handles it immediately after await;
        // once installed, finishExit owns cleanup and the real exit state.
        if (attempt.session) finishExit(paneId, attempt, code);
      },
    );
  } catch (err) {
    if (attempts.get(paneId) === attempt) attempts.delete(paneId);
    if (attempt.exited) {
      if (generations.get(paneId) === gen) {
        clearActivityTimer(paneId);
        usePanes.getState().setPaneExit(paneId, attempt.exitCode);
      }
      return null;
    }
    // Rust rejects a duplicate pane, the shell is missing, or we're in a plain
    // browser (no Tauri) — surface it in the pane, never crash the UI.
    if (generations.get(paneId) === gen && usePanes.getState().panes[paneId]) {
      clearActivityTimer(paneId);
      const message = `Could not start "${pane.command}": ${String(err)}`;
      termRef.current.write(`\r\n\x1b[38;2;244;123;116m[helm] ${message}\x1b[0m\r\n`);
      usePanes.getState().setPaneState(paneId, "error");
      useNotifications.getState().notify({
        kind: "error",
        title: `${pane.title} failed to start`,
        body: message,
        paneId,
        ts: Date.now(),
      });
    }
    return null;
  }

  if (attempts.get(paneId) === attempt) attempts.delete(paneId);

  // A very short-lived command can exit before ptySpawn returns. Its exit is
  // final: never wire input or overwrite done/error with a zombie "running".
  if (attempt.exited) {
    if (generations.get(paneId) === gen) {
      clearActivityTimer(paneId);
      usePanes.getState().setPaneExit(paneId, attempt.exitCode);
    }
    return null;
  }

  if (generations.get(paneId) !== gen || !usePanes.getState().panes[paneId] || !mounts.has(paneId)) {
    // Detached, closed, or respawned while the native spawn was in flight —
    // never leave the just-created process orphaned behind a removed pane.
    // This lifecycle queue prevents a replacement from spawning until the kill
    // settles, so the pane-id-based command cannot target a valid newer PTY.
    await handle.kill().catch(() => {});
    return null;
  }

  // A remount may have arrived while the native spawn was pending. Bind to the
  // newest terminal rather than the possibly disposed term captured above.
  const liveMount = mounts.get(paneId)!;
  termRef.current = liveMount.term;
  const inputs = wireTerm(paneId, liveMount.term, handle);
  const session: Session = { handle, termRef, inputs };
  attempt.session = session;
  sessions.set(paneId, session);
  markActivity(paneId);
  return handle;
}

export function attachPtyToTerminal(
  paneId: string,
  term: Terminal,
  fit?: FitAddon,
): Promise<PtyHandle | null> {
  ensurePaneSearch(paneId, term);
  mounts.set(paneId, { term, fit });
  // Keep output from an in-flight spawn pointed at the newest mounted xterm;
  // the queued attach will rebind its input subscriptions after spawn settles.
  const attempt = attempts.get(paneId);
  if (attempt && generations.get(paneId) === attempt.generation) attempt.termRef.current = term;
  const expectedGeneration = currentGeneration(paneId);
  return serializeLifecycle(paneId, () => attachCurrentMount(paneId, { expectedGeneration }));
}

async function detachCurrentSession(paneId: string): Promise<void> {
  clearActivityTimer(paneId);
  disposeDetector(paneId);
  const session = sessions.get(paneId);
  if (!session) return;
  sessions.delete(paneId);
  disposeInputs(session.inputs);
  await session.handle.kill().catch(() => {});
}

/** Kill + forget a pane's PTY. */
export function detachPty(paneId: string): Promise<void> {
  // Invalidate synchronously: an exit delivered before this queued operation
  // runs is stale and cannot overwrite a freshly selected agent's idle state.
  invalidateGeneration(paneId);
  return serializeLifecycle(paneId, () => detachCurrentSession(paneId));
}

/** Agent/model switch = a NEW session: kill the PTY, reset the live xterm,
    spawn the pane's (already updated) command into it. */
export function respawnPty(paneId: string): Promise<PtyHandle | null> {
  // Reserve the replacement's generation before it enters the queue. This
  // immediately makes predecessor output/exit callbacks stale.
  const generation = invalidateGeneration(paneId);
  return serializeLifecycle(paneId, async () => {
    disposeBlockTracking(paneId, true);
    await detachCurrentSession(paneId);
    if (generations.get(paneId) !== generation) return null;
    const mount = mounts.get(paneId);
    if (!mount) return null; // pane not mounted — next mount spawns the new command
    try { mount.term.reset(); } catch { return null; }
    return attachCurrentMount(paneId, {
      expectedGeneration: generation,
      spawnGeneration: generation,
    });
  });
}

/** Reap PTYs for panes that no longer exist (pane/tab close). Cheap; call on store change. */
export function reconcileSessions(alive: Set<string>): void {
  const tracked = new Set([...sessions.keys(), ...attempts.keys(), ...mounts.keys(), ...paneSearchAddons.keys()]);
  for (const paneId of tracked) {
    if (!alive.has(paneId)) {
      disposeBlockTracking(paneId, true);
      mounts.delete(paneId);
      paneSearchAddons.delete(paneId);
      void detachPty(paneId);
    }
  }
}

export function paneSearch(
  paneId: string,
  query: string,
  dir: "next" | "prev",
  opts?: { caseSensitive?: boolean; regex?: boolean },
): boolean {
  const search = paneSearchAddons.get(paneId);
  if (!search || !query) return false;
  try {
    const options = { ...opts, decorations: searchDecorations };
    return dir === "next"
      ? search.addon.findNext(query, options)
      : search.addon.findPrevious(query, options);
  } catch {
    return false;
  }
}

export function paneSearchClear(paneId: string): void {
  const search = paneSearchAddons.get(paneId);
  if (!search) return;
  try {
    search.addon.clearActiveDecoration();
    search.addon.clearDecorations();
  } catch {
    // The terminal may have disposed between search UI teardown and this call.
  }
}

/** Return keyboard focus to a pane's live terminal — e.g. after the find bar
    closes, so typing resumes in the terminal rather than a detached input. */
export function focusPaneTerminal(paneId: string): void {
  try {
    mounts.get(paneId)?.term.focus();
  } catch {
    // The term can dispose between a remount and this focus call.
  }
}

export const isAttached = (paneId: string): boolean => sessions.has(paneId);
