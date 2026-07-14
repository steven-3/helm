/* ══════════════════════════════════════════════════════════════════════════
   usePanes — panes · tabs · splits · active/focus (the terminal topology).

   Session persistence stores topology only. Restored panes receive new ids and
   idle state so bootstrap mounts fresh PTYs; terminal output is never replayed.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import type { Pane, Tab, AgentKind, PaneState, SplitDir } from "../lib/contract";
import { useEnv } from "./env";
import { useSettings } from "./settings";

const SESSION_STORAGE_KEY = "helm.session.v1";
const SESSION_VERSION = 1;

interface PersistedPane {
  id: string;
  tabId: string;
  command: string;
  launchViaShell?: boolean;
  agent: AgentKind;
  model?: string;
  title: string;
  cwd: string;
}

interface PersistedTab {
  id: string;
  title: string;
  customTitle?: string;
  paneIds: string[];
  activePaneId: string;
  split: SplitDir;
  sizes?: number[];
}

interface PersistedSession {
  version: number;
  tabs: PersistedTab[];
  panes: PersistedPane[];
  activeTabId: string;
}

interface PanesState {
  tabs: Tab[];
  panes: Record<string, Pane>;
  activeTabId: string;
  /** User-authored titles survive automatic single-pane agent title changes. */
  tabCustomTitles: Record<string, string>;
  /** Safety-sensitive runtime state: deliberately excluded from persistence. */
  broadcastTabs: Record<string, boolean>;

  setActiveTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  addTab: (seed?: Partial<Pane> & { tabTitle?: string }) => string;
  renameTab: (tabId: string, title: string) => void;
  moveTab: (from: number, to: number) => void;
  toggleTabBroadcast: (tabId: string) => void;

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

function validAgent(value: unknown): value is AgentKind {
  return value === "claude" || value === "opus" || value === "codex" || value === "shell";
}

function validSplit(value: unknown): value is SplitDir {
  return value === "none" || value === "horizontal" || value === "vertical";
}

function autoTabTitle(tab: Pick<Tab, "paneIds" | "activePaneId">, panes: Record<string, Pane>): string {
  return panes[tab.activePaneId]?.title ?? panes[tab.paneIds[0]]?.title ?? "Terminal";
}

function cleanSizes(value: unknown, count: number): number[] | undefined {
  if (!Array.isArray(value) || value.length !== count) return undefined;
  const sizes = value.filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item > 0);
  return sizes.length === count ? sizes : undefined;
}

function loadSession(): Pick<PanesState, "tabs" | "panes" | "activeTabId" | "tabCustomTitles" | "broadcastTabs"> {
  const empty = {
    tabs: [],
    panes: {},
    activeTabId: "",
    tabCustomTitles: {},
    broadcastTabs: {},
  };
  if (typeof window === "undefined" || !useSettings.getState().restoreSession) return empty;

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return empty;
    const saved = JSON.parse(raw) as Partial<PersistedSession>;
    if (saved.version !== SESSION_VERSION || !Array.isArray(saved.tabs) || !Array.isArray(saved.panes)) return empty;

    const sourcePanes = new Map<string, PersistedPane>();
    for (const value of saved.panes) {
      if (
        value &&
        typeof value.id === "string" &&
        typeof value.tabId === "string" &&
        typeof value.command === "string" &&
        value.command.trim() &&
        validAgent(value.agent) &&
        typeof value.title === "string" &&
        typeof value.cwd === "string"
      ) sourcePanes.set(value.id, value);
    }

    const tabs: Tab[] = [];
    const panes: Record<string, Pane> = {};
    const tabCustomTitles: Record<string, string> = {};
    const tabIdMap = new Map<string, string>();

    for (const sourceTab of saved.tabs) {
      if (
        !sourceTab ||
        typeof sourceTab.id !== "string" ||
        typeof sourceTab.title !== "string" ||
        !Array.isArray(sourceTab.paneIds)
      ) continue;

      const sourcePaneIds = sourceTab.paneIds.filter((paneId): paneId is string => {
        const pane = typeof paneId === "string" ? sourcePanes.get(paneId) : undefined;
        return Boolean(pane && pane.tabId === sourceTab.id);
      });
      if (sourcePaneIds.length === 0) continue;

      const tabId = uid("t");
      tabIdMap.set(sourceTab.id, tabId);
      const paneIdMap = new Map<string, string>();
      for (const sourcePaneId of sourcePaneIds) paneIdMap.set(sourcePaneId, uid("p"));
      const activePaneId = paneIdMap.get(sourceTab.activePaneId) ?? paneIdMap.get(sourcePaneIds[0])!;

      for (const sourcePaneId of sourcePaneIds) {
        const sourcePane = sourcePanes.get(sourcePaneId)!;
        const paneId = paneIdMap.get(sourcePaneId)!;
        panes[paneId] = {
          id: paneId,
          tabId,
          command: sourcePane.command.trim(),
          launchViaShell: sourcePane.launchViaShell === true,
          agent: sourcePane.agent,
          model: typeof sourcePane.model === "string" ? sourcePane.model : undefined,
          title: sourcePane.title.trim() || commandBase(sourcePane.command),
          cwd: sourcePane.cwd || "~",
          state: "idle",
          focused: paneId === activePaneId,
        };
      }

      const customTitle = typeof sourceTab.customTitle === "string" ? sourceTab.customTitle.trim() : "";
      if (customTitle) tabCustomTitles[tabId] = customTitle;
      const paneIds = sourcePaneIds.map((paneId) => paneIdMap.get(paneId)!);
      tabs.push({
        id: tabId,
        title: customTitle || sourceTab.title.trim() || autoTabTitle({ paneIds, activePaneId }, panes),
        paneIds,
        activePaneId,
        split: paneIds.length > 1 && validSplit(sourceTab.split) ? sourceTab.split : "none",
        sizes: cleanSizes(sourceTab.sizes, paneIds.length),
      });
    }

    const activeTabId = tabIdMap.get(saved.activeTabId ?? "") ?? tabs[0]?.id ?? "";
    return { tabs, panes, activeTabId, tabCustomTitles, broadcastTabs: {} };
  } catch {
    return empty;
  }
}

