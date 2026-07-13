/* ══════════════════════════════════════════════════════════════════════════
   useEnv — real environment facts resolved ONCE from Rust (sys::env_info):
   home dir, login shell, WSL distro. null = genuinely unknown (e.g. running in
   a plain browser without Tauri) — consumers OMIT the value, never fake one.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import { envInfo } from "../lib/commands";

interface EnvState {
  home: string | null;
  shell: string | null;
  cwd: string | null;
  wslDistro: string | null;
  /** true once load() settled (successfully or not) — gates bootstrap. */
  loaded: boolean;
  load: () => Promise<void>;
}

export const useEnv = create<EnvState>((set) => ({
  home: null,
  shell: null,
  cwd: null,
  wslDistro: null,
  loaded: false,

  load: async () => {
    try {
      const info = await envInfo();
      set({ home: info.home, shell: info.shell, cwd: info.cwd, wslDistro: info.wslDistro, loaded: true });
    } catch {
      // no Tauri backend (browser dev) — everything stays unknown
      set({ loaded: true });
    }
  },
}));
