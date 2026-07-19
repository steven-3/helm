import type { AgentKind, Pane, SplitDir, Tab } from "../lib/contract";
import { commandBase, usePanes, type PaneTopology } from "./panes";
import { useLayout } from "./layout";
import { useSettings } from "./settings";

const STORAGE_KEY = "helm-workspace-v1";
const LEGACY_STORAGE_KEY = "helm.session.v1";
const VERSION = 1;
const SAVE_DEBOUNCE_MS = 1_000;

export interface SavedWorkspacePane {
  id: string;
  tabId: string;
  profileId?: string;
  command: string;
  launchViaShell?: boolean;
  agent: AgentKind;
  model?: string;
  title: string;
  cwd?: string;
}

export interface SavedWorkspaceTab {
  id: string;
  title: string;
  customTitle?: string;
  paneIds: string[];
  activePaneId: string;
  split: SplitDir;
  sizes?: number[];
}

export interface SavedWorkspace {
  version: 1;
  activeTabId: string;
  tabs: SavedWorkspaceTab[];
  panes: SavedWorkspacePane[];
  layout: {
    sidebarWidth: number;
    stageWidth: number;
  };
}

const uid = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function validAgent(value: unknown): value is AgentKind {
  return value === "claude" || value === "opus" || value === "codex" || value === "shell";
}

function validSplit(value: unknown): value is SplitDir {
  return value === "none" || value === "horizontal" || value === "vertical";
}

function cleanSizes(value: unknown, count: number): number[] | undefined {
  if (!Array.isArray(value) || value.length !== count) return undefined;
  const sizes = value.filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item > 0);
  return sizes.length === count ? sizes : undefined;
}

function parseWorkspace(raw: string | null): SavedWorkspace | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedWorkspace>;
    if (value.version !== VERSION || !Array.isArray(value.tabs) || !Array.isArray(value.panes)) return null;
    return {
      version: VERSION,
      activeTabId: typeof value.activeTabId === "string" ? value.activeTabId : "",
      tabs: value.tabs,
      panes: value.panes,
      layout: {
        sidebarWidth: typeof value.layout?.sidebarWidth === "number"
          ? value.layout.sidebarWidth
          : useLayout.getState().sidebarWidth,
        stageWidth: typeof value.layout?.stageWidth === "number"
          ? value.layout.stageWidth
          : useLayout.getState().stageWidth,
      },
    };
  } catch {
    return null;
  }
}

function currentSnapshot(): SavedWorkspace {
  const panesState = usePanes.getState();
  const layoutState = useLayout.getState();
  const profiles = useSettings.getState().profiles;
  return {
    version: VERSION,
    activeTabId: panesState.activeTabId,
    tabs: panesState.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      customTitle: panesState.tabCustomTitles[tab.id],
      paneIds: [...tab.paneIds],
      activePaneId: tab.activePaneId,
      split: tab.split,
      sizes: tab.sizes ? [...tab.sizes] : undefined,
    })),
    panes: Object.values(panesState.panes).map((pane) => ({
      id: pane.id,
      tabId: pane.tabId,
      profileId: profiles.find((profile) =>
        profile.agent === pane.agent
        && profile.command === pane.command
        && profile.launchViaShell === pane.launchViaShell)?.id,
      command: pane.command,
      launchViaShell: pane.launchViaShell,
      agent: pane.agent,
      model: pane.model,
      title: pane.title,
      cwd: pane.cwd,
    })),
    layout: {
      sidebarWidth: layoutState.sidebarWidth,
      stageWidth: layoutState.stageWidth,
    },
  };
}

function saveWorkspace(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSnapshot()));
  } catch {
    // Workspace persistence is best-effort; live stores remain authoritative.
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (typeof window === "undefined") return;
  if (saveTimer != null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    saveWorkspace();
  }, SAVE_DEBOUNCE_MS);
}

usePanes.subscribe(scheduleSave);
useLayout.subscribe(scheduleSave);

export function getSavedWorkspace(): SavedWorkspace | null {
  if (typeof window === "undefined") return null;
  return parseWorkspace(window.localStorage.getItem(STORAGE_KEY));
}

export function clearSavedWorkspace(): void {
  if (typeof window === "undefined") return;
  if (saveTimer != null) window.clearTimeout(saveTimer);
  saveTimer = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Clearing unavailable storage is a no-op.
  }
}

function toTopology(saved: SavedWorkspace): PaneTopology {
  const sourcePanes = new Map<string, SavedWorkspacePane>();
  for (const value of saved.panes) {
    if (
      value
      && typeof value.id === "string"
      && typeof value.tabId === "string"
      && typeof value.command === "string"
      && value.command.trim()
      && validAgent(value.agent)
      && typeof value.title === "string"
    ) sourcePanes.set(value.id, value);
  }

  const tabs: Tab[] = [];
  const panes: Record<string, Pane> = {};
  const tabCustomTitles: Record<string, string> = {};
  const tabIdMap = new Map<string, string>();

  for (const sourceTab of saved.tabs) {
    if (
      !sourceTab
      || typeof sourceTab.id !== "string"
      || typeof sourceTab.title !== "string"
      || !Array.isArray(sourceTab.paneIds)
    ) continue;

    const sourcePaneIds = sourceTab.paneIds.filter((paneId): paneId is string => {
      const pane = typeof paneId === "string" ? sourcePanes.get(paneId) : undefined;
      return Boolean(pane && pane.tabId === sourceTab.id);
    });
    if (sourcePaneIds.length === 0) continue;

    const tabId = uid("t");
    tabIdMap.set(sourceTab.id, tabId);
    const paneIdMap = new Map(sourcePaneIds.map((paneId) => [paneId, uid("p")]));
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
        cwd: typeof sourcePane.cwd === "string" && sourcePane.cwd ? sourcePane.cwd : "~",
        state: "idle",
        focused: paneId === activePaneId,
      };
    }

    const customTitle = typeof sourceTab.customTitle === "string" ? sourceTab.customTitle.trim() : "";
    if (customTitle) tabCustomTitles[tabId] = customTitle;
    const paneIds = sourcePaneIds.map((paneId) => paneIdMap.get(paneId)!);
    tabs.push({
      id: tabId,
      title: customTitle || sourceTab.title.trim() || panes[activePaneId]?.title || "Terminal",
      paneIds,
      activePaneId,
      split: paneIds.length > 1 && validSplit(sourceTab.split) ? sourceTab.split : "none",
      sizes: cleanSizes(sourceTab.sizes, paneIds.length),
    });
  }

  return {
    tabs,
    panes,
    activeTabId: tabIdMap.get(saved.activeTabId) ?? tabs[0]?.id ?? "",
    tabCustomTitles,
  };
}

export async function restoreWorkspace(): Promise<void> {
  if (typeof window === "undefined" || !useSettings.getState().restoreOnLaunch) return;
  const saved = getSavedWorkspace() ?? parseWorkspace(window.localStorage.getItem(LEGACY_STORAGE_KEY));
  if (!saved) return;
  usePanes.getState().replaceTopology(toTopology(saved));
  useLayout.getState().setSidebarWidth(saved.layout.sidebarWidth);
  useLayout.getState().setStageWidth(saved.layout.stageWidth);
}
