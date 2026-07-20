/* ══════════════════════════════════════════════════════════════════════════
   useUpdater — in-app auto-update (§3.4 / §4.1). Thin, honest wrapper around
   @tauri-apps/plugin-updater (check/download) + plugin-process (relaunch).
   The endpoint + pubkey live in tauri.conf.json (workstream A) — this store
   only drives the JS lifecycle and exposes progress for the UI (settings card,
   titlebar "Update ready — Restart" pill, silent startup check).

   State machine: idle → checking → (idle | available) → downloading → ready
   → installing; any failure → error (message kept, retry allowed).
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdaterPhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export interface UpdaterState {
  state: UpdaterPhase;
  /** Version offered by the feed (null until a check finds one). */
  version: string | null;
  currentVersion: string | null;
  /** Release notes body from latest.json. */
  notes: string | null;
  /** Download progress 0..1; null while length is unknown. */
  progress: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;
  lastCheckTs: number | null;

  /** Query the feed. `silent` suppresses the error state on network failure
      (startup background check must not paint the UI red). */
  check: (opts?: { silent?: boolean }) => Promise<boolean>;
  /** Download the pending update (no install yet). */
  download: () => Promise<boolean>;
  /** Install the downloaded update and relaunch the app. */
  install: () => Promise<void>;
  /** Drop a pending update/error back to idle. */
  dismiss: () => void;
}

// The plugin's Update is a Rust-side Resource — kept OUT of the store (not
// serializable, and set() snapshots would leak stale rids).
let pendingUpdate: Update | null = null;

async function releasePending(): Promise<void> {
  const update = pendingUpdate;
  pendingUpdate = null;
  if (update) {
    try { await update.close(); } catch { /* resource already dropped */ }
  }
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  state: "idle",
  version: null,
  currentVersion: null,
  notes: null,
  progress: null,
  downloadedBytes: 0,
  totalBytes: null,
  error: null,
  lastCheckTs: null,

  check: async (opts) => {
    const current = get().state;
    if (current === "downloading" || current === "installing") return false;
    await releasePending();
    set({ state: "checking", error: null });
    try {
      const update = await check();
      if (!update) {
        set({ state: "idle", version: null, notes: null, lastCheckTs: Date.now() });
        return false;
      }
      pendingUpdate = update;
      set({
        state: "available",
        version: update.version,
        currentVersion: update.currentVersion,
        notes: update.body ?? null,
        progress: null,
        downloadedBytes: 0,
        totalBytes: null,
        lastCheckTs: Date.now(),
      });
      return true;
    } catch (err) {
      set(opts?.silent
        ? { state: "idle", lastCheckTs: Date.now() }
        : { state: "error", error: String(err), lastCheckTs: Date.now() });
      return false;
    }
  },

  download: async () => {
    if (!pendingUpdate || get().state !== "available") return false;
    set({ state: "downloading", progress: null, downloadedBytes: 0, totalBytes: null, error: null });
    try {
      let received = 0;
      let total: number | null = null;
      await pendingUpdate.download((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          set({ totalBytes: total, progress: total ? 0 : null });
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          set({
            downloadedBytes: received,
            progress: total ? Math.min(1, received / total) : null,
          });
        } else {
          set({ progress: 1 });
        }
      });
      set({ state: "ready" });
      return true;
    } catch (err) {
      set({ state: "error", error: String(err) });
      return false;
    }
  },

  install: async () => {
    if (!pendingUpdate || get().state !== "ready") return;
    set({ state: "installing", error: null });
    try {
      await pendingUpdate.install();
      pendingUpdate = null;
      await relaunch();
    } catch (err) {
      // Install failed — the downloaded package may be unusable; force a
      // fresh check rather than retrying a possibly corrupt resource.
      await releasePending();
      set({ state: "error", error: String(err) });
    }
  },

  dismiss: () => {
    const current = get().state;
    if (current === "downloading" || current === "installing") return;
    void releasePending();
    set({ state: "idle", version: null, notes: null, progress: null, error: null });
  },
}));

/** Silent startup check — call once from bootstrap/UI (Wave 2 wires it). */
export function startupUpdateCheck(delayMs = 4_000): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    void useUpdater.getState().check({ silent: true });
  }, delayMs);
}
