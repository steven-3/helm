import { create } from "zustand";
import type { ITheme } from "@xterm/xterm";
import type { AgentKind } from "../lib/contract";
import { DEFAULT_TERM_FONT, TERM_FONTS, helmTerminalFont, type TermFontKey } from "../lib/terminal-theme";
import { applyThemeById, type ThemeMode } from "../lib/theme";
import { DEFAULT_THEME_ID, getTheme, validateTheme, type HelmTheme } from "../lib/themes";

const STORAGE_KEY = "helm.settings.v2";
const LEGACY_FONT_KEY = "helm.termFont";
const SETTINGS_VERSION = 9;

/** The persisted v3 `theme` mode maps onto registry ids 1:1 (lib/theme.ts). */
const LEGACY_THEME_IDS: Record<ThemeMode, string> = { dark: "helm-void", light: "helm-light" };

/** Matches the <style> element lib/theme.ts owns for override injection
    (DESIGN.md §13.5). Reused verbatim so a custom theme composed here and a
    shipped theme applied via applyThemeById() never fight over two elements. */
const THEME_STYLE_ID = "helm-theme-overrides";

export type TerminalRenderer = "canvas" | "webgl";
/** §12.2 density axis — cozy (default) | compact. Sizes only; type never shrinks. */
export type DensityMode = "cozy" | "compact";

export interface TerminalProfile {
  id: string;
  label: string;
  description: string;
  command: string;
  agent: AgentKind;
  /** Evaluate the command in the user's login shell. This supports aliases and
      functions while keeping the normal shell profile as a direct PTY. */
  launchViaShell: boolean;
}

/** Profiles use `shell` as a portable sentinel. Resolve it only at launch so
    saved settings remain valid across WSL, Linux, macOS, and Windows. */
export function resolveProfileCommand(profile: Pick<TerminalProfile, "command">, shell?: string | null): string {
  const command = profile.command.trim();
  // Preserve the sentinel when the frontend cannot know the platform default;
  // Rust resolves it to $SHELL, PowerShell, or cmd as appropriate.
  return command === "shell" ? shell?.trim() || "shell" : command;
}

export function profileLabel(profile: Pick<TerminalProfile, "label">): string {
  return profile.label.trim() || "Untitled profile";
}

export const DEFAULT_PROFILES: TerminalProfile[] = [
  {
    id: "claude",
    label: "Claude",
    description: "Claude Code in a full interactive session",
    command: "claude",
    agent: "claude",
    launchViaShell: true,
  },
  {
    id: "codex",
    label: "Codex",
    description: "OpenAI Codex CLI with your normal shell environment",
    command: "codex",
    agent: "codex",
    launchViaShell: true,
  },
  {
    id: "opus-route",
    label: "Opus Route",
    description: "Your mixed-model ClaudeX routing profile",
    command: "cx-opus-route",
    agent: "opus",
    launchViaShell: true,
  },
  {
    id: "shell",
    label: "Shell",
    description: "Your default login shell",
    command: "shell",
    agent: "shell",
    launchViaShell: false,
  },
];

interface PersistedSettings {
  version: number;
  termFont: TermFontKey;
  terminalFontSize: number;
  terminalLineHeight: number;
  terminalScreenReaderMode: boolean;
  renderer: TerminalRenderer;
  theme: ThemeMode;
  /** Registry (or custom) theme id — the v4 theme-engine selection (§4.10).
      `theme` above is kept in lock-step as the kind for legacy consumers. */
  themeId: string;
  /** User themes (validated on load); appear in the Appearance gallery. */
  customThemes: HelmTheme[];
  densityMode: DensityMode;
  restoreSession: boolean;
  restoreOnLaunch: boolean;
  accentGlow: boolean;
  stageDetect: boolean;
  /** Silent startup update check + surface the "update ready" pill (§4.1). */
  autoCheckUpdates: boolean;
  /** Fallback command-block detection by prompt heuristic when the OSC 133
      shell-integration snippet is not installed (§4.3). */
  blockHeuristics: boolean;
  profiles: TerminalProfile[];
}

