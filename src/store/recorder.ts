/* ══════════════════════════════════════════════════════════════════════════
   useRecorder — Flight Recorder (§4.9). Persists per-session event streams to
   .helm/recordings/<sessionId>.ndjson ({ts,kind:'out'|'in'|'osc'|'lifecycle',
   data}) and builds "since you looked away" digests.

   Wiring: pane LIFECYCLE + OSC events auto-subscribe here (usePanes/useStage
   are observable stores). Raw PTY OUTPUT has no observable seam — the byte
   sink lives inside terminal-session.ts (workstream B's file) — so this store
   exports recordPaneOutput()/recordPaneInput() taps; the terminal engine adds
   the one-line calls in Wave 2 wiring. Until then, digests still carry
   lifecycle + OSC events (honest, just thinner).

   Buffering: per-session ring buffer (cheap on the hot path), flushed to Rust
   recorder_append on size/interval. 10MB cap + rotation is Rust-side (§4.2).
   Digest: recorder_read → parse commands (prompt heuristics), files touched,
   errors (exit≠0 + error lines) → optional one-paragraph LLM summary through
   the proxy (chatComplete) — gracefully skipped when the proxy is down.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import { recorderAppend, recorderRead } from "../lib/ipc";
import { chatComplete } from "../lib/prompt-improver";
import { firstPinnedModel, useModelHub } from "./modelhub";
import { usePanes } from "./panes";
import { useStage } from "./stage";

export type RecorderEventKind = "out" | "in" | "osc" | "lifecycle";

export interface RecorderEvent {
  ts: number;
  kind: RecorderEventKind;
  data: string;
}

export interface SessionDigest {
  sessionId: string;
  sinceTs: number;
  commands: string[];
  filesTouched: string[];
  errors: string[];
  summaryMd: string;
}

interface RecorderState {
  /** Project root recordings flush under; null = pane-cwd fallback per session. */
  root: string | null;
  /** sessionIds with buffered/flushed events this run. */
  sessions: string[];
  /** Last time the user "looked" at each session (digest watermark). */
  lastSeenTs: Record<string, number>;

  setRoot: (root: string) => void;
  markSeen: (sessionId: string) => void;
  /** Build {commands,filesTouched,errors,summaryMd} from the recording. */
  digest: (sessionId: string, sinceTs: number) => Promise<SessionDigest>;
}

const FLUSH_INTERVAL_MS = 3_000;
const FLUSH_THRESHOLD_BYTES = 16 * 1024;
const MAX_BUFFERED_EVENTS = 2_000;
const MAX_OUT_CHUNK = 4_096;

