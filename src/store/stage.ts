/* ══════════════════════════════════════════════════════════════════════════
   useStage — per-pane Stage widgets surfaced by the OSC 5379 channel (§4.3)
   or by a direct user action (FilesView preview). Cooperative/user pushes
   auto-reveal the dock; passive detector pushes append silently. NO SEED — the
   Stage starts empty and only ever shows real dispatches.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import type { StageWidget, OscPayload, AgentKind, StageWidgetType } from "../lib/contract";
import { ptyWrite } from "../lib/commands";
import { useLayout } from "./layout";

interface StageState {
  widgets: StageWidget[];
  /** Push a widget; cooperative/user dispatches reveal by default, detectors do not. */
  push: (w: { paneId: string; agent?: AgentKind; payload: OscPayload; reveal?: boolean }) => void;
  respond: (id: string, send: string) => void;
  dismiss: (id: string) => void;
  clearPane: (paneId: string) => void;
}

const typeOf = (p: OscPayload): StageWidgetType => p.t;
const INTERACTIVE_TYPES: ReadonlySet<StageWidgetType> = new Set(["confirm", "choice", "ask"]);
const MAX_WIDGETS_PER_PANE = 50;
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

export const useStage = create<StageState>((set, get) => ({
  widgets: [],

  push: ({ paneId, agent, payload, reveal = true }) => {
    set((s) => {
      const paneWidgetCount = s.widgets.filter((w) => w.paneId === paneId).length;
      const oldestPaneWidgetIndex = paneWidgetCount >= MAX_WIDGETS_PER_PANE
        ? s.widgets.findIndex((w) => w.paneId === paneId)
        : -1;
      const widgets = oldestPaneWidgetIndex === -1
        ? s.widgets
        : s.widgets.filter((_, index) => index !== oldestPaneWidgetIndex);

      return {
        widgets: [
          ...widgets,
          {
            id: crypto.randomUUID(),
            paneId,
            agent,
            type: typeOf(payload),
            payload,
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

    // SECURITY: callers may invoke this only from an explicit user action. It
    // writes the supplied response verbatim plus one Enter to the SAME pane that
    // surfaced the widget, then synchronously marks it answered. Surfacing,
    // rendering, and hovering never call this path; the guard permits one write.
    void ptyWrite(widget.paneId, send + "\r");
    set((s) => ({
      widgets: s.widgets.map((w) => w.id === id ? { ...w, answered: true } : w),
    }));
  },

  dismiss: (id) => set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) })),
  clearPane: (paneId) => set((s) => ({ widgets: s.widgets.filter((w) => w.paneId !== paneId) })),
}));
