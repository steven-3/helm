/* ══════════════════════════════════════════════════════════════════════════
   useResizing — transient window-resize gate (WS-1). `windowResizing` is true
   only while the OS resize gesture is streaming Tauri `onResized` events; a
   trailing debounce in App.tsx clears it on settle. Pure UI state (no Rust).

   Consumers:
   • App.tsx sets it (+ a <body data-window-resizing> attribute that drives the
     opaque-during-resize shell paint in components.css — the borderless/
     transparent resize-lag fix). Outside Tauri, getCurrentWindow()/onResized()
     throws (the dynamic import itself succeeds), so browser dev remains a no-op.
   • WS-3 (TerminalPane) reads `windowResizing` to SUSPEND xterm reflow during
     the gesture and refit ONCE on settle. Keep this flag lean and stable.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";

interface ResizingState {
  /** true while a native window-resize gesture is in flight (debounced off). */
  windowResizing: boolean;
  setWindowResizing: (resizing: boolean) => void;
}

export const useResizing = create<ResizingState>((set) => ({
  windowResizing: false,
  setWindowResizing: (windowResizing) => set({ windowResizing }),
}));
