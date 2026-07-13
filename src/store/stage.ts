/* ══════════════════════════════════════════════════════════════════════════
   useStage — per-pane Stage widgets surfaced by the OSC 5379 channel (§4.3)
   or by a direct user action (FilesView preview). pushWidget auto-reveals the
   dock (opens the Stage via useLayout). NO SEED — the Stage starts empty and
   only ever shows real dispatches.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import type { StageWidget, OscPayload, AgentKind, StageWidgetType } from "../lib/contract";
import { useLayout } from "./layout";

interface StageState {
  widgets: StageWidget[];
  /** Push a widget (OSC dispatch, or agent-less user action) + auto-reveal. */
  push: (w: { paneId: string; agent?: AgentKind; payload: OscPayload }) => void;
  dismiss: (id: string) => void;
  clearPane: (paneId: string) => void;
}

const typeOf = (p: OscPayload): StageWidgetType => p.t;

export const useStage = create<StageState>((set) => ({
  widgets: [],

  push: ({ paneId, agent, payload }) => {
    set((s) => ({
      widgets: [
        ...s.widgets,
        {
          id: crypto.randomUUID(),
          paneId,
          agent,
          type: typeOf(payload),
          payload,
          ts: Date.now(),
        },
      ],
    }));
    useLayout.getState().openStage(paneId);
  },

  dismiss: (id) => set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) })),
  clearPane: (paneId) => set((s) => ({ widgets: s.widgets.filter((w) => w.paneId !== paneId) })),
}));
