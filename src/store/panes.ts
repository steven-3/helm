/* ══════════════════════════════════════════════════════════════════════════
   usePanes — panes · tabs · splits · active/focus (the terminal topology).

   Session persistence stores topology only. Restored panes receive new ids and
   idle state so bootstrap mounts fresh PTYs; terminal output is never replayed.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import type { Pane, Tab, AgentKind, PaneState, SplitDir } from "../lib/contract";
import { useEnv } from "./env";
import { useNotifications } from "./notifications";
import { useExplorer } from "./explorer";
import { resolveProfileSpawn, useSettings } from "./settings";

export type GridTemplateCount = 1 | 2 | 4 | 6 | 8 | 9 | 12 | 16;
export type TabAccent = "indigo" | "teal" | "amber" | "violet" | "orange" | "green" | "red" | "slate";

export interface GridTemplate {
  count: GridTemplateCount;
  columns: number;
  rows: number;
}

export const GRID_TEMPLATES: readonly GridTemplate[] = [
  { count: 1, columns: 1, rows: 1 },
  { count: 2, columns: 2, rows: 1 },
  { count: 4, columns: 2, rows: 2 },
  { count: 6, columns: 3, rows: 2 },
  { count: 8, columns: 4, rows: 2 },
  { count: 9, columns: 3, rows: 3 },
  { count: 12, columns: 4, rows: 3 },
  { count: 16, columns: 4, rows: 4 },
] as const;

export const TAB_ACCENT_SLOTS: readonly TabAccent[] = [
  "indigo", "teal", "amber", "violet", "orange", "green", "red", "slate",
] as const;

declare module "../lib/contract" {
  interface Tab {
    template?: GridTemplateCount;
    color?: TabAccent;
  }
}

export interface PaneTopology {
  tabs: Tab[];
  panes: Record<string, Pane>;
  activeTabId: string;
  tabCustomTitles: Record<string, string>;
}

interface PanesState {
  tabs: Tab[];
  panes: Record<string, Pane>;
  activeTabId: string;
  /** User-authored titles survive automatic single-pane agent title changes. */
  tabCustomTitles: Record<string, string>;
  /** Safety-sensitive runtime state: deliberately excluded from persistence. */
  broadcastTabs: Record<string, boolean>;
  broadcastEnabled: boolean;
  broadcastPaneIds: string[];

  setActiveTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  addTab: (seed?: Partial<Pane> & { tabTitle?: string }) => string;
  renameTab: (tabId: string, title: string) => void;
  renamePane: (paneId: string, title: string) => void;
  setTabColor: (tabId: string, color: TabAccent | undefined) => void;
  applyTemplate: (count: GridTemplateCount, tabId?: string) => void;
  moveTab: (from: number, to: number) => void;
  toggleTabBroadcast: (tabId: string) => void;
  toggleBroadcast: () => void;
  setBroadcastPanes: (ids: string[]) => void;
  getBroadcastTargets: (sourcePaneId: string) => string[];
  replaceTopology: (topology: PaneTopology) => void;

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
  const settings = useSettings.getState();
  const defaultProfile = settings.profiles.find((profile) => profile.id === settings.defaultProfileId);
  // The profile's terminal binding (agent hosted in a WSL distro / plain
  // Windows shell) resolves here so every new pane respects it.
  const spawn = defaultProfile
    ? resolveProfileSpawn(defaultProfile, settings.profiles, env.shell)
    : { command: env.shell ?? "shell", launchViaShell: false };
  // Explorer root (the folder the user pointed Files at) wins over the app's
  // launch cwd, so new terminals open in the active project.
  const root = useExplorer.getState().root;
  return {
    command: spawn.command,
    launchViaShell: spawn.launchViaShell,
    cwd: usableCwd(root) ?? usableCwd(env.cwd) ?? env.home ?? "~",
  };
}

function autoTabTitle(tab: Pick<Tab, "paneIds" | "activePaneId">, panes: Record<string, Pane>): string {
  return panes[tab.activePaneId]?.title ?? panes[tab.paneIds[0]]?.title ?? "Terminal";
}

