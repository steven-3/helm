/* ══════════════════════════════════════════════════════════════════════════
   useVoice — voice prompting (§3.4): getUserMedia → AudioWorklet PCM capture
   → 16 kHz mono WAV (lib/wav.ts) → temp file under .helm/tmp (base64 IPC
   write) → voice_transcribe (whisper-cli) → prompt-improver.improve() →
   deliver text to the UI callback (the UI pastes into the active pane).

   The AudioWorklet module is served as a same-origin public asset; it forwards
   raw Float32 frames — downsampling to 16 kHz happens once at encode time in
   wav.ts, not per-frame in the audio thread.

   Model management: voice_download_model streams ggml models with progress on
   the "voice://download" event. binary/model paths + model dir persist in
   localStorage `helm.voice.v1` (settings-adjacent, own key).
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import {
  helmStoreWriteB64,
  onVoiceDownload,
  voiceDownloadModel,
  voiceTranscribe,
} from "../lib/ipc";
import { bytesToBase64, encodeCaptureToWav } from "../lib/wav";
import {
  improve,
  type ImproveContext,
  type ImproveEffort,
  type ImproveMode,
} from "../lib/prompt-improver";
import { armVoiceShortcuts } from "../lib/voice-shortcuts";
import { firstPinnedModel, useModelHub } from "./modelhub";
import { useBlocks } from "./blocks";
import { usePanes } from "./panes";
import { useEnv } from "./env";
import { useVoiceHistory } from "./voicehistory";

const STORAGE_KEY = "helm.voice.v1";
const STORAGE_VERSION = 2;
const DEFAULT_TOGGLE_SHORTCUT = "mod+shift+v";

export type VoicePhase =
  | "idle"
  | "recording"
  | "encoding"
  | "transcribing"
  | "improving"
  | "done"
  | "error";

export interface VoiceDownloadState {
  modelId: string;
  received: number;
  total: number | null;
  done: boolean;
  error: string | null;
}

interface PersistedVoice {
  version: number;
  binaryPath: string;
  modelPath: string;
  modelDir: string;
  /** Skip the LLM improve pass and paste the raw transcript. */
  rawMode: boolean;
  /** Paths came from voice_setup_whisper (managed dir) rather than the user. */
  managedSetup: boolean;
  /** v2: improver behavior — cleanup-only vs structured agent prompt. */
  improveMode: ImproveMode;
  /** v2: reasoning effort for the improver call. */
  improverEffort: ImproveEffort;
  /** v2: preferred capture device (null = system default mic). */
  deviceId: string | null;
  /** v2: push-to-talk accelerators (null = unbound). */
  holdShortcut: string | null;
  toggleShortcut: string | null;
}

export interface VoiceResult {
  /** Final text (improved, or raw on fallback/rawMode). */
  text: string;
  rawTranscript: string;
  improved: boolean;
}

interface VoiceState {
  phase: VoicePhase;
  /** Error detail for phase === "error". */
  error: string | null;
  /** Live capture level (0..1) for the UI meter. */
  level: number;
  result: VoiceResult | null;
  download: VoiceDownloadState | null;
  binaryPath: string;
  modelPath: string;
  modelDir: string;
  rawMode: boolean;
  managedSetup: boolean;
  /** Improver behavior: "regular" = cleanup only, "prompt" = agent prompt. */
  improveMode: ImproveMode;
  /** Reasoning effort for the improver call. */
  improverEffort: ImproveEffort;
  /** Preferred capture device id (null = system default mic). */
  deviceId: string | null;
  /** Hold-to-talk accelerator ("mod+shift+v" style), null = unbound. */
  holdShortcut: string | null;
  /** Toggle accelerator (also registered OS-globally), null = unbound. */
  toggleShortcut: string | null;

  setBinaryPath: (path: string) => void;
  setModelPath: (path: string) => void;
  setModelDir: (dir: string) => void;
  setRawMode: (raw: boolean) => void;
  setImproveMode: (m: ImproveMode) => void;
  setImproverEffort: (e: ImproveEffort) => void;
  setDeviceId: (id: string | null) => void;
  setHoldShortcut: (keys: string | null) => void;
  setToggleShortcut: (keys: string | null) => void;
  /** Adopt the paths voice_setup_whisper installed (marks the config managed). */
  applyManagedSetup: (binaryPath: string, modelPath: string) => void;
  /** Begin capture. `onText` receives the final text (the UI pastes it). */
  start: (opts?: { onText?: (result: VoiceResult) => void }) => Promise<void>;
  /** End capture and run the pipeline; resolves the result (null on error). */
  stop: () => Promise<VoiceResult | null>;
  /** Abandon a recording without transcribing. */
  cancel: () => void;
  /** Download a whisper ggml model into modelDir (progress via events). */
  downloadModel: (modelId: string) => Promise<string | null>;
}

