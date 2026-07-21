/* ══════════════════════════════════════════════════════════════════════════
   voice-shortcuts.ts — window-level push-to-talk engine, armed from the voice
   store's holdShortcut / toggleShortcut settings.

   Semantics:
   • TOGGLE press  → start when idle, stop+deliver when recording.
   • HOLD keydown  → start (repeats ignored); keyup → stop+deliver.
     DOUBLE-TAP LATCH: two hold presses within 350 ms latch the recording —
     keyup is then ignored and it keeps recording until the hold key OR the
     toggle shortcut is pressed again. A quick single tap defers its stop by
     the remainder of the 350 ms window so a second tap can latch seamlessly.
   • Focus guard: chords are ignored while a text input / textarea /
     contenteditable has focus — EXCEPT xterm's hidden textarea (the terminal
     is a valid dictation target; detected via closest('.xterm')).
   • Listeners ride the window CAPTURE phase and stopImmediatePropagation on a
     match, so the chord never leaks into xterm/the PTY and the legacy
     "voice.toggle" palette shortcut (same default keys) cannot double-fire.

   GLOBAL side: when toggleShortcut is set (and we run under Tauri) the same
   accelerator is registered OS-globally (mod → CommandOrControl); the
   "voice://global-toggle" event drives the identical toggle behavior. When the
   voice pop-out window exists it owns the global shortcut and the main window
   defers. Registration failure is non-fatal — in-app handling still works.

   Accelerator format matches lib/shortcuts.ts ("mod+shift+v"); its matcher is
   not exported, so a minimal equivalent lives here (do not edit shortcuts.ts).
   ══════════════════════════════════════════════════════════════════════════ */
import { onVoiceGlobalToggle, voiceGlobalShortcutClear, voiceGlobalShortcutSet } from "./ipc";
import { deliverVoiceResult, isPopoutWindow } from "./voice-delivery";
import { useVoice, type VoiceResult } from "../store/voice";

const DOUBLE_TAP_MS = 350;
/** Local keydown + OS-global event can both fire for one press on some
    platforms — accept at most one toggle per window. */
const TOGGLE_DEDUPE_MS = 300;

/* ── minimal accelerator matcher (mirrors lib/shortcuts.ts semantics) ─────── */

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

interface ParsedKeys {
  key: string;
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

function parseKeys(keys: string): ParsedKeys {
  const parts = keys.toLowerCase().split("+").map((part) => part.trim()).filter(Boolean);
  const modifiers = new Set(parts.filter((part) =>
    ["mod", "ctrl", "control", "cmd", "command", "meta", "shift", "alt", "option"].includes(part)));
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

function matchesChord(event: KeyboardEvent, keys: string): boolean {
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

/** Keyup match on the primary key ONLY: releasing modifiers before the letter
    must still end a hold (the keyup event no longer carries the chord). */
function matchesKeyOnly(event: KeyboardEvent, keys: string): boolean {
  const expected = parseKeys(keys);
  return expected.key !== "" && normalizedKey(event.key) === expected.key;
}

/** True when a text-editing element holds focus — except inside xterm, whose
    hidden helper textarea is a legitimate dictation target. */
function focusSuppresses(event: KeyboardEvent): boolean {
  const candidates = [event.target, document.activeElement];
  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement)) continue;
    if (candidate.closest(".xterm")) continue;
    if (
      candidate.tagName === "INPUT"
      || candidate.tagName === "TEXTAREA"
      || candidate.isContentEditable
    ) return true;
  }
  return false;
}

/* ── engine state (module scope; the store owns only the settings) ────────── */

let armed = false;
/** A hold-initiated recording is in flight (keyup / latch bookkeeping). */
let holdActive = false;
/** Double-tap latch: hold keyup is ignored until a press stops the take. */
let latched = false;
let lastHoldPressTs = 0;
/** Deferred stop for a quick single tap (waits out the double-tap window). */
let pendingHoldStop: number | null = null;
let lastToggleTs = 0;
let registeredGlobalAccel: string | null = null;

function deliver(result: VoiceResult): void {
  void deliverVoiceResult(result, { external: isPopoutWindow() });
}

function canStart(): boolean {
  const phase = useVoice.getState().phase;
  return phase === "idle" || phase === "done" || phase === "error";
}

function startRecording(): void {
  if (!canStart()) return; // mid-pipeline (encoding/transcribing) — ignore
  void useVoice.getState().start({ onText: deliver });
}

function clearPendingHoldStop(): void {
  if (pendingHoldStop !== null) {
    window.clearTimeout(pendingHoldStop);
    pendingHoldStop = null;
  }
}

/** Stop + deliver (delivery rides the onText callback registered at start). */
function stopRecording(): void {
  clearPendingHoldStop();
  holdActive = false;
  latched = false;
  if (useVoice.getState().phase === "recording") void useVoice.getState().stop();
}

function toggleAction(): void {
  const now = Date.now();
  if (now - lastToggleTs < TOGGLE_DEDUPE_MS) return;
  lastToggleTs = now;
  if (useVoice.getState().phase === "recording") stopRecording();
  else startRecording();
}

