/* ══════════════════════════════════════════════════════════════════════════
   useStage — per-pane Stage widgets surfaced by the OSC 5379 channel (§4.3)
   or by a direct user action (FilesView preview). Cooperative/user pushes
   auto-reveal the dock; passive detector pushes append silently. NO SEED — the
   Stage starts empty and only ever shows real dispatches.

   WS-9 additions:
   • progress dedupe/update — a `progress` payload carrying an `id` UPDATES the
     matching live progress widget in place (same widget id, new payload + ts)
     instead of stacking a new card, so a ticking bar animates one element.
   • pinning — `pinnedIds` (a parallel Set; StageWidget in contract.ts is frozen,
     so pin state is NOT stored on the widget and is NOT persisted). Pinned widgets
     are excluded from the FIFO cap eviction and from clearPane; Stage renders them
     first. Dismiss still removes a pinned card (an explicit user act) and prunes
     its id from the set.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import type { StageWidget, OscPayload, OscProgress, AgentKind, StageWidgetType } from "../lib/contract";
import { bridgeRespond, ptyWrite } from "../lib/commands";
import { useLayout } from "./layout";

interface StageState {
  widgets: StageWidget[];
  /** Ids of pinned widgets (parallel to widgets; NOT on the frozen StageWidget,
      NOT persisted). Pinned widgets survive the FIFO cap + clearPane and sort first. */
  pinnedIds: Set<string>;
  /** Push a widget; cooperative/user dispatches reveal by default, detectors do not. */
  push: (w: { paneId: string; agent?: AgentKind; payload: OscPayload; reveal?: boolean; bridgeRequestId?: string }) => void;
  respond: (id: string, send: string) => void;
  dismiss: (id: string) => void;
  clearPane: (paneId: string) => void;
  /** Toggle a widget's pinned state (excludes it from the cap + clearPane). */
  togglePin: (id: string) => void;
}

const typeOf = (p: OscPayload): StageWidgetType => p.t;
const INTERACTIVE_TYPES: ReadonlySet<StageWidgetType> = new Set(["confirm", "choice", "ask"]);
const MAX_WIDGETS_PER_PANE = 50;
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

export const useStage = create<StageState>((set, get) => ({
  widgets: [],
  pinnedIds: new Set<string>(),

  push: ({ paneId, agent, payload, reveal = true, bridgeRequestId }) => {
    set((s) => {
      // ── progress UPDATE: a progress payload with an id replaces the matching
      //    LIVE progress widget (still in the array = not dismissed) from the same
      //    pane, in place — same widget id/position, fresh payload + ts. Never
      //    appends, so it does not consume a FIFO slot on every tick. ──
      if (payload.t === "progress" && (payload as OscProgress).id !== undefined) {
        const targetId = (payload as OscProgress).id;
        const existing = s.widgets.find(
          (w) =>
            w.paneId === paneId &&
            w.type === "progress" &&
            (w.payload as OscProgress).id === targetId,
        );
        if (existing) {
          return {
            widgets: s.widgets.map((w) =>
              w.id === existing.id ? { ...w, payload, bridgeRequestId, ts: Date.now() } : w,
            ),
          };
        }
      }

      // ── FIFO cap: at capacity, evict the OLDEST UNPINNED widget of this pane
      //    (pinned cards are protected). If every pane widget is pinned there is
      //    nothing to evict, so we append rather than drop a user-kept card. ──
      const paneWidgetCount = s.widgets.filter((w) => w.paneId === paneId).length;
      const oldestUnpinnedIndex = paneWidgetCount >= MAX_WIDGETS_PER_PANE
        ? s.widgets.findIndex((w) => w.paneId === paneId && !s.pinnedIds.has(w.id))
        : -1;
      const widgets = oldestUnpinnedIndex === -1
        ? s.widgets
        : s.widgets.filter((_, index) => index !== oldestUnpinnedIndex);

      return {
        widgets: [
          ...widgets,
          {
            id: crypto.randomUUID(),
            paneId,
            agent,
            type: typeOf(payload),
            payload,
            bridgeRequestId,
            ts: Date.now(),
          },
        ],
      };
    });
    if (reveal) useLayout.getState().openStage(paneId);
  },

  respond: (id, send) => {
    const widget = get().widgets.find((w) => w.id === id);
    if (!widget || widget.answered || !INTERACTIVE_TYPES.has(widget.type)) return;
    if (CONTROL_CHAR_RE.test(send)) return;

    // SECURITY: callers may invoke this only from an explicit user action. Bridge
    // widgets answer the parked HTTP request; terminal widgets write the supplied
    // response verbatim plus one Enter to the SAME pane. Surfacing, rendering, and
    // hovering never call this path; the guard permits one response.
    if (widget.bridgeRequestId) void bridgeRespond(widget.bridgeRequestId, send);
    else void ptyWrite(widget.paneId, send + "\r");
    set((s) => ({
      widgets: s.widgets.map((w) => w.id === id ? { ...w, answered: true } : w),
    }));
  },

  // Dismiss removes the widget (works on pinned too — an explicit user act) and
  // prunes any pin record so the parallel Set never leaks removed ids.
  dismiss: (id) => set((s) => {
    if (!s.pinnedIds.has(id)) {
      return { widgets: s.widgets.filter((w) => w.id !== id) };
    }
    const pinnedIds = new Set(s.pinnedIds);
    pinnedIds.delete(id);
    return { widgets: s.widgets.filter((w) => w.id !== id), pinnedIds };
  }),

  // Clear the pane's cards but KEEP pinned ones (Stage's "Clear unpinned").
  clearPane: (paneId) => set((s) => ({
    widgets: s.widgets.filter((w) => w.paneId !== paneId || s.pinnedIds.has(w.id)),
  })),

  togglePin: (id) => set((s) => {
    const pinnedIds = new Set(s.pinnedIds);
    if (pinnedIds.has(id)) pinnedIds.delete(id);
    else pinnedIds.add(id);
    return { pinnedIds };
  }),
}));
