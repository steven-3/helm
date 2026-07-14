/* ══════════════════════════════════════════════════════════════════════════
   helm terminal theme — DESIGN.md §5/§6. xterm renders outside normal CSS and
   cannot read CSS vars, so the §5 ANSI hexes are inlined HERE (the one
   sanctioned raw-hex exception, terminal content only). Both the TerminalPane
   (Track B) and the Phase-3 PTY wiring bind to this — one source so they never
   diverge.

   TERMINAL FONT: JetBrains Mono (stable xterm metrics) — user-switchable via
   TERM_FONTS (Settings). xterm measures glyph metrics at term.open(), so the
   selected face MUST be loaded first: await loadTermFont() before opening or
   restyling a terminal, else the grid is computed from the fallback font and
   the terminal renders scrunched/misaligned.
   ══════════════════════════════════════════════════════════════════════════ */
import type { ITheme } from "@xterm/xterm";

const TERM_FONT_LOAD_TIMEOUT_MS = 2_000;

export const helmTerminalTheme: ITheme = {
  background: "#08090a",          // --surface-base / n1 (void)
  foreground: "#e4e7ec",          // bright slate (16.08:1 on bg)
  cursor: "#9aa0ee",              // --term-cursor (indigo accent text)
  cursorAccent: "#08090a",
  selectionBackground: "#23262c", // --term-selection (neutral raised)
  black: "#3e424b",   red: "#ef5350",     green: "#40b869",  yellow: "#d7b02a",
  blue: "#6e79e0",    magenta: "#a878e8",  cyan: "#45b6ad",   white: "#aaafb7",
  brightBlack: "#565c66", brightRed: "#f47b74", brightGreen: "#5bd080", brightYellow: "#f0bf00",
  brightBlue: "#9aa0ee",  brightMagenta: "#c79bf0", brightCyan: "#7fd9ce", brightWhite: "#e4e7ec",
};

/* ── LIGHT theme ("Daylit Instrument") — semantic re-map of §5 onto the light
      token map (tokens.css :root[data-theme="light"]). The terminal stays the
      brightest reading surface (near-white void), so the 16 ANSI colours invert
      their role from the dark set: chromatic colours become saturated-DARK to read
      on white (all 12 ≥4.5:1 on the #fcfcfd bg), ANSI 0/8 stay dim-by-spec, and
      7/15 ("white"/"bright-white") become the light greys. Blue→indigo and
      cyan→teal are preserved so the terminal still reads as one system with the
      chrome. Values mirror the CSS --ansi-* light block exactly (one source). ── */
export const helmTerminalThemeLight: ITheme = {
  background: "#fcfcfd",          // --surface-base (light) — near-white hero well
  foreground: "#26282f",          // near-black cool slate (14.35:1 on bg)
  cursor: "#4a52c4",              // indigo, darkened for AA on white (6.22:1 on bg)
  cursorAccent: "#fcfcfd",        // char under the block cursor (near-white on indigo, 6.22:1)
  selectionBackground: "#dbe0f4", // soft indigo tint (primary text 12.65:1 over it)
  black: "#2b2f38",   red: "#c0343a",     green: "#1f7a33",  yellow: "#856a00",
  blue: "#4a52c4",    magenta: "#8038bf",  cyan: "#0e766c",   white: "#a2a9b5",
  brightBlack: "#6b7280", brightRed: "#cf2f34", brightGreen: "#1c7a33", brightYellow: "#8a6d00",
  brightBlue: "#5E6AD2",  brightMagenta: "#8f45d0", brightCyan: "#0d7d72", brightWhite: "#e9ebf0",
};

/* ── Terminal font registry — bundled faces ONLY (src/assets/fonts + IBM Plex
      via @fontsource), so every option is guaranteed to actually exist. ── */
export type TermFontKey = "jetbrains-mono" | "monaspace-neon" | "monaspace-argon" | "ibm-plex-mono";

export interface TermFontSpec {
  label: string;
  /** The primary family name, used for FontFaceSet load/check probes. */
  family: string;
  /** Full CSS stack handed to xterm (keeps a mono fallback chain). */
  stack: string;
  /** Heaviest bundled weight — Monaspace ships 700, IBM Plex Mono 600. */
  weightBold: 600 | 700;
}

export const TERM_FONTS: Record<TermFontKey, TermFontSpec> = {
  "jetbrains-mono": {
    label: "JetBrains Mono",
    family: "JetBrains Mono",
    stack: '"JetBrains Mono",ui-monospace,"Cascadia Code",Menlo,Consolas,monospace',
    weightBold: 600,
  },
  "monaspace-neon": {
    label: "Monaspace Neon",
    family: "Monaspace Neon",
    stack: '"Monaspace Neon","IBM Plex Mono",ui-monospace,"Cascadia Code",Menlo,Consolas,monospace',
    weightBold: 700,
  },
  "monaspace-argon": {
    label: "Monaspace Argon",
    family: "Monaspace Argon",
    stack: '"Monaspace Argon","IBM Plex Mono",ui-monospace,"Cascadia Code",Menlo,Consolas,monospace',
    weightBold: 700,
  },
  "ibm-plex-mono": {
    label: "IBM Plex Mono",
    family: "IBM Plex Mono",
    stack: '"IBM Plex Mono","JetBrains Mono",ui-monospace,"Cascadia Code",Menlo,Consolas,monospace',
    weightBold: 600,
  },
};

// JetBrains Mono has especially predictable glyph metrics in xterm and keeps
// Claude/Codex box drawing stable across renderer and DPI changes.
export const DEFAULT_TERM_FONT: TermFontKey = "jetbrains-mono";

/** Load a terminal font's faces (regular/bold/italic) before xterm measures
    them. A failed bundled face degrades to the fallback stack. */
export async function loadTermFont(key: TermFontKey): Promise<void> {
  const spec = TERM_FONTS[key];
  const probes = [
    `400 14px "${spec.family}"`,
    `${spec.weightBold} 14px "${spec.family}"`,
    `italic 400 14px "${spec.family}"`,
  ];
  try {
    await Promise.race([
      Promise.all(probes.map((probe) => document.fonts.load(probe))),
      new Promise<void>((resolve) => window.setTimeout(resolve, TERM_FONT_LOAD_TIMEOUT_MS)),
    ]);
  } catch {
    /* font failed to load — xterm falls back down the stack */
  }
}

/** Terminal type defaults. The live size/line-height comes from useSettings;
    panes never silently change font metrics while a divider is being dragged. */
export const helmTerminalFont = {
  fontFamily: TERM_FONTS[DEFAULT_TERM_FONT].stack,
  fontSize: 14,
  lineHeight: 1.35,
} as const;
