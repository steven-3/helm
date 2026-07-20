/* ══════════════════════════════════════════════════════════════════════════
   usePalette — open/close state plus the command ids most recently executed.

   The component still owns command definitions and execution. Only recents are
   persisted; open/close remains session-scoped.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";

const RECENTS_KEY = "helm-palette-recents";
const MAX_RECENTS = 8;

function loadRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? "[]") as unknown;
    return Array.isArray(saved)
      ? saved.filter((id): id is string => typeof id === "string").slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
}

function persistRecents(recents: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  } catch {
    // Recents are best-effort and never block command execution.
  }
}

interface PaletteState {
  open: boolean;
  /** U1 · optional initial query the Omnibar opens with — carries a prefix
      (">"/"@"/"#"/"+") so openSurface("dispatch-card") lands straight in a mode.
      Consumed once on open, then cleared. */
  seed: string | null;
  recents: string[];
  show: (seed?: string) => void;
  hide: () => void;
  toggle: () => void;
  recordRecent: (id: string) => void;
  clearRecents: () => void;
}

export const usePalette = create<PaletteState>((set) => ({
  open: false,
  seed: null,
  recents: loadRecents(),
  show: (seed) => set({ open: true, seed: seed ?? null }),
  hide: () => set({ open: false, seed: null }),
  toggle: () => set((state) => ({ open: !state.open, seed: null })),
  recordRecent: (id) => set((state) => {
    const recents = [id, ...state.recents.filter((recent) => recent !== id)].slice(0, MAX_RECENTS);
    persistRecents(recents);
    return { recents };
  }),
  clearRecents: () => {
    persistRecents([]);
    set({ recents: [] });
  },
}));
