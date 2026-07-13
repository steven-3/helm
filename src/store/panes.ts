/* ══════════════════════════════════════════════════════════════════════════
   usePanes — panes · tabs · splits · active/focus (the terminal topology).

   NO SEED DATA. The store boots EMPTY; src/lib/bootstrap.ts creates the first
   real pane (the user's $SHELL in their real home dir, both resolved by Rust
   sys::env_info). Every pane here is backed by a real PTY spawn — states follow
   its lifecycle plus terminal attention/input signals (terminal-session.ts).
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import type { Pane, Tab, AgentKind, PaneState, SplitDir } from "../lib/contract";
import { useEnv } from "./env";

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
  /** PTY exit — the ONLY source of done/error states (real exit code). */
  setPaneExit: (paneId: string, code: number | null) => void;
  /** The per-pane switcher: sets agent/model/command (= a new session in that pane). */
  setPaneAgent: (
    paneId: string,
    agent: AgentKind,
    model: string | undefined,
    command: string,
    launchViaShell?: boolean,
    title?: string,
  ) => void;
  /** Divider drag — per-pane flex ratios for a tab's split. */
  setTabSizes: (tabId: string, sizes: number[]) => void;
}

// Random ids: a webview reload must never reuse a paneId that a still-living
// Rust PTY session is keyed by (pty_spawn rejects duplicates).
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

export const commandBase = (command: string): string =>
  command.trim().split(/[\\/]/).pop() || command;

/** Real defaults from the environment (Rust env_info); "bash" is the documented
    $SHELL fallback, "~" resolves to the real home in Rust — never a fake path. */
function usableCwd(cwd: string | null): string | null {
  return cwd && cwd !== "/" ? cwd : null;
}

function envDefaults() {
  const env = useEnv.getState();
  return { command: env.shell ?? "shell", cwd: usableCwd(env.cwd) ?? env.home ?? "~" };
}

export const usePanes = create<PanesState>((set) => ({
  tabs: [],
  panes: {},
  activeTabId: "",

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  closeTab: (tabId) =>
    set((s) => {
      const closedIndex = s.tabs.findIndex((t) => t.id === tabId);
      const tab = s.tabs[closedIndex];
      if (!tab) return s;
      const panes = { ...s.panes };
      tab.paneIds.forEach((pid) => delete panes[pid]);
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      const activeTabId =
        s.activeTabId === tabId
          ? tabs[closedIndex]?.id ?? tabs[closedIndex - 1]?.id ?? ""
          : s.activeTabId;
      return { tabs, panes, activeTabId };
    }),

  addTab: (seedPane) => {
    const d = envDefaults();
    const tabId = uid("t");
    const paneId = uid("p");
    const command = seedPane?.command ?? d.command;
    const pane: Pane = {
      id: paneId,
      tabId,
      agent: seedPane?.agent ?? "shell",
      model: seedPane?.model,
      title: seedPane?.title ?? commandBase(command),
      command,
      launchViaShell: seedPane?.launchViaShell ?? false,
      cwd: seedPane?.cwd ?? d.cwd,
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
      const activeIndex = s.tabs.findIndex((tab) => tab.id === s.activeTabId);
      const panes = { ...s.panes };
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
            sizes: undefined, // membership changed — back to equal split
          };
        })
        .filter((t) => t.paneIds.length > 0);
      return {
        panes,
        tabs,
        activeTabId: tabs.find((t) => t.id === s.activeTabId)
          ? s.activeTabId
          : tabs[activeIndex]?.id ?? tabs[activeIndex - 1]?.id ?? "",
      };
    }),

  splitPane: (tabId, dir, seedPane) => {
    const d = envDefaults();
    const paneId = uid("p");
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab) return s;
      const sibling = s.panes[tab.activePaneId];
      const command = seedPane?.command ?? d.command;
      const pane: Pane = {
        id: paneId,
        tabId,
        agent: seedPane?.agent ?? "shell",
        model: seedPane?.model,
        title: seedPane?.title ?? commandBase(command),
        command,
        launchViaShell: seedPane?.launchViaShell ?? false,
        cwd: seedPane?.cwd ?? sibling?.cwd ?? d.cwd,
        state: seedPane?.state ?? "idle",
        focused: false,
      };
      return {
        panes: { ...s.panes, [paneId]: pane },
        tabs: s.tabs.map((t) =>
          t.id === tabId
            ? { ...t, paneIds: [...t.paneIds, paneId], split: dir, sizes: undefined }
            : t,
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
      const activeTab = s.tabs.find((t) => t.id === target.tabId);
      if (target.focused && activeTab?.activePaneId === paneId) return s;
      const panes: Record<string, Pane> = {};
      for (const [id, p] of Object.entries(s.panes)) {
        const focused = p.tabId === target.tabId ? id === paneId : p.focused;
        panes[id] = focused === p.focused ? p : { ...p, focused };
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

  setPaneExit: (paneId, code) =>
    set((s) => {
      const pane = s.panes[paneId];
      if (!pane) return s;
      const state: PaneState = code !== null && code !== 0 ? "error" : "done";
      return { panes: { ...s.panes, [paneId]: { ...pane, state, exitCode: code } } };
    }),

  setPaneAgent: (paneId, agent, model, command, launchViaShell = false, profileTitle) =>
    set((s) => {
      const pane = s.panes[paneId];
      if (!pane) return s;
      const title = profileTitle?.trim() || commandBase(command);
      const next: Pane = {
        ...pane,
        agent,
        model,
        command,
        launchViaShell,
        title,
        state: "idle",
        exitCode: undefined,
      };
      return {
        panes: { ...s.panes, [paneId]: next },
        // a single-pane tab is named after its pane's command
        tabs: s.tabs.map((t) =>
          t.id === pane.tabId && t.paneIds.length === 1 ? { ...t, title } : t,
        ),
      };
    }),

  setTabSizes: (tabId, sizes) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, sizes } : t)),
    })),
}));
