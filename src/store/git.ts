/* ══════════════════════════════════════════════════════════════════════════
   useGit — real git state and source-control actions for the active pane cwd.
   Rust shells out to the user's git binary; null status means "not a repo / git
   unavailable". Polls every 15s as a backstop and refreshes after mutations.
   ══════════════════════════════════════════════════════════════════════════ */
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { GitBranchList, GitEntry, GitStatus } from "../lib/contract";
import { usePanes } from "./panes";

// Git on WSL drvfs is materially more expensive than native filesystem work.
// Fifteen seconds is current enough for passive chrome; cwd/visibility changes
// and all source-control mutations still refresh immediately.
const POLL_MS = 15_000;

/** Compatibility projection for the current status bar/rail/sidebar. New SCM
    UI should consume staged/unstaged/untracked directly. */
export interface GitChange {
  code: string;
  path: string;
}

export interface GitStoreStatus extends GitStatus {
  changes: GitChange[];
}

export interface GitState {
  status: GitStoreStatus | null;
  /** cwd the current status was read from (display and mutation context). */
  cwd: string | null;
  refresh: () => Promise<void>;
  stage: (path: string) => Promise<void>;
  unstage: (path: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  commit: (message: string, amend?: boolean) => Promise<void>;
  diff: (path: string, staged?: boolean) => Promise<string>;
  listBranches: () => Promise<GitBranchList>;
  checkout: (branch: string) => Promise<void>;
  createBranch: (name: string) => Promise<void>;
  discard: (path: string) => Promise<void>;
  push: () => Promise<void>;
  pull: () => Promise<void>;
  fetch: () => Promise<void>;
  /** Begin polling — idempotent; called once from bootstrap. */
  start: () => void;
}

let started = false;
let inFlight = false;
// A refresh requested while one is in flight (e.g. a cwd change or mutation
// mid-poll) sets this; finally re-fires once so the newest state is not dropped.
let pending = false;

const activeCwd = (): string | null => {
  const state = usePanes.getState();
  const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
  return (tab && state.panes[tab.activePaneId]?.cwd) || null;
};

const requireRepoCwd = (snapshotCwd: string | null): string => {
  const cwd = snapshotCwd ?? activeCwd();
  if (!cwd) throw new Error("No active pane cwd for git operation");
  return cwd;
};

const legacyCode = (code: string): string => code === "." ? " " : code;

const toStoreStatus = (status: GitStatus): GitStoreStatus => {
  const changes: GitChange[] = [];
  const seen = new Set<string>();
  const entries: GitEntry[] = [
    ...status.staged,
    ...status.unstaged,
    ...status.untracked,
  ];

  for (const entry of entries) {
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    changes.push({
      code: `${legacyCode(entry.x)}${legacyCode(entry.y)}`,
      path: entry.path,
    });
  }

  return { ...status, changes };
};

const mutate = async (
  snapshotCwd: string | null,
  command: string,
  args: Record<string, unknown> = {},
): Promise<void> => {
  const repoPath = requireRepoCwd(snapshotCwd);
  await invoke<void>(command, { repoPath, ...args });
  await useGit.getState().refresh();
};

export const useGit = create<GitState>((set, get) => ({
  status: null,
  cwd: null,

  refresh: async () => {
    if (inFlight) {
      pending = true;
      return;
    }
    inFlight = true;
    try {
      const cwd = activeCwd();
      if (!cwd) {
        set({ status: null, cwd: null });
        return;
      }
      const status = await invoke<GitStatus | null>("git_status", { path: cwd });
      // The active cwd may have changed while the status was in flight — writing
      // it now would misattribute this repo's branch/counts to the new pane.
      if (activeCwd() !== cwd) return;
      set({ status: status ? toStoreStatus(status) : null, cwd });
    } catch {
      // Backend unavailable (browser dev) or git failed — omit git segments.
      const cwd = activeCwd();
      set({ status: null, cwd });
    } finally {
      inFlight = false;
      if (pending) {
        pending = false;
        void useGit.getState().refresh();
      }
    }
  },

  stage: (path) => mutate(get().cwd, "git_stage", { path }),
  unstage: (path) => mutate(get().cwd, "git_unstage", { path }),
  stageAll: () => mutate(get().cwd, "git_stage_all"),
  unstageAll: () => mutate(get().cwd, "git_unstage_all"),
  commit: (message, amend = false) =>
    mutate(get().cwd, "git_commit", { message, amend }),

  diff: (path, staged = false) => {
    const repoPath = requireRepoCwd(get().cwd);
    return invoke<string>("git_diff", { repoPath, path, staged });
  },

  listBranches: () => {
    const repoPath = requireRepoCwd(get().cwd);
    return invoke<GitBranchList>("git_branch_list", { repoPath });
  },

  checkout: (branch) => mutate(get().cwd, "git_checkout", { branch }),
  createBranch: (name) => mutate(get().cwd, "git_create_branch", { name }),
  discard: (path) => mutate(get().cwd, "git_discard", { path }),
  push: () => mutate(get().cwd, "git_push"),
  pull: () => mutate(get().cwd, "git_pull"),
  fetch: () => mutate(get().cwd, "git_fetch"),

  start: () => {
    if (started) return;
    started = true;
    const refresh = () => void useGit.getState().refresh();
    refresh();
    window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
    let lastCwd = activeCwd();
    usePanes.subscribe(() => {
      const cwd = activeCwd();
      if (cwd !== lastCwd) {
        lastCwd = cwd;
        refresh();
      }
    });
  },
}));