function onHoldPress(): void {
  const now = Date.now();
  if (latched) {
    stopRecording(); // pressing the hold key again ends a latched take
    return;
  }
  if (holdActive && now - lastHoldPressTs <= DOUBLE_TAP_MS) {
    latched = true; // second tap inside the window — latch, keep recording
    clearPendingHoldStop();
    return;
  }
  lastHoldPressTs = now;
  if (useVoice.getState().phase === "recording") return; // toggle-owned take
  holdActive = true;
  clearPendingHoldStop();
  startRecording();
}

function onKeyDown(event: KeyboardEvent): void {
  const { toggleShortcut, holdShortcut } = useVoice.getState();

  if (toggleShortcut && matchesChord(event, toggleShortcut)) {
    if (focusSuppresses(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    toggleAction();
    return;
  }

  if (holdShortcut && matchesChord(event, holdShortcut)) {
    // Mid-hold/latched presses always reach the engine (else a take started
    // outside an input could never be ended from inside one).
    if (!holdActive && !latched && focusSuppresses(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    onHoldPress();
  }
}

function onKeyUp(event: KeyboardEvent): void {
  if (!holdActive || latched) return;
  const { holdShortcut } = useVoice.getState();
  if (!holdShortcut || !matchesKeyOnly(event, holdShortcut)) return;
  const elapsed = Date.now() - lastHoldPressTs;
  if (elapsed < DOUBLE_TAP_MS) {
    // Possibly tap 1 of a double-tap: keep recording until the window closes.
    clearPendingHoldStop();
    pendingHoldStop = window.setTimeout(() => {
      pendingHoldStop = null;
      if (holdActive && !latched) stopRecording();
    }, DOUBLE_TAP_MS - elapsed);
  } else {
    stopRecording();
  }
}

/** Once focus leaves the window the hold keyup is unobservable — end the take
    (deliver, not discard: the user was speaking). Latched/toggle recordings
    keep running across blur by design. */
function onWindowBlur(): void {
  if (holdActive && !latched) stopRecording();
}

/* ── OS-global side ───────────────────────────────────────────────────────── */

/** "mod+shift+v" → "CommandOrControl+Shift+V" (Tauri accelerator format). */
function toTauriAccelerator(keys: string): string {
  const keyAliases: Record<string, string> = {
    space: "Space",
    esc: "Escape",
    escape: "Escape",
    enter: "Enter",
    return: "Enter",
    tab: "Tab",
    backspace: "Backspace",
    delete: "Delete",
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
  };
  return keys
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      switch (part) {
        case "mod": return "CommandOrControl";
        case "ctrl": case "control": return "Control";
        case "cmd": case "command": case "meta": return "Command";
        case "shift": return "Shift";
        case "alt": case "option": return "Alt";
        default:
          if (keyAliases[part]) return keyAliases[part];
          if (part.length === 1 || /^f\d+$/.test(part)) return part.toUpperCase();
          return part[0].toUpperCase() + part.slice(1);
      }
    })
    .join("+");
}

async function armGlobal(toggleShortcut: string | null): Promise<void> {
  const accel = toggleShortcut ? toTauriAccelerator(toggleShortcut) : null;
  if (accel === registeredGlobalAccel) return;
  try {
    if (accel) await voiceGlobalShortcutSet(accel);
    else await voiceGlobalShortcutClear();
    registeredGlobalAccel = accel;
  } catch (error) {
    // Non-fatal: taken by another app / unsupported — in-app shortcut still works.
    console.warn("Voice global shortcut registration failed", error);
  }
}

async function popoutExists(): Promise<boolean> {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    return (await WebviewWindow.getByLabel("voice-popout")) != null;
  } catch {
    return false;
  }
}

async function handleGlobalToggle(): Promise<void> {
  // The pop-out owns the global shortcut while it exists; the main window
  // defers so two webviews never capture the mic for one press.
  if (!isPopoutWindow() && (await popoutExists())) return;
  toggleAction();
}

/* ── arming ───────────────────────────────────────────────────────────────── */

/** Install the window listeners + global registration. Idempotent — the store
    calls this at init; setting changes re-arm via the subscription below. */
export function armVoiceShortcuts(): void {
  if (typeof window === "undefined" || armed) return;
  armed = true;

  // CAPTURE phase, registered at module-init time (before initShortcuts adds
  // its own capture listener) — this engine wins the walk and can stop the
  // chord from reaching xterm or the legacy palette shortcut.
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", onWindowBlur);

  if ("__TAURI_INTERNALS__" in window) {
    void onVoiceGlobalToggle(() => { void handleGlobalToggle(); }).catch(() => {
      // No Tauri event target (browser dev) — global side is desktop-only.
    });
    void armGlobal(useVoice.getState().toggleShortcut);
    useVoice.subscribe((state, prev) => {
      if (state.toggleShortcut !== prev.toggleShortcut) {
        void armGlobal(state.toggleShortcut);
      }
    });
  }
}