export const usePanes = create<PanesState>((set, get) => ({
  tabs: [],
  panes: {},
  activeTabId: "",
  tabCustomTitles: {},
  broadcastTabs: {},
  broadcastEnabled: false,
  broadcastPaneIds: [],

  setActiveTab: (tabId) => set((state) => state.activeTabId === tabId
    ? state
    : { activeTabId: tabId, broadcastTabs: {}, broadcastEnabled: false, broadcastPaneIds: [] }),

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
      const tabCustomTitles = { ...s.tabCustomTitles };
      const broadcastTabs = { ...s.broadcastTabs };
      delete tabCustomTitles[tabId];
      delete broadcastTabs[tabId];
      const disableBroadcast = activeTabId !== s.activeTabId
        || tab.paneIds.some((paneId) => s.broadcastPaneIds.includes(paneId));
      return {
        tabs,
        panes,
        activeTabId,
        tabCustomTitles,
        broadcastTabs: disableBroadcast ? {} : broadcastTabs,
        broadcastEnabled: disableBroadcast ? false : s.broadcastEnabled,
        broadcastPaneIds: disableBroadcast ? [] : s.broadcastPaneIds,
      };
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
      launchViaShell: seedPane?.command !== undefined
        ? seedPane?.launchViaShell ?? false
        : d.launchViaShell,
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
      broadcastTabs: {},
      broadcastEnabled: false,
      broadcastPaneIds: [],
    }));
    return tabId;
  },

  renameTab: (tabId, value) =>
    set((s) => {
      const tab = s.tabs.find((item) => item.id === tabId);
      if (!tab) return s;
      const title = value.trim();
      const tabCustomTitles = { ...s.tabCustomTitles };
      if (title) tabCustomTitles[tabId] = title;
      else delete tabCustomTitles[tabId];
      return {
        tabCustomTitles,
        tabs: s.tabs.map((item) => item.id === tabId
          ? { ...item, title: title || autoTabTitle(item, s.panes) }
          : item),
      };
    }),

  renamePane: (paneId, value) =>
    set((state) => {
      const pane = state.panes[paneId];
      const title = value.trim();
      if (!pane || !title || pane.title === title) return state;
      return { panes: { ...state.panes, [paneId]: { ...pane, title } } };
    }),

  setTabColor: (tabId, color) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => tab.id === tabId ? { ...tab, color } : tab),
    })),

  applyTemplate: (count, requestedTabId) =>
    set((state) => {
      const preset = GRID_TEMPLATES.find((item) => item.count === count);
      const tabId = requestedTabId ?? state.activeTabId;
      const tab = state.tabs.find((item) => item.id === tabId);
      if (!preset || !tab) return state;

      const defaults = envDefaults();
      const activePane = state.panes[tab.activePaneId] ?? state.panes[tab.paneIds[0]];
      if (!activePane) return state;
      const orderedExisting = [activePane.id, ...tab.paneIds.filter((id) => id !== activePane.id)]
        .filter((id) => Boolean(state.panes[id]));
      const paneIds = orderedExisting.slice(0, count);
      const panes = { ...state.panes };

      while (paneIds.length < count) {
        const paneId = uid("p");
        paneIds.push(paneId);
        panes[paneId] = {
          id: paneId,
          tabId,
          agent: "shell",
          title: commandBase(defaults.command),
          command: defaults.command,
          launchViaShell: defaults.launchViaShell,
          cwd: activePane.cwd ?? defaults.cwd,
          state: "idle",
          focused: false,
        };
      }
      for (const oldPaneId of tab.paneIds) {
        if (!paneIds.includes(oldPaneId)) delete panes[oldPaneId];
      }
      for (const paneId of paneIds) {
        const pane = panes[paneId];
        panes[paneId] = { ...pane, focused: paneId === activePane.id };
      }

      return {
        panes,
        tabs: state.tabs.map((item) => item.id === tabId
          ? {
              ...item,
              paneIds,
              activePaneId: activePane.id,
              split: "none",
              sizes: undefined,
              template: count,
            }
          : item),
        broadcastTabs: {},
        broadcastEnabled: false,
        broadcastPaneIds: [],
      };
    }),

  moveTab: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || from >= s.tabs.length || to < 0 || to >= s.tabs.length) return s;
      const tabs = [...s.tabs];
      const [tab] = tabs.splice(from, 1);
      tabs.splice(to, 0, tab);
      return { tabs };
    }),

  toggleTabBroadcast: (tabId) =>
    set((state) => {
      const tab = state.tabs.find((item) => item.id === tabId);
      if (!tab || tab.id !== state.activeTabId || tab.paneIds.length < 2) return state;
      const enabled = !(state.broadcastEnabled && state.broadcastTabs[tabId]);
      return {
        broadcastTabs: enabled ? { [tabId]: true } : {},
        broadcastEnabled: enabled,
        broadcastPaneIds: enabled ? [...tab.paneIds] : [],
      };
    }),

  toggleBroadcast: () => {
    const { activeTabId, toggleTabBroadcast } = get();
    if (activeTabId) toggleTabBroadcast(activeTabId);
  },

  setBroadcastPanes: (ids) =>
    set((state) => {
      const tab = state.tabs.find((item) => item.id === state.activeTabId);
      if (!tab) return state;
      const paneIds = [...new Set(ids)].filter((id) => tab.paneIds.includes(id) && state.panes[id]);
      const enabled = paneIds.length > 1;
      return {
        broadcastTabs: enabled ? { [tab.id]: true } : {},
        broadcastEnabled: enabled,
        broadcastPaneIds: enabled ? paneIds : [],
      };
    }),

  getBroadcastTargets: (sourcePaneId) => {
    const state = get();
    if (!state.broadcastEnabled || !state.broadcastPaneIds.includes(sourcePaneId)) return [];
    const source = state.panes[sourcePaneId];
    if (!source || source.tabId !== state.activeTabId || !state.broadcastTabs[source.tabId]) return [];
    return state.broadcastPaneIds.filter((id) => id !== sourcePaneId && state.panes[id]?.tabId === source.tabId);
  },

  replaceTopology: (topology) => set({
    ...topology,
    broadcastTabs: {},
    broadcastEnabled: false,
    broadcastPaneIds: [],
  }),

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
            template: undefined,
          };
        })
        .filter((t) => t.paneIds.length > 0);
      const liveTabIds = new Set(tabs.map((tab) => tab.id));
      const tabCustomTitles = Object.fromEntries(
        Object.entries(s.tabCustomTitles).filter(([tabId]) => liveTabIds.has(tabId)),
      );
      const nextActiveTabId = tabs.find((t) => t.id === s.activeTabId)
        ? s.activeTabId
        : tabs[activeIndex]?.id ?? tabs[activeIndex - 1]?.id ?? "";
      const disableBroadcast = s.broadcastPaneIds.includes(paneId) || nextActiveTabId !== s.activeTabId;
      const broadcastTabs = disableBroadcast ? {} : Object.fromEntries(
        Object.entries(s.broadcastTabs).filter(([tabId, enabled]) =>
          enabled && (tabs.find((tab) => tab.id === tabId)?.paneIds.length ?? 0) > 1),
      );
      return {
        panes,
        tabs,
        tabCustomTitles,
        broadcastTabs,
        broadcastEnabled: disableBroadcast ? false : s.broadcastEnabled,
        broadcastPaneIds: disableBroadcast ? [] : s.broadcastPaneIds,
        activeTabId: nextActiveTabId,
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
        launchViaShell: seedPane?.command !== undefined
          ? seedPane?.launchViaShell ?? false
          : d.launchViaShell,
        cwd: seedPane?.cwd ?? sibling?.cwd ?? d.cwd,
        state: seedPane?.state ?? "idle",
        focused: false,
      };
      return {
        panes: { ...s.panes, [paneId]: pane },
        tabs: s.tabs.map((t) =>
          t.id === tabId
            ? { ...t, paneIds: [...t.paneIds, paneId], split: dir, sizes: undefined, template: undefined }
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

  setPaneExit: (paneId, code) => {
    const pane = get().panes[paneId];
    if (!pane) return;
    const state: PaneState = code !== null && code !== 0 ? "error" : "done";
    set((current) => ({ panes: { ...current.panes, [paneId]: { ...pane, state, exitCode: code } } }));
    useNotifications.getState().notify({
      kind: state === "error" ? "error" : "session-exit",
      title: `${pane.title} exited`,
      body: code == null ? "Session ended" : `Exit code ${code}`,
      paneId,
      ts: Date.now(),
    });
  },

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
        // A single-pane tab follows its pane unless the user explicitly renamed it.
        tabs: s.tabs.map((t) =>
          t.id === pane.tabId && t.paneIds.length === 1 && !s.tabCustomTitles[t.id]
            ? { ...t, title }
            : t,
        ),
      };
    }),

  setTabSizes: (tabId, sizes) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, sizes } : t)),
    })),
}));
