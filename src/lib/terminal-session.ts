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
   term. Only imports frozen modules (commands/osc/contract/stores) — no dependency
   on Track B's components, so it was safe to author before the UI landed.
   ══════════════════════════════════════════════════════════════════════════ */
import type { Terminal, IDisposable } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { ptySpawn, type PtyHandle } from "./commands";
import { parseOsc } from "./osc";
import { OSC_CODE } from "./contract";
import { usePanes } from "../store/panes";
import { useStage } from "../store/stage";

interface Session {
  handle: PtyHandle;
  termRef: { current: Terminal };
  inputs: IDisposable[]; // OSC + onData + onResize, bound to the CURRENT term
}

const sessions = new Map<string, Session>();

/** Bind OSC dispatch + keystroke/resize forwarding to a specific term instance. */
function wireTerm(paneId: string, term: Terminal, handle: PtyHandle): IDisposable[] {
  const osc = term.parser.registerOscHandler(OSC_CODE, (data) => {
    const payload = parseOsc(data);
    if (payload) {
      const agent = usePanes.getState().panes[paneId]?.agent ?? "shell";
      useStage.getState().push({ paneId, agent, payload });
    }
    return true; // consume valid AND malformed 5379 — never render to scrollback
  });
  const data = term.onData((d) => void handle.write(d).catch(() => {}));
  const resize = term.onResize(({ cols, rows }) => void handle.resize(cols, rows).catch(() => {}));
  return [osc, data, resize];
}

export async function attachPtyToTerminal(
  paneId: string,
  term: Terminal,
  fit?: FitAddon,
): Promise<PtyHandle | null> {
  const existing = sessions.get(paneId);
  if (existing) {
    // Remount — re-point the byte sink + rebind input handlers to the live term.
    existing.inputs.forEach((d) => d.dispose());
    existing.termRef.current = term;
    existing.inputs = wireTerm(paneId, term, existing.handle);
    try { fit?.fit(); } catch { /* not measured yet */ }
    void existing.handle.resize(term.cols, term.rows).catch(() => {});
    return existing.handle;
  }

  const pane = usePanes.getState().panes[paneId];
  if (!pane) return null;

  try { fit?.fit(); } catch { /* host not laid out yet */ }

  const termRef = { current: term };
  let handle: PtyHandle;
  try {
    handle = await ptySpawn(
      { paneId, command: pane.command, args: [], cwd: pane.cwd, cols: term.cols, rows: term.rows },
      (bytes) => { try { termRef.current.write(bytes); } catch { /* term disposed between unmount+remount */ } },
      (code) => {
        sessions.delete(paneId);
        usePanes.getState().setPaneState(paneId, code && code !== 0 ? "error" : "idle");
      },
    );
  } catch (err) {
    // Rust rejects a duplicate pane, the shell is missing, or we're in a plain
    // browser (no Tauri) — surface it in the pane, never crash the UI.
    term.write(`\r\n\x1b[38;2;244;123;116m[helm] could not start "${pane.command}": ${String(err)}\x1b[0m\r\n`);
    return null;
  }

  const inputs = wireTerm(paneId, term, handle);
  sessions.set(paneId, { handle, termRef, inputs });
  return handle;
}

/** Kill + forget a pane's PTY. */
export async function detachPty(paneId: string): Promise<void> {
  const s = sessions.get(paneId);
  if (!s) return;
  sessions.delete(paneId);
  s.inputs.forEach((d) => d.dispose());
  await s.handle.kill().catch(() => {});
}

/** Reap PTYs for panes that no longer exist (pane/tab close). Cheap; call on store change. */
export function reconcileSessions(alive: Set<string>): void {
  for (const paneId of [...sessions.keys()]) {
    if (!alive.has(paneId)) void detachPty(paneId);
  }
}

export const isAttached = (paneId: string): boolean => sessions.has(paneId);
