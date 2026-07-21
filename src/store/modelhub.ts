/* ══════════════════════════════════════════════════════════════════════════
   useModelHub — CLIProxyAPI wiring (§3.4). Probes {proxyUrl}/v1/models through
   the Rust proxy_http command (the webview can't reach loopback itself), keeps
   the seat→model map, and generates seat launchers: env pins riding a full
   shell command string that a pane can execute (panes launchViaShell run the
   user's login shell, so `VAR=x cmd` prefixes work).

   Persistence: own localStorage key `helm.modelhub.v1` (settings-adjacent but
   deliberately separate — the settings store's shape stays untouched).
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import type { AgentKind } from "../lib/contract";
import { proxyHttp } from "../lib/ipc";

const STORAGE_KEY = "helm.modelhub.v1";
const VERSION = 1;

export const DEFAULT_PROXY_URL = "http://127.0.0.1:8317";

/** Default seat set (the fleet vocabulary; models stay unpinned until the user
    assigns them from the probed list). "" = unpinned → launcher omits the pin. */
export const DEFAULT_SEATS: Record<string, string> = {
  orchestrator: "",
  "ui-builder": "",
  "backend-worker": "",
  debugger: "",
  "impl-worker": "",
  scout: "",
};

export type ModelHubStatus = "unknown" | "probing" | "online" | "offline" | "auth";

export interface SeatLauncher {
  seat: string;
  /** Pinned model, or null when the seat is unpinned. */
  model: string | null;
  /** Env pins (ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_MODEL). */
  env: Record<string, string>;
  /** Full shell command string for a pane: env prefixes + base command. */
  command: string;
}

interface PersistedModelHub {
  version: number;
  proxyUrl: string;
  authToken: string;
  /** Base CLI the launchers wrap (the proxy speaks the Anthropic protocol). */
  baseCommand: string;
  seats: Record<string, string>;
}

interface ModelHubState {
  proxyUrl: string;
  authToken: string;
  baseCommand: string;
  /** seat → model id ("" = unpinned). */
  seats: Record<string, string>;
  /** Chat-capable model ids reported by the proxy, ordered for selection UIs. */
  models: string[];
  /** Raw model ids reported by the proxy's /v1/models. */
  allModels: string[];
  status: ModelHubStatus;
  lastProbeTs: number | null;
  error: string | null;

  setProxyUrl: (url: string) => void;
  setAuthToken: (token: string) => void;
  setBaseCommand: (command: string) => void;
  setSeat: (seat: string, model: string) => void;
  removeSeat: (seat: string) => void;
  addSeat: (seat: string) => void;
  /** GET {proxyUrl}/v1/models via proxy_http; updates models/status. */
  probe: () => Promise<void>;
  /** Launcher for one seat (unknown seat → unpinned launcher). */
  launcherFor: (seat: string | undefined) => SeatLauncher;
  /** All seat launchers, for the Model Hub UI + fan-out flows. */
  launchers: () => SeatLauncher[];
}

/** POSIX single-quote escaping — safe inside the login shell the pane runs. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Pane color identity from a model id (§7.2 seat colors ride AgentKind). */
export function agentKindForModel(model: string | null): AgentKind {
  if (!model) return "claude";
  const m = model.toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("gpt") || m.includes("codex") || /\bo[0-9]/.test(m)) return "codex";
  return "claude";
}

const NON_CHAT_MARKERS = [
  "image",
  "dall-e",
  "whisper",
  "tts",
  "audio",
  "embed",
  "moderation",
  "realtime",
  "search",
  "transcribe",
];

/** Whether a model id represents a current, general-purpose chat model. */
export function isChatModel(id: string): boolean {
  const model = id.trim().toLowerCase();
  if (!model || NON_CHAT_MARKERS.some((marker) => model.includes(marker))) return false;
  if (model.includes("gpt-3.5") || model.includes("gpt-4-")) return false;
  if (["davinci", "babbage", "curie", "ada"].some((name) => model.includes(name))) return false;
  if (/claude-(?:1|2)(?:[.-]|$)/.test(model) || model.includes("claude-instant")) return false;

  const claude3 = model.match(/claude-3(?:[.-](\d{1,2}))?(?:[.-]|$)/);
  if (claude3 && (claude3[1] === undefined || Number(claude3[1]) < 5)) return false;
  return true;
}

const NATURAL_COLLATOR = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const OPENAI_RANKED_PREFIXES = ["gpt-5.", "gpt-5", "o4", "o3", "gpt-4.1", "gpt-4o"];
const CLAUDE_RANKED_MARKERS = ["fable", "mythos", "opus", "sonnet", "haiku"];

function modelName(id: string): string {
  return id.toLowerCase().split("/").pop() ?? id.toLowerCase();
}

function modelFamily(id: string): number {
  const name = modelName(id);
  if (name.startsWith("gpt-") || /^o\d/.test(name)) return 0;
  if (name.startsWith("claude-")) return 1;
  if (name.startsWith("gemini-")) return 2;
  return 3;
}

function rankedIndex(name: string, prefixes: string[]): number {
  const index = prefixes.findIndex((prefix) => name.startsWith(prefix) || name.includes(prefix));
  return index === -1 ? prefixes.length : index;
}

/** Return model ids grouped by family and ranked newest/strongest first. */
export function sortModels(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const familyA = modelFamily(a);
    const familyB = modelFamily(b);
    if (familyA !== familyB) return familyA - familyB;

    const nameA = modelName(a);
    const nameB = modelName(b);
    if (familyA === 0) {
      const rank = rankedIndex(nameA, OPENAI_RANKED_PREFIXES)
        - rankedIndex(nameB, OPENAI_RANKED_PREFIXES);
      if (rank !== 0) return rank;
    } else if (familyA === 1) {
      const rank = rankedIndex(nameA, CLAUDE_RANKED_MARKERS)
        - rankedIndex(nameB, CLAUDE_RANKED_MARKERS);
      if (rank !== 0) return rank;
    }

    const natural = NATURAL_COLLATOR.compare(b, a);
    return natural !== 0 ? natural : a.localeCompare(b, "en");
  });
}

