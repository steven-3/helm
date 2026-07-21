import { create } from "zustand";
import type { ITheme } from "@xterm/xterm";
import type { AgentKind } from "../lib/contract";
import type { DetectedShell } from "../lib/ipc";
import { DEFAULT_TERM_FONT, TERM_FONTS, helmTerminalFont, type TermFontKey } from "../lib/terminal-theme";
import { applyThemeById, type ThemeMode } from "../lib/theme";
import { DEFAULT_THEME_ID, getTheme, validateTheme, type HelmTheme } from "../lib/themes";

const STORAGE_KEY = "helm.settings.v2";
const LEGACY_FONT_KEY = "helm.termFont";
const SETTINGS_VERSION = 12;

/** Auto-created (shell_detect) profiles carry this id prefix so a later sync
    can prune the ones whose shell disappeared without touching user profiles. */
export const DETECTED_PROFILE_PREFIX = "detected-";
const MAX_RECENT_PROJECTS = 10;

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
  /** Agent-profile terminal binding: id of the TERMINAL (shell-kind) profile
      that hosts this agent's command (a WSL-distro host wraps the command via
      wsl.exe; see resolveProfileSpawn). Unset = follow the default terminal
      profile; NO_HOST_PROFILE ("none") = explicit raw spawn (the legacy
      launchViaShell behavior); any other id = that specific host. */
  terminalProfileId?: string;
}

/** `terminalProfileId` sentinel: explicitly host-less — the raw legacy spawn
    (the profile's own command + launchViaShell), never the default fallback. */
export const NO_HOST_PROFILE = "none";

/** Profiles use `shell` as a portable sentinel. Resolve it only at launch so
    saved settings remain valid across WSL, Linux, macOS, and Windows. */
export function resolveProfileCommand(profile: Pick<TerminalProfile, "command">, shell?: string | null): string {
  const command = profile.command.trim();
  // Preserve the sentinel when the frontend cannot know the platform default;
  // Rust resolves it to $SHELL, PowerShell, or cmd as appropriate.
  return command === "shell" ? shell?.trim() || "shell" : command;
}

/** How a profile should actually be spawned once its terminal binding is
    applied. `launchViaShell` is included because a WSL-wrapped command must
    spawn DIRECTLY (wsl.exe is the host shell) even for agent profiles. */
export interface ResolvedSpawn {
  command: string;
  launchViaShell: boolean;
}

/** WSL host detection for the terminal binding: returns the distro name for a
    `wsl.exe -d "<distro>" ...` command, "" for bare `wsl.exe` (default
    distro), and null when the command is not a WSL launcher at all. */
