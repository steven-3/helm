/* ══════════════════════════════════════════════════════════════════════════
   useSearch — the in-terminal find-bar state (Tier C). ONE bar at a time: a
   single `openForPane` slot means opening search on another pane closes the
   previous one (mirrors useLightbox / the once-mounted overlays). The find bar
   is opened from terminal-session.ts's custom key handler (Ctrl+F / Cmd+F),
   which swallows ^F so it never reaches the PTY, and closed by the bar itself.

   `focusNonce` bumps on every open() so the bar can (re)focus + select its input
   even when it is ALREADY open — e.g. the user clicked back into the terminal
   with the bar still visible, then pressed Ctrl+F again.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";

interface SearchState {
  /** Pane id whose find bar is open; null = no bar visible. */
  openForPane: string | null;
  /** Bumped by open() to (re)focus the query input on demand. */
  focusNonce: number;
  open: (paneId: string) => void;
  close: () => void;
}

export const useSearch = create<SearchState>((set) => ({
  openForPane: null,
  focusNonce: 0,
  open: (paneId) => set((s) => ({ openForPane: paneId, focusNonce: s.focusNonce + 1 })),
  close: () => set({ openForPane: null }),
}));
