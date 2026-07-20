/* ══════════════════════════════════════════════════════════════════════════
   helm v0.4 — typed invoke() wrappers for the §3.2 IPC surface (workstream C
   side of the seam; workstream A implements the matching #[tauri::command]s).

   INTEROP RULES (mirror lib/commands.ts):
   • Arg keys here are camelCase; Tauri v2 auto-maps them to the snake_case
     Rust params (projectRoot → project_root).
   • Errors are Result<T, String> on the Rust side — every call can reject
     with a plain string; callers guard.
   • `rel_path`/`rel_dir` are relative to the project's `.helm/` directory
     (helm_store_* lazily creates `.helm/` on first write).

   This file also owns the typed EVENT listeners C consumes:
   • "bridge://stage"    — existing bridge channel (bridge.rs). §3.3 extends
     the payload `t` values with task.progress / task.done / task.blocked /
     memory.write; the verb router below fans those out to the domain stores.
   • "voice://download"  — §3.2 voice_download_model progress stream.
   ══════════════════════════════════════════════════════════════════════════ */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/* ─────────────────────────── .helm project store ─────────────────────────── */

/** Entry from helm_store_list (mirrors fs.rs DirEntry shape). */
export interface StoreEntry {
  name: string;
  path: string;
  dir: boolean;
}

export const helmStoreRead = (projectRoot: string, relPath: string) =>
  invoke<string>("helm_store_read", { projectRoot, relPath });

/** Atomic write + mkdir -p. */
export const helmStoreWrite = (projectRoot: string, relPath: string, content: string) =>
  invoke<void>("helm_store_write", { projectRoot, relPath, content });

/** CONTRACT ADDITION (flagged to the orchestrator): binary payloads (voice WAV)
    cannot ride a String IPC arg losslessly, so this base64 variant is required
    alongside §3.2's helm_store_write. Rust decodes b64 and writes raw bytes. */
export const helmStoreWriteB64 = (projectRoot: string, relPath: string, b64: string) =>
  invoke<void>("helm_store_write_b64", { projectRoot, relPath, b64 });

export const helmStoreList = (projectRoot: string, relDir: string) =>
  invoke<StoreEntry[]>("helm_store_list", { projectRoot, relDir });

/* ─────────────────────────────── worktrees ───────────────────────────────── */

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  /** Dirty file count (0 = clean) — Fleet chips render the number. */
  dirty: number;
}

export const worktreeList = (repo: string) =>
  invoke<WorktreeInfo[]>("worktree_list", { repo });

/** Creates `.helm-worktrees/<branch>` as a sibling dir of the repo. */
export const worktreeAdd = (repo: string, branch: string, base: string) =>
  invoke<{ path: string }>("worktree_add", { repo, branch, base });

export const worktreeRemove = (repo: string, path: string, force: boolean) =>
  invoke<void>("worktree_remove", { repo, path, force });

/* ─────────────────────────── flight recorder ─────────────────────────────── */

/** Buffered append to .helm/recordings/<sessionId>.ndjson. `ndjsonLine` may
    carry MULTIPLE newline-joined lines (one flush = one IPC hop). */
export const recorderAppend = (projectRoot: string, sessionId: string, ndjsonLine: string) =>
  invoke<void>("recorder_append", { projectRoot, sessionId, ndjsonLine });

export const recorderRead = (projectRoot: string, sessionId: string, fromLine: number) =>
  invoke<string[]>("recorder_read", { projectRoot, sessionId, fromLine });

/* ──────────────────────── proxy HTTP (CLIProxyAPI) ───────────────────────── */

export interface ProxyHttpResponse {
  status: number;
  body: string;
}

/** Loopback/LAN-only HTTP through Rust (the webview cannot reach 127.0.0.1
    cross-origin). Used for CLIProxyAPI /v1/models + /v1/chat/completions. */
export const proxyHttp = (
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | null,
) => invoke<ProxyHttpResponse>("proxy_http", { method, url, headers, body });

/* ────────────────────────────── voice ────────────────────────────────────── */

/** Spawns whisper-cli against a 16 kHz mono WAV. */
export const voiceTranscribe = (wavPath: string, modelPath: string, binaryPath: string) =>
  invoke<{ text: string }>("voice_transcribe", { wavPath, modelPath, binaryPath });

/** Streamed download; progress arrives on the "voice://download" event. */
export const voiceDownloadModel = (modelId: string, destDir: string) =>
  invoke<{ path: string }>("voice_download_model", { modelId, destDir });

