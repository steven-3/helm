/* ══════════════════════════════════════════════════════════════════════════
   useExplorer — the file tree's OWN navigable root, decoupled from the pane's
   frozen spawn cwd. `root === null` means "follow the active pane cwd" (the
   original behavior, so first-open is unchanged); the moment the user navigates
   (up / home / a breadcrumb / typing a path / entering a folder) an explicit
   root is set and STICKS until they clear it. This is the fix for the tree being
   locked to the dir the pane launched in with no way to go elsewhere.

   Path helpers are separator-agnostic (POSIX "/" and Windows "\") because the
   Rust fs backend may run against either; "~" is passed through verbatim since
   fs_read_dir expands it server-side.
   ══════════════════════════════════════════════════════════════════════════ */
import { create } from "zustand";

interface ExplorerState {
  /** Explicit user root. null = follow the active pane's cwd. */
  root: string | null;
  setRoot: (path: string) => void;
  /** Clear the override → fall back to following the active pane cwd. */
  followPane: () => void;
}

export const useExplorer = create<ExplorerState>((set) => ({
  root: null,
  setRoot: (path) => set({ root: path }),
  followPane: () => set({ root: null }),
}));

/** Parent directory of a path, or null when already at a root we can't climb
    past ("/", a bare "~", or a drive like "C:"). */
export function parentOf(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, "");
  if (trimmed === "") return null; // was "/" (or all separators) → no parent
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (idx < 0) return null; // "~" or "C:" — nothing above we track
  if (idx === 0) return "/"; // "/home" → "/"
  return trimmed.slice(0, idx);
}

export interface Crumb {
  label: string;
  path: string;
}

/** Break an absolute (or ~-rooted) path into clickable breadcrumb segments,
    each carrying the cumulative path to jump to. */
export function buildCrumbs(path: string): Crumb[] {
  const sep = path.includes("\\") && !path.includes("/") ? "\\" : "/";
  const trimmed = path.replace(/[\\/]+$/, "") || path;
  const parts = trimmed.split(/[\\/]/);
  const crumbs: Crumb[] = [];
  let acc = "";

  parts.forEach((part, i) => {
    if (part === "") {
      if (i === 0) {
        crumbs.push({ label: "/", path: "/" });
        acc = "";
      }
      return;
    }
    if (acc === "") acc = crumbs.length && crumbs[0].path === "/" ? `/${part}` : part;
    else acc = `${acc}${sep}${part}`;
    crumbs.push({ label: part, path: acc });
  });

  return crumbs;
}