/* ── capture plumbing (module scope — not store state; not serializable) ──── */

interface CaptureRig {
  stream: MediaStream;
  audioContext: AudioContext;
  workletNode: AudioWorkletNode;
  source: MediaStreamAudioSourceNode;
  chunks: Float32Array[];
  sampleRate: number;
}

let rig: CaptureRig | null = null;
let onTextCallback: ((result: VoiceResult) => void) | null = null;
/** Wall-clock start of the current take (history durationMs). */
let recordingStartedAt = 0;

const WORKLET_URL = "/voice-capture-worklet.js";

// Recording must survive window blur/hide: nothing here pauses on those
// events, but some platforms suspend the AudioContext when the window is
// hidden — resume it so a backgrounded take keeps capturing.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const context = rig?.audioContext;
    if (context && context.state === "suspended") {
      context.resume().catch(() => { /* resumes on next user gesture instead */ });
    }
  });
}

async function teardownRig(): Promise<void> {
  const current = rig;
  rig = null;
  if (!current) return;
  try { current.workletNode.port.onmessage = null; } catch { /* already gone */ }
  try { current.source.disconnect(); } catch { /* already gone */ }
  try { current.workletNode.disconnect(); } catch { /* already gone */ }
  for (const track of current.stream.getTracks()) {
    try { track.stop(); } catch { /* already stopped */ }
  }
  try { await current.audioContext.close(); } catch { /* already closed */ }
}

/** Loads the persisted blob. Handles the v1 → v2 migration implicitly: v1
    blobs simply lack the new fields, so every new field falls back to its
    default while the v1 fields carry over untouched. Corrupt JSON → defaults. */
function loadPersisted(): Omit<PersistedVoice, "version"> {
  const defaults: Omit<PersistedVoice, "version"> = {
    binaryPath: "whisper-cli",
    modelPath: "",
    modelDir: "",
    rawMode: false,
    managedSetup: false,
    improveMode: "regular",
    improverEffort: "medium",
    deviceId: null,
    holdShortcut: null,
    toggleShortcut: DEFAULT_TOGGLE_SHORTCUT,
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Partial<PersistedVoice>;
    const isV2 = typeof saved.version === "number" && saved.version >= 2;
    return {
      binaryPath: typeof saved.binaryPath === "string" && saved.binaryPath.trim()
        ? saved.binaryPath.trim()
        : defaults.binaryPath,
      modelPath: typeof saved.modelPath === "string" ? saved.modelPath.trim() : "",
      modelDir: typeof saved.modelDir === "string" ? saved.modelDir.trim() : "",
      rawMode: saved.rawMode === true,
      managedSetup: saved.managedSetup === true,
      improveMode: saved.improveMode === "prompt" ? "prompt" : "regular",
      improverEffort: saved.improverEffort === "low" || saved.improverEffort === "high"
        ? saved.improverEffort
        : "medium",
      deviceId: typeof saved.deviceId === "string" && saved.deviceId ? saved.deviceId : null,
      holdShortcut: typeof saved.holdShortcut === "string" && saved.holdShortcut.trim()
        ? saved.holdShortcut.trim()
        : null,
      // v2 persists an explicit null when the user unbinds the toggle; a v1
      // blob's missing field means "never configured" → seed the default.
      toggleShortcut: typeof saved.toggleShortcut === "string" && saved.toggleShortcut.trim()
        ? saved.toggleShortcut.trim()
        : isV2 ? null : DEFAULT_TOGGLE_SHORTCUT,
    };
  } catch {
    return defaults;
  }
}

/** Improve() context from the ACTIVE pane: cwd + agent, plus the pane's
    recent command-block cmds (most recent last) for disambiguation/hotwords. */
function activeContext(): ImproveContext {
  const state = usePanes.getState();
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  const pane = tab ? state.panes[tab.activePaneId] : undefined;
  if (!pane) return {};
  const blocks = useBlocks.getState().bySession[pane.id] ?? [];
  const recentCommands = blocks
    .slice(-5)
    .map((block) => block.cmd.trim())
    .filter(Boolean);
  return { cwd: pane.cwd, activeAgent: pane.agent, recentCommands };
}

/* ── whisper hotwords (--prompt vocabulary biasing) ───────────────────────── */

