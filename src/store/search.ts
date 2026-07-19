/* ══════════════════════════════════════════════════════════════════════════
   useSearch — the in-terminal find-bar state (Tier C). ONE bar at a time: a
   single `openForPane` slot means opening search on another pane closes the
   previous one (mirrors useLightbox / the once-mounted overlays). The find bar
   is opened from terminal-session.ts's custom key handler (Ctrl+F / Cmd+F),
   which swallows ^F so it never reaches the PTY, and closed by the bar itself.

   `focusNonce` bumps on every open() so the bar can (re)focus + select its input
   even when it is ALREADY open — e.g. the user clicked back into the terminal
   with the bar still visible, then pressed Ctrl+F again.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";
import { searchProject } from "../lib/commands";
import type { SearchHit } from "../lib/commands";

interface SearchState {
  /** Pane id whose find bar is open; null = no bar visible. */
  openForPane: string | null;
  /** Bumped by open() to (re)focus the query input on demand. */
  focusNonce: number;
  open: (paneId: string) => void;
  close: () => void;
}

export const useSearch = create<SearchState>((set) => ({
  openForPane: null,
  focusNonce: 0,
  open: (paneId) => set((s) => ({ openForPane: paneId, focusNonce: s.focusNonce + 1 })),
  close: () => set({ openForPane: null }),
}));

/* ──────────────────────────────────────────────────────────────────────────
   useProjectSearch — the SIDEBAR project-wide search (SearchView). A separate
   slice from the in-terminal find bar above: the two never share state.

   The store owns data + the request lifecycle; the VIEW owns the 250ms debounce
   (mirrors TerminalSearch, where the timer lives in the component). Stale
   responses are dropped by a monotonically increasing request id: every run()
   and every reset() bumps `reqSeq`, and a settling promise whose id is no
   longer current is ignored — out-of-order invokes can never clobber a newer
   query's results. On error the PREVIOUS results are kept on screen (VS Code
   idiom): the error rides as a strip under the input until the next settle.
   ────────────────────────────────────────────────────────────────────────── */
export type ProjectSearchStatus = "idle" | "searching" | "done" | "error";

interface ProjectSearchState {
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  /** Single include glob (e.g. "*.ts"); "" = search everything. */
  includeGlob: string;
  /** Whether the include-glob field is expanded (filter toggle). */
  filtersOpen: boolean;
  status: ProjectSearchStatus;
  results: SearchHit[];
  /** True when the walk stopped at the result cap — the list is partial. */
  truncated: boolean;
  /** Settled error string (regex compile failure, unreadable root, …). */
  error: string | null;
  /** Paths of collapsed file groups (default: every group expanded). */
  collapsed: Set<string>;
  /** Bumped by the Mod+Shift+F shortcut to (re)focus the query input. */
  focusNonce: number;

  setQuery: (q: string) => void;
  setCaseSensitive: (v: boolean) => void;
  setRegex: (v: boolean) => void;
  setIncludeGlob: (v: string) => void;
  toggleFilters: () => void;
  toggleCollapsed: (path: string) => void;
  requestFocus: () => void;
  /** Empty-query settle: back to idle, results cleared, inflight invalidated. */
  reset: () => void;
  /** Run the search against a root. Stale settles are dropped via reqSeq. */
  run: (root: string) => Promise<void>;
}

let reqSeq = 0;

export const useProjectSearch = create<ProjectSearchState>((set, get) => ({
  query: "",
  caseSensitive: false,
  regex: false,
  includeGlob: "",
  filtersOpen: false,
  status: "idle",
  results: [],
  truncated: false,
  error: null,
  collapsed: new Set<string>(),
  focusNonce: 0,

  setQuery: (query) => set({ query }),
  setCaseSensitive: (caseSensitive) => set({ caseSensitive }),
  setRegex: (regex) => set({ regex }),
  setIncludeGlob: (includeGlob) => set({ includeGlob }),
  toggleFilters: () => set((s) => ({ filtersOpen: !s.filtersOpen })),
  toggleCollapsed: (path) =>
    set((s) => {
      const collapsed = new Set(s.collapsed);
      if (collapsed.has(path)) collapsed.delete(path);
      else collapsed.add(path);
      return { collapsed };
    }),
  requestFocus: () => set((s) => ({ focusNonce: s.focusNonce + 1 })),
  reset: () => {
    reqSeq++; // invalidate any inflight invoke — its settle will be dropped
    set({ status: "idle", results: [], truncated: false, error: null });
  },

  run: async (root) => {
    const { query, caseSensitive, regex, includeGlob } = get();
    if (!query.trim()) {
      get().reset();
      return;
    }
    const id = ++reqSeq;
    set({ status: "searching", error: null });
    try {
      const res = await searchProject({
        root,
        query,
        caseSensitive,
        regex,
        includeGlob: includeGlob.trim() || undefined,
      });
      if (id !== reqSeq) return; // a newer run/reset superseded this one
      set({ status: "done", results: res.results, truncated: res.truncated, error: null });
    } catch (e) {
      if (id !== reqSeq) return;
      // Keep the previous results on screen; the error rides as a strip.
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
