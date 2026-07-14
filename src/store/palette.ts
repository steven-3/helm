/* ══════════════════════════════════════════════════════════════════════════
   usePalette — open/close state for the ⌘K command palette (Tier B).

   Deliberately tiny + decoupled: App registers ONE window capture-phase hotkey
   that calls toggle() (so Ctrl/Cmd+K fires even while xterm holds focus — see
   App.tsx), and <CommandPalette> reads `open`. No action logic lives here; the
   palette component owns the command list and executes against the real stores.
   Pure UI session state — never persisted.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";

interface PaletteState {
  open: boolean;
  show: () => void;
  hide: () => void;
  toggle: () => void;
}

export const usePalette = create<PaletteState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
