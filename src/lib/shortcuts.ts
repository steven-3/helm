import { usePalette } from "../store/palette";
import { usePanes } from "../store/panes";
import { useCheatsheet } from "../store/cheatsheet";
import { getCommandList, runCommand } from "./commands";

export interface ShortcutRegistration {
  id: string;
  keys: string;
  description: string;
  category: string;
  handler: (event: KeyboardEvent) => void;
  when?: () => boolean;
  global?: boolean;
}

export interface ShortcutListItem {
  id: string;
  keys: string;
  description: string;
}

export interface ShortcutListGroup {
  category: string;
  items: ShortcutListItem[];
}

const STORAGE_KEY = "helm.keybinds.v1";
const shortcuts = new Map<string, ShortcutRegistration>();
let initialized = false;
let unregisterDefaults: (() => void)[] = [];
let shortcutCaptureActive = false;

function loadOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([id, keys]) => id.trim() && typeof keys === "string" && keys.trim())
        .map(([id, keys]) => [id.trim(), (keys as string).trim().toLowerCase()]),
    );
  } catch {
    return {};
  }
}

let overrides = loadOverrides();

function persistOverrides(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Effective shortcuts remain live for this process when storage is unavailable.
  }
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

function normalizedKey(key: string): string {
  const lower = key.toLowerCase();
  const aliases: Record<string, string> = {
    " ": "space",
    escape: "esc",
    arrowup: "up",
    arrowdown: "down",
    arrowleft: "left",
    arrowright: "right",
    return: "enter",
  };
  return aliases[lower] ?? lower;
}

function parseKeys(keys: string): { key: string; mod: boolean; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean } {
  const parts = keys.toLowerCase().split("+").map((part) => part.trim()).filter(Boolean);
  const modifiers = new Set(parts.filter((part) => ["mod", "ctrl", "control", "cmd", "command", "meta", "shift", "alt", "option"].includes(part)));
  const key = parts.find((part) => !modifiers.has(part)) ?? "";
  return {
    key: normalizedKey(key),
    mod: modifiers.has("mod"),
    ctrl: modifiers.has("ctrl") || modifiers.has("control"),
    meta: modifiers.has("cmd") || modifiers.has("command") || modifiers.has("meta"),
    shift: modifiers.has("shift"),
    alt: modifiers.has("alt") || modifiers.has("option"),
  };
}

/** The persisted override for an id, falling back to its registered default. */
export function getEffectiveShortcut(id: string): string | null {
  if (Object.prototype.hasOwnProperty.call(overrides, id)) return overrides[id];
  return shortcuts.get(id)?.keys ?? null;
}

/** Set an override, or pass null to restore the registered default. */
export function setShortcutOverride(id: string, accel: string | null): void {
  const key = id.trim();
  if (!key) return;
  if (accel && accel.trim()) overrides = { ...overrides, [key]: accel.trim().toLowerCase() };
  else {
    const next = { ...overrides };
    delete next[key];
    overrides = next;
  }
  persistOverrides();
}

/** Disable registered actions while the shortcut editor owns keyboard capture. */
export function setShortcutCaptureActive(active: boolean): void {
  shortcutCaptureActive = active;
}

/** Convert a physical key event into Helm's platform-neutral accelerator syntax. */
export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const key = normalizedKey(event.key);
  if (["control", "ctrl", "shift", "alt", "meta", "command", "cmd", "option"].includes(key)) return null;

  const mac = isMacPlatform();
  const parts: string[] = [];
  if (event.ctrlKey) parts.push(mac ? "ctrl" : "mod");
  if (event.metaKey) parts.push(mac ? "mod" : "meta");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

/** Match an event against an id's override before its supplied/default keys. */
export function matches(event: KeyboardEvent, id: string, defaultKeys?: string): boolean {
  const keys = getEffectiveShortcut(id) ?? defaultKeys;
  if (!keys) return false;
  const expected = parseKeys(keys);
  const mac = isMacPlatform();
  const expectedCtrl = expected.ctrl || (expected.mod && !mac);
  const expectedMeta = expected.meta || (expected.mod && mac);
  return normalizedKey(event.key) === expected.key
    && event.ctrlKey === expectedCtrl
    && event.metaKey === expectedMeta
    && event.shiftKey === expected.shift
    && event.altKey === expected.alt;
}

function focusSuppressesShortcut(event: KeyboardEvent): boolean {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return [target, active].some((element) => element != null && (
    element.tagName === "INPUT"
    || element.tagName === "TEXTAREA"
    || element.classList.contains("xterm-helper-textarea")
    || Boolean(element.closest(".xterm"))
  ));
}

