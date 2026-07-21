/* ══════════════════════════════════════════════════════════════════════════
   useCheatsheet — open and shortcut-recording state for the keyboard editor.

   A store keeps one capture target active across the cheatsheet and Voice
   settings, and exposes a revision counter so persisted keybind changes redraw
   every effective shortcut immediately.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";

interface CheatsheetState {
  open: boolean;
  recordingId: string | null;
  revision: number;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setRecordingId: (id: string | null) => void;
  touch: () => void;
}

export const useCheatsheet = create<CheatsheetState>((set) => ({
  open: false,
  recordingId: null,
  revision: 0,
  toggle: () => set((state) => ({ open: !state.open, recordingId: null })),
  setOpen: (open) => set({ open, recordingId: null }),
  setRecordingId: (recordingId) => set({ recordingId }),
  touch: () => set((state) => ({ revision: state.revision + 1 })),
}));