/** Built-in tech vocabulary whisper tends to mangle without biasing. */
const TECH_VOCAB = [
  "git", "npm", "pnpm", "Tauri", "Zustand", "TypeScript", "JavaScript",
  "Vite", "React", "Rust", "cargo", "regex", "async", "await", "JSON",
  "API", "CLI", "IPC", "localhost", "webview", "xterm", "whisper", "Helm",
];

/** whisper --prompt string: built-in vocab + tokens from recent commands.
    Capped at ~200 chars — the prompt biases recognition, it is not a prompt
    in the LLM sense. */
function buildHotwords(context: ImproveContext): string {
  const seen = new Set<string>();
  const words: string[] = [];
  const push = (word: string) => {
    const key = word.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    words.push(word);
  };
  for (const word of TECH_VOCAB) push(word);
  for (const cmd of context.recentCommands ?? []) {
    for (const token of cmd.split(/\s+/)) {
      // Keep identifier-ish tokens only — skip flags, paths, and noise.
      const cleaned = token.replace(/^[-./\\]+|[;|&<>]+$/g, "");
      if (/^[A-Za-z][\w-]{2,24}$/.test(cleaned)) push(cleaned);
    }
  }
  let out = "";
  for (const word of words) {
    const next = out ? `${out}, ${word}` : word;
    if (next.length > 200) break;
    out = next;
  }
  return out;
}

/** Project root for the temp wav: active pane cwd, else env home. */
function tempRoot(): string | null {
  const state = usePanes.getState();
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  const pane = tab ? state.panes[tab.activePaneId] : undefined;
  return pane?.cwd ?? useEnv.getState().home;
}

const initial = loadPersisted();

