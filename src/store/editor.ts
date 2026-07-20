import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { fsReadFile } from "../lib/commands";

export interface EditorFile {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  dirty: boolean;
  readOnly: boolean;
  loading: boolean;
  conflict: boolean;
  error: string | null;
}

export interface OpenFileSeed {
  content: string;
  truncated?: boolean;
}

interface EditorState {
  tabs: EditorFile[];
  activeTab: string | null;
  mtimes: Record<string, number>;
  openFile: (path: string, seed?: OpenFileSeed) => Promise<void>;
  save: (path?: string) => Promise<void>;
  close: (path: string) => void;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  reload: (path: string) => Promise<void>;
  keepLocal: (path: string) => void;
  pollExternalChanges: () => Promise<void>;
}

const basename = (path: string) => path.split(/[\\/]/).pop() || path;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

// TODO(workstream A): register fs_file_mtime(path) -> epoch milliseconds.
const fileMtime = (path: string) => invoke<number>("fs_file_mtime", { path });
// TODO(workstream A): register fs_write_file(path, content) -> ().
const writeFile = (path: string, content: string) =>
  invoke<void>("fs_write_file", { path, content });

async function readEditorFile(path: string): Promise<Pick<EditorFile, "content" | "savedContent" | "readOnly">> {
  const file = await fsReadFile(path);
  if (file.text === undefined) throw new Error(`Cannot edit binary file (${file.mime})`);
  return {
    content: file.text,
    savedContent: file.text,
    readOnly: file.truncated,
  };
}

export const useEditor = create<EditorState>((set, get) => ({
  tabs: [],
  activeTab: null,
  mtimes: {},

  openFile: async (path, seed) => {
    const existing = get().tabs.find((tab) => tab.path === path);
    if (existing) {
      set({ activeTab: path });
      return;
    }

    const seeded = seed
      ? { content: seed.content, savedContent: seed.content, readOnly: seed.truncated ?? false }
      : null;
    set((state) => ({
      activeTab: path,
      tabs: [...state.tabs, {
        path,
        name: basename(path),
        content: seeded?.content ?? "",
        savedContent: seeded?.savedContent ?? "",
        dirty: false,
        readOnly: seeded?.readOnly ?? false,
        loading: !seeded,
        conflict: false,
        error: null,
      }],
    }));

    try {
      const [loaded, mtime] = await Promise.all([
        seeded ? Promise.resolve(seeded) : readEditorFile(path),
        fileMtime(path).catch(() => undefined),
      ]);
      set((state) => ({
        tabs: state.tabs.map((tab) => tab.path === path
          ? { ...tab, ...loaded, loading: false, error: null }
          : tab),
        mtimes: mtime === undefined ? state.mtimes : { ...state.mtimes, [path]: mtime },
      }));
    } catch (error) {
      set((state) => ({
        tabs: state.tabs.map((tab) => tab.path === path
          ? { ...tab, loading: false, error: message(error) }
          : tab),
      }));
    }
  },

  save: async (requestedPath) => {
    const path = requestedPath ?? get().activeTab;
    if (!path) return;
    const tab = get().tabs.find((item) => item.path === path);
    if (!tab || tab.readOnly || tab.loading) return;

    try {
      await writeFile(path, tab.content);
      const mtime = await fileMtime(path).catch(() => undefined);
      set((state) => ({
        tabs: state.tabs.map((item) => item.path === path
          ? { ...item, savedContent: item.content, dirty: false, conflict: false, error: null }
          : item),
        mtimes: mtime === undefined ? state.mtimes : { ...state.mtimes, [path]: mtime },
      }));
    } catch (error) {
      set((state) => ({
        tabs: state.tabs.map((item) => item.path === path
          ? { ...item, error: message(error) }
          : item),
      }));
    }
  },

  close: (path) => set((state) => {
    const index = state.tabs.findIndex((tab) => tab.path === path);
    if (index < 0) return state;
    const tabs = state.tabs.filter((tab) => tab.path !== path);
    const activeTab = state.activeTab === path
      ? tabs[index]?.path ?? tabs[index - 1]?.path ?? null
      : state.activeTab;
    const mtimes = { ...state.mtimes };
    delete mtimes[path];
    return { tabs, activeTab, mtimes };
  }),

  setActive: (path) => {
    if (get().tabs.some((tab) => tab.path === path)) set({ activeTab: path });
  },

  updateContent: (path, content) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.path === path
      ? { ...tab, content, dirty: content !== tab.savedContent }
      : tab),
  })),

  reload: async (path) => {
    try {
      const [loaded, mtime] = await Promise.all([
        readEditorFile(path),
        fileMtime(path).catch(() => undefined),
      ]);
      set((state) => ({
        tabs: state.tabs.map((tab) => tab.path === path
          ? { ...tab, ...loaded, dirty: false, conflict: false, loading: false, error: null }
          : tab),
        mtimes: mtime === undefined ? state.mtimes : { ...state.mtimes, [path]: mtime },
      }));
    } catch (error) {
      set((state) => ({
        tabs: state.tabs.map((tab) => tab.path === path
          ? { ...tab, error: message(error) }
          : tab),
      }));
    }
  },

  keepLocal: (path) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.path === path ? { ...tab, conflict: false } : tab),
  })),

  pollExternalChanges: async () => {
    const snapshot = get();
    await Promise.all(snapshot.tabs.map(async (tab) => {
      try {
        const mtime = await fileMtime(tab.path);
        const previous = get().mtimes[tab.path];
        if (previous === undefined) {
          set((state) => ({ mtimes: { ...state.mtimes, [tab.path]: mtime } }));
          return;
        }
        if (mtime === previous) return;

        const current = get().tabs.find((item) => item.path === tab.path);
        if (!current) return;
        if (current.dirty) {
          set((state) => ({
            tabs: state.tabs.map((item) => item.path === tab.path
              ? { ...item, conflict: true }
              : item),
            mtimes: { ...state.mtimes, [tab.path]: mtime },
          }));
          return;
        }

        const loaded = await readEditorFile(tab.path);
        set((state) => ({
          tabs: state.tabs.map((item) => item.path === tab.path
            ? { ...item, ...loaded, dirty: false, conflict: false, error: null }
            : item),
          mtimes: { ...state.mtimes, [tab.path]: mtime },
        }));
      } catch {
        // Missing IPC during the Wave 1 merge or a transient stat failure should
        // not interrupt editing. The next two-second poll retries naturally.
      }
    }));
  },
}));