function sanitizeSeats(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_SEATS };
  const seats: Record<string, string> = {};
  for (const [seat, model] of Object.entries(value as Record<string, unknown>)) {
    if (typeof seat === "string" && seat.trim() && typeof model === "string") {
      seats[seat.trim()] = model.trim();
    }
  }
  return Object.keys(seats).length > 0 ? seats : { ...DEFAULT_SEATS };
}

function loadPersisted(): Omit<PersistedModelHub, "version"> {
  const defaults = {
    proxyUrl: DEFAULT_PROXY_URL,
    authToken: "",
    baseCommand: "claude",
    seats: { ...DEFAULT_SEATS },
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Partial<PersistedModelHub>;
    return {
      proxyUrl: typeof saved.proxyUrl === "string" && saved.proxyUrl.trim()
        ? saved.proxyUrl.trim()
        : defaults.proxyUrl,
      authToken: typeof saved.authToken === "string" ? saved.authToken : "",
      baseCommand: typeof saved.baseCommand === "string" && saved.baseCommand.trim()
        ? saved.baseCommand.trim()
        : defaults.baseCommand,
      seats: sanitizeSeats(saved.seats),
    };
  } catch {
    return defaults; // corrupt storage → safe defaults
  }
}

function buildLauncher(
  seat: string,
  model: string,
  proxyUrl: string,
  authToken: string,
  baseCommand: string,
): SeatLauncher {
  const env: Record<string, string> = { ANTHROPIC_BASE_URL: proxyUrl };
  if (authToken) env.ANTHROPIC_AUTH_TOKEN = authToken;
  if (model) env.ANTHROPIC_MODEL = model;
  const prefix = Object.entries(env)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ");
  return {
    seat,
    model: model || null,
    env,
    command: `${prefix} ${baseCommand}`.trim(),
  };
}

const initial = loadPersisted();

export const useModelHub = create<ModelHubState>((set, get) => ({
  ...initial,
  models: [],
  allModels: [],
  status: "unknown",
  lastProbeTs: null,
  error: null,

  setProxyUrl: (url) => set({ proxyUrl: url.trim() || DEFAULT_PROXY_URL, status: "unknown" }),
  setAuthToken: (token) => set({ authToken: token.trim() }),
  setBaseCommand: (command) => set({ baseCommand: command.trim() || "claude" }),

  setSeat: (seat, model) =>
    set((s) => ({ seats: { ...s.seats, [seat.trim()]: model.trim() } })),

  removeSeat: (seat) =>
    set((s) => {
      if (!(seat in s.seats)) return s;
      const seats = { ...s.seats };
      delete seats[seat];
      return { seats };
    }),

  addSeat: (seat) =>
    set((s) => {
      const name = seat.trim();
      if (!name || name in s.seats) return s;
      return { seats: { ...s.seats, [name]: "" } };
    }),

  probe: async () => {
    const { proxyUrl, authToken } = get();
    set({ status: "probing", error: null });
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      const response = await proxyHttp(
        "GET",
        `${proxyUrl.replace(/\/+$/, "")}/v1/models`,
        headers,
        null,
      );
      if (response.status === 401 || response.status === 403) {
        // Reached the proxy but it rejected auth — distinct from unreachable.
        set({ status: "auth", lastProbeTs: Date.now(), error: `HTTP ${response.status}` });
        return;
      }
      if (response.status < 200 || response.status >= 300) {
        set({ status: "offline", lastProbeTs: Date.now(), error: `HTTP ${response.status}` });
        return;
      }
      const parsed = JSON.parse(response.body) as { data?: { id?: unknown }[] };
      const allModels = Array.isArray(parsed.data)
        ? parsed.data
            .map((item) => (typeof item?.id === "string" ? item.id : null))
            .filter((id): id is string => id !== null)
        : [];
      const models = sortModels(allModels.filter(isChatModel));
      set({ allModels, models, status: "online", lastProbeTs: Date.now(), error: null });
    } catch (err) {
      // proxy_http rejected (proxy down / no Tauri backend) — offline, not fatal.
      set({ status: "offline", lastProbeTs: Date.now(), error: String(err) });
    }
  },

  launcherFor: (seat) => {
    const s = get();
    const name = seat?.trim() || "orchestrator";
    return buildLauncher(name, s.seats[name] ?? "", s.proxyUrl, s.authToken, s.baseCommand);
  },

  launchers: () => {
    const s = get();
    return Object.keys(s.seats).map((seat) =>
      buildLauncher(seat, s.seats[seat], s.proxyUrl, s.authToken, s.baseCommand),
    );
  },
}));

/** First pinned model across seats — the default engine for LLM side-tasks
    (flight-recorder digests, voice prompt improvement). null = none pinned. */
export function firstPinnedModel(): string | null {
  const seats = useModelHub.getState().seats;
  for (const model of Object.values(seats)) {
    if (model) return model;
  }
  return null;
}

// Persist config only (models/status are live probe results, never stored).
useModelHub.subscribe((state) => {
  if (typeof window === "undefined") return;
  const saved: PersistedModelHub = {
    version: VERSION,
    proxyUrl: state.proxyUrl,
    authToken: state.authToken,
    baseCommand: state.baseCommand,
    seats: state.seats,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Config continues to work for this process when storage is unavailable.
  }
});
