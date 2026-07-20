/* ══════════════════════════════════════════════════════════════════════════
   useAttention — the "16 agents, who needs me RIGHT NOW" inbox (§4.7).

   Aggregates three real signal sources:
     1. Stage ask/confirm/choice widgets still unanswered (stage store),
     2. task.blocked bridge verbs (agent explicitly stuck),
     3. long-idle-with-bell sessions — a pane that rang the bell entered
        "needs-input" (terminal-session's markNeedsInput) and has sat there
        past a threshold.
   Sorted by age × urgency (older + more urgent first). resolve() re-uses the
   Stage answer path for widgets (same security guard: explicit user action),
   writes the reply into the pane for blocked tasks, and dismisses idle items.
   sessionId === paneId in helm (roster derives 1:1 from panes).
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import { onTaskVerb, type TaskVerb } from "../lib/ipc";
import { revealPane, sendToPane } from "../lib/dispatch";
import { usePanes } from "./panes";
import { useStage } from "./stage";
import type { StageWidgetType } from "../lib/contract";

export type AttentionKind = "ask" | "confirm" | "choice" | "blocked" | "idle-bell";
/** 3 = agent hard-stuck, 2 = agent waiting on an answer, 1 = probably idle. */
export type AttentionUrgency = 1 | 2 | 3;

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  /** Session = pane in helm. */
  sessionId: string;
  paneId: string;
  title: string;
  detail?: string;
  ts: number;
  urgency: AttentionUrgency;
  /** Present for Stage-widget items — resolve() answers through the Stage. */
  widgetId?: string;
  /** Present for task.blocked items. */
  taskId?: string;
}

interface AttentionState {
  /** Pending items, sorted by age × urgency (most pressing first). */
  queue: AttentionItem[];
  /** Answer/dismiss one item. `answer` reaches the agent for ask/confirm/
      choice (Stage respond) and blocked (pty write); ignored for idle-bell. */
  resolve: (id: string, answer?: string) => void;
  /** Jump the UI to the session that owns an item (deep-link). */
  focusSession: (sessionId: string) => void;
}

const INTERACTIVE: ReadonlySet<StageWidgetType> = new Set(["ask", "confirm", "choice"]);
/** A bell-flagged pane must sit in needs-input this long to become an item. */
const IDLE_BELL_MS = 30_000;
/** Recompute cadence for the time-based idle heuristic. */
const SWEEP_MS = 10_000;

const URGENCY: Record<AttentionKind, AttentionUrgency> = {
  blocked: 3,
  ask: 2,
  confirm: 2,
  choice: 2,
  "idle-bell": 1,
};

/** Blocked verbs are events, not derivable state — keep them here. */
const blockedItems = new Map<string, AttentionItem>();
/** paneId → epoch when it entered needs-input (cleared when it leaves). */
const needsInputSince = new Map<string, number>();
/** Idle-bell dismissals last until the pane LEAVES needs-input once. */
const dismissedIdle = new Set<string>();

const score = (item: AttentionItem, now: number) =>
  Math.max(now - item.ts, 1) * item.urgency;

function paneTitle(paneId: string): string {
  return usePanes.getState().panes[paneId]?.title ?? paneId;
}

function widgetPrompt(payload: Record<string, unknown>): string | undefined {
  return typeof payload.prompt === "string" ? payload.prompt : undefined;
}

