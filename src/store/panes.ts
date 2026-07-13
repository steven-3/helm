/* ══════════════════════════════════════════════════════════════════════════
   usePanes — panes · tabs · splits · active/focus (the terminal topology).

   SEED DATA below mirrors mockup/cockpit.html so Track B has a live target and
   `vite dev` renders something meaningful. Track A GUTS the seed and drives this
   from real PTY spawns (spawnPane → commands.ptySpawn). UI actions (focus, split,
   setActive, switcher) stay UI-only and are safe to keep.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import type { Pane, Tab, AgentKind, PaneState, SplitDir } from "../lib/contract";

interface PanesState {
  tabs: Tab[];
  panes: Record<string, Pane>;
  activeTabId: string;

  setActiveTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  addTab: (seed?: Partial<Pane> & { tabTitle?: string }) => string;

  addPane: (pane: Pane) => void;
  closePane: (paneId: string) => void;
  splitPane: (tabId: string, dir: SplitDir, seed?: Partial<Pane>) => string;
  setActivePane: (tabId: string, paneId: string) => void;
  focusPane: (paneId: string) => void;

  setPaneState: (paneId: string, state: PaneState) => void;
  /** The per-pane switcher: sets agent/model/command (= a new session in that pane). */
  setPaneAgent: (paneId: string, agent: AgentKind, model: string, command: string) => void;
}

let _id = 0;
const uid = (p: string) => `${p}-${++_id}`;

// ── SEED (Track A replaces) ────────────────────────────────────────────────
function seed(): Pick<PanesState, "tabs" | "panes" | "activeTabId"> {
  const mk = (
    id: string,
    tabId: string,
    agent: AgentKind,
    model: string | undefined,
    title: string,
    command: string,
    state: PaneState,
    focused = false,
    cwd = "/mnt/e/Projects/helm",
  ): Pane => ({ id, tabId, agent, model, title, command, state, focused, cwd });

  const panes: Record<string, Pane> = {
    "p-pty": mk("p-pty", "t-1", "claude", "opus-4.8", "pty-stream", "claude", "running", true),
    "p-type": mk("p-type", "t-1", "codex", "gpt-5.6", "type-gen", "codex", "idle"),
    "p-migrate": mk("p-migrate", "t-2", "claude", "opus-4.8", "migrate-db", "claude", "needs-input"),
    "p-scratch": mk("p-scratch", "t-3", "shell", "bash", "scratch", "bash", "idle"),
    "p-e2e": mk("p-e2e", "t-4", "codex", "gpt-5.6", "e2e-tests", "codex", "error"),
  };
  panes["p-e2e"].command = "codex";

  const tabs: Tab[] = [
    { id: "t-1", title: "pty-stream", paneIds: ["p-pty", "p-type"], activePaneId: "p-pty", split: "vertical" },
    { id: "t-2", title: "migrate-db", paneIds: ["p-migrate"], activePaneId: "p-migrate", split: "none" },
    { id: "t-3", title: "scratch", paneIds: ["p-scratch"], activePaneId: "p-scratch", split: "none" },
    { id: "t-4", title: "e2e-tests", paneIds: ["p-e2e"], activePaneId: "p-e2e", split: "none" },
  ];
  return { tabs, panes, activeTabId: "t-1" };
}

export const usePanes = create<PanesState>((set) => ({
  ...seed(),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  closeTab: (tabId) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab) return s;
      const panes = { ...s.panes };
      tab.paneIds.forEach((pid) => delete panes[pid]);
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      const activeTabId =
        s.activeTabId === tabId ? tabs[0]?.id ?? "" : s.activeTabId;
      return { tabs, panes, activeTabId };
    }),

  addTab: (seedPane) => {
    const tabId = uid("t");
    const paneId = uid("p");
    const pane: Pane = {
      id: paneId,
      tabId,
      agent: seedPane?.agent ?? "shell",
      model: seedPane?.model,
      title: seedPane?.title ?? seedPane?.tabTitle ?? "shell",
      command: seedPane?.command ?? "bash",
      cwd: seedPane?.cwd ?? "~",
      state: seedPane?.state ?? "idle",
      focused: true,
    };
    set((s) => ({
      panes: { ...s.panes, [paneId]: pane },
      tabs: [
        ...s.tabs,
        { id: tabId, title: seedPane?.tabTitle ?? pane.title, paneIds: [paneId], activePaneId: paneId, split: "none" },
      ],
      activeTabId: tabId,
    }));
    return tabId;
  },

  addPane: (pane) => set((s) => ({ panes: { ...s.panes, [pane.id]: pane } })),

  closePane: (paneId) =>
    set((s) => {
      const panes = { ...s.panes };
      const pane = panes[paneId];
      delete panes[paneId];
      const tabs = s.tabs
        .map((t) => {
          if (!t.paneIds.includes(paneId)) return t;
          const paneIds = t.paneIds.filter((p) => p !== paneId);
          return {
            ...t,
            paneIds,
            activePaneId: t.activePaneId === paneId ? paneIds[0] ?? "" : t.activePaneId,
            split: paneIds.length > 1 ? t.split : "none",
          };
        })
        .filter((t) => t.paneIds.length > 0);
      void pane;
      return { panes, tabs, activeTabId: tabs.find((t) => t.id === s.activeTabId) ? s.activeTabId : tabs[0]?.id ?? "" };
    }),

  splitPane: (tabId, dir, seedPane) => {
    const paneId = uid("p");
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab) return s;
      const pane: Pane = {
        id: paneId,
        tabId,
        agent: seedPane?.agent ?? "shell",
        model: seedPane?.model,
        title: seedPane?.title ?? "shell",
        command: seedPane?.command ?? "bash",
        cwd: seedPane?.cwd ?? "~",
        state: seedPane?.state ?? "idle",
        focused: false,
      };
      return {
        panes: { ...s.panes, [paneId]: pane },
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, paneIds: [...t.paneIds, paneId], split: dir } : t,
        ),
      };
    });
    return paneId;
  },

  setActivePane: (tabId, paneId) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, activePaneId: paneId } : t)),
    })),

  focusPane: (paneId) =>
    set((s) => {
      const target = s.panes[paneId];
      if (!target) return s;
      const panes: Record<string, Pane> = {};
      for (const [id, p] of Object.entries(s.panes)) {
        panes[id] = { ...p, focused: p.tabId === target.tabId ? id === paneId : p.focused };
      }
      return {
        panes,
        tabs: s.tabs.map((t) => (t.id === target.tabId ? { ...t, activePaneId: paneId } : t)),
      };
    }),

  setPaneState: (paneId, state) =>
    set((s) =>
      s.panes[paneId] ? { panes: { ...s.panes, [paneId]: { ...s.panes[paneId], state } } } : s,
    ),

  setPaneAgent: (paneId, agent, model, command) =>
    set((s) =>
      s.panes[paneId]
        ? { panes: { ...s.panes, [paneId]: { ...s.panes[paneId], agent, model, command } } }
        : s,
    ),
}));
