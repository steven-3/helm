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
  recents: string[];
  show: () => void;
  hide: () => void;
  toggle: () => void;
  recordRecent: (id: string) => void;
  clearRecents: () => void;
}

export const usePalette = create<PaletteState>((set) => ({
  open: false,
  recents: loadRecents(),
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open })),
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