function rebuild(): void {
  const now = Date.now();
  const panes = usePanes.getState().panes;
  const items: AttentionItem[] = [];

  // 1. Unanswered interactive Stage widgets (across ALL sessions).
  for (const widget of useStage.getState().widgets) {
    if (!INTERACTIVE.has(widget.type) || widget.answered) continue;
    if (!panes[widget.paneId]) continue;
    const kind = widget.type as AttentionKind;
    items.push({
      id: `w-${widget.id}`,
      kind,
      sessionId: widget.paneId,
      paneId: widget.paneId,
      title: paneTitle(widget.paneId),
      detail: widgetPrompt(widget.payload as unknown as Record<string, unknown>),
      ts: widget.ts,
      urgency: URGENCY[kind],
      widgetId: widget.id,
    });
  }

  // 2. task.blocked verbs (pruned when their pane disappears).
  for (const [key, item] of blockedItems) {
    if (!panes[item.paneId]) {
      blockedItems.delete(key);
      continue;
    }
    items.push(item);
  }

  // 3. Long-idle-with-bell: panes stuck in needs-input past the threshold.
  for (const pane of Object.values(panes)) {
    if (pane.state !== "needs-input") {
      needsInputSince.delete(pane.id);
      dismissedIdle.delete(pane.id);
      continue;
    }
    const since = needsInputSince.get(pane.id) ?? now;
    if (!needsInputSince.has(pane.id)) needsInputSince.set(pane.id, since);
    if (now - since < IDLE_BELL_MS || dismissedIdle.has(pane.id)) continue;
    // A widget/blocked item for the same pane already covers the signal.
    if (items.some((item) => item.paneId === pane.id)) continue;
    items.push({
      id: `idle-${pane.id}`,
      kind: "idle-bell",
      sessionId: pane.id,
      paneId: pane.id,
      title: pane.title,
      detail: "Rang the bell and has been waiting",
      ts: since,
      urgency: URGENCY["idle-bell"],
    });
  }

  // Prune tracking for panes that no longer exist.
  for (const paneId of needsInputSince.keys()) {
    if (!panes[paneId]) needsInputSince.delete(paneId);
  }
  for (const paneId of dismissedIdle) {
    if (!panes[paneId]) dismissedIdle.delete(paneId);
  }

  items.sort((a, b) => score(b, now) - score(a, now));

  // Only publish when membership/order actually changed (subscribers re-render
  // on reference change; sweeps mostly find nothing new).
  const previous = useAttention.getState().queue;
  const unchanged =
    previous.length === items.length &&
    previous.every((item, index) => item.id === items[index].id && item.ts === items[index].ts);
  if (!unchanged) useAttention.setState({ queue: items });
}

export const useAttention = create<AttentionState>((set, get) => ({
  queue: [],

  resolve: (id, answer) => {
    const item = get().queue.find((entry) => entry.id === id);
    if (!item) return;

    if (item.widgetId) {
      // Stage owns the security guard (one response, explicit user action).
      if (answer !== undefined) useStage.getState().respond(item.widgetId, answer);
      else useStage.getState().dismiss(item.widgetId);
    } else if (item.kind === "blocked") {
      if (answer !== undefined && answer.trim()) void sendToPane(item.paneId, answer);
      blockedItems.delete(item.id);
    } else if (item.kind === "idle-bell") {
      dismissedIdle.add(item.paneId);
    }

    // Optimistic removal; the source subscriptions re-derive the truth.
    set((s) => ({ queue: s.queue.filter((entry) => entry.id !== id) }));
    rebuild();
  },

  focusSession: (sessionId) => {
    revealPane(sessionId);
  },
}));

/* ── signal wiring (module scope, once) ───────────────────────────────────── */

function handleTaskVerb(verb: TaskVerb): void {
  if (verb.kind === "task.blocked") {
    const id = `b-${verb.taskId}-${verb.ts}`;
    blockedItems.set(id, {
      id,
      kind: "blocked",
      sessionId: verb.paneId,
      paneId: verb.paneId,
      title: paneTitle(verb.paneId),
      detail: verb.msg ?? `Task ${verb.taskId} is blocked`,
      ts: verb.ts,
      urgency: URGENCY.blocked,
      taskId: verb.taskId,
    });
    rebuild();
    return;
  }
  // progress/done from the same task clears its outstanding blocks.
  for (const [id, item] of blockedItems) {
    if (item.taskId === verb.taskId) blockedItems.delete(id);
  }
  rebuild();
}

onTaskVerb(handleTaskVerb);
useStage.subscribe(rebuild);
usePanes.subscribe(rebuild);
if (typeof window !== "undefined") {
  window.setInterval(rebuild, SWEEP_MS);
}
