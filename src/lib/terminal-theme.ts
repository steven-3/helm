/* ══════════════════════════════════════════════════════════════════════════
   helm terminal theme — DESIGN.md §5. xterm renders to canvas/WebGL and cannot
   read CSS vars, so the §5 ANSI hexes are inlined HERE (the one sanctioned
   raw-hex exception, terminal content only). Both the TerminalPane (Track B) and
   the Phase-3 PTY wiring bind to this — one source so they never diverge.
   ══════════════════════════════════════════════════════════════════════════ */
import type { ITheme } from "@xterm/xterm";

export const helmTerminalTheme: ITheme = {
  background: "#0c0f12",          // --surface-base / n1
  foreground: "#eceef1",          // --text-primary / n12
  cursor: "#6bb9f8",              // --term-cursor (accent text)
  cursorAccent: "#0c0f12",
  selectionBackground: "#2b2f36", // --term-selection / n5
  black: "#424850",   red: "#df504d",     green: "#4eb068",  yellow: "#dca744",
  blue: "#3093db",    magenta: "#bc6ece",  cyan: "#55bfb3",   white: "#acb2b9",
  brightBlack: "#5b626b", brightRed: "#f26a64", brightGreen: "#68ca80", brightYellow: "#eec469",
  brightBlue: "#5db2f7",  brightMagenta: "#d78de8", brightCyan: "#7cd7cc", brightWhite: "#eceef1",
};

/** Terminal type defaults — 14px full-width; drop to 13px in compact split panes
    (pane width ≲ 560px). Never below 13px (DESIGN.md §10). */
export const helmTerminalFont = {
  fontFamily:
    '"IBM Plex Mono","JetBrains Mono",ui-monospace,"Cascadia Code",Menlo,Consolas,monospace',
  fontSize: 14,
  fontSizeCompact: 13,
  lineHeight: 1.4,
} as const;
