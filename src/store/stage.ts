/* ══════════════════════════════════════════════════════════════════════════
   useStage — per-pane Stage widgets surfaced by the OSC 5379 channel (§4.3).
   pushWidget auto-reveals the dock (opens the Stage via useLayout). SEED holds
   the mockup's three widgets for pane p-pty; Phase-3 integration replaces the
   seed with real OSC dispatch.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import type { StageWidget, OscPayload, AgentKind, StageWidgetType } from "../lib/contract";
import { useLayout } from "./layout";

interface StageState {
  widgets: StageWidget[];
  /** Push a widget (from an OSC dispatch) and auto-reveal the Stage. */
  push: (w: { paneId: string; agent: AgentKind; payload: OscPayload }) => void;
  dismiss: (id: string) => void;
  clearPane: (paneId: string) => void;
}

const typeOf = (p: OscPayload): StageWidgetType => p.t;

// ── SEED (Phase-3 integration replaces) ────────────────────────────────────
const seedWidgets: StageWidget[] = [
  {
    id: "w-copy", paneId: "p-pty", agent: "claude", type: "copy", ts: 0,
    payload: { v: 1, t: "copy", text: "hlm_tok_9f3c1a7e2b4d5e6f", label: "pane access token" },
  },
  {
    id: "w-link", paneId: "p-pty", agent: "claude", type: "link", ts: 0,
    payload: { v: 1, t: "link", url: "http://localhost:1420", label: "helm dev server · vite" },
  },
  {
    id: "w-img", paneId: "p-pty", agent: "codex", type: "img", ts: 0,
    payload: { v: 1, t: "img", path: "~/dev/helm/bench-throughput.png" },
  },
];

export const useStage = create<StageState>((set) => ({
  widgets: seedWidgets,

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
