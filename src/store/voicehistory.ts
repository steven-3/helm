import { create } from "zustand";

const STORAGE_KEY = "helm.voicehistory.v1";
const VERSION = 1;
const MAX_ENTRIES = 200;

export type VoiceHistoryMode = "regular" | "prompt";

export interface VoiceHistoryEntry {
  id: string;
  ts: number;
  raw: string;
  improved?: string;
  mode?: VoiceHistoryMode;
  durationMs?: number;
}

export type NewVoiceHistoryEntry = Omit<VoiceHistoryEntry, "id" | "ts">;

interface PersistedVoiceHistory {
  version: number;
  entries: VoiceHistoryEntry[];
}

export interface VoiceHistoryState {
  entries: VoiceHistoryEntry[];
  add: (entry: NewVoiceHistoryEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
}

function isVoiceHistoryEntry(value: unknown): value is VoiceHistoryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<VoiceHistoryEntry>;
  return typeof entry.id === "string"
    && typeof entry.ts === "number"
    && Number.isFinite(entry.ts)
    && typeof entry.raw === "string"
    && (entry.improved === undefined || typeof entry.improved === "string")
    && (entry.mode === undefined || entry.mode === "regular" || entry.mode === "prompt")
    && (entry.durationMs === undefined
      || (typeof entry.durationMs === "number" && Number.isFinite(entry.durationMs)));
}

function loadPersisted(): VoiceHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as Partial<PersistedVoiceHistory>;
    if (!Array.isArray(saved.entries)) return [];
    return saved.entries
      .filter(isVoiceHistoryEntry)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useVoiceHistory = create<VoiceHistoryState>((set) => ({
  entries: loadPersisted(),
  add: (entry) => set((state) => ({
    entries: [{ ...entry, id: createId(), ts: Date.now() }, ...state.entries]
      .slice(0, MAX_ENTRIES),
  })),
  remove: (id) => set((state) => ({
    entries: state.entries.filter((entry) => entry.id !== id),
  })),
  clear: () => set({ entries: [] }),
}));

useVoiceHistory.subscribe((state) => {
  if (typeof window === "undefined") return;
  const saved: PersistedVoiceHistory = {
    version: VERSION,
    entries: state.entries,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // History remains available for this process when storage is unavailable.
  }
});
