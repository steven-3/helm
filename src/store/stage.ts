/* ══════════════════════════════════════════════════════════════════════════
   useStage — per-pane Stage widgets surfaced by the OSC 5379 channel (§4.3)
   or by a direct user action (FilesView preview). Cooperative/user pushes
   auto-reveal the dock; passive detector pushes append silently. NO SEED — the
   Stage starts empty and only ever shows real dispatches.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import type { StageWidget, OscPayload, AgentKind, StageWidgetType } from "../lib/contract";
import { useLayout } from "./layout";

interface StageState {
  widgets: StageWidget[];
  /** Push a widget; cooperative/user dispatches reveal by default, detectors do not. */
  push: (w: { paneId: string; agent?: AgentKind; payload: OscPayload; reveal?: boolean }) => void;
  dismiss: (id: string) => void;
  clearPane: (paneId: string) => void;
}

const typeOf = (p: OscPayload): StageWidgetType => p.t;

export const useStage = create<StageState>((set) => ({
  widgets: [],

  push: ({ paneId, agent, payload, reveal = true }) => {
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
    if (reveal) useLayout.getState().openStage(paneId);
  },

  dismiss: (id) => set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) })),
  clearPane: (paneId) => set((s) => ({ widgets: s.widgets.filter((w) => w.paneId !== paneId) })),
}));
