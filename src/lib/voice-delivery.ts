import { clipboardWrite } from "./commands";
import { pasteExternal } from "./ipc";
import { pasteIntoPaneTerminal } from "./terminal-session";
import type { VoiceResult } from "../store/voice";
import { usePanes } from "../store/panes";
import { useNotifications } from "../store/notifications";

/** True when this webview is the always-on-top voice pop-out window
    (voice_popout_open loads index.html?window=voice-popout). */
export function isPopoutWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("window") === "voice-popout";
}

export interface DeliverVoiceOptions {
  /** Deliver OUTSIDE Helm: paste_external sets the clipboard and synthesizes
      Ctrl+V into the OS-focused window (the pop-out flow). */
  external?: boolean;
  /** UI-only sink (the Settings test row) instead of terminal paste. */
  onText?: (result: VoiceResult) => void;
}

function notify(kind: "error" | "info", title: string, body: string, paneId?: string): void {
  useNotifications.getState().notify({ kind, title, body, paneId, ts: Date.now() });
}

async function copyResult(text: string): Promise<boolean> {
  try {
    await clipboardWrite(text);
    return true;
  } catch (error) {
    console.error("Failed to copy voice prompt to the clipboard", error);
    return false;
  }
}

/** Deliver a completed voice result.
    - Default: bracketed-paste into the active pane, ALWAYS clipboard-copy.
    - `{ external: true }` (pop-out): paste_external — Rust sets the clipboard
      and synthesizes Ctrl+V into the OS-focused window; no double-write here.
    - `onText` (or a bare callback, legacy form): UI-only sink instead of
      terminal paste (the Settings test row). */
export async function deliverVoiceResult(
  result: VoiceResult,
  options?: DeliverVoiceOptions | ((result: VoiceResult) => void),
): Promise<void> {
  if (!result.text) return;
  const opts: DeliverVoiceOptions = typeof options === "function" ? { onText: options } : options ?? {};
  const onText = opts.onText;

  if (opts.external) {
    try {
      // Rust owns the clipboard write on this path — no local copy.
      await pasteExternal(result.text);
    } catch (error) {
      console.error("External voice paste failed", error);
      const didCopy = await copyResult(result.text);
      notify(
        didCopy ? "info" : "error",
        didCopy ? "Voice prompt copied" : "Voice prompt not delivered",
        didCopy
          ? "External paste failed. Paste the transcript from the clipboard."
          : "External paste failed, and clipboard copy failed.",
      );
    }
    return;
  }

  const copied = copyResult(result.text);

  if (onText) {
    try {
      onText(result);
    } catch (error) {
      console.error("Voice result callback failed", error);
    }
    if (!(await copied)) {
      notify("error", "Voice clipboard copy failed", "The transcript was produced, but could not be copied to the clipboard.");
    }
    return;
  }

  const state = usePanes.getState();
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  const paneId = tab?.activePaneId;
  if (!paneId) {
    const didCopy = await copied;
    console.warn("Voice prompt has no active terminal pane");
    notify(
      didCopy ? "info" : "error",
      didCopy ? "Voice prompt copied" : "Voice prompt not delivered",
      didCopy
        ? "No active terminal pane is available. Paste the transcript from the clipboard."
        : "No active terminal pane is available, and clipboard copy failed.",
    );
    return;
  }

  let pasted = false;
  try {
    pasted = await pasteIntoPaneTerminal(paneId, result.text);
  } catch (error) {
    console.error(`Failed to paste voice prompt into pane ${paneId}`, error);
  }

  const didCopy = await copied;
  if (!pasted) {
    notify(
      didCopy ? "info" : "error",
      didCopy ? "Voice prompt copied" : "Voice prompt not delivered",
      didCopy
        ? "The active terminal is not accepting input. Paste the transcript from the clipboard."
        : "The active terminal is not accepting input, and clipboard copy failed.",
      paneId,
    );
  } else if (!didCopy) {
    notify(
      "error",
      "Voice clipboard copy failed",
      "The prompt was inserted into the active terminal, but could not be copied to the clipboard.",
      paneId,
    );
  }
}
