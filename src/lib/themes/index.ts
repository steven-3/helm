/* ══════════════════════════════════════════════════════════════════════════
   helm — THEME REGISTRY (DESIGN.md v5 §13, OVERHAUL-V4 §4.10)

   A theme is a PARTIAL TOKEN OVERRIDE MAP + an xterm palette:

     { id, name, kind: "dark" | "light", tokens: { "--n-1": "#…", … }, terminal }

   Application (src/lib/theme.ts) sets `data-theme` + `data-theme-kind` on <html>
   and injects the override map as one `:root[data-theme="<id>"]{ … }` rule. The
   cascade does the rest: `[data-theme-kind]` owns the big dark/light semantic
   re-map (tokens.css), `[data-theme]` wins on the specific vars it overrides.

   The shipped themes are small curated maps over the v5 base. Helm Void IS the
   Linear Dark default — the terminal well stays void #08090a. Helm Light
   IS the §9 semantic re-map (kind "light", tokens {}).

   CONTRAST IS GATED IN THIS FILE: auditTheme() resolves every theme against the
   base maps below and checks every text/surface, accent, seat, status and ANSI
   pair against WCAG AA (4.5 text / 3.1 non-text). Values that had to be nudged off
   their canonical source palettes to pass are marked "// AA-adj" with the source
   value quoted. Run the audit in dev: `auditAllThemes()` (also wired to a
   console warning in dev via src/lib/theme.ts).
   ══════════════════════════════════════════════════════════════════════════ */
import type { ITheme } from "@xterm/xterm";
import { deriveTerminalTheme, helmTerminalTheme, helmTerminalThemeLight } from "../terminal-theme";

/* ──────────────────────────────────────────────────────────────────────────
   §1 · WCAG sRGB contrast helpers (the programmatic gate)
   ────────────────────────────────────────────────────────────────────────── */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse #rgb / #rrggbb / #rrggbbaa to 0–255 channels. Throws on anything else. */
export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) throw new Error(`hexToRgb: not a hex color: ${hex}`);
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance of a hex color. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** WCAG contrast ratio between two hex colors, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite a #rrggbb fg at `alpha` over a hex bg (for .22-alpha status surfaces,
    glass tints). Returns the resulting hex. */
