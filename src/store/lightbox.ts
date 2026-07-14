/* ══════════════════════════════════════════════════════════════════════════
   useLightbox — the image lightbox overlay state (WS-6). A single global slot:
   ImagePreview.open(url, alt) fills it, the <ImageLightbox> overlay (mounted once
   at the App root, sibling to the Settings modal) reads it, and Esc / scrim
   mousedown clears it. Store-driven — not local component state — so any surface
   can raise the same full-window overlay through one mount point (mirrors how the
   Settings modal is owned once by App).
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";

interface LightboxState {
  /** Data/URL of the image to show full-window; null = closed. */
  url: string | null;
  /** Accessible label / filename for the open image. */
  alt?: string;
  open: (url: string, alt?: string) => void;
  close: () => void;
}

export const useLightbox = create<LightboxState>((set) => ({
  url: null,
  alt: undefined,
  open: (url, alt) => set({ url, alt }),
  close: () => set({ url: null, alt: undefined }),
}));