/* eslint-disable no-control-regex */
const ANSI_RE = /\x1b(?:\[[0-9;?]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[()][0-9A-Za-z])/g;
/* eslint-enable no-control-regex */
const PROMPT_COMMAND_RE = /(?:^|\n)\s*(?:[$#>❯]|PS [^>]*>)\s+(\S[^\n]*)/g;
const FILE_PATH_RE = /(?:^|[\s"'`(])((?:[A-Za-z]:[\\/]|\.{0,2}\/|~\/)?[\w.-]+(?:[\\/][\w.-]+)+\.[A-Za-z0-9]{1,8})(?=$|[\s"'`),:;])/g;
const ERROR_LINE_RE = /\b(error|panic|exception|traceback|fatal|FAILED|E:\s)\b/i;

interface SessionBuffer {
  events: RecorderEvent[];
  pendingBytes: number;
  flushing: boolean;
}

const buffers = new Map<string, SessionBuffer>();

function bufferFor(sessionId: string): SessionBuffer {
  let buffer = buffers.get(sessionId);
  if (!buffer) {
    buffer = { events: [], pendingBytes: 0, flushing: false };
    buffers.set(sessionId, buffer);
    const state = useRecorder.getState();
    if (!state.sessions.includes(sessionId)) {
      useRecorder.setState({ sessions: [...state.sessions, sessionId] });
    }
  }
  return buffer;
}

/** Recording root for a session: explicit store root, else the pane's cwd
    (the project the session actually runs in). Null = cannot persist. */
function rootFor(sessionId: string): string | null {
  const explicit = useRecorder.getState().root;
  if (explicit) return explicit;
  return usePanes.getState().panes[sessionId]?.cwd ?? null;
}

function pushEvent(sessionId: string, kind: RecorderEventKind, data: string): void {
  const buffer = bufferFor(sessionId);
  buffer.events.push({ ts: Date.now(), kind, data });
  buffer.pendingBytes += data.length + 40;
  // Ring behavior: a flush outage never grows the buffer unboundedly.
  if (buffer.events.length > MAX_BUFFERED_EVENTS) {
    const dropped = buffer.events.splice(0, buffer.events.length - MAX_BUFFERED_EVENTS);
    for (const event of dropped) buffer.pendingBytes -= event.data.length + 40;
  }
  if (buffer.pendingBytes >= FLUSH_THRESHOLD_BYTES) void flushSession(sessionId);
}

async function flushSession(sessionId: string): Promise<void> {
  const buffer = buffers.get(sessionId);
  if (!buffer || buffer.flushing || buffer.events.length === 0) return;
  const root = rootFor(sessionId);
  if (!root) return; // keep ring-buffering; a root may appear later
  buffer.flushing = true;
  const events = buffer.events.splice(0, buffer.events.length);
  buffer.pendingBytes = 0;
  try {
    const lines = events.map((event) => JSON.stringify(event)).join("\n");
    await recorderAppend(root, sessionId, lines);
  } catch {
    // Rust unavailable (browser dev) or disk issue — re-queue at the FRONT so
    // order holds; the ring cap above still bounds memory.
    buffer.events.unshift(...events);
    for (const event of events) buffer.pendingBytes += event.data.length + 40;
  } finally {
    buffer.flushing = false;
  }
}

function flushAll(): void {
  for (const sessionId of buffers.keys()) void flushSession(sessionId);
}

/* ── public taps (terminal engine calls these — one line each in Wave 2) ──── */

/** Record a pane's PTY output chunk (ANSI stripped, per-chunk capped). */
export function recordPaneOutput(paneId: string, chunk: string): void {
  const clean = chunk.replace(ANSI_RE, "");
  if (clean.trim().length === 0) return;
  pushEvent(paneId, "out", clean.length > MAX_OUT_CHUNK ? clean.slice(0, MAX_OUT_CHUNK) : clean);
}

/** Record submitted user input (call on Enter, not per keystroke). */
export function recordPaneInput(paneId: string, line: string): void {
  if (line.trim().length === 0) return;
  pushEvent(paneId, "in", line.slice(0, 1_024));
}

/* ── digest parsing ───────────────────────────────────────────────────────── */

function parseDigestSources(events: RecorderEvent[]): {
  commands: string[];
  filesTouched: string[];
  errors: string[];
} {
  const commands: string[] = [];
  const filesTouched = new Set<string>();
  const errors: string[] = [];

  for (const event of events) {
    if (event.kind === "in") {
      const line = event.data.trim();
      if (line && !commands.includes(line)) commands.push(line);
      continue;
    }
    if (event.kind === "lifecycle") {
      const match = /^exit code (\d+)/.exec(event.data);
      if (match && match[1] !== "0") errors.push(event.data);
      continue;
    }
    if (event.kind !== "out" && event.kind !== "osc") continue;

    for (const match of event.data.matchAll(PROMPT_COMMAND_RE)) {
      const command = match[1].trim();
      if (command && !commands.includes(command)) commands.push(command);
    }
    for (const match of event.data.matchAll(FILE_PATH_RE)) {
      filesTouched.add(match[1]);
    }
    if (event.kind === "out") {
      for (const line of event.data.split("\n")) {
        if (ERROR_LINE_RE.test(line) && line.trim().length > 0 && errors.length < 20) {
          errors.push(line.trim().slice(0, 200));
        }
      }
    }
  }
  return {
    commands: commands.slice(-30),
    filesTouched: [...filesTouched].slice(0, 40),
    errors: errors.slice(0, 20),
  };
}

function fallbackSummary(digest: Omit<SessionDigest, "summaryMd">): string {
  const parts: string[] = [];
  parts.push(
    digest.commands.length > 0
      ? `Ran ${digest.commands.length} command${digest.commands.length === 1 ? "" : "s"} (latest: \`${digest.commands[digest.commands.length - 1]}\`).`
      : "No commands recorded in this window.",
  );
  if (digest.filesTouched.length > 0) {
    parts.push(`Touched ${digest.filesTouched.length} file${digest.filesTouched.length === 1 ? "" : "s"}.`);
  }
  parts.push(
    digest.errors.length > 0
      ? `${digest.errors.length} error signal${digest.errors.length === 1 ? "" : "s"} — first: ${digest.errors[0]}`
      : "No errors detected.",
  );
  return parts.join(" ");
}

async function llmSummary(
  digest: Omit<SessionDigest, "summaryMd">,
  transcriptTail: string,
): Promise<string | null> {
  const hub = useModelHub.getState();
  const model = firstPinnedModel() ?? hub.models[0];
  if (!model) return null; // nothing to call — skip gracefully
  return chatComplete({
    proxyUrl: hub.proxyUrl,
    authToken: hub.authToken || undefined,
    model,
    system:
      "Summarize a terminal session slice for a developer walking back to their desk. " +
      "ONE paragraph, plain prose, ≤80 words. Lead with the outcome, mention errors if any. " +
      "No headings, no lists, no preamble.",
    user: [
      `Commands: ${digest.commands.join("; ") || "(none)"}`,
      `Files touched: ${digest.filesTouched.join(", ") || "(none)"}`,
      `Errors: ${digest.errors.join(" | ") || "(none)"}`,
      "",
      "Output tail:",
      transcriptTail.slice(-3_000),
    ].join("\n"),
    maxTokens: 200,
    temperature: 0.2,
  });
}

export const useRecorder = create<RecorderState>((set, get) => ({
  root: null,
  sessions: [],
  lastSeenTs: {},

  setRoot: (root) => set({ root }),

  markSeen: (sessionId) =>
    set((s) => ({ lastSeenTs: { ...s.lastSeenTs, [sessionId]: Date.now() } })),

  digest: async (sessionId, sinceTs) => {
    // Flush first so the file includes the freshest events.
    await flushSession(sessionId);

    let events: RecorderEvent[] = [];
    const root = rootFor(sessionId);
    if (root) {
      try {
        const lines = await recorderRead(root, sessionId, 0);
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as RecorderEvent;
            if (
              typeof event.ts === "number" &&
              typeof event.data === "string" &&
              event.ts >= sinceTs
            ) events.push(event);
          } catch {
            // A torn/rotated line never breaks the digest.
          }
        }
      } catch {
        // No recording on disk — fall through to the in-memory buffer.
      }
    }
    if (events.length === 0) {
      events = (buffers.get(sessionId)?.events ?? []).filter((event) => event.ts >= sinceTs);
    }

    const sources = parseDigestSources(events);
    const base = { sessionId, sinceTs, ...sources };
    const transcriptTail = events
      .filter((event) => event.kind === "out")
      .map((event) => event.data)
      .join("\n");
    const summary = await llmSummary(base, transcriptTail);
    const result: SessionDigest = { ...base, summaryMd: summary ?? fallbackSummary(base) };
    get().markSeen(sessionId);
    return result;
  },
}));

/* ── auto-subscriptions (lifecycle + OSC) ─────────────────────────────────── */

// Pane lifecycle: state transitions + exits, diffed against the previous map.
let previousPanes = usePanes.getState().panes;
usePanes.subscribe((state) => {
  const current = state.panes;
  if (current === previousPanes) return;
  for (const [paneId, pane] of Object.entries(current)) {
    const before = previousPanes[paneId];
    if (!before) {
      pushEvent(paneId, "lifecycle", `spawn ${pane.command} (cwd ${pane.cwd})`);
    } else if (before.state !== pane.state) {
      if (pane.state === "done" || pane.state === "error") {
        pushEvent(paneId, "lifecycle", `exit code ${pane.exitCode ?? "null"}`);
        void flushSession(paneId);
      } else {
        pushEvent(paneId, "lifecycle", `state ${before.state} → ${pane.state}`);
      }
    }
  }
  for (const paneId of Object.keys(previousPanes)) {
    if (!current[paneId]) {
      pushEvent(paneId, "lifecycle", "pane closed");
      void flushSession(paneId);
    }
  }
  previousPanes = current;
});

// OSC/Stage events: newly appended widgets become 'osc' records.
let previousWidgetCount = useStage.getState().widgets.length;
let lastWidgetTs = 0;
useStage.subscribe((state) => {
  const widgets = state.widgets;
  if (widgets.length <= previousWidgetCount) {
    previousWidgetCount = widgets.length;
    return;
  }
  for (const widget of widgets) {
    if (widget.ts <= lastWidgetTs) continue;
    const label = (widget.payload as { label?: string }).label;
    pushEvent(widget.paneId, "osc", `${widget.type}${label ? ` ${label}` : ""}`);
  }
  lastWidgetTs = widgets.reduce((max, widget) => Math.max(max, widget.ts), lastWidgetTs);
  previousWidgetCount = widgets.length;
});

if (typeof window !== "undefined") {
  window.setInterval(flushAll, FLUSH_INTERVAL_MS);
  window.addEventListener("beforeunload", flushAll);
}