const initial = loadSession();

export const usePanes = create<PanesState>((set) => ({
  ...initial,

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
      const tabCustomTitles = { ...s.tabCustomTitles };
      const broadcastTabs = { ...s.broadcastTabs };
      delete tabCustomTitles[tabId];
      delete broadcastTabs[tabId];
      return { tabs, panes, activeTabId, tabCustomTitles, broadcastTabs };
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

  moveTab: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || from >= s.tabs.length || to < 0 || to >= s.tabs.length) return s;
      const tabs = [...s.tabs];
      const [tab] = tabs.splice(from, 1);
      tabs.splice(to, 0, tab);
      return { tabs };
    }),

  toggleTabBroadcast: (tabId) =>
    set((s) => {
      const tab = s.tabs.find((item) => item.id === tabId);
      if (!tab || tab.paneIds.length < 2) return s;
      return { broadcastTabs: { ...s.broadcastTabs, [tabId]: !s.broadcastTabs[tabId] } };
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
          };
        })
        .filter((t) => t.paneIds.length > 0);
      const liveTabIds = new Set(tabs.map((tab) => tab.id));
      const tabCustomTitles = Object.fromEntries(
        Object.entries(s.tabCustomTitles).filter(([tabId]) => liveTabIds.has(tabId)),
      );
      const broadcastTabs = Object.fromEntries(
        Object.entries(s.broadcastTabs).filter(([tabId, enabled]) =>
          enabled && (tabs.find((tab) => tab.id === tabId)?.paneIds.length ?? 0) > 1),
      );
      return {
        panes,
        tabs,
        tabCustomTitles,
        broadcastTabs,
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

usePanes.subscribe((state) => {
  if (typeof window === "undefined") return;
  const saved: PersistedSession = {
    version: SESSION_VERSION,
    activeTabId: state.activeTabId,
    tabs: state.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      customTitle: state.tabCustomTitles[tab.id],
      paneIds: [...tab.paneIds],
      activePaneId: tab.activePaneId,
      split: tab.split,
      sizes: tab.sizes ? [...tab.sizes] : undefined,
    })),
    panes: Object.values(state.panes).map((pane) => ({
      id: pane.id,
      tabId: pane.tabId,
      command: pane.command,
      launchViaShell: pane.launchViaShell,
      agent: pane.agent,
      model: pane.model,
      title: pane.title,
      cwd: pane.cwd,
    })),
  };
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Session persistence is best-effort; live topology remains authoritative.
  }
});
