/* ══════════════════════════════════════════════════════════════════════════
   helm theme engine — DESIGN.md v4 §13.5, OVERHAUL-V4 §4.10.

   A theme is a partial token override map + an xterm palette (registry:
   src/lib/themes). Applying a theme =

     1. <html data-theme="<id>">           — theme identity (override rule keys off it)
     2. <html data-theme-kind="dark|light">— the big semantic re-map (tokens.css
                                             `:root` / `[data-theme-kind="light"]`)
        and color-scheme tracking (global.css — the v3.1 fix that keeps the
        webview from painting opaque corners behind the rounded shell; kept
        intact, now driven by the kind axis)
     3. one `:root[data-theme="<id>"]{ --var: value; … }` rule in a dedicated
        <style id="helm-theme-overrides"> element, appended AFTER the bundled
        stylesheets so equal-specificity overrides win on document order

   LEGACY SURFACE (unchanged): applyTheme("dark"|"light") / terminalThemeFor()
   map onto the registry ids "helm-void" / "helm-light" — the settings store
   (helm.settings.v2) and every existing caller keep working with zero edits.
   xterm renders to a canvas and cannot read CSS vars, so apply* returns the
   matching ITheme for the caller to apply to any live terminals.
   ══════════════════════════════════════════════════════════════════════════ */
import type { ITheme } from "@xterm/xterm";
import {
  DEFAULT_THEME_ID,
  auditAllThemes,
  getTheme,
  type HelmTheme,
} from "./themes";

export type ThemeMode = "dark" | "light";

/** The persisted v3 settings values map onto registry ids 1:1. */
const LEGACY_MODE_IDS: Record<ThemeMode, string> = {
  dark: "helm-void",
  light: "helm-light",
};

const STYLE_ELEMENT_ID = "helm-theme-overrides";

function resolveTheme(id: string): HelmTheme {
  const theme = getTheme(id) ?? getTheme(DEFAULT_THEME_ID);
  if (!theme) throw new Error(`theme registry is empty (wanted "${id}")`);
  if (!getTheme(id)) {
    console.warn(`[theme] unknown theme id "${id}" — falling back to ${DEFAULT_THEME_ID}`);
  }
  return theme;
}

function injectOverrides(theme: HelmTheme): void {
  let el = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  const entries = Object.entries(theme.tokens);
  if (entries.length === 0) {
    // Base themes (Helm Void / Helm Light) are pure tokens.css — no rule needed.
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ELEMENT_ID;
    document.head.appendChild(el);
  }
  const body = entries.map(([k, v]) => `${k}:${v}`).join(";");
  el.textContent = `:root[data-theme="${theme.id}"]{${body}}`;
}

/**
 * Apply a registry theme by id: sets data-theme + data-theme-kind on <html>,
 * injects the token override rule, and returns the xterm ITheme that matches.
 * The terminal canvas can't read the CSS custom properties, so the caller
 * applies the returned theme to each live Terminal:
 *
 *   const term = applyThemeById("nord");      // document flipped
 *   xterm.options.theme = term;               // for every open TerminalPane
 *   xterm.refresh(0, xterm.rows - 1);         // repaint the canvas
 *
 * Unknown ids fall back to Helm Void (never a blank screen).
 */
export function applyThemeById(id: string): ITheme {
  const theme = resolveTheme(id);
  const root = document.documentElement;
  root.setAttribute("data-theme", theme.id);
  root.setAttribute("data-theme-kind", theme.kind);
  injectOverrides(theme);
  return theme.terminal;
}

/** The xterm theme object for a registry id, WITHOUT touching the DOM (for
    constructing a Terminal before it is opened, or gallery previews). */
export function terminalThemeForId(id: string): ITheme {
  return resolveTheme(id).terminal;
}

/* ── Legacy v3 API — kept verbatim for existing callers (main.tsx, Settings,
      TerminalPane, the helm.settings.v2 payload). "dark"/"light" now resolve
      through the registry to helm-void / helm-light; behavior is identical
      because Helm Void IS :root and Helm Light IS the kind re-map. ── */
export function applyTheme(theme: ThemeMode): ITheme {
  return applyThemeById(LEGACY_MODE_IDS[theme]);
}

export function terminalThemeFor(theme: ThemeMode): ITheme {
  return terminalThemeForId(LEGACY_MODE_IDS[theme]);
}

/* Dev-time AA gate: re-audit every shipped theme on module load in dev builds
   and warn loudly if a future edit drops a pair below the floor. The audit is
   pure arithmetic (no DOM), so this is cheap and silent when green. */
if (import.meta.env?.DEV) {
  for (const result of auditAllThemes()) {
    if (!result.ok) {
      console.warn(
        `[theme] "${result.theme}" fails the WCAG AA gate:`,
        result.violations.map((v) => `${v.pair} ${v.ratio}:1 < ${v.min}:1`).join("; "),
      );
    }
  }
}
