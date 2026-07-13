import { create } from "zustand";
import type { AgentKind } from "../lib/contract";
import { DEFAULT_TERM_FONT, TERM_FONTS, helmTerminalFont, type TermFontKey } from "../lib/terminal-theme";

const STORAGE_KEY = "helm.settings.v2";
const LEGACY_FONT_KEY = "helm.termFont";
const SETTINGS_VERSION = 2;

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
    agent: "claude",
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
  accentGlow: boolean;
  profiles: TerminalProfile[];
}

interface SettingsState extends Omit<PersistedSettings, "version"> {
  setTermFont: (key: TermFontKey) => void;
  setTerminalFontSize: (size: number) => void;
  setTerminalLineHeight: (height: number) => void;
  setTerminalScreenReaderMode: (enabled: boolean) => void;
  setAccentGlow: (enabled: boolean) => void;
  updateProfile: (id: string, patch: Partial<Omit<TerminalProfile, "id">>) => void;
  addProfile: () => void;
  removeProfile: (id: string) => void;
  resetProfiles: () => void;
  resetTerminal: () => void;
}

const cloneProfiles = (profiles: TerminalProfile[]) => profiles.map((profile) => ({ ...profile }));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function validAgent(value: unknown): value is AgentKind {
  return value === "claude" || value === "codex" || value === "shell";
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
    accentGlow: false,
    profiles: cloneProfiles(DEFAULT_PROFILES),
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PersistedSettings>;
      return {
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
        accentGlow: saved.accentGlow === true,
        profiles: sanitizeProfiles(saved.profiles),
      };
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
  setAccentGlow: (accentGlow) => set({ accentGlow }),
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
    accentGlow: state.accentGlow,
    profiles: sanitizeProfiles(state.profiles),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Preferences continue to work for the current process when storage is unavailable.
  }
});