interface SettingsState extends Omit<PersistedSettings, "version"> {
  setTermFont: (key: TermFontKey) => void;
  setTerminalFontSize: (size: number) => void;
  setTerminalLineHeight: (height: number) => void;
  setTerminalScreenReaderMode: (enabled: boolean) => void;
  setRenderer: (renderer: TerminalRenderer) => void;
  setTheme: (theme: ThemeMode) => void;
  /** Select a registry or custom theme by id (keeps `theme` = its kind). */
  setThemeId: (id: string) => void;
  addCustomTheme: (theme: HelmTheme) => void;
  removeCustomTheme: (id: string) => void;
  setDensityMode: (mode: DensityMode) => void;
  setRestoreSession: (enabled: boolean) => void;
  setRestoreOnLaunch: (enabled: boolean) => void;
  setAccentGlow: (enabled: boolean) => void;
  setStageDetect: (enabled: boolean) => void;
  setAutoCheckUpdates: (enabled: boolean) => void;
  setBlockHeuristics: (enabled: boolean) => void;
  updateProfile: (id: string, patch: Partial<Omit<TerminalProfile, "id">>) => void;
  addProfile: () => void;
  removeProfile: (id: string) => void;
  resetProfiles: () => void;
  resetTerminal: () => void;
}

const cloneProfiles = (profiles: TerminalProfile[]) => profiles.map((profile) => ({ ...profile }));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function validAgent(value: unknown): value is AgentKind {
  return value === "claude" || value === "opus" || value === "codex" || value === "shell";
}

/** Re-validate persisted user themes; silently drop any that no longer pass
    the registry gate (validateTheme re-derives a terminal palette if absent). */
function sanitizeCustomThemes(value: unknown): HelmTheme[] {
  if (!Array.isArray(value)) return [];
  const out: HelmTheme[] = [];
  for (const raw of value) {
    const result = validateTheme(raw);
    if (result.ok) out.push(result.theme);
  }
  return out;
}

/** A persisted theme id is valid only if a shipped or custom theme resolves it;
    otherwise fall back to the legacy kind's base theme (never a blank screen). */
function resolveThemeId(saved: unknown, theme: ThemeMode, customThemes: HelmTheme[]): string {
  if (typeof saved === "string" && (getTheme(saved) || customThemes.some((t) => t.id === saved))) {
    return saved;
  }
  return LEGACY_THEME_IDS[theme];
}

function sanitizeProfiles(value: unknown): TerminalProfile[] {
  if (!Array.isArray(value)) return cloneProfiles(DEFAULT_PROFILES);
  const profiles = value.flatMap((raw, index): TerminalProfile[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<TerminalProfile>;
    if (
      typeof item.id !== "string" ||
      typeof item.label !== "string" ||
      typeof item.command !== "string" ||
      !validAgent(item.agent)
    ) return [];
    return [{
      id: item.id || `profile-${index}`,
      label: item.label.trim() || "Untitled profile",
      description: typeof item.description === "string" && item.description.trim()
        ? item.description.trim()
        : "Custom terminal profile",
      command: item.command.trim(),
      agent: item.agent,
      launchViaShell: item.launchViaShell !== false,
    }];
  });
  return profiles.length > 0 ? profiles : cloneProfiles(DEFAULT_PROFILES);
}

