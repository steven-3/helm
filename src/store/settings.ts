import { create } from "zustand";
import type { AgentKind } from "../lib/contract";
import { DEFAULT_TERM_FONT, TERM_FONTS, helmTerminalFont, type TermFontKey } from "../lib/terminal-theme";
import type { ThemeMode } from "../lib/theme";

const STORAGE_KEY = "helm.settings.v2";
const LEGACY_FONT_KEY = "helm.termFont";
const SETTINGS_VERSION = 7;

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
  densityMode: DensityMode;
  restoreSession: boolean;
  restoreOnLaunch: boolean;
  accentGlow: boolean;
  stageDetect: boolean;
  profiles: TerminalProfile[];
}

interface SettingsState extends Omit<PersistedSettings, "version"> {
  setTermFont: (key: TermFontKey) => void;
  setTerminalFontSize: (size: number) => void;
  setTerminalLineHeight: (height: number) => void;
  setTerminalScreenReaderMode: (enabled: boolean) => void;
  setRenderer: (renderer: TerminalRenderer) => void;
  setTheme: (theme: ThemeMode) => void;
  setDensityMode: (mode: DensityMode) => void;
  setRestoreSession: (enabled: boolean) => void;
  setRestoreOnLaunch: (enabled: boolean) => void;
  setAccentGlow: (enabled: boolean) => void;
  setStageDetect: (enabled: boolean) => void;
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
    densityMode: "cozy" as DensityMode,
    restoreSession: true,
    restoreOnLaunch: true,
    accentGlow: false,
    stageDetect: true,
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
        theme: saved.theme === "light" ? "light" : "dark",
        densityMode: saved.densityMode === "compact" ? "compact" : "cozy",
        restoreSession: saved.restoreSession !== false,
        restoreOnLaunch: saved.restoreOnLaunch !== undefined
          ? saved.restoreOnLaunch !== false
          : saved.restoreSession !== false,
        accentGlow: saved.accentGlow === true,
        stageDetect: saved.stageDetect !== false,
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
  setTheme: (theme) => set({ theme }),
  setDensityMode: (densityMode) => set({ densityMode }),
  setRestoreSession: (restoreSession) => set({ restoreSession, restoreOnLaunch: restoreSession }),
  setRestoreOnLaunch: (restoreOnLaunch) => set({ restoreOnLaunch, restoreSession: restoreOnLaunch }),
  setAccentGlow: (accentGlow) => set({ accentGlow }),
  setStageDetect: (stageDetect) => set({ stageDetect }),
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
    densityMode: state.densityMode,
    restoreSession: state.restoreSession,
    restoreOnLaunch: state.restoreOnLaunch,
    accentGlow: state.accentGlow,
    stageDetect: state.stageDetect,
    profiles: sanitizeProfiles(state.profiles),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Preferences continue to work for the current process when storage is unavailable.
  }
});
