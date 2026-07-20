import { create } from "zustand";
import { helmStoreRead, helmStoreWrite } from "../lib/ipc";

const REL_PATH = "agents.json";

export interface CustomAgent {
  id: string;
  name: string;
  seat: string;
  launcher: string;
  systemPrompt: string;
  color: string;
}

interface CustomAgentsState {
  root: string | null;
  agents: CustomAgent[];
  loaded: boolean;
  error: string | null;
  load: (root: string) => Promise<void>;
  add: (input: Omit<CustomAgent, "id">) => string;
  update: (id: string, patch: Partial<Omit<CustomAgent, "id">>) => void;
  remove: (id: string) => void;
}

const uid = () => `agent-${crypto.randomUUID().slice(0, 8)}`;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function cleanAgent(value: unknown): CustomAgent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CustomAgent>;
  if (typeof item.id !== "string" || typeof item.name !== "string") return null;
  return {
    id: item.id,
    name: item.name.trim() || "Custom agent",
    seat: typeof item.seat === "string" && item.seat.trim() ? item.seat.trim() : "orchestrator",
    launcher: typeof item.launcher === "string" ? item.launcher : "",
    systemPrompt: typeof item.systemPrompt === "string" ? item.systemPrompt : "",
    color: typeof item.color === "string" && item.color ? item.color : "indigo",
  };
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const { root, agents, loaded } = useCustomAgents.getState();
    if (!root || !loaded) return;
    void helmStoreWrite(root, REL_PATH, JSON.stringify(agents, null, 2)).catch((error) => {
      useCustomAgents.setState({ error: String(error) });
    });
  }, 120);
}

export const useCustomAgents = create<CustomAgentsState>((set, get) => ({
  root: null,
  agents: [],
  loaded: false,
  error: null,

  load: async (root) => {
    set({ root, loaded: false, error: null });
    try {
      const raw = await helmStoreRead(root, REL_PATH);
      const parsed = JSON.parse(raw);
      const agents = Array.isArray(parsed) ? parsed.map(cleanAgent).filter((item): item is CustomAgent => item !== null) : [];
      if (get().root === root) set({ agents, loaded: true });
    } catch {
      if (get().root === root) set({ agents: [], loaded: true });
    }
  },

  add: (input) => {
    const id = uid();
    const agent: CustomAgent = {
      id,
      name: input.name.trim() || "Custom agent",
      seat: input.seat.trim() || "orchestrator",
      launcher: input.launcher.trim(),
      systemPrompt: input.systemPrompt,
      color: input.color || "indigo",
    };
    set((state) => ({ agents: [...state.agents, agent], error: null }));
    scheduleSave();
    return id;
  },

  update: (id, patch) => {
    set((state) => ({
      agents: state.agents.map((agent) => agent.id === id ? {
        ...agent,
        ...(patch.name !== undefined ? { name: patch.name.trim() || "Custom agent" } : {}),
        ...(patch.seat !== undefined ? { seat: patch.seat.trim() || "orchestrator" } : {}),
        ...(patch.launcher !== undefined ? { launcher: patch.launcher.trim() } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.color !== undefined ? { color: patch.color || "indigo" } : {}),
      } : agent),
      error: null,
    }));
    scheduleSave();
  },

  remove: (id) => {
    set((state) => ({ agents: state.agents.filter((agent) => agent.id !== id), error: null }));
    scheduleSave();
  },
}));