function onKeyDown(event: KeyboardEvent): void {
  if (shortcutCaptureActive) return;
  for (const shortcut of shortcuts.values()) {
    if (!matches(event, shortcut.id, shortcut.keys)) continue;
    if (!shortcut.global && focusSuppressesShortcut(event)) continue;
    if (shortcut.when && !shortcut.when()) continue;
    event.preventDefault();
    // Globals listen in CAPTURE phase (see initShortcuts), so they fire BEFORE
    // xterm's own capture-phase textarea keydown; stopImmediatePropagation halts
    // the walk so the key never reaches the PTY. Repeats are swallowed.
    if (shortcut.global) event.stopImmediatePropagation();
    if (!event.repeat) shortcut.handler(event);
    return;
  }
}

export function registerShortcut(shortcut: ShortcutRegistration): () => void {
  shortcuts.set(shortcut.id, shortcut);
  return () => {
    if (shortcuts.get(shortcut.id) === shortcut) shortcuts.delete(shortcut.id);
  };
}

export function initShortcuts(): void {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  unregisterDefaults = [
    registerShortcut({
      id: "palette.open",
      keys: "mod+k",
      description: "Open command palette",
      category: "General",
      global: true,
      handler: () => usePalette.getState().toggle(),
    }),
    registerShortcut({
      id: "pane.find",
      keys: "mod+f",
      description: "Find in terminal",
      category: "Terminal",
      when: () => false,
      handler: () => {},
    }),
    registerShortcut({
      id: "tab.broadcast",
      keys: "mod+alt+b",
      description: "Toggle broadcast input",
      category: "Terminal",
      global: true,
      handler: () => usePanes.getState().toggleBroadcast(),
    }),
    registerShortcut({
      id: "help.cheatsheet",
      keys: "mod+/",
      description: "Keyboard shortcuts",
      category: "Help",
      global: true,
      when: () => !usePalette.getState().open,
      handler: () => useCheatsheet.getState().toggle(),
    }),
    ...getCommandList()
      .filter((command) => command.shortcut)
      .map((command) => registerShortcut({
        id: command.id,
        keys: command.shortcut!,
        description: command.label,
        category: command.category,
        global: true,
        handler: () => runCommand(command.id),
      })),
  ];
  window.addEventListener("keydown", onKeyDown, true);
}

export function disposeShortcuts(): void {
  if (typeof window === "undefined" || !initialized) return;
  window.removeEventListener("keydown", onKeyDown, true);
  for (const unregister of unregisterDefaults) unregister();
  unregisterDefaults = [];
  initialized = false;
}

export function getShortcutById(id: string): ShortcutRegistration | undefined {
  const shortcut = shortcuts.get(id);
  if (!shortcut) return undefined;
  return { ...shortcut, keys: getEffectiveShortcut(id) ?? shortcut.keys };
}

export function getShortcutList(): ShortcutListGroup[] {
  const groups = new Map<string, ShortcutListItem[]>();
  for (const shortcut of shortcuts.values()) {
    const items = groups.get(shortcut.category) ?? [];
    items.push({
      id: shortcut.id,
      keys: getEffectiveShortcut(shortcut.id) ?? shortcut.keys,
      description: shortcut.description,
    });
    groups.set(shortcut.category, items);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.description.localeCompare(b.description)),
    }));
}

export function formatKeys(keys: string): string {
  const mac = isMacPlatform();
  const labels: Record<string, string> = mac
    ? { mod: "⌘", ctrl: "⌃", control: "⌃", cmd: "⌘", command: "⌘", meta: "⌘", shift: "⇧", alt: "⌥", option: "⌥" }
    : { mod: "Ctrl", ctrl: "Ctrl", control: "Ctrl", cmd: "Meta", command: "Meta", meta: "Meta", shift: "Shift", alt: "Alt", option: "Alt" };
  const parts = keys.split("+").map((part) => part.trim().toLowerCase()).filter(Boolean);
  const rendered = parts.map((part) => labels[part] ?? (part.startsWith("f") && /^f\d+$/.test(part) ? part.toUpperCase() : part.length === 1 ? part.toUpperCase() : part));
  return mac ? rendered.join("") : rendered.join("+");
}

/** One label per keycap chip. */
export function formatKeySegments(keys: string): string[] {
  return keys
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => formatKeys(part));
}