export function compositeOver(fgHex: string, alpha: number, bgHex: string): string {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(mix(fg.r, bg.r))}${to2(mix(fg.g, bg.g))}${to2(mix(fg.b, bg.b))}`;
}

/* ──────────────────────────────────────────────────────────────────────────
   §2 · Theme model
   ────────────────────────────────────────────────────────────────────────── */
export type ThemeKind = "dark" | "light";

export interface HelmTheme {
  /** Stable slug, lowercase [a-z0-9-]. Written to <html data-theme>. */
  id: string;
  /** Display name for the (Wave-2) theme gallery. */
  name: string;
  /** Which semantic base re-map applies: tokens.css :root (dark) or the
      [data-theme-kind="light"] block (light). Also drives color-scheme. */
  kind: ThemeKind;
  /** Partial CSS-var override map. Keys are token names ("--n-1"), values CSS
      colors. Applied as one :root[data-theme="<id>"] rule. */
  tokens: Record<string, string>;
  /** xterm palette (canvas can't read CSS vars). `background` MUST equal
      tokens["--n-1"] (or the base --n-1) so the well stays one surface. */
  terminal: ITheme;
  /** One-line gallery blurb. */
  blurb: string;
}

export const DEFAULT_THEME_ID = "helm-void";

/* ──────────────────────────────────────────────────────────────────────────
   §3 · Audit base maps — mirror tokens.css :root (VOID_BASE) and the
   [data-theme-kind="light"] re-map (LIGHT_KIND) for the vars the audit touches.
   tokens.css stays the rendered source of truth; these mirrors exist so the
   gate runs without a DOM. Keep them in sync (DESIGN.md §13.5).
   ────────────────────────────────────────────────────────────────────────── */
export const VOID_BASE: Record<string, string> = {
  "--n-1": "#08090a",
  "--n-2": "#151617",
  "--n-3": "#191a1b",
  "--n-5": "#262829",
  "--n-9": "#666b73",
  "--n-11": "#abb1ba",
  "--n-12": "#e5e8ed",
  "--slate-body": "#90969f",
  "--slate-place": "#8d939c",
  "--hair-control": "#747982",
  "--indigo-solid": "#5E6AD2",
  "--indigo-text": "#aab0ff",
  "--indigo-ink": "#fafbff",
  "--red-text": "#f47b74",
  "--green-text": "#56c96e",
  "--amber-text": "#f0bf00",
  // seat identity (DESIGN.md v5 §5; v4 values deliberately retained)
  "--seat-claude-text": "#9aa0ee",
  "--seat-gpt-text": "#81d6cb",
  "--seat-kimi-text": "#f0bd6e",
  "--seat-sonnet-text": "#c79bf0",
  "--seat-custom-1-text": "#f1a278",
  "--seat-custom-2-text": "#f49ab8",
  "--seat-custom-3-text": "#8cc4f0",
  "--seat-custom-4-text": "#bcd68e",
};

export const LIGHT_KIND: Record<string, string> = {
  "--n-1": "#fcfcfd",
  "--n-2": "#f2f3f6",
  "--n-3": "#fdfdfe",
  "--n-5": "#e3e7ee",
  "--n-9": "#898f9d",
  "--n-11": "#565d6b",
  "--n-12": "#1c1e26",
  "--slate-body": "#5a616f",
  "--slate-place": "#606774",
  "--hair-control": "#767d8b",
  "--indigo-solid": "#5E6AD2",
  "--indigo-text": "#4a52c4",
  "--indigo-ink": "#fbfbff",
  "--red-text": "#c62f34",
  "--green-text": "#1a7f33",
  "--amber-text": "#846700",
  // seat identity, darkened for light-bg AA (tokens.css v4 light block)
  "--seat-claude-text": "#4a52c4",
  "--seat-gpt-text": "#0e7a70",
  "--seat-kimi-text": "#7d5c00",
  "--seat-sonnet-text": "#7a35c2",
  "--seat-custom-1-text": "#ac4c1c",
  "--seat-custom-2-text": "#b02a58",
  "--seat-custom-3-text": "#2a62a0",
  "--seat-custom-4-text": "#557429",
};

/** Effective token map for a theme: base ← kind re-map ← theme overrides. */
export function resolveThemeTokens(theme: HelmTheme): Record<string, string> {
  return {
    ...VOID_BASE,
    ...(theme.kind === "light" ? LIGHT_KIND : {}),
    ...theme.tokens,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   §4 · The audit — every pair a theme must pass. Min ratios: 4.5 text,
   3.1 non-text (WCAG AA). Primary-text pairs TARGET 7 (AAA) but gate at 4.5;
   the measured ratio is reported either way.
   ────────────────────────────────────────────────────────────────────────── */
export interface AuditViolation {
  pair: string;
  fg: string;
  bg: string;
  ratio: number;
  min: number;
}

export interface AuditResult {
  theme: string;
  ok: boolean;
  violations: AuditViolation[];
  /** Measured ratios for the report/DESIGN.md table (pair → "x.xx:1"). */
  measured: Record<string, number>;
}

const SEAT_TEXT_VARS = [
  "--seat-claude-text",
  "--seat-gpt-text",
  "--seat-kimi-text",
  "--seat-sonnet-text",
  "--seat-custom-1-text",
  "--seat-custom-2-text",
  "--seat-custom-3-text",
  "--seat-custom-4-text",
] as const;

/** The 14 non-dim ANSI keys, gated ≥4.5. The dim pair is polarity-dependent:
    on DARK terminals 0/8 (black/br-black) are dim-by-spec; on LIGHT terminals
    the roles invert (DESIGN.md §5 light re-map) — 7/15 (white/br-white) become
    the light greys and 0/8 are strong darks. So the exempt set flips with the
    terminal background luminance. */
const ANSI_GATE_DARK = [
  "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
] as const;
const ANSI_GATE_LIGHT = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan",
] as const;

export function auditTheme(theme: HelmTheme): AuditResult {
  const t = resolveThemeTokens(theme);
  const violations: AuditViolation[] = [];
  const measured: Record<string, number> = {};

  const check = (pair: string, fg: string, bg: string, min: number) => {
    const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
    measured[pair] = ratio;
    if (ratio < min) violations.push({ pair, fg, bg, ratio, min });
  };

  const base = t["--n-1"];
  const panel = t["--n-2"];
  const raised = t["--n-3"];

  // text ladder
  check("text-primary/base", t["--n-12"], base, 4.5);
  check("text-primary/panel", t["--n-12"], panel, 4.5);
  check("text-primary/raised", t["--n-12"], raised, 4.5);
  check("text-secondary/base", t["--n-11"], base, 4.5);
  check("text-secondary/panel", t["--n-11"], panel, 4.5);
  check("text-body/base", t["--slate-body"], base, 4.5);
  check("placeholder/input", t["--slate-place"], t["--n-5"], 4.5);
  // non-text
  check("idle-dot/base", t["--n-9"], base, 3);
  check("control-boundary/input", t["--hair-control"], t["--n-5"], 3);
  // accent
  check("accent-text/base", t["--indigo-text"], base, 4.5);
  check("accent-ink/solid", t["--indigo-ink"], t["--indigo-solid"], 4.5);
  check("focus-ring/base", t["--indigo-solid"], base, 3);
  check("focus-ring/panel", t["--indigo-solid"], panel, 3);
  // status text tiers
  check("danger-text/base", t["--red-text"], base, 4.5);
  check("success-text/base", t["--green-text"], base, 4.5);
  check("warning-text/base", t["--amber-text"], base, 4.5);
  // seat identity text tiers
  for (const seatVar of SEAT_TEXT_VARS) {
    check(`seat-text/${seatVar.replace("--seat-", "").replace("-text", "")}`, t[seatVar], base, 4.5);
  }
  // terminal
  const term = theme.terminal;
  const termBg = term.background ?? base;
  const termFg = term.foreground ?? t["--n-12"];
  check("terminal/fg-bg", termFg, termBg, 4.5);
  const ansiGate = relativeLuminance(termBg) < 0.18 ? ANSI_GATE_DARK : ANSI_GATE_LIGHT;
  for (const key of ansiGate) {
    const color = term[key];
    if (typeof color === "string") check(`ansi/${key}`, color, termBg, 4.5);
  }

  return { theme: theme.id, ok: violations.length === 0, violations, measured };
}

export function auditAllThemes(): AuditResult[] {
  return THEMES.map(auditTheme);
}

/* ──────────────────────────────────────────────────────────────────────────
   §5 · The 13 shipped themes. Small curated override maps; everything not
   named inherits the v4 base (dark) or the §9 light re-map (light).
   "// AA-adj" marks values nudged off a canonical source palette to pass the
   §4 gate, with the source value quoted.
   ────────────────────────────────────────────────────────────────────────── */

/* ── 1 · HELM VOID — v5 Linear Dark. :root IS this theme (tokens {}). ── */
const helmVoid: HelmTheme = {
  id: "helm-void",
  name: "Helm Void",
  kind: "dark",
  tokens: {},
  terminal: helmTerminalTheme,
  blurb: "Linear Dark: matte graphite, hard seams, indigo signal, #08090a terminal.",
};

/* ── 2 · HELM LIGHT — the §9 "Daylit Instrument" semantic re-map. ── */
const helmLight: HelmTheme = {
  id: "helm-light",
  name: "Helm Light",
  kind: "light",
  tokens: {},
  terminal: helmTerminalThemeLight,
  blurb: "Daylit Instrument — the bright field framed by grey plates.",
};

/* ── 3 · GHOST — near-monochrome minimal dark. Hue spent almost nowhere. ── */
const ghost: HelmTheme = {
  id: "ghost",
  name: "Ghost",
  kind: "dark",
  tokens: {
    "--n-1": "#0c0c0e", "--n-2": "#131316", "--n-3": "#18181c", "--n-4": "#1b1b20",
    "--n-5": "#202026", "--n-6": "#232329", "--n-7": "#2b2b33", "--n-8": "#3a3a44",
    "--n-9": "#6a6a75", "--n-10": "#7e7e89", "--n-11": "#adadb6", "--n-12": "#dcdce2",
    "--slate-body": "#909099", "--slate-name": "#c9c9d1", "--slate-place": "#888891",
    "--void": "#0c0c0e", "--chrome": "#131316", "--chrome-hi": "#17171b",
    "--sheet": "#151518", "--panel-float": "#1a1a1f", "--ring": "#101013",
    "--hair-panel": "#26262c", "--hair-zone": "#29292f", "--hair-top": "#27272d",
    "--hair-control": "#6b6b75",
    // desaturated periwinkle accent — the one hue in a grey room
    "--indigo-solid": "#8f96b8", "--indigo-hover": "#a3aac4", "--indigo-text": "#b7bdd6",
    "--indigo-subtle": "#20222e", "--indigo-ink": "#101014",
  },
  terminal: {
    background: "#0c0c0e", foreground: "#e6e6ec",
    cursor: "#b7bdd6", cursorAccent: "#0c0c0e", selectionBackground: "#26262e",
    black: "#34343c", red: "#d97a7a", green: "#8fbc8f", yellow: "#d4b46a",
    blue: "#8f9cc4", magenta: "#b393c8", cyan: "#7fb3b3", white: "#adadb6",
    brightBlack: "#55555f", brightRed: "#e89a9a", brightGreen: "#a8d4a8", brightYellow: "#e6cd8e",
    brightBlue: "#b9c0dd", brightMagenta: "#cfade0", brightCyan: "#a3cccc", brightWhite: "#e6e6ec",
  },
  blurb: "Near-monochrome minimal — hue spent almost nowhere.",
};

/* ── 4 · CARBON — IBM Carbon gray-100 discipline. ── */
const carbon: HelmTheme = {
  id: "carbon",
  name: "Carbon",
  kind: "dark",
  tokens: {
    "--n-1": "#161616", "--n-2": "#1f1f1f", "--n-3": "#262626", "--n-4": "#2b2b2b",
    "--n-5": "#303030", "--n-6": "#353535", "--n-7": "#393939", "--n-8": "#525252",
    "--n-9": "#6f6f6f", "--n-10": "#8d8d8d", "--n-11": "#c6c6c6", "--n-12": "#f4f4f4",
    "--slate-body": "#a8a8a8", "--slate-name": "#e0e0e0", "--slate-place": "#989898",
    "--void": "#161616", "--chrome": "#1f1f1f", "--chrome-hi": "#242424",
    "--sheet": "#1c1c1c", "--panel-float": "#262626", "--ring": "#101010",
    "--hair-panel": "#333333", "--hair-zone": "#363636", "--hair-top": "#333333",
    "--hair-control": "#7b7b7b",
    // Carbon blue-60 fills, blue-40 carries text
    "--indigo-solid": "#4589ff", "--indigo-hover": "#5c97ff", "--indigo-text": "#78a9ff",
    "--indigo-subtle": "#1a2742", "--indigo-ink": "#0b1526",
  },
  terminal: {
    background: "#161616", foreground: "#f2f2f2",
    cursor: "#78a9ff", cursorAccent: "#161616", selectionBackground: "#393939",
    black: "#393939", red: "#ff8389", green: "#42be65", yellow: "#f1c21b",
    blue: "#78a9ff", magenta: "#be95ff", cyan: "#3ddbd9", white: "#c6c6c6",
    brightBlack: "#6f6f6f", brightRed: "#ffb3b8", brightGreen: "#6fdc8c", brightYellow: "#fddc69",
    brightBlue: "#a6c8ff", brightMagenta: "#d4bbff", brightCyan: "#9bf0f0", brightWhite: "#f4f4f4",
  },
  blurb: "IBM Carbon gray-100 — flat layers, one productive blue.",
};

/* ── 5 · ABYSS — deep-sea blue-black, abyssal cyan signal. ── */
const abyss: HelmTheme = {
  id: "abyss",
  name: "Abyss",
  kind: "dark",
  tokens: {
    "--n-1": "#05080f", "--n-2": "#0a0f1a", "--n-3": "#0e1422", "--n-4": "#111828",
    "--n-5": "#151c2e", "--n-6": "#182033", "--n-7": "#202a42", "--n-8": "#2c3852",
    "--n-9": "#5a6480", "--n-10": "#707a96", "--n-11": "#a2adc6", "--n-12": "#d2dbea",
    "--slate-body": "#8893ab", "--slate-name": "#c0c9dc", "--slate-place": "#7c859e",
    "--void": "#05080f", "--chrome": "#0a0f1a", "--chrome-hi": "#0e1320",
    "--sheet": "#0c1120", "--panel-float": "#101728", "--ring": "#04060b",
    "--hair-panel": "#1c2438", "--hair-zone": "#1e2740", "--hair-top": "#1c2438",
    "--hair-control": "#5f6986",
    "--indigo-solid": "#2ea8b8", "--indigo-hover": "#43bcc9", "--indigo-text": "#6fd8e6",
    "--indigo-subtle": "#0e2a33", "--indigo-ink": "#04242b",
  },
  terminal: {
    background: "#05080f", foreground: "#d7e3f2",
    cursor: "#6fd8e6", cursorAccent: "#05080f", selectionBackground: "#1a2338",
    black: "#1c2438", red: "#e0727a", green: "#78c08a", yellow: "#d8b56a",
    blue: "#5aa9e6", magenta: "#b493e6", cyan: "#56c8d8", white: "#a2adc6",
    brightBlack: "#3a4664", brightRed: "#f0939a", brightGreen: "#97d9a8", brightYellow: "#ecd28e",
    brightBlue: "#86c4f2", brightMagenta: "#cfb2f5", brightCyan: "#86e0ea", brightWhite: "#eef4fc",
  },
  blurb: "Deep-sea blue-black — pressure-depth dark, cyan signal.",
};

/* ── 6 · NEON TOKYO — tokyonight-night, blue hour neon. ── */
const neonTokyo: HelmTheme = {
  id: "neon-tokyo",
  name: "Neon Tokyo",
  kind: "dark",
  tokens: {
    "--n-1": "#16161e", "--n-2": "#1a1b26", "--n-3": "#1f2335", "--n-4": "#24283b",
    "--n-5": "#292e42", "--n-6": "#323852", "--n-7": "#3b4261", "--n-8": "#4a5178",
    "--n-9": "#59628b", "--n-10": "#6f76a3", "--n-11": "#a9b1d6", "--n-12": "#c0caf5",
    "--slate-body": "#8f97bd", "--slate-name": "#b9c0e0", "--slate-place": "#9197b8",
    "--void": "#16161e", "--chrome": "#1a1b26", "--chrome-hi": "#1e1f2c",
    "--sheet": "#181a24", "--panel-float": "#1e2030", "--ring": "#11121a",
    "--hair-panel": "#262940", "--hair-zone": "#282b44", "--hair-top": "#262940",
    "--hair-control": "#6f76a3",
    "--indigo-solid": "#7aa2f7", "--indigo-hover": "#89b0fa", "--indigo-text": "#8cb0f8",
    "--indigo-subtle": "#232b4d", "--indigo-ink": "#10121f",
  },
  terminal: {
    background: "#16161e", foreground: "#c0caf5",
    cursor: "#7aa2f7", cursorAccent: "#16161e", selectionBackground: "#283457",
    black: "#414868", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
    blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
    brightBlack: "#565f89", brightRed: "#ff7a93", brightGreen: "#b9f27c", brightYellow: "#ff9e64",
    brightBlue: "#7da6ff", brightMagenta: "#d0a9f7", brightCyan: "#b4f9f8", brightWhite: "#c0caf5",
  },
  blurb: "Tokyonight-night — blue-hour neon over the bay.",
};

/* ── 7 · SYNTHWAVE — '84 outrun. Hot pink accent, retuned status set. ── */
const synthwave: HelmTheme = {
  id: "synthwave",
  name: "Synthwave",
  kind: "dark",
  tokens: {
    "--n-1": "#241b33", "--n-2": "#2a2139", "--n-3": "#302545", "--n-4": "#352a4c",
    "--n-5": "#3b2f54", "--n-6": "#403460", "--n-7": "#4a3a6e", "--n-8": "#5c4886",
    "--n-9": "#7a649c", "--n-10": "#8f7ab0", "--n-11": "#c0aede", "--n-12": "#ead9ff",
    "--slate-body": "#a08cc4", "--slate-name": "#dccbf2", "--slate-place": "#a797c2",
    "--void": "#241b33", "--chrome": "#2a2139", "--chrome-hi": "#2e2540",
    "--sheet": "#28203a", "--panel-float": "#322748", "--ring": "#1a1226",
    "--hair-panel": "#3c2e56", "--hair-zone": "#3e3060", "--hair-top": "#3c2e56",
    "--hair-control": "#8c77ad",
    "--indigo-solid": "#ff7edb", "--indigo-hover": "#ff93e2", "--indigo-text": "#ff8fe0",
    "--indigo-subtle": "#3d2140", "--indigo-ink": "#33103a",
    // status retone — outrun set
    "--red-solid": "#fe4450", "--red-text": "#ff8fa0", "--red-subtle": "#45161f", "--red-icon": "#e0566a",
    "--green-solid": "#3fce8f", "--green-text": "#72f1b8", "--green-subtle": "#14352a",
    "--amber-solid": "#d9b400", "--amber-bright": "#fede5d", "--amber-text": "#fede5d", "--amber-subtle": "#3a2f10",
    "--status-danger-surface": "rgba(254,68,80,.24)",
    "--status-success-surface": "rgba(63,206,143,.22)",
    "--status-warning-surface": "rgba(217,180,0,.24)",
    "--status-info-surface": "rgba(255,126,219,.22)",
  },
  terminal: {
    background: "#241b33", foreground: "#e8ddf5",
    cursor: "#ff7edb", cursorAccent: "#241b33", selectionBackground: "#3c2a56",
    black: "#4a3a6e", red: "#fe4450", green: "#72f1b8", yellow: "#fede5d",
    blue: "#03edf9", magenta: "#ff7edb", cyan: "#61e2ff", white: "#c5b8dd",
    brightBlack: "#6e5a94", brightRed: "#ff8fa0", brightGreen: "#97f7cd", brightYellow: "#fff084",
    brightBlue: "#7df3ff", brightMagenta: "#ffa8e6", brightCyan: "#a5f3ff", brightWhite: "#f5ecff",
  },
  blurb: "'84 outrun — hot pink signal on ultraviolet dusk.",
};

/* ── 8 · DRACULA — the classic, AA-gated. ── */
const dracula: HelmTheme = {
  id: "dracula",
  name: "Dracula",
  kind: "dark",
  tokens: {
    "--n-1": "#21222c", "--n-2": "#282a36", "--n-3": "#2c2e3c", "--n-4": "#303242",
    "--n-5": "#34364a", "--n-6": "#383a50", "--n-7": "#44475a", "--n-8": "#525574",
    "--n-9": "#6272a4", "--n-10": "#7584b4", "--n-11": "#b6bcd4", "--n-12": "#f8f8f2",
    "--slate-body": "#98a0c0", "--slate-name": "#e2e4f0", "--slate-place": "#9aa1be",
    "--void": "#21222c", "--chrome": "#282a36", "--chrome-hi": "#2c2e3c",
    "--sheet": "#24262f", "--panel-float": "#2e303e", "--ring": "#191a22",
    "--hair-panel": "#363848", "--hair-zone": "#383a4c", "--hair-top": "#363848",
    "--hair-control": "#7885ae",
    "--indigo-solid": "#bd93f9", "--indigo-hover": "#cbaafc", "--indigo-text": "#c9a6fa",
    "--indigo-subtle": "#342b4d", "--indigo-ink": "#28203e",
    // Dracula status set
    "--red-solid": "#ff5555", "--red-text": "#ff6e6e", "--red-subtle": "#441f26", "--red-icon": "#e05656",
    "--green-solid": "#50fa7b", "--green-text": "#69ff94", "--green-subtle": "#16351f",
    "--amber-solid": "#e2d60a", "--amber-bright": "#f1fa8c", "--amber-text": "#f1fa8c", "--amber-subtle": "#3a3512",
    "--status-danger-surface": "rgba(255,85,85,.22)",
    "--status-success-surface": "rgba(80,250,123,.20)",
    "--status-warning-surface": "rgba(241,250,140,.20)",
    "--status-info-surface": "rgba(189,147,249,.22)",
  },
  terminal: {
    background: "#21222c", foreground: "#f8f8f2",
    cursor: "#bd93f9", cursorAccent: "#21222c", selectionBackground: "#44475a",
    black: "#44475a", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
    blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
    brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94", brightYellow: "#ffffa5",
    brightBlue: "#d6acff", brightMagenta: "#ff92df", brightCyan: "#a4ffff", brightWhite: "#f8f8f2",
  },
  blurb: "The classic — purple accent on a Transylvania night.",
};

/* ── 9 · NORD — arctic frost palette. Aurora reds brightened for AA. ── */
const nord: HelmTheme = {
  id: "nord",
  name: "Nord",
  kind: "dark",
  tokens: {
    "--n-1": "#242933", "--n-2": "#2e3440", "--n-3": "#333a48", "--n-4": "#38404e",
    "--n-5": "#3b4252", "--n-6": "#3f4757", "--n-7": "#434c5e", "--n-8": "#4c566a",
    "--n-9": "#67748d", "--n-10": "#74809a", "--n-11": "#a8b1c2", "--n-12": "#d8dee9",
    "--slate-body": "#8e99ac", "--slate-name": "#e5e9f0", "--slate-place": "#a9b0be",
    "--void": "#242933", "--chrome": "#2e3440", "--chrome-hi": "#323846",
    "--sheet": "#2b303c", "--panel-float": "#363d4b", "--ring": "#1d212a",
    "--hair-panel": "#3d4454", "--hair-zone": "#3f4658", "--hair-top": "#3d4454",
    "--hair-control": "#868fa4",
    "--indigo-solid": "#88c0d0", "--indigo-hover": "#97cbda", "--indigo-text": "#88c0d0",
    "--indigo-subtle": "#2b3f4c", "--indigo-ink": "#1e2b33",
    // Aurora status set — canonical aurora red #bf616a is 3.8:1 on the void
    // (fails AA); text tier brightened. AA-adj: red-text #bf616a → #d68a92,
    // green-text #a3be8c stays (passes as dot; text tier = #b4d69a).
    "--red-solid": "#bf616a", "--red-text": "#d68a92", "--red-subtle": "#3a252c", "--red-icon": "#bf616a",
    "--green-solid": "#a3be8c", "--green-text": "#b4d69a", "--green-subtle": "#2a3524",
    "--amber-solid": "#ebcb8b", "--amber-bright": "#ebcb8b", "--amber-text": "#ebcb8b", "--amber-subtle": "#3a3320",
    "--status-danger-surface": "rgba(191,97,106,.24)",
    "--status-success-surface": "rgba(163,190,140,.22)",
    "--status-warning-surface": "rgba(235,203,139,.22)",
    "--status-info-surface": "rgba(136,192,208,.22)",
  },
  terminal: {
    background: "#242933", foreground: "#d8dee9",
    cursor: "#88c0d0", cursorAccent: "#242933", selectionBackground: "#3b4252",
    black: "#3b4252", red: "#d2757e", green: "#a3be8c", yellow: "#ebcb8b",
    blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
    brightBlack: "#4c566a", brightRed: "#d68a92", brightGreen: "#b1d196", brightYellow: "#f0d49c",
    brightBlue: "#8cadd0", brightMagenta: "#c095b8", brightCyan: "#8fbcbb", brightWhite: "#eceff4",
  },
  blurb: "Arctic frost — polar-night blues, one calm glacier accent.",
};

/* ── 10 · SOLARIZED DARK — the precision palette, AA-gated. Canonical
   solarized yellow/green/red fail AA on base03 (3.3–4.2); every failing
   chromatic ANSI + status text tier is brightened to the AA floor. ── */
const solarizedDark: HelmTheme = {
  id: "solarized-dark",
  name: "Solarized Dark",
  kind: "dark",
  tokens: {
    "--n-1": "#002430", "--n-2": "#002b36", "--n-3": "#073642", "--n-4": "#0a3a47",
    "--n-5": "#0d3f4d", "--n-6": "#104454", "--n-7": "#1a4c5c", "--n-8": "#2a5a68",
    "--n-9": "#586e75", "--n-10": "#657b83", "--n-11": "#93a1a1", "--n-12": "#eee8d5",
    "--slate-body": "#839496", "--slate-name": "#e3ddcd", "--slate-place": "#9aa8ae",
    "--void": "#002430", "--chrome": "#002b36", "--chrome-hi": "#05303c",
    "--sheet": "#053039", "--panel-float": "#08323e", "--ring": "#001c24",
    "--hair-panel": "#0e3a46", "--hair-zone": "#103c49", "--hair-top": "#0e3a46",
    "--hair-control": "#75878f",
    "--indigo-solid": "#268bd2", "--indigo-hover": "#3d9bdd", "--indigo-text": "#6db3e8",
    "--indigo-subtle": "#0b2f45", "--indigo-ink": "#032032",
    // AA-adj: canonical solarized accents on base03 — red #dc322f 4.3, green
    // #859900 3.9, yellow #b58900 3.4 — text tiers brightened to ≥4.5.
    "--red-solid": "#dc322f", "--red-text": "#ef6a64", "--red-subtle": "#3a1614", "--red-icon": "#dc322f",
    "--green-solid": "#859900", "--green-text": "#b9ca4e", "--green-subtle": "#1f2a0a",
    "--amber-solid": "#b58900", "--amber-bright": "#e6bf45", "--amber-text": "#e6bf45", "--amber-subtle": "#33280a",
    "--status-danger-surface": "rgba(220,50,47,.26)",
    "--status-success-surface": "rgba(133,153,0,.26)",
    "--status-warning-surface": "rgba(181,137,0,.26)",
    "--status-info-surface": "rgba(38,139,210,.26)",
  },
  terminal: {
    background: "#002430", foreground: "#93a1a1",
    cursor: "#6db3e8", cursorAccent: "#002430", selectionBackground: "#0d3f4d",
    black: "#073642", red: "#e25c5a", green: "#a3b83a", yellow: "#d3a92c",
    blue: "#4da3e0", magenta: "#db5a99", cyan: "#2aa198", white: "#eee8d5",
    brightBlack: "#586e75", brightRed: "#ef6a64", brightGreen: "#b9ca4e", brightYellow: "#e6bf45",
    brightBlue: "#6cb2e8", brightMagenta: "#e562a0", brightCyan: "#4ec4ba", brightWhite: "#fdf6e3",
  },
  blurb: "The precision palette — measured on base03, gated to AA.",
};

/* ── 11 · PAPER — warm light field, helm indigo kept for continuity. ── */
const paper: HelmTheme = {
  id: "paper",
  name: "Paper",
  kind: "light",
  tokens: {
    "--n-1": "#faf7f0", "--n-2": "#f1ece2", "--n-3": "#fcfaf5", "--n-4": "#e8e2d4",
    "--n-5": "#e0d9c9", "--n-6": "#e5dfd1", "--n-7": "#d9d2c2", "--n-8": "#c4bca9",
    "--n-9": "#8f8776", "--n-10": "#6e6759", "--n-11": "#5b5443", "--n-12": "#29261d",
    "--slate-body": "#5f5947", "--slate-name": "#35311f", "--slate-place": "#645e4f",
    "--void": "#faf7f0", "--chrome": "#f1ece2", "--chrome-hi": "#f6f2e9",
    "--sheet": "#ece6d8", "--panel-float": "#fcfaf4", "--ring": "#e2dccf",
    "--hair-panel": "#d6cfbe", "--hair-zone": "#dad3c3", "--hair-top": "#e6e0d2",
    "--hair-control": "#7a7260",
    "--light-edge": "rgba(255,255,255,.75)", "--light-edge-strong": "rgba(255,255,255,.92)",
    "--ambient-shadow": "rgba(58,48,30,.16)", "--scrim": "rgba(40,34,22,.42)",
    // helm indigo kept — continuity with the dark system (4.58:1 on paper)
    "--indigo-subtle": "#e9e5f6",
  },
  terminal: {
    background: "#faf7f0", foreground: "#2c2921",
    cursor: "#4a52c4", cursorAccent: "#faf7f0", selectionBackground: "#ebe3d0",
    black: "#4a453a", red: "#b03a2e", green: "#357a2e", yellow: "#7a5c00",
    blue: "#4a52c4", magenta: "#8a3fb0", cyan: "#0f766e", white: "#b8b2a4",
    brightBlack: "#746f65", brightRed: "#c04536", brightGreen: "#2b7f32", brightYellow: "#8a6a00",
    brightBlue: "#5c68ce", brightMagenta: "#9a4fc0", brightCyan: "#0d7d76", brightWhite: "#e8e2d4",
  },
  blurb: "Warm paper field, sepia ink — helm indigo kept for continuity.",
};

/* ── 12 · CLAUDE — Anthropic warmth, terracotta signal, cream text. ── */
const claude: HelmTheme = {
  id: "claude",
  name: "Claude",
  kind: "dark",
  tokens: {
    "--n-1": "#171512", "--n-2": "#201d19", "--n-3": "#28231e", "--n-4": "#2d2822",
    "--n-5": "#332d27", "--n-6": "#39322b", "--n-7": "#463d34", "--n-8": "#5a4e43",
    "--n-9": "#7d736a", "--n-10": "#968b80", "--n-11": "#c8bdb0", "--n-12": "#eee5d8",
    "--slate-body": "#a99e92", "--slate-name": "#ddd2c4", "--slate-place": "#9f958a",
    "--void": "#171512", "--chrome": "#201d19", "--chrome-hi": "#27221d",
    "--sheet": "#1d1a17", "--panel-float": "#2a251f", "--ring": "#110f0d",
    "--hair-panel": "#3b342d", "--hair-zone": "#40372f", "--hair-top": "#3b342d",
    "--hair-control": "#857a70",
    "--indigo-solid": "#d97757", "--indigo-hover": "#e28769", "--indigo-text": "#ef9b82",
    "--indigo-subtle": "#3b2118", "--indigo-ink": "#2a120b",
  },
  terminal: {
    background: "#171512", foreground: "#eee5d8",
    cursor: "#ef9b82", cursorAccent: "#171512", selectionBackground: "#40342c",
    black: "#463d34", red: "#e88983", green: "#76c893", yellow: "#e8c46a",
    blue: "#8aa7d6", magenta: "#c69bd8", cyan: "#79c6bd", white: "#c8bdb0",
    brightBlack: "#6d6258", brightRed: "#f0a09a", brightGreen: "#98d9ad", brightYellow: "#f1d58d",
    brightBlue: "#a9bfe3", brightMagenta: "#d9b5e6", brightCyan: "#9ed9d1", brightWhite: "#f8f0e5",
  },
  blurb: "Warm off-blacks, cream type, and a measured terracotta signal.",
};

/* ── 13 · ARCTIC — cool blue-white light, steel-blue signal. ── */
const arctic: HelmTheme = {
  id: "arctic",
  name: "Arctic",
  kind: "light",
  tokens: {
    "--n-1": "#f6f9fc", "--n-2": "#eaf0f6", "--n-3": "#fbfdfe", "--n-4": "#dfe8f1",
    "--n-5": "#d5e0ec", "--n-6": "#dde5ee", "--n-7": "#cfd9e5", "--n-8": "#b8c5d4",
    "--n-9": "#7e8ca0", "--n-10": "#5f6d82", "--n-11": "#49566b", "--n-12": "#1a2432",
    "--slate-body": "#4e5b70", "--slate-name": "#242f3f", "--slate-place": "#566278",
    "--void": "#f6f9fc", "--chrome": "#eaf0f6", "--chrome-hi": "#f0f4f9",
    "--sheet": "#e4ebf3", "--panel-float": "#fafcfe", "--ring": "#d9e1ea",
    "--hair-panel": "#c9d4e1", "--hair-zone": "#ccd6e3", "--hair-top": "#dfe7f0",
    "--hair-control": "#66748a",
    "--light-edge": "rgba(255,255,255,.75)", "--light-edge-strong": "rgba(255,255,255,.92)",
    "--ambient-shadow": "rgba(20,32,48,.16)", "--scrim": "rgba(15,22,32,.42)",
    "--indigo-solid": "#3b6fd4", "--indigo-hover": "#3162c2", "--indigo-text": "#2f5cb8",
    "--indigo-subtle": "#e2ebfa", "--indigo-ink": "#f7faff",
  },
  terminal: {
    background: "#f6f9fc", foreground: "#1f2937",
    cursor: "#2f5cb8", cursorAccent: "#f6f9fc", selectionBackground: "#d7e4f5",
    black: "#3a4556", red: "#c03540", green: "#1e7a34", yellow: "#7a5f00",
    blue: "#2f5cb8", magenta: "#7c3ab5", cyan: "#0e7490", white: "#9aa7b8",
    brightBlack: "#64748b", brightRed: "#cf3a45", brightGreen: "#1a8237", brightYellow: "#8a6d00",
    brightBlue: "#3b6fd4", brightMagenta: "#8f45d0", brightCyan: "#0c7d90", brightWhite: "#e2eaf2",
  },
  blurb: "Cool blue-white light — a steel-blue signal on ice.",
};

export const THEMES: readonly HelmTheme[] = [
  helmVoid, helmLight, ghost, carbon, abyss, neonTokyo,
  synthwave, dracula, nord, solarizedDark, paper, claude, arctic,
];

const THEME_MAP: ReadonlyMap<string, HelmTheme> = new Map(THEMES.map((t) => [t.id, t]));

export function getTheme(id: string): HelmTheme | undefined {
  return THEME_MAP.get(id);
}

/* ──────────────────────────────────────────────────────────────────────────
   §6 · User themes (OVERHAUL-V4 §4.10 — JSON in settings, editable,
   exportable; the settings UI lands in Wave 2). validateTheme() is the gate:
   shape, hex formats, id collision, and the same AA floor as shipped themes.
   ────────────────────────────────────────────────────────────────────────── */
export type ThemeValidation =
  | { ok: true; theme: HelmTheme; errors: [] }
  | { ok: false; errors: string[] };

const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
/** Pragmatic CSS-color gate: hex, rgb(a), hsl(a), or a var() reference. */
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([^)]{3,40}\)|hsla?\([^)]{3,40}\)|var\(--[a-z0-9-]+\))$/i;

const TERMINAL_KEYS = [
  "background", "foreground", "cursor", "cursorAccent", "selectionBackground",
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow",
  "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
] as const;

/**
 * Parse + validate a user theme object (from settings JSON / an import).
 * On success returns a normalized HelmTheme ready for applyThemeById().
 * Failures return a full error list (never throws) so the settings UI can
 * show every problem at once.
 */
export function validateTheme(input: unknown): ThemeValidation {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["theme must be an object {id, name, kind, tokens, terminal}"] };
  }
  const raw = input as Record<string, unknown>;

  // id
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!ID_RE.test(id)) errors.push(`id "${String(raw.id)}" must be lowercase [a-z0-9-], 2–41 chars`);
  else if (THEME_MAP.has(id)) errors.push(`id "${id}" collides with a shipped theme`);

  // name
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) errors.push("name is required");

  // kind
  const kind = raw.kind;
  if (kind !== "dark" && kind !== "light") errors.push(`kind must be "dark" | "light", got ${JSON.stringify(kind)}`);

  // tokens
  const tokens: Record<string, string> = {};
  if (raw.tokens !== undefined) {
    if (typeof raw.tokens !== "object" || raw.tokens === null || Array.isArray(raw.tokens)) {
      errors.push("tokens must be an object of --var: color pairs");
    } else {
      for (const [k, v] of Object.entries(raw.tokens as Record<string, unknown>)) {
        if (!k.startsWith("--")) { errors.push(`token key "${k}" must start with "--"`); continue; }
        if (typeof v !== "string" || !COLOR_RE.test(v.trim())) {
          errors.push(`token "${k}" value ${JSON.stringify(v)} is not a hex/rgb/hsl/var() color`);
          continue;
        }
        tokens[k] = v.trim();
      }
    }
  }

  // terminal — optional; derived from tokens when absent (terminal-theme.ts)
  let terminal: ITheme | undefined;
  if (raw.terminal !== undefined) {
    if (typeof raw.terminal !== "object" || raw.terminal === null || Array.isArray(raw.terminal)) {
      errors.push("terminal must be an xterm ITheme object (or omitted to derive one)");
    } else {
      terminal = {};
      for (const key of TERMINAL_KEYS) {
        const v = (raw.terminal as Record<string, unknown>)[key];
        if (v === undefined) continue;
        if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v.trim())) {
          errors.push(`terminal.${key} must be a #rrggbb hex, got ${JSON.stringify(v)}`);
          continue;
        }
        (terminal as Record<string, string>)[key] = v.trim();
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const theme: HelmTheme = {
    id,
    name,
    kind: kind as ThemeKind,
    tokens,
    terminal: terminal ?? deriveTerminalFromTokens(tokens, kind as ThemeKind),
    blurb: typeof raw.blurb === "string" ? raw.blurb : "User theme",
  };

  // AA floor — the same gate shipped themes pass (softened: user themes warn on
  // the full audit but hard-fail only on the core reading pairs).
  const audit = auditTheme(theme);
  const core = audit.violations.filter((v) =>
    ["text-primary/base", "text-secondary/base", "terminal/fg-bg", "accent-ink/solid"].includes(v.pair),
  );
  if (core.length > 0) {
    return {
      ok: false,
      errors: core.map((v) => `${v.pair}: ${v.ratio}:1 < ${v.min}:1 (${v.fg} on ${v.bg})`),
    };
  }
  return { ok: true, theme, errors: [] };
}

/** Derive a terminal palette from a token map + kind when a user theme omits
    `terminal`. Delegates to terminal-theme.ts so there is one derivation. */
function deriveTerminalFromTokens(tokens: Record<string, string>, kind: ThemeKind): ITheme {
  return deriveTerminalTheme(tokens, kind === "light" ? helmTerminalThemeLight : helmTerminalTheme);
}
