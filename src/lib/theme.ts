/* ══════════════════════════════════════════════════════════════════════════
   helm theme switch — DESIGN.md §9. The light theme ("Daylit Instrument") is a
   semantic re-map over the SAME primitives (src/styles/tokens.css
   :root[data-theme="light"]), so switching the entire app is a single attribute
   flip on <html> — ZERO component edits. xterm renders to a canvas and cannot read
   CSS vars, so this helper also hands back the matching inlined ITheme
   (src/lib/terminal-theme.ts) for the caller to apply to any live terminals.
   ══════════════════════════════════════════════════════════════════════════ */
import type { ITheme } from "@xterm/xterm";
import { helmTerminalTheme, helmTerminalThemeLight } from "./terminal-theme";

export type ThemeMode = "dark" | "light";

/**
 * Flip the whole app between the dark (default) and light token maps by setting
 * `data-theme` on <html>, and return the xterm `ITheme` that matches. The terminal
 * canvas can't read the CSS custom properties, so the caller applies the returned
 * theme to each live Terminal, e.g.
 *
 *   const term = applyTheme(mode);            // <html data-theme="…"> flipped
 *   xterm.options.theme = term;               // for every open TerminalPane
 *   xterm.refresh(0, xterm.rows - 1);         // repaint the canvas
 *
 * Dark is the bare `:root` default; we still write `data-theme="dark"` explicitly so
 * the attribute is a faithful 1:1 mirror of the setting (and any future
 * `[data-theme="dark"]` rules resolve predictably rather than relying on absence).
 */
export function applyTheme(theme: ThemeMode): ITheme {
  document.documentElement.setAttribute("data-theme", theme);
  return theme === "light" ? helmTerminalThemeLight : helmTerminalTheme;
}

/** The xterm theme object for a mode, WITHOUT touching the DOM (for constructing a
    Terminal before it is opened, or previewing). Pairs with `applyTheme` above. */
export function terminalThemeFor(theme: ThemeMode): ITheme {
  return theme === "light" ? helmTerminalThemeLight : helmTerminalTheme;
}