export const useVoice = create<VoiceState>((set, get) => ({
  phase: "idle",
  error: null,
  level: 0,
  result: null,
  download: null,
  ...initial,

  // A manual path edit means the config is no longer the managed layout.
  setBinaryPath: (path) => set({ binaryPath: path.trim(), managedSetup: false }),
  setModelPath: (path) => set({ modelPath: path.trim(), managedSetup: false }),
  setModelDir: (dir) => set({ modelDir: dir.trim() }),
  setRawMode: (rawMode) => set({ rawMode }),
  setImproveMode: (improveMode) => set({ improveMode }),
  setImproverEffort: (improverEffort) => set({ improverEffort }),
  setDeviceId: (deviceId) => set({ deviceId: deviceId?.trim() || null }),
  // Shortcut re-arming: the in-app engine reads the store live on every key
  // event; the OS-global registration re-arms via the voice-shortcuts
  // subscription on toggleShortcut changes.
  setHoldShortcut: (keys) => set({ holdShortcut: keys?.trim() || null }),
  setToggleShortcut: (keys) => set({ toggleShortcut: keys?.trim() || null }),
  applyManagedSetup: (binaryPath, modelPath) => set({
    binaryPath: binaryPath.trim(),
    modelPath: modelPath.trim(),
    managedSetup: true,
  }),

  start: async (opts) => {
    if (get().phase === "recording") return;
    onTextCallback = opts?.onText ?? null;
    recordingStartedAt = Date.now();
    set({ phase: "recording", error: null, result: null, level: 0 });
    try {
      const baseAudio = { channelCount: 1, echoCancellation: true, noiseSuppression: true };
      const { deviceId } = get();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { ...baseAudio, deviceId: { exact: deviceId } } : baseAudio,
        });
      } catch (err) {
        // Selected mic unplugged/renumbered — fall back to the default device.
        if (!deviceId) throw err;
        console.warn(`Voice device ${deviceId} unavailable, falling back to default`, err);
        stream = await navigator.mediaDevices.getUserMedia({ audio: baseAudio });
      }
      const audioContext = new AudioContext();
      await audioContext.audioWorklet.addModule(WORKLET_URL);
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, "helm-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
      });

      const chunks: Float32Array[] = [];
      let levelFrames = 0;
      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const frame = event.data;
        chunks.push(frame);
        // Cheap RMS meter, throttled to ~every 8th block.
        if (++levelFrames % 8 === 0) {
          let sum = 0;
          for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
          set({ level: Math.min(1, Math.sqrt(sum / frame.length) * 4) });
        }
      };
      source.connect(workletNode);
      rig = { stream, audioContext, workletNode, source, chunks, sampleRate: audioContext.sampleRate };
    } catch (err) {
      await teardownRig();
      set({ phase: "error", error: `Microphone unavailable: ${String(err)}` });
    }
  },

  stop: async () => {
    const current = rig;
    if (!current || get().phase !== "recording") return null;
    set({ phase: "encoding", level: 0 });
    const { chunks, sampleRate } = current;
    await teardownRig();

    try {
      if (chunks.length === 0) throw new Error("no audio captured");
      const wav = encodeCaptureToWav(chunks, sampleRate);

      // Temp file under the project's .helm/tmp — Rust owns the absolute path.
      const root = tempRoot();
      if (!root) throw new Error("no project root for the temp recording");
      const relPath = `tmp/voice-${Date.now()}.wav`;
      await helmStoreWriteB64(root, relPath, bytesToBase64(wav));
      const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
      const wavPath = `${root}${sep}.helm${sep}${relPath.split("/").join(sep)}`;

      set({ phase: "transcribing" });
      const { binaryPath, modelPath, rawMode, improveMode, improverEffort } = get();
      if (!modelPath) throw new Error("no whisper model configured — download one first");
      const context = activeContext();
      const hotwords = buildHotwords(context);
      const { text: transcript } = await voiceTranscribe(
        wavPath,
        modelPath,
        binaryPath,
        hotwords || undefined,
      );
      const raw = transcript.trim();
      if (!raw) throw new Error("transcription produced no text");

      let result: VoiceResult;
      if (rawMode) {
        result = { text: raw, rawTranscript: raw, improved: false };
      } else {
        set({ phase: "improving" });
        const hub = useModelHub.getState();
        const model = hub.seats["voice-improver"] || firstPinnedModel() || hub.models[0] || "";
        // improve() hard-falls-back to the raw transcript on ANY error,
        // including "no model to call".
        const outcome = model
          ? await improve(raw, context, {
              proxyUrl: hub.proxyUrl,
              authToken: hub.authToken || undefined,
              model,
              mode: improveMode,
              effort: improverEffort,
            })
          : { text: raw, improved: false };
        result = { text: outcome.text, rawTranscript: raw, improved: outcome.improved };
      }

      useVoiceHistory.getState().add({
        raw,
        improved: result.improved ? result.text : undefined,
        mode: improveMode,
        durationMs: recordingStartedAt > 0 ? Date.now() - recordingStartedAt : undefined,
      });

      set({ phase: "done", result });
      onTextCallback?.(result);
      return result;
    } catch (err) {
      set({ phase: "error", error: String(err) });
      return null;
    } finally {
      onTextCallback = null;
    }
  },

  cancel: () => {
    void teardownRig();
    onTextCallback = null;
    set({ phase: "idle", level: 0, error: null });
  },

  downloadModel: async (modelId) => {
    const { modelDir } = get();
    if (!modelDir) {
      set({ download: { modelId, received: 0, total: null, done: false, error: "Set a model directory first" } });
      return null;
    }
    set({ download: { modelId, received: 0, total: null, done: false, error: null } });
    try {
      const { path } = await voiceDownloadModel(modelId, modelDir);
      set((s) => ({
        download: s.download ? { ...s.download, done: true, error: null } : null,
        modelPath: path,
      }));
      return path;
    } catch (err) {
      set((s) => ({
        download: s.download ? { ...s.download, done: true, error: String(err) } : null,
      }));
      return null;
    }
  },
}));

/* ── voice://download progress stream (§3.2) ──────────────────────────────── */
if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
  void onVoiceDownload((event) => {
    useVoice.setState((s) => {
      if (!s.download || s.download.modelId !== event.modelId) return s;
      return {
        download: {
          ...s.download,
          received: event.received,
          total: event.total,
          done: event.done === true || s.download.done,
          error: event.error ?? s.download.error,
        },
        ...(event.done && event.path ? { modelPath: event.path } : {}),
      };
    });
  });
}

// Persist config (paths, improver, device, shortcuts) — capture/pipeline
// state stays ephemeral.
useVoice.subscribe((state) => {
  if (typeof window === "undefined") return;
  const saved: PersistedVoice = {
    version: STORAGE_VERSION,
    binaryPath: state.binaryPath,
    modelPath: state.modelPath,
    modelDir: state.modelDir,
    rawMode: state.rawMode,
    managedSetup: state.managedSetup,
    improveMode: state.improveMode,
    improverEffort: state.improverEffort,
    deviceId: state.deviceId,
    holdShortcut: state.holdShortcut,
    toggleShortcut: state.toggleShortcut,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Config still works for this process when storage is unavailable.
  }
});

// Push-to-talk engine (lib/voice-shortcuts): armed once at store init;
// in-app matching reads the store live, the OS-global side re-arms itself
// on toggleShortcut changes via its own subscription.
armVoiceShortcuts();