function loadSettings(): Omit<PersistedSettings, "version"> {
  const defaults = {
    termFont: DEFAULT_TERM_FONT,
    terminalFontSize: helmTerminalFont.fontSize,
    terminalLineHeight: helmTerminalFont.lineHeight,
    terminalScreenReaderMode: false,
    renderer: "canvas" as TerminalRenderer,
    theme: "dark" as ThemeMode,
    themeId: DEFAULT_THEME_ID,
    customThemes: [] as HelmTheme[],
    densityMode: "cozy" as DensityMode,
    restoreSession: true,
    restoreOnLaunch: true,
    accentGlow: false,
    stageDetect: true,
    autoCheckUpdates: true,
    blockHeuristics: true,
    profiles: cloneProfiles(DEFAULT_PROFILES),
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PersistedSettings>;
      const savedVersion = typeof saved.version === "number" ? saved.version : 0;
      const profiles = sanitizeProfiles(saved.profiles);
      const migratedProfiles: TerminalProfile[] = savedVersion < 3
        ? profiles.map((profile) => profile.id === "opus-route" && profile.agent === "claude"
          ? { ...profile, agent: "opus" }
          : profile)
        : profiles;
      const theme: ThemeMode = saved.theme === "light" ? "light" : "dark";
      const customThemes = sanitizeCustomThemes(saved.customThemes);
      const loaded: Omit<PersistedSettings, "version"> = {
        termFont: typeof saved.termFont === "string" && saved.termFont in TERM_FONTS
          ? saved.termFont as TermFontKey
          : defaults.termFont,
        terminalFontSize: typeof saved.terminalFontSize === "number"
          ? clamp(saved.terminalFontSize, 13, 20)
          : defaults.terminalFontSize,
        terminalLineHeight: typeof saved.terminalLineHeight === "number"
          ? clamp(saved.terminalLineHeight, 1.15, 1.6)
          : defaults.terminalLineHeight,
        terminalScreenReaderMode: saved.terminalScreenReaderMode === true,
        renderer: saved.renderer === "webgl" ? "webgl" : "canvas",
        theme,
        themeId: resolveThemeId(saved.themeId, theme, customThemes),
        customThemes,
        densityMode: saved.densityMode === "compact" ? "compact" : "cozy",
        restoreSession: saved.restoreSession !== false,
        restoreOnLaunch: saved.restoreOnLaunch !== undefined
          ? saved.restoreOnLaunch !== false
          : saved.restoreSession !== false,
        accentGlow: saved.accentGlow === true,
        stageDetect: saved.stageDetect !== false,
        autoCheckUpdates: saved.autoCheckUpdates !== false,
        blockHeuristics: saved.blockHeuristics !== false,
        profiles: migratedProfiles,
      };
      if (savedVersion < SETTINGS_VERSION) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: SETTINGS_VERSION,
            ...loaded,
          }));
        } catch {
          // Settings still load for this process when migration persistence is unavailable.
        }
      }
      return loaded;
    }

    // One-time migration from the original font-only preference.
    const legacyFont = window.localStorage.getItem(LEGACY_FONT_KEY);
    if (legacyFont && legacyFont in TERM_FONTS) defaults.termFont = legacyFont as TermFontKey;
  } catch {
    // Corrupt or unavailable storage falls back to safe bundled defaults.
  }
  return defaults;
}

const initial = loadSettings();

export const useSettings = create<SettingsState>((set) => ({
  ...initial,
  setTermFont: (termFont) => set({ termFont }),
  setTerminalFontSize: (terminalFontSize) => set({ terminalFontSize: clamp(terminalFontSize, 13, 20) }),
  setTerminalLineHeight: (terminalLineHeight) => set({ terminalLineHeight: clamp(terminalLineHeight, 1.15, 1.6) }),
  setTerminalScreenReaderMode: (terminalScreenReaderMode) => set({ terminalScreenReaderMode }),
  setRenderer: (renderer) => set({ renderer }),
  setTheme: (theme) => set({ theme, themeId: LEGACY_THEME_IDS[theme] }),
  setThemeId: (id) => set((state) => {
    const theme = state.customThemes.find((t) => t.id === id) ?? getTheme(id);
    // Keep the legacy kind synced so new terminals + boot pick the right base.
    return theme ? { themeId: id, theme: theme.kind } : { themeId: id };
  }),
  addCustomTheme: (theme) => set((state) => ({
    customThemes: [...state.customThemes.filter((t) => t.id !== theme.id), theme],
  })),
  removeCustomTheme: (id) => set((state) => ({
    customThemes: state.customThemes.filter((t) => t.id !== id),
    // If the removed theme was active, retreat to its kind's base theme.
    ...(state.themeId === id ? { themeId: LEGACY_THEME_IDS[state.theme] } : {}),
  })),
  setDensityMode: (densityMode) => set({ densityMode }),
  setRestoreSession: (restoreSession) => set({ restoreSession, restoreOnLaunch: restoreSession }),
  setRestoreOnLaunch: (restoreOnLaunch) => set({ restoreOnLaunch, restoreSession: restoreOnLaunch }),
  setAccentGlow: (accentGlow) => set({ accentGlow }),
  setStageDetect: (stageDetect) => set({ stageDetect }),
  setAutoCheckUpdates: (autoCheckUpdates) => set({ autoCheckUpdates }),
  setBlockHeuristics: (blockHeuristics) => set({ blockHeuristics }),
  updateProfile: (id, patch) => set((state) => ({
    profiles: state.profiles.map((profile) => profile.id === id ? { ...profile, ...patch, id } : profile),
  })),
  addProfile: () => set((state) => ({
    profiles: [...state.profiles, {
      id: `custom-${crypto.randomUUID().slice(0, 8)}`,
      label: "Custom profile",
      description: "A custom terminal command",
      command: "",
      agent: "shell",
      launchViaShell: true,
    }],
  })),
  removeProfile: (id) => set((state) => ({
    profiles: state.profiles.length > 1 ? state.profiles.filter((profile) => profile.id !== id) : state.profiles,
  })),
  resetProfiles: () => set({ profiles: cloneProfiles(DEFAULT_PROFILES) }),
  resetTerminal: () => set({
    termFont: DEFAULT_TERM_FONT,
    terminalFontSize: helmTerminalFont.fontSize,
    terminalLineHeight: helmTerminalFont.lineHeight,
    terminalScreenReaderMode: false,
    renderer: "canvas",
  }),
}));

