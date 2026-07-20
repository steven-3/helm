/* ══════════════════════════════════════════════════════════════════════════
   dispatch.ts — §3.5 pipeline: task → context pack → seat launcher → pane.

   card/task → context-pack.ts writes .helm/tasks/<id>.md
             → seat launcher from useModelHub (env pins + base command)
             → spawn pane via the panes store in the project cwd; the pane's
               `command` IS the full launch line (launchViaShell), with the
               kickoff prompt riding as the CLI's positional argument — no
               racy post-spawn pty writes for the initial instruction
             → receipt links paneId/sessionId (in helm sessionId === paneId:
               the roster derives sessions 1:1 from panes)
             → bridge task.* verbs move the card onward (board.ts subscribes).
   The board never blocks on the agent; every hop is timeline-recorded by the
   caller. This module is the ONE spawn primitive board + swarm + fleet share.
   ══════════════════════════════════════════════════════════════════════════ */
import { usePanes } from "../store/panes";
import { useModelHub, agentKindForModel, shellQuote } from "../store/modelhub";
import { ptyWrite } from "./commands";
import { writeContextPack, type ContextPackInput } from "./context-pack";
import type { AgentKind } from "./contract";

export interface DispatchRequest {
  /** Task/card id — the id the agent reports back with (`helm task done <id>`). */
  id: string;
  title: string;
  body: string;
  acceptance?: string[];
  files?: string[];
  /** Seat name; resolves a launcher from useModelHub. Absent → default seat. */
  seat?: string;
  /** Project root — owns `.helm/` and is the pane's default cwd. */
  projectRoot: string;
  /** Pane cwd override (Worktree Fleet spawns into the worktree dir). */
  cwd?: string;
  /** Extra pack sections (swarm role prompt, mailbox conventions). */
  extraSections?: ContextPackInput["extraSections"];
  /** Pane/tab title override; default = "<seat> · <title>". */
  paneTitle?: string;
}

export interface DispatchReceipt {
  taskId: string;
  /** In helm the pane IS the session (roster derives 1:1). */
  paneId: string;
  sessionId: string;
  tabId: string;
  seat: string;
  /** Context pack path relative to `.helm/`. */
  packRelPath: string;
  /** The full command line the pane runs. */
  command: string;
  agent: AgentKind;
  ts: number;
}

/** The kickoff prompt every dispatched agent starts from. */
export function buildKickoffPrompt(packRelPath: string): string {
  return [
    `Read .helm/${packRelPath} and complete the task described there.`,
    "Follow its Reporting section: use the helm CLI to report progress,",
    "blocked, and done as you work.",
  ].join(" ");
}

/** §3.5 — write the pack, resolve the seat launcher, spawn the pane.
    Rejects with a plain Error string when the pack write fails (no pane is
    spawned in that case — a dispatch is atomic: pack THEN process). */
export async function dispatchTask(request: DispatchRequest): Promise<DispatchReceipt> {
  if (!request.projectRoot) throw new Error("dispatchTask: projectRoot is required");
  if (!request.id.trim()) throw new Error("dispatchTask: task id is required");

  // 1. Context pack (embeds the memory INDEX excerpt — §5.3).
  const packRelPath = await writeContextPack(request.projectRoot, {
    id: request.id,
    title: request.title,
    body: request.body,
    acceptance: request.acceptance,
    files: request.files,
    seat: request.seat,
    extraSections: request.extraSections,
  });

  // 2. Seat launcher (env pins + base command) + kickoff prompt as CLI arg.
  const launcher = useModelHub.getState().launcherFor(request.seat);
  const command = `${launcher.command} ${shellQuote(buildKickoffPrompt(packRelPath))}`;
  const agent = agentKindForModel(launcher.model);

  // 3. Spawn: a fresh tab in the project (or worktree) cwd. The pane mounts →
  //    attachPtyToTerminal spawns `command` through the login shell (env
  //    prefixes + quoting need a real shell).
  const title = request.paneTitle ?? `${launcher.seat} · ${request.title}`.slice(0, 60);
  const tabId = usePanes.getState().addTab({
    agent,
    command,
    launchViaShell: true,
    cwd: request.cwd ?? request.projectRoot,
    title,
    tabTitle: title,
  });
  const tab = usePanes.getState().tabs.find((t) => t.id === tabId);
  const paneId = tab?.activePaneId;
  if (!paneId) throw new Error("dispatchTask: pane spawn failed (tab has no pane)");

  return {
    taskId: request.id,
    paneId,
    sessionId: paneId,
    tabId,
    seat: launcher.seat,
    packRelPath,
    command,
    agent,
    ts: Date.now(),
  };
}

/** Write a message into a dispatched agent's pane (swarm @-targeting, board
    follow-ups). Appends CR so the composer submits. Resolves false when the
    pane is gone — callers surface that, never silently drop. */
export async function sendToPane(paneId: string, message: string): Promise<boolean> {
  if (!usePanes.getState().panes[paneId]) return false;
  try {
    await ptyWrite(paneId, message.endsWith("\r") ? message : `${message}\r`);
    return true;
  } catch {
    return false; // PTY already exited — the pane record may outlive the process
  }
}

/** Focus a dispatched pane (card ↔ pane deep-link, attention focusSession). */
export function revealPane(paneId: string): boolean {
  const state = usePanes.getState();
  const pane = state.panes[paneId];
  if (!pane) return false;
  state.setActiveTab(pane.tabId);
  state.focusPane(paneId);
  return true;
}