export interface VoiceDownloadEvent {
  modelId: string;
  /** Bytes received so far. */
  received: number;
  /** Total bytes, when the server reported Content-Length. */
  total: number | null;
  /** Present on the final event. */
  done?: boolean;
  path?: string;
  error?: string;
}

export function onVoiceDownload(
  handler: (event: VoiceDownloadEvent) => void,
): Promise<UnlistenFn> {
  return listen<VoiceDownloadEvent>("voice://download", (event) => {
    const p = event.payload;
    if (p && typeof p === "object" && typeof p.modelId === "string") handler(p);
  });
}

/* ─────────────────────── bridge event channel (§3.3) ─────────────────────────
   One shared "bridge://stage" listener; the App keeps its own for Stage cards
   (parseOsc rejects the new verb kinds there, so double-listening is safe). */

export interface BridgeStageEvent {
  pane: string;
  payload: Record<string, unknown>;
  requestId: string;
}

export type TaskVerbKind = "task.progress" | "task.done" | "task.blocked";

export interface TaskVerb {
  kind: TaskVerbKind;
  /** Task/card id the agent reported on (`helm task done <id>`). */
  taskId: string;
  msg?: string;
  /** Pane the shim ran in ($HELM_PANE). */
  paneId: string;
  ts: number;
}

export interface MemoryWriteVerb {
  name: string;
  desc?: string;
  links: string[];
  body?: string;
  paneId: string;
  ts: number;
}

type TaskVerbHandler = (verb: TaskVerb) => void;
type MemoryWriteHandler = (verb: MemoryWriteVerb) => void;

const taskHandlers = new Set<TaskVerbHandler>();
const memoryHandlers = new Set<MemoryWriteHandler>();
let bridgeListenerStarted = false;

const TASK_KINDS: ReadonlySet<string> = new Set(["task.progress", "task.done", "task.blocked"]);

function routeBridgePayload(paneId: string, payload: Record<string, unknown>): void {
  const t = payload.t;
  if (typeof t !== "string") return;
  const ts = Date.now();

  if (TASK_KINDS.has(t)) {
    if (typeof payload.id !== "string" || payload.id.length === 0) return;
    const verb: TaskVerb = {
      kind: t as TaskVerbKind,
      taskId: payload.id,
      msg: typeof payload.msg === "string" ? payload.msg : undefined,
      paneId,
      ts,
    };
    for (const handler of taskHandlers) {
      try { handler(verb); } catch { /* one bad subscriber never blocks the rest */ }
    }
    return;
  }

  if (t === "memory.write") {
    if (typeof payload.name !== "string" || payload.name.trim().length === 0) return;
    const links = Array.isArray(payload.links)
      ? payload.links.filter((link): link is string => typeof link === "string")
      : [];
    const verb: MemoryWriteVerb = {
      name: payload.name.trim(),
      desc: typeof payload.desc === "string" ? payload.desc : undefined,
      links,
      body: typeof payload.body === "string" ? payload.body : undefined,
      paneId,
      ts,
    };
    for (const handler of memoryHandlers) {
      try { handler(verb); } catch { /* isolate subscribers */ }
    }
  }
}

function ensureBridgeListener(): void {
  if (bridgeListenerStarted) return;
  bridgeListenerStarted = true;
  void listen<BridgeStageEvent>("bridge://stage", (event) => {
    const message = event.payload;
    if (
      !message ||
      typeof message.pane !== "string" ||
      !message.payload ||
      typeof message.payload !== "object"
    ) return;
    routeBridgePayload(message.pane, message.payload);
  }).catch(() => {
    // Browser dev has no Tauri event target — verbs are desktop-only.
  });
}

/** Subscribe to task.* verbs (board / swarm / attention). Sync unsubscribe. */
export function onTaskVerb(handler: TaskVerbHandler): () => void {
  ensureBridgeListener();
  taskHandlers.add(handler);
  return () => taskHandlers.delete(handler);
}

/** Subscribe to memory.write verbs (memory store). Sync unsubscribe. */
export function onMemoryWrite(handler: MemoryWriteHandler): () => void {
  ensureBridgeListener();
  memoryHandlers.add(handler);
  return () => memoryHandlers.delete(handler);
}

/** Raw bridge listener for consumers that need the untouched event. */
export function listenBridgeStage(
  handler: (event: BridgeStageEvent) => void,
): Promise<UnlistenFn> {
  return listen<BridgeStageEvent>("bridge://stage", (event) => handler(event.payload));
}
