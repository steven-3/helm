import { create } from "zustand";
import { helmStoreRead, helmStoreWrite } from "../lib/ipc";

const REL_PATH = "prompts.json";

export interface SavedPrompt {
  id: string;
  title: string;
  body: string;
  tags: string[];
}

interface PromptsState {
  root: string | null;
  prompts: SavedPrompt[];
  loaded: boolean;
  error: string | null;
  load: (root: string) => Promise<void>;
  add: (input: Omit<SavedPrompt, "id">) => string;
  update: (id: string, patch: Partial<Omit<SavedPrompt, "id">>) => void;
  remove: (id: string) => void;
}

const uid = () => `prompt-${crypto.randomUUID().slice(0, 8)}`;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function cleanPrompt(value: unknown): SavedPrompt | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SavedPrompt>;
  if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.body !== "string") return null;
  return {
    id: item.id,
    title: item.title.trim() || "Untitled prompt",
    body: item.body,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean) : [],
  };
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const { root, prompts, loaded } = usePrompts.getState();
    if (!root || !loaded) return;
    void helmStoreWrite(root, REL_PATH, JSON.stringify(prompts, null, 2)).catch((error) => {
      usePrompts.setState({ error: String(error) });
    });
  }, 120);
}

export const usePrompts = create<PromptsState>((set, get) => ({
  root: null,
  prompts: [],
  loaded: false,
  error: null,

  load: async (root) => {
    set({ root, loaded: false, error: null });
    try {
      const raw = await helmStoreRead(root, REL_PATH);
      const parsed = JSON.parse(raw);
      const prompts = Array.isArray(parsed) ? parsed.map(cleanPrompt).filter((item): item is SavedPrompt => item !== null) : [];
      if (get().root === root) set({ prompts, loaded: true });
    } catch {
      if (get().root === root) set({ prompts: [], loaded: true });
    }
  },

  add: (input) => {
    const id = uid();
    const prompt: SavedPrompt = {
      id,
      title: input.title.trim() || "Untitled prompt",
      body: input.body,
      tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    };
    set((state) => ({ prompts: [...state.prompts, prompt], error: null }));
    scheduleSave();
    return id;
  },

  update: (id, patch) => {
    set((state) => ({
      prompts: state.prompts.map((prompt) => prompt.id === id ? {
        ...prompt,
        ...(patch.title !== undefined ? { title: patch.title.trim() || "Untitled prompt" } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags.map((tag) => tag.trim()).filter(Boolean) } : {}),
      } : prompt),
      error: null,
    }));
    scheduleSave();
  },

  remove: (id) => {
    set((state) => ({ prompts: state.prompts.filter((prompt) => prompt.id !== id), error: null }));
    scheduleSave();
  },
}));