export function wslDistroOf(command: string): string | null {
  const tokens = command.trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const program = (tokens[0] ?? "").replace(/^["']|["']$/g, "").toLowerCase();
  const base = program.split(/[\\/]/).pop() ?? program;
  if (base !== "wsl" && base !== "wsl.exe") return null;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === "-d" || tokens[i] === "--distribution") {
      const name = (tokens[i + 1] ?? "").replace(/^["']|["']$/g, "").trim();
      return name || "";
    }
  }
  return "";
}

/** Quote for `bash -ilc '<command>'` inside a direct-spawn command string.
    The `'"'"'` escape survives both the Rust direct-command tokenizer and a
    POSIX shell, so embedded single quotes round-trip. */
function quotePosixCommand(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/** Shell-kind = a terminal host candidate (identity "Shell / other": the stock
    shell/wsl profiles, detected-* shells, custom shells). Agent profiles
    (claude/opus/codex) can never host — which is also the recursion guard when
    the DEFAULT profile is itself an agent profile. */
export function isShellProfile(profile: Pick<TerminalProfile, "agent">): boolean {
  return profile.agent === "shell";
}

/** Resolve the profile's terminal binding into the final spawn shape.

    Host selection (agent-kind profiles only — a shell profile IS a terminal
    and never re-hosts):
    - `terminalProfileId` unset → the default terminal profile hosts, IF that
      default is shell-kind (an agent-profile default cannot host itself or
      another agent — the binding would recurse);
    - `terminalProfileId` = NO_HOST_PROFILE → no host (explicit legacy spawn);
    - `terminalProfileId` = an id → that profile hosts when it still exists and
      is shell-kind; a dangling/invalid id degrades to no host.

    Host application:
    - WSL-distro host → wrap as
      `wsl.exe -d "<distro>" -- bash -ilc '<agent command>'` (direct spawn);
    - plain Windows shell host (PowerShell / cmd / git-bash) or no host → the
      profile's own command + launchViaShell. The wrap only matters for WSL
      hosts today: a Windows-side agent already gets the right environment via
      launchViaShell, so non-WSL hosts intentionally keep that behavior. */
export function resolveProfileSpawn(
  profile: TerminalProfile,
  allProfiles: TerminalProfile[],
  shell?: string | null,
  defaultProfileId?: string | null,
): ResolvedSpawn {
  const command = resolveProfileCommand(profile, shell);
  const binding = profile.terminalProfileId;
  let host: TerminalProfile | undefined;
  if (!isShellProfile(profile) && binding !== NO_HOST_PROFILE) {
    const hostId = binding ?? defaultProfileId;
    const candidate = hostId
      ? allProfiles.find((item) => item.id === hostId)
      : undefined;
    host = candidate && isShellProfile(candidate) ? candidate : undefined;
  }
  const distro = host ? wslDistroOf(host.command) : null;
  // Never wrap an empty command or the unresolved "shell" sentinel — callers
  // rely on "" to mean "nothing to launch", and Rust resolves the sentinel.
  if (host && distro !== null && command && command !== "shell") {
    // Escape-hatch: a distro name can never legitimately contain a quote.
    const safeDistro = distro.replace(/["']/g, "");
    const target = safeDistro ? `wsl.exe -d "${safeDistro}"` : "wsl.exe";
    return {
      command: `${target} -- bash -ilc ${quotePosixCommand(command)}`,
      launchViaShell: false,
    };
  }
  return { command, launchViaShell: profile.launchViaShell };
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
  {
    id: "wsl",
    label: "WSL",
    description: "Windows Subsystem for Linux (Windows only)",
    // --shell-type login: bare wsl.exe is a NON-login shell (no ~/.profile,
    // user PATH missing) — unlike Windows Terminal's distro profiles.
    command: "wsl.exe --shell-type login",
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
  /** Profile used for newly created terminals; null delegates to the OS shell. */
  defaultProfileId: string | null;
  /** Onboarding flow version the user last completed; null = never run. */
  onboardingCompletedVersion: number | null;
  /** Most-recent-first opened project roots (max 10). */
  recentProjects: string[];
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
  setDefaultProfileId: (id: string | null) => void;
  /** Bind an agent profile to its terminal host: a shell-kind profile id,
      NO_HOST_PROFILE for explicit raw spawn, or null to clear the binding
      (= follow the default terminal profile). */
  setProfileTerminalHost: (profileId: string, hostId: string | null) => void;
  updateProfile: (id: string, patch: Partial<Omit<TerminalProfile, "id">>) => void;
  addProfile: () => void;
  removeProfile: (id: string) => void;
  resetProfiles: () => void;
  resetTerminal: () => void;
  /** Mark the onboarding flow as completed at `version`. */
  completeOnboarding: (version: number) => void;
  /** Record an opened project root (dedupe, most-recent-first, cap 10). */
  addRecentProject: (path: string) => void;
  /** Merge shell_detect results into profiles as `detected-*` terminal
      profiles; prunes previously auto-created ones whose shell disappeared and
      updates a kept one's command when re-detection differs (detected-*
      entries are MANAGED — this is how launch-command fixes reach persisted
      profiles). User-created and agent profiles are never touched. */
  syncDetectedProfiles: (detected: DetectedShell[]) => void;
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
      ...(typeof item.terminalProfileId === "string" && item.terminalProfileId
        ? { terminalProfileId: item.terminalProfileId }
        : {}),
    }];
  });
  return profiles.length > 0 ? profiles : cloneProfiles(DEFAULT_PROFILES);
}

/** Persisted recents: strings only, dedupe, cap. */
function sanitizeRecentProjects(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const path = raw.trim();
    if (path && !out.includes(path)) out.push(path);
    if (out.length >= MAX_RECENT_PROJECTS) break;
  }
  return out;
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
    defaultProfileId: null,
    onboardingCompletedVersion: null as number | null,
    recentProjects: [] as string[],
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PersistedSettings>;
      const savedVersion = typeof saved.version === "number" ? saved.version : 0;
      const profiles = sanitizeProfiles(saved.profiles);
      let migratedProfiles: TerminalProfile[] = savedVersion < 3
        ? profiles.map((profile) => profile.id === "opus-route" && profile.agent === "claude"
          ? { ...profile, agent: "opus" }
          : profile)
        : profiles;
      if (savedVersion < 10 && !migratedProfiles.some((profile) => profile.id === "wsl")) {
        const wslProfile = DEFAULT_PROFILES.find((profile) => profile.id === "wsl");
        if (wslProfile) migratedProfiles = [...migratedProfiles, { ...wslProfile }];
      }
      // v12: WSL launch commands gain --shell-type login (bare wsl.exe is a
      // non-login shell — no ~/.profile, user PATH missing). Only the managed
      // shapes are touched: the stock `wsl` profile still on its default
      // command, and detected-wsl-* profiles (detected- entries are managed;
      // user-created profiles are never rewritten).
      if (savedVersion < 12) {
        migratedProfiles = migratedProfiles.map((profile) => {
          const command = profile.command.trim();
          if (command.includes("--shell-type")) return profile;
          if (profile.id === "wsl" && command === "wsl.exe") {
            return { ...profile, command: "wsl.exe --shell-type login" };
          }
          if (
            profile.id.startsWith(`${DETECTED_PROFILE_PREFIX}wsl-`) &&
            /^wsl(\.exe)?(\s|$)/i.test(command)
          ) {
            return { ...profile, command: `${command} --shell-type login` };
          }
          return profile;
        });
      }
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
        defaultProfileId: typeof saved.defaultProfileId === "string"
          && migratedProfiles.some((profile) => profile.id === saved.defaultProfileId)
          ? saved.defaultProfileId
          : null,
        // v11 additions — older payloads simply lack the keys.
        onboardingCompletedVersion: typeof saved.onboardingCompletedVersion === "number"
          ? saved.onboardingCompletedVersion
          : null,
        recentProjects: sanitizeRecentProjects(saved.recentProjects),
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
  setDefaultProfileId: (id) => set((state) => ({
    defaultProfileId: id && state.profiles.some((profile) => profile.id === id) ? id : null,
  })),
  setProfileTerminalHost: (profileId, hostId) => set((state) => {
    // Accept the sentinel or a live shell-kind profile; anything else clears
    // back to "follow default" (the key is REMOVED, not set to a dangling id).
    const valid = hostId === NO_HOST_PROFILE
      || (hostId != null && state.profiles.some((profile) =>
        profile.id === hostId && isShellProfile(profile)));
    return {
      profiles: state.profiles.map((profile) => {
        if (profile.id !== profileId) return profile;
        const { terminalProfileId: _drop, ...rest } = profile;
        return valid && hostId != null ? { ...rest, terminalProfileId: hostId } : rest;
      }),
    };
  }),
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
  removeProfile: (id) => set((state) => {
    const profiles = state.profiles.length > 1
      ? state.profiles.filter((profile) => profile.id !== id)
      : state.profiles;
    return {
      profiles,
      defaultProfileId: profiles.some((profile) => profile.id === state.defaultProfileId)
        ? state.defaultProfileId
        : null,
    };
  }),
  resetProfiles: () => set((state) => ({
    profiles: cloneProfiles(DEFAULT_PROFILES),
    defaultProfileId: DEFAULT_PROFILES.some((profile) => profile.id === state.defaultProfileId)
      ? state.defaultProfileId
      : null,
  })),
  resetTerminal: () => set({
    termFont: DEFAULT_TERM_FONT,
    terminalFontSize: helmTerminalFont.fontSize,
    terminalLineHeight: helmTerminalFont.lineHeight,
    terminalScreenReaderMode: false,
    renderer: "canvas",
  }),
  completeOnboarding: (version) => set({ onboardingCompletedVersion: version }),
  addRecentProject: (path) => set((state) => {
    const trimmed = path.trim();
    if (!trimmed) return state;
    return {
      recentProjects: [
        trimmed,
        ...state.recentProjects.filter((existing) => existing !== trimmed),
      ].slice(0, MAX_RECENT_PROJECTS),
    };
  }),
  syncDetectedProfiles: (detected) => set((state) => {
    const detectedById = new Map(
      detected.map((shell) => [`${DETECTED_PROFILE_PREFIX}${shell.id}`, shell]),
    );
    // Prune auto-created profiles whose shell disappeared, and refresh the
    // command on the kept ones when re-detection differs — detected-* entries
    // are managed end-to-end, so launch-command fixes (e.g. the WSL
    // --shell-type login flag) heal persisted profiles here. Labels and other
    // fields a user may have edited stay untouched.
    let changed = false;
    const kept = state.profiles
      .filter((profile) =>
        !profile.id.startsWith(DETECTED_PROFILE_PREFIX) || detectedById.has(profile.id))
      .map((profile) => {
        const shell = detectedById.get(profile.id);
        if (!shell || profile.command === shell.command) return profile;
        changed = true;
        return { ...profile, command: shell.command };
      });
    const existingIds = new Set(kept.map((profile) => profile.id));
    const added: TerminalProfile[] = detected
      .filter((shell) => !existingIds.has(`${DETECTED_PROFILE_PREFIX}${shell.id}`))
      .map((shell) => ({
        id: `${DETECTED_PROFILE_PREFIX}${shell.id}`,
        label: shell.label,
        description: shell.path ? `Detected shell (${shell.path})` : "Detected shell",
        command: shell.command,
        agent: "shell" as AgentKind,
        launchViaShell: false,
      }));
    if (added.length === 0 && !changed && kept.length === state.profiles.length) return state;
    const profiles = [...kept, ...added];
    return {
      profiles,
      defaultProfileId: profiles.some((profile) => profile.id === state.defaultProfileId)
        ? state.defaultProfileId
        : null,
    };
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
    defaultProfileId: state.profiles.some((profile) => profile.id === state.defaultProfileId)
      ? state.defaultProfileId
      : null,
    onboardingCompletedVersion: state.onboardingCompletedVersion,
    recentProjects: sanitizeRecentProjects(state.recentProjects),
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
