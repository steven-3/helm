/* ══════════════════════════════════════════════════════════════════════════
   useGit — REAL git state for the active pane's cwd, via Rust sys::git_status
   (which shells out to the actual git binary). status === null means "not a
   repo / git unavailable" — the status bar and SCM view drop their git segments
   entirely instead of inventing a branch. Polls every 15s while visible + refreshes when the
   active pane (and therefore cwd) changes.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import { gitStatus } from "../lib/commands";
import type { GitStatus } from "../lib/contract";
import { usePanes } from "./panes";

// Git on WSL drvfs is materially more expensive than native filesystem work.
// Fifteen seconds is current enough for passive chrome; cwd/visibility changes
// still refresh immediately.
const POLL_MS = 15_000;

interface GitState {
  status: GitStatus | null;
  /** cwd the current status was read from (display context). */
  cwd: string | null;
  refresh: () => Promise<void>;
  /** Begin polling — idempotent; called once from bootstrap. */
  start: () => void;
}

let started = false;
let inFlight = false;
// A refresh requested while one is in flight (e.g. a cwd change mid-poll) sets
// this; the in-flight poll's finally re-fires exactly once so the newest cwd is
// never dropped. Cleared before the retry — bounded, no loop.
let pending = false;

const activeCwd = (): string | null => {
  const s = usePanes.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  return (tab && s.panes[tab.activePaneId]?.cwd) || null;
};

export const useGit = create<GitState>((set) => ({
  status: null,
  cwd: null,

  refresh: async () => {
    if (inFlight) { pending = true; return; }
    inFlight = true;
    try {
      const cwd = activeCwd();
      if (!cwd) {
        set({ status: null, cwd: null });
        return;
      }
      const status = await gitStatus(cwd);
      // The active cwd may have changed while the status was in flight — writing
      // it now would misattribute this repo's branch/± to the new pane. Skip the
      // stale set; the pending retry below fetches the right cwd.
      if (activeCwd() !== cwd) return;
      set({ status, cwd });
    } catch {
      // backend unavailable (browser dev) — no git segments
      set({ status: null });
    } finally {
      inFlight = false;
      if (pending) { pending = false; void useGit.getState().refresh(); }
    }
  },

  start: () => {
    if (started) return;
    started = true;
    const refresh = () => void useGit.getState().refresh();
    refresh();
    window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
    let lastCwd = activeCwd();
    usePanes.subscribe(() => {
      const cwd = activeCwd();
      if (cwd !== lastCwd) {
        lastCwd = cwd;
        refresh();
      }
    });
  },
}));
