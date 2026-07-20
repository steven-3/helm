/* ══════════════════════════════════════════════════════════════════════════
   useLayout — cockpit chrome state: which sidebar panel is open, the active rail
   view, whether the right Stage dock is revealed, and (WS-2) the DRAGGABLE widths
   of the sidebar + Stage plates. Widths persist to localStorage; the show/hide
   booleans stay ephemeral session state — visibility is the booleans' job, width
   is a separate axis that only applies while a plate is shown. Pure UI (no Rust).
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import type { SidebarView, RailView } from "../lib/contract";

/* U1 · Mission Control surfaces. The terminal deck is always mounted (hidden,
   never unmounted — PTYs stay alive); the other views are the center-stage
   surfaces the Activity Rail + palette/omnibar route to. "agents" is the
   AgentManager tab (TabBar-driven, kept); fleet/board/swarm/memory/editor/
   preview are the new v0.4 surfaces. */
export type WorkspaceView =
  | "terminal" | "agents" | "fleet" | "board" | "swarm" | "memory" | "editor" | "preview";

/* Single-slot modal overlays opened via openSurface() (palette/rail/shortcut).
   Only one is ever open at a time; each component self-gates on its `open`. */
export type ModalSurface = "templates" | "prompts" | "skills" | "agents" | null;

/* WS-2 · width clamps (px). MIN keeps each chrome plate legible — the sidebar's
   agent word + model sublabel (DESIGN.md §10), the Stage's cards; MAX protects
   the terminal hero from being crowded out. DEFAULTs match §10 (272 / 300). The
   TopSplitter additionally holds the center ≥ its own floor while dragging. */
export const SIDEBAR_MIN = 216;
export const SIDEBAR_MAX = 420;
export const SIDEBAR_DEFAULT = 272;
export const STAGE_MIN = 248;
export const STAGE_MAX = 480;
export const STAGE_DEFAULT = 300;

const WIDTHS_KEY = "helm.layout.widths.v1";
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clampSidebar = (px: number) => clamp(Math.round(px), SIDEBAR_MIN, SIDEBAR_MAX);
const clampStage = (px: number) => clamp(Math.round(px), STAGE_MIN, STAGE_MAX);

function loadWidths(): { sidebarWidth: number; stageWidth: number } {
  const defaults = { sidebarWidth: SIDEBAR_DEFAULT, stageWidth: STAGE_DEFAULT };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(WIDTHS_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Partial<{ sidebarWidth: number; stageWidth: number }>;
    return {
      sidebarWidth: typeof saved.sidebarWidth === "number" ? clampSidebar(saved.sidebarWidth) : defaults.sidebarWidth,
      stageWidth: typeof saved.stageWidth === "number" ? clampStage(saved.stageWidth) : defaults.stageWidth,
    };
  } catch {
    return defaults; // corrupt / unavailable storage → safe defaults
  }
}

interface LayoutState {
  sidebar: SidebarView;   // null = collapsed
  railView: RailView;
  stageOpen: boolean;
  /** pane whose widgets the Stage is focused on (set on auto-reveal). */
  stagePaneId: string | null;
  workspaceView: WorkspaceView;
  /** U1 · Attention inbox overlay (rail toggle + Ctrl+Shift+A both drive it). */
  attentionOpen: boolean;
  /** U1 · the single open modal surface (template picker, prompts, skills…). */
  modalSurface: ModalSurface;
  /** U1 · per-session "last looked at" ts — the Fleet Home digest window origin
      (sinceTs). Marked when a session is revealed from Fleet Home. */
  sessionSeenTs: Record<string, number>;
  /** WS-2 · persisted, clamped chrome-plate widths (px). Applied only while the
      matching panel is shown — the show/hide booleans remain the source of truth
      for visibility, so a collapsed plate simply never consumes its width. */
  sidebarWidth: number;
  stageWidth: number;

  setRailView: (v: RailView) => void;
  setSidebar: (v: SidebarView) => void;
  toggleSidebar: () => void;
  openStage: (paneId?: string) => void;
  closeStage: () => void;
  toggleStage: () => void;
  setWorkspaceView: (view: WorkspaceView) => void;
  openAttention: () => void;
  closeAttention: () => void;
  toggleAttention: () => void;
  openModal: (surface: Exclude<ModalSurface, null>) => void;
  closeModal: () => void;
  markSessionSeen: (sessionId: string) => void;
  /** WS-2 · commit a dragged / keyboard-nudged width (re-clamped to min/max). */
  setSidebarWidth: (px: number) => void;
  setStageWidth: (px: number) => void;
}

const initialWidths = loadWidths();

export const useLayout = create<LayoutState>((set) => ({
  sidebar: "roster",
  railView: "roster",
  // Stage starts collapsed — it auto-reveals on the first REAL widget dispatch.
  stageOpen: false,
  stagePaneId: null,
  workspaceView: "terminal",
  attentionOpen: false,
  modalSurface: null,
  sessionSeenTs: {},
  sidebarWidth: initialWidths.sidebarWidth,
  stageWidth: initialWidths.stageWidth,

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
  openAttention: () => set({ attentionOpen: true }),
  closeAttention: () => set({ attentionOpen: false }),
  toggleAttention: () => set((s) => ({ attentionOpen: !s.attentionOpen })),
  openModal: (surface) => set({ modalSurface: surface }),
  closeModal: () => set({ modalSurface: null }),
  markSessionSeen: (sessionId) =>
    set((s) => ({ sessionSeenTs: { ...s.sessionSeenTs, [sessionId]: Date.now() } })),
  setSidebarWidth: (px) => set({ sidebarWidth: clampSidebar(px) }),
  setStageWidth: (px) => set({ stageWidth: clampStage(px) }),
}));

// WS-2 · persist ONLY the widths (the layout booleans stay ephemeral session UI).
// Mirrors the settings store's subscribe-to-write pattern; fires on any change
// but always writes the same two clamped numbers, so it is cheap.
useLayout.subscribe((state) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WIDTHS_KEY,
      JSON.stringify({ sidebarWidth: state.sidebarWidth, stageWidth: state.stageWidth }),
    );
  } catch {
    // Widths fall back to defaults next launch when storage is unavailable.
  }
});
