import type { IDisposable, IMarker, Terminal } from "@xterm/xterm";
import type { CommandBlock } from "../store/blocks";
import { useBlocks } from "../store/blocks";

export const OSC_COMMAND_MARK = 133;

const PROMPT_COMMAND_RE = /^\s*(?:(?:[\w.-]+@)?[\w.-]+(?::[^$#>\r\n]*)?|PS\s+[^>\r\n]+|[^$#>\r\n]{0,72})[$#>]\s+(.\S.*|\S.*)$/;
const MAX_COMMAND_LINES = 8;
const AGENT_TURN_DEBOUNCE_MS = 750;

interface TrackingState {
  term: Terminal;
  oscSeen: boolean;
  promptMarker?: IMarker;
  activeBlockId?: string;
  activeAgentId?: string;
  lastAgentTurnAt: number;
}

const tracking = new Map<string, TrackingState>();
let blockSequence = 0;
const nextId = (paneId: string, kind: "cmd" | "turn") => `${paneId}-${kind}-${Date.now().toString(36)}-${(++blockSequence).toString(36)}`;

function marker(term: Terminal, offset = 0): IMarker | undefined {
  if (term.buffer.active.type === "alternate") return undefined;
  try { return term.registerMarker(offset); } catch { return undefined; }
}

function absoluteCursorLine(term: Terminal): number {
  const buffer = term.buffer.active;
  return buffer.baseY + buffer.cursorY;
}

function lineText(term: Terminal, line: number): string {
  return term.buffer.normal.getLine(line)?.translateToString(true) ?? "";
}

function textBetween(term: Terminal, start: number, end: number): string {
  const lines: string[] = [];
  const boundedStart = Math.max(0, start);
  const boundedEnd = Math.min(end, term.buffer.normal.length - 1);
  for (let line = boundedStart; line <= boundedEnd; line++) {
    const bufferLine = term.buffer.normal.getLine(line);
    if (!bufferLine) continue;
    const text = bufferLine.translateToString(true);
    if (bufferLine.isWrapped && lines.length > 0) lines[lines.length - 1] += text;
    else lines.push(text);
  }
  return lines.join("\n").replace(/[ \t]+$/gm, "").trimEnd();
}

function commandFromRange(term: Terminal, startLine: number, endLine: number): string {
  const text = textBetween(term, startLine, Math.min(endLine, startLine + MAX_COMMAND_LINES));
  const firstLine = text.split("\n", 1)[0]?.trim() ?? "";
  const prompt = firstLine.match(PROMPT_COMMAND_RE);
  return (prompt?.[1] ?? firstLine).trim();
}

function stateFor(paneId: string, term: Terminal): TrackingState {
  const current = tracking.get(paneId);
  if (current?.term === term) return current;
  if (current) useBlocks.getState().clearSession(paneId);
  const state: TrackingState = {
    term,
    oscSeen: false,
    lastAgentTurnAt: 0,
  };
  tracking.set(paneId, state);
  return state;
}

function finishActiveCommand(paneId: string, state: TrackingState, exitCode?: number | null): void {
  const id = state.activeBlockId;
  if (!id) return;
  const block = useBlocks.getState().bySession[paneId]?.find((item) => item.id === id);
  if (!block) {
    state.activeBlockId = undefined;
    return;
  }
  const endMarker = marker(state.term);
  const endLine = endMarker?.line ?? absoluteCursorLine(state.term);
  useBlocks.getState().updateBlock(paneId, id, {
    cmd: block.cmd || commandFromRange(state.term, block.startMarker.line, endLine),
    endMarker,
    exitCode,
  });
  state.activeBlockId = undefined;
}

function startCommand(paneId: string, state: TrackingState, startMarker: IMarker, cmd = ""): void {
  if (state.activeBlockId) finishActiveCommand(paneId, state, undefined);
  const id = nextId(paneId, "cmd");
  useBlocks.getState().addBlock(paneId, {
    id,
    cmd,
    startMarker,
    ts: Date.now(),
  });
  state.activeBlockId = id;
}

function parseExitCode(data: string): number | null {
  const raw = data.split(";", 2)[1];
  if (raw == null || raw === "") return 0;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function handleOsc133(paneId: string, state: TrackingState, data: string): boolean {
  const kind = data.split(";", 1)[0]?.trim().toUpperCase();
  if (!kind || !["A", "B", "C", "D"].includes(kind)) return false;
  state.oscSeen = true;

  if (kind === "A") {
    state.promptMarker = marker(state.term);
  } else if (kind === "B") {
    const startMarker = marker(state.term) ?? state.promptMarker;
    if (startMarker) startCommand(paneId, state, startMarker);
  } else if (kind === "C") {
    const block = state.activeBlockId
      ? useBlocks.getState().bySession[paneId]?.find((item) => item.id === state.activeBlockId)
      : undefined;
    if (block && !block.cmd) {
      useBlocks.getState().updateBlock(paneId, block.id, {
        cmd: commandFromRange(state.term, block.startMarker.line, absoluteCursorLine(state.term)),
      });
    }
  } else {
    finishActiveCommand(paneId, state, parseExitCode(data));
  }
  return true;
}

function handleFallbackLine(paneId: string, state: TrackingState): void {
  if (state.oscSeen || state.term.buffer.active.type === "alternate") return;
  const line = absoluteCursorLine(state.term) - 1;
  if (line < 0) return;
  const text = lineText(state.term, line);
  const match = text.match(PROMPT_COMMAND_RE);
  if (!match?.[1]) return;
  finishActiveCommand(paneId, state, undefined);
  const startMarker = marker(state.term, -1);
  if (startMarker) startCommand(paneId, state, startMarker, match[1].trim());
}

export function registerBlockTracking(paneId: string, term: Terminal): IDisposable[] {
  const state = stateFor(paneId, term);
  return [
    term.parser.registerOscHandler(OSC_COMMAND_MARK, (data) => handleOsc133(paneId, state, data)),
    term.onLineFeed(() => handleFallbackLine(paneId, state)),
  ];
}

export function markAgentTurn(paneId: string, term: Terminal, label = "Agent turn"): void {
  if (term.buffer.active.type === "alternate") return;
  const state = stateFor(paneId, term);
  const now = Date.now();
  if (now - state.lastAgentTurnAt < AGENT_TURN_DEBOUNCE_MS) return;
  state.lastAgentTurnAt = now;

  if (state.activeAgentId) {
    const endMarker = marker(term);
    useBlocks.getState().updateBlock(paneId, state.activeAgentId, { endMarker, exitCode: 0 });
  }
  const startMarker = marker(term);
  if (!startMarker) return;
  const id = nextId(paneId, "turn");
  useBlocks.getState().addBlock(paneId, {
    id,
    cmd: label,
    startMarker,
    ts: now,
    agentTurn: true,
  });
  state.activeAgentId = id;
}

export function disposeBlockTracking(paneId: string, clear = false): void {
  tracking.delete(paneId);
  if (clear) useBlocks.getState().clearSession(paneId);
}

export function getBlockOutput(term: Terminal, block: CommandBlock): string {
  if (block.startMarker.isDisposed) return "";
  const start = block.startMarker.line + 1;
  const end = block.endMarker && !block.endMarker.isDisposed
    ? block.endMarker.line - 1
    : term.buffer.normal.length - 1;
  return end >= start ? textBetween(term, start, end) : "";
}

export function scrollToBlock(term: Terminal, block: CommandBlock): void {
  if (!block.startMarker.isDisposed && block.startMarker.line >= 0) term.scrollToLine(block.startMarker.line);
}

export function copyBlockTurnMarkdown(term: Terminal, block: CommandBlock): string {
  const heading = block.agentTurn ? "Agent turn" : "Command";
  const output = getBlockOutput(term, block);
  const command = block.cmd.trim();
  return [`## ${heading}`, command ? `\`${command}\`` : "", output ? `\n${output}` : ""]
    .filter(Boolean)
    .join("\n");
}
