import { usePalette } from "../store/palette";
import { usePanes } from "../store/panes";
import { useCheatsheet } from "../store/cheatsheet";

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

const shortcuts = new Map<string, ShortcutRegistration>();
let initialized = false;
let unregisterDefaults: (() => void)[] = [];

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

function matches(event: KeyboardEvent, keys: string): boolean {
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
  for (const shortcut of shortcuts.values()) {
    if (!matches(event, shortcut.keys)) continue;
    if (!shortcut.global && focusSuppressesShortcut(event)) continue;
    if (shortcut.when && !shortcut.when()) continue;
    event.preventDefault();
    // Globals listen in CAPTURE phase (see initShortcuts), so they fire BEFORE
    // xterm's own capture-phase textarea keydown; stopImmediatePropagation halts
    // the walk so the key (e.g. \x0b from Ctrl+K) never reaches the PTY — a bare
    // preventDefault would NOT stop xterm. Repeats are swallowed, never re-fired:
    // a held key must not machine-gun toggles.
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
      // The palette outranks the sheet — mod+/ while the palette is open is a
      // no-op (swallowed above) rather than stacking an overlay beneath it.
      when: () => !usePalette.getState().open,
      handler: () => useCheatsheet.getState().toggle(),
    }),
  ];
  // CAPTURE phase on window: the window ancestor wins the capture walk before
  // xterm's descendant textarea listener, so global shortcuts work from
  // anywhere — terminal focus included — and can stop the key from leaking
  // into the PTY (see onKeyDown).
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
  return shortcuts.get(id);
}

export function getShortcutList(): ShortcutListGroup[] {
  const groups = new Map<string, ShortcutListItem[]>();
  for (const shortcut of shortcuts.values()) {
    const items = groups.get(shortcut.category) ?? [];
    items.push({ id: shortcut.id, keys: shortcut.keys, description: shortcut.description });
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

/** formatKeys per SEGMENT — one label per keycap chip ("mod+alt+b" →
    ["Ctrl","Alt","B"] / ["⌘","⌥","B"]), so each key renders in its own kbd. */
export function formatKeySegments(keys: string): string[] {
  return keys
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => formatKeys(part));
}