useSettings.subscribe((state) => {
  if (typeof window === "undefined") return;
  const saved: PersistedSettings = {
    version: SETTINGS_VERSION,
    termFont: state.termFont,
    terminalFontSize: state.terminalFontSize,
    terminalLineHeight: state.terminalLineHeight,
    terminalScreenReaderMode: state.terminalScreenReaderMode,
    renderer: state.renderer,
    theme: state.theme,
    themeId: state.themeId,
    customThemes: state.customThemes,
    densityMode: state.densityMode,
    restoreSession: state.restoreSession,
    restoreOnLaunch: state.restoreOnLaunch,
    accentGlow: state.accentGlow,
    stageDetect: state.stageDetect,
    autoCheckUpdates: state.autoCheckUpdates,
    blockHeuristics: state.blockHeuristics,
    profiles: sanitizeProfiles(state.profiles),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Preferences continue to work for the current process when storage is unavailable.
  }
});

/* ── Theme-engine application (§4.10) ──────────────────────────────────────────
   The store owns state only; DOM application lives here so live-terminal
   re-theming (applyMountedTerminalTheme) can stay in the component that calls
   applyThemeSelection — importing terminal-session here would form a cycle
   (terminal-session imports this store). Shipped themes route through
   lib/theme.ts's applyThemeById; a user theme (unknown to the registry) mirrors
   the same §13.5 injection contract. */

function injectCustomTheme(theme: HelmTheme): ITheme {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme.id);
  root.setAttribute("data-theme-kind", theme.kind);
  const entries = Object.entries(theme.tokens);
  let el = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (entries.length === 0) {
    el?.remove();
  } else {
    if (!el) {
      el = document.createElement("style");
      el.id = THEME_STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = `:root[data-theme="${theme.id}"]{${entries.map(([k, v]) => `${k}:${v}`).join(";")}}`;
  }
  return theme.terminal;
}

/** Apply a theme id to the document (CSS vars + data-theme + color-scheme via
    kind) and return its xterm ITheme so the caller can re-theme live terminals:
    `applyMountedTerminalTheme(applyThemeSelection(id))`. */
export function applyThemeSelection(id: string): ITheme {
  const custom = useSettings.getState().customThemes.find((t) => t.id === id);
  return custom ? injectCustomTheme(custom) : applyThemeById(id);
}

/** Boot hook (§4.10): apply the persisted theme id — including a user theme the
    registry cannot resolve. Call once at startup AFTER the bundled styles load;
    at boot no terminals are mounted yet, so the returned palette is dropped. */
export function initThemeFromSettings(): void {
  applyThemeSelection(useSettings.getState().themeId);
}
