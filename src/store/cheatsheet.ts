/* ══════════════════════════════════════════════════════════════════════════
   useCheatsheet — open state for the keyboard-shortcut overlay.

   A store (not component state) because three disjoint channels open it: the
   registered mod+/ shortcut (lib/shortcuts, outside React), the command palette
   action, and the Settings "Keyboard shortcuts" row. Session-scoped, never
   persisted — same posture as usePalette's open flag.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";

interface CheatsheetState {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

export const useCheatsheet = create<CheatsheetState>((set) => ({
  open: false,
  toggle: () => set((state) => ({ open: !state.open })),
  setOpen: (open) => set({ open }),
}));
