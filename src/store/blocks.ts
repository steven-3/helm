import type { IMarker } from "@xterm/xterm";
import { create } from "zustand";

export interface CommandBlock {
  id: string;
  cmd: string;
  startMarker: IMarker;
  endMarker?: IMarker;
  exitCode?: number | null;
  ts: number;
  agentTurn?: boolean;
  collapsed?: boolean;
}

interface BlocksState {
  bySession: Record<string, CommandBlock[]>;
  selectedBySession: Record<string, string | undefined>;
  addBlock: (sessionId: string, block: CommandBlock) => void;
  updateBlock: (sessionId: string, id: string, patch: Partial<Omit<CommandBlock, "id">>) => void;
  selectBlock: (sessionId: string, id: string | undefined) => void;
  toggleCollapsed: (sessionId: string, id: string) => void;
  clearSession: (sessionId: string) => void;
  pruneSessions: (alive: Set<string>) => void;
}

export const useBlocks = create<BlocksState>((set) => ({
  bySession: {},
  selectedBySession: {},

  addBlock: (sessionId, block) => set((state) => ({
    bySession: {
      ...state.bySession,
      [sessionId]: [...(state.bySession[sessionId] ?? []), block],
    },
  })),

  updateBlock: (sessionId, id, patch) => set((state) => {
    const blocks = state.bySession[sessionId];
    if (!blocks?.some((block) => block.id === id)) return state;
    return {
      bySession: {
        ...state.bySession,
        [sessionId]: blocks.map((block) => block.id === id ? { ...block, ...patch } : block),
      },
    };
  }),

  selectBlock: (sessionId, id) => set((state) => ({
    selectedBySession: { ...state.selectedBySession, [sessionId]: id },
  })),

  toggleCollapsed: (sessionId, id) => set((state) => {
    const blocks = state.bySession[sessionId];
    if (!blocks) return state;
    return {
      bySession: {
        ...state.bySession,
        [sessionId]: blocks.map((block) => block.id === id
          ? { ...block, collapsed: !block.collapsed }
          : block),
      },
    };
  }),

  clearSession: (sessionId) => set((state) => {
    const blocks = state.bySession[sessionId];
    if (!blocks && !(sessionId in state.selectedBySession)) return state;
    blocks?.forEach((block) => {
      try { block.startMarker.dispose(); } catch { /* marker may already be trimmed */ }
      try { block.endMarker?.dispose(); } catch { /* marker may already be trimmed */ }
    });
    const bySession = { ...state.bySession };
    const selectedBySession = { ...state.selectedBySession };
    delete bySession[sessionId];
    delete selectedBySession[sessionId];
    return { bySession, selectedBySession };
  }),

  pruneSessions: (alive) => set((state) => {
    const removed = Object.keys(state.bySession).filter((sessionId) => !alive.has(sessionId));
    if (removed.length === 0) return state;
    const bySession = { ...state.bySession };
    const selectedBySession = { ...state.selectedBySession };
    for (const sessionId of removed) {
      bySession[sessionId]?.forEach((block) => {
        try { block.startMarker.dispose(); } catch { /* marker may already be trimmed */ }
        try { block.endMarker?.dispose(); } catch { /* marker may already be trimmed */ }
      });
      delete bySession[sessionId];
      delete selectedBySession[sessionId];
    }
    return { bySession, selectedBySession };
  }),
}));
