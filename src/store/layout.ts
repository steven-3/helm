/* ══════════════════════════════════════════════════════════════════════════
   useLayout — cockpit chrome state: which sidebar panel is open, the active rail
   view, and whether the right Stage dock is revealed. Pure UI state (no Rust).
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import type { SidebarView, RailView } from "../lib/contract";

interface LayoutState {
  sidebar: SidebarView;   // null = collapsed
  railView: RailView;
  stageOpen: boolean;
  /** pane whose widgets the Stage is focused on (set on auto-reveal). */
  stagePaneId: string | null;
  workspaceView: "terminal" | "agents";

  setRailView: (v: RailView) => void;
  setSidebar: (v: SidebarView) => void;
  toggleSidebar: () => void;
  openStage: (paneId?: string) => void;
  closeStage: () => void;
  toggleStage: () => void;
  setWorkspaceView: (view: "terminal" | "agents") => void;
}

export const useLayout = create<LayoutState>((set) => ({
  sidebar: "roster",
  railView: "roster",
  // Stage starts collapsed — it auto-reveals on the first REAL widget dispatch.
  stageOpen: false,
  stagePaneId: null,
  workspaceView: "terminal",

  setRailView: (v) =>
    set(() =>
      v === "roster" || v === "files"
        ? { railView: v, sidebar: v }
        : { railView: v },
    ),
  setSidebar: (v) => set({ sidebar: v }),
  toggleSidebar: () => set((s) => ({ sidebar: s.sidebar ? null : s.railView === "files" ? "files" : "roster" })),
  openStage: (paneId) => set((s) => ({ stageOpen: true, stagePaneId: paneId ?? s.stagePaneId })),
  closeStage: () => set({ stageOpen: false }),
  toggleStage: () => set((s) => ({ stageOpen: !s.stageOpen })),
  setWorkspaceView: (workspaceView) => set({ workspaceView }),
}));
