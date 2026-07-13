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
    them. Never blocks forever: races a timeout so a broken font file degrades
    to the fallback stack instead of freezing the terminal. */
export async function loadTermFont(key: TermFontKey, timeoutMs = 2500): Promise<void> {
  const spec = TERM_FONTS[key];
  const probes = [
    `400 14px "${spec.family}"`,
    `${spec.weightBold} 14px "${spec.family}"`,
    `italic 400 14px "${spec.family}"`,
  ];
  const load = Promise.all(probes.map((p) => document.fonts.load(p))).then(() => undefined);
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs));
  try {
    await Promise.race([load, timeout]);
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
