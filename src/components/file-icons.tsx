/* ══════════════════════════════════════════════════════════════════════════
   file-icons.tsx — colored, per-language file-type icons for the FilesView tree.

   SELF-CONTAINED + SELF-COLORED by design. Each icon is its own <svg> whose child
   shapes carry inline `fill`/`stroke` PRESENTATION ATTRIBUTES, so an icon renders
   its color with NO CSS help. This is deliberate: `src/styles/components.css` is
   owned by a concurrent workstream and must not be touched here. Only *layout*
   comes from the shared `.tw-ico` class (14×14 box, flex:none) — we intentionally
   DO NOT reuse `.icon`, because `.icon{stroke:currentColor;fill:none}` would cascade
   onto these shapes and fight the fills. The generic fallback is the one exception:
   it uses `currentColor` on purpose so it themes with the row (`--text-disabled`).

   Palette — a functional-color exception SANCTIONED in its own note at DESIGN.md §4.5
   (added there alongside the ANSI palette §5 and agent identity §4.3, which it is
   analogous to). Brand hues are lifted from material-icon-theme / seti-ui / vscode-icons,
   then DESATURATED and pulled toward helm's void-tuned band. The restraint rule that
   keeps the tree from reading as rainbow noise (DESIGN.md §4.5; principle §2.3 "color is
   signal, not decoration"): saturated-but-muted hue is spent ONLY on genuine code /
   language files (ts, tsx, js, jsx, json, rs, py, css, scss, html/vue/svelte, images)
   plus a few iconic tool marks (npm, Docker, git). Every SECONDARY type — markdown,
   readme, yaml, toml, shell, lockfiles, the tsconfig / Cargo config icons, and the
   generic fallback — recedes to NEAR-NEUTRAL slate in the --text-secondary /
   --text-disabled family, so color stays scarce and therefore meaningful.

   All colors are non-text marks → measured ≥3:1 on the void (the WCAG non-text floor):
   code fills land ≈4.76–9.8:1, the neutral slates ≈5.6–6.2:1, inner monograms ≥3.5:1.
   Every icon is aria-hidden (the filename carries the semantics), 14×14, flex:none —
   it cannot introduce horizontal overflow.
   ══════════════════════════════════════════════════════════════════════════ */
import type { ReactNode } from "react";

/* ── void-tuned type palette (material/seti/vscode → desaturated). Restraint rule in
      DESIGN.md §4.5: saturated hue only on CODE/language files + a few iconic tool
      marks; every secondary type recedes to slate. Ratios measured on #08090a. ── */
const C = {
  /* colored — genuine code / language files (muted brand hue, ≥4.76:1 on the void) */
  ts: "#3d7fc2",        // TypeScript blue (material #3178c6, held dark for a white monogram) · 4.76:1
  js: "#cdb63f",        // JavaScript gold (material #f7df1e, muted off the void) · 9.83:1
  json: "#c6ad55",      // JSON — warm gold, a touch softer than js · 9.02:1
  rs: "#c17f52",        // Rust source — warm terracotta, kept clear of Claude-orange · 6.10:1
  py: "#4f83bd",        // Python blue (+ pale-gold monogram → the blue+gold Python tell) · 5.04:1
  css: "#5f86cb",       // CSS blue · 5.47:1
  scss: "#bd76a4",      // Sass pink (#cd6799, muted) · 5.97:1
  html: "#cf7a52",      // markup orange (#e34f26, muted) — also vue/svelte/xml · 6.22:1
  img: "#5aa294",       // images — teal-green, pulled toward Codex-teal (§4.3) · 6.67:1
  /* colored — a few iconic tool marks, kept as restrained accents (§4.5) */
  npm: "#b0585a",       // package.json — npm red (muted; darkened for a crisper inner mark) · 4.17:1
  docker: "#5b8fc4",    // Dockerfile — docker blue (#2496ed, muted) · 5.86:1
  git: "#bd7a58",       // git dotfiles — cool-leaning orange; the branch shape disambiguates · 5.78:1
  /* near-neutral — secondary text / data / config recede to slate so colour stays scarce (§4.5).
     Two tiers by icon archetype: DOCUMENT/data glyphs read as slate; TOOL glyphs (gear/crate/
     padlock) read a hair dimmer as metal. Shape, not hue, tells these apart. */
  slate: "#8b9099",     // md, readme, yaml, toml, sh — the readable neutral · 6.21:1
  metal: "#828992",     // lockfiles, tsconfig, Cargo — config machinery, recedes further · 5.64:1
  /* inner monogram inks */
  inkTs: "#eef4fb",     // near-white monogram on ts blue · 3.78:1
  inkJs: "#22240a",     // dark monogram on js gold · 7.82:1
  inkRs: "#241509",     // dark monogram on rust terracotta · 5.42:1
  inkPy: "#faf5da",     // pale-gold monogram on py blue — crisper (3.60:1), keeps the blue+gold tell
  inkNpm: "#fdf6f5",    // near-white npm mark on the muted red · 4.48:1
  void: "#0b0c0d",      // near-void — keyholes / fold shadow / inner cuts
} as const;

/* ── shared glyph primitives ─────────────────────────────────────────────── */
// A rounded-square language badge, filling most of the 24-box with ~2px inset.
const badge = (fill: string, mark: ReactNode): ReactNode => (
  <>
    <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="4.5" fill={fill} />
    {mark}
  </>
);
// A centered mono monogram — reuses helm's "mono = code signal" principle (§6).
const mono = (text: string, fill: string, size = 8.4): ReactNode => (
  <text
    x="12"
    y="12"
    textAnchor="middle"
    dominantBaseline="central"
    fontFamily='ui-monospace, "JetBrains Mono", "Cascadia Code", monospace'
    fontWeight={700}
    fontSize={size}
    letterSpacing="-0.4"
    fill={fill}
    style={{ userSelect: "none" }}
  >
    {text}
  </text>
);
// A React atom (nucleus + 3 orbits) — marks the JSX/TSX variants.
const atom = (stroke: string): ReactNode => (
  <g fill="none" stroke={stroke} strokeWidth={1.05}>
    <circle cx="12" cy="12" r="1.35" fill={stroke} stroke="none" />
    <ellipse cx="12" cy="12" rx="6.2" ry="2.45" />
    <ellipse cx="12" cy="12" rx="6.2" ry="2.45" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="6.2" ry="2.45" transform="rotate(120 12 12)" />
  </g>
);
// A config gear — same spoke language as the app's ic-settings / ic-helm sprite.
const gear = (stroke: string): ReactNode => (
  <g fill="none" stroke={stroke} strokeWidth={1.7} strokeLinecap="round">
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 3.9v2.4M12 17.7v2.4M3.9 12h2.4M17.7 12h2.4M6.2 6.2l1.7 1.7M16.1 16.1l1.7 1.7M17.8 6.2l-1.7 1.7M7.9 16.1l-1.7 1.7" />
  </g>
);

/* ── the icon kinds + their glyphs ───────────────────────────────────────── */
type Kind =
  | "ts" | "tsx" | "js" | "jsx" | "json" | "rs" | "cargo" | "py"
  | "md" | "readme" | "css" | "scss" | "html" | "toml" | "yaml"
  | "lock" | "img" | "git" | "sh" | "npm" | "tsconfig" | "docker" | "file";

const GLYPH: Record<Kind, ReactNode> = {
  ts: badge(C.ts, mono("TS", C.inkTs)),
  tsx: badge(C.ts, atom(C.inkTs)),
  js: badge(C.js, mono("JS", C.inkJs)),
  jsx: badge(C.js, atom(C.inkJs)),
  py: badge(C.py, mono("py", C.inkPy, 8.6)),
  rs: badge(C.rs, mono("RS", C.inkRs)),

  // package.json → npm's blocky mark, light on red.
  npm: (
    <>
      <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="3" fill={C.npm} />
      <path d="M6.4 6.6h11.2v11.2h-2.8V9.4h-2.5v8.4H6.4Z" fill={C.inkNpm} />
    </>
  ),
  // tsconfig.json → a config gear, held metal/neutral (§4.5): config machinery recedes.
  tsconfig: gear(C.metal),
  // Cargo.toml → a shipping crate (Rust's "cargo" of packages), also metal/neutral. The
  // box shape keeps it distinct from the tsconfig gear — no two kinds share a glyph.
  cargo: (
    <g fill="none" stroke={C.metal} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
      <path d="M20 7.6 12 3.4 4 7.6 4 16.4 12 20.6 20 16.4Z" />
      <path d="M4 7.6 12 12 20 7.6M12 12v8.6" />
    </g>
  ),

  // JSON → braces + dot.
  json: (
    <>
      <g fill="none" stroke={C.json} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.4 4.6C7.8 4.6 7.7 6 7.7 7.6c0 1.7-.5 2.9-2.2 3.4v1.9c1.7.5 2.2 1.7 2.2 3.4 0 1.6.1 3 1.7 3" />
        <path d="M14.6 4.6c1.6 0 1.7 1.4 1.7 3 0 1.7.5 2.9 2.2 3.4v1.9c-1.7.5-2.2 1.7-2.2 3.4 0 1.6-.1 3-1.7 3" />
      </g>
      <circle cx="12" cy="12" r="1.05" fill={C.json} />
    </>
  ),

  // Markdown → the classic "M▼" in a rounded rect. Near-neutral slate so docs stay quiet.
  md: (
    <>
      <rect x="3" y="6.4" width="18" height="11.2" rx="2.2" fill="none" stroke={C.slate} strokeWidth={1.5} />
      <g fill="none" stroke={C.slate} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 15V9l2.4 2.9L10.8 9v6" />
        <path d="M14.6 9v4.3M12.7 12.1l1.9 2.2 1.9-2.2" />
      </g>
    </>
  ),
  // README → a slate page with heading lines (a filled document — reads first among the
  // neutrals, but stays near-neutral slate, not a warm accent).
  readme: (
    <>
      <path d="M6 3.4h7.3L18.2 8v11.1a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V4.9A1.5 1.5 0 0 1 6 3.4Z" fill={C.slate} />
      <path d="M13 3.7V8h4.7" fill={C.void} fillOpacity={0.18} />
      <g stroke={C.void} strokeOpacity={0.5} strokeWidth={1.1} strokeLinecap="round">
        <path d="M7.4 11.6h7M7.4 14h7M7.4 16.4h4.4" />
      </g>
    </>
  ),

  // CSS → a slanted "#" (a selector set).
  css: (
    <g stroke={C.css} strokeWidth={1.8} strokeLinecap="round">
      <path d="M9.6 4.9 7.9 19.1M15.6 4.9 13.9 19.1M6 9.4h13M5.4 14.6h13" />
    </g>
  ),
  // SCSS → a Sass "$" variable (a stylesheet cousin of css, but a distinct glyph — an
  // S-curve struck through by a vertical bar), so scss no longer shares css's path.
  scss: (
    <g fill="none" stroke={C.scss} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 7.7c-.9-1.3-2.3-1.9-3.9-1.9-1.8 0-3.4.9-3.4 2.7 0 4 7.6 1.7 7.6 5.9 0 1.9-1.9 2.9-3.9 2.9-1.8 0-3.4-.7-4.2-2.1" />
      <path d="M12 4.1v15.8" />
    </g>
  ),
  // HTML / markup → angle brackets + slash.
  html: (
    <g fill="none" stroke={C.html} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.8 8 4.8 12l4 4" />
      <path d="M15.2 8l4 4-4 4" />
      <path d="M13.4 6.3 10.6 17.7" />
    </g>
  ),

  // TOML → settings sliders (config), the ic-settings metaphor.
  toml: (
    <g fill="none" stroke={C.slate} strokeWidth={1.6} strokeLinecap="round">
      <path d="M5 8.2h14M5 12h14M5 15.8h14" />
      <circle cx="9" cy="8.2" r="2" fill={C.void} />
      <circle cx="15.5" cy="12" r="2" fill={C.void} />
      <circle cx="8" cy="15.8" r="2" fill={C.void} />
    </g>
  ),
  // YAML → a key/value list (dots + lines) — data, distinct from toml's sliders.
  yaml: (
    <g fill="none" stroke={C.slate} strokeWidth={1.5} strokeLinecap="round">
      <circle cx="6.4" cy="7.6" r="1.15" fill={C.slate} stroke="none" />
      <circle cx="6.4" cy="12" r="1.15" fill={C.slate} stroke="none" />
      <circle cx="6.4" cy="16.4" r="1.15" fill={C.slate} stroke="none" />
      <path d="M9.6 7.6h8.4M9.6 12h8.4M9.6 16.4h5.6" />
    </g>
  ),

  // Lockfiles → a plain neutral padlock (recede).
  lock: (
    <>
      <rect x="5.4" y="10.3" width="13.2" height="9.3" rx="1.9" fill={C.metal} />
      <path d="M8 10.3V8a4 4 0 0 1 8 0v2.3" fill="none" stroke={C.metal} strokeWidth={1.8} />
      <circle cx="12" cy="14.2" r="1.35" fill={C.void} />
      <path d="M12 15v2.1" stroke={C.void} strokeWidth={1.4} strokeLinecap="round" />
    </>
  ),
  // Images → a teal frame with a sun + mountain silhouette.
  img: (
    <>
      <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.4" fill={C.img} />
      <circle cx="8.4" cy="9.4" r="1.7" fill="#eaf6f2" />
      <path d="M3.7 16.9 9 11.6l3.1 3 3.3-3.9 5 5.1v1.2a1.4 1.4 0 0 1-1.4 1.4H5.1A1.4 1.4 0 0 1 3.7 17.8Z" fill="#123530" />
    </>
  ),
  // Git dotfiles → a branch (two-node merge).
  git: (
    <g fill="none" stroke={C.git} strokeWidth={1.7}>
      <circle cx="7" cy="6.4" r="2.1" fill={C.git} stroke="none" />
      <circle cx="7" cy="17.6" r="2.1" fill={C.git} stroke="none" />
      <circle cx="16.6" cy="8.6" r="2.1" fill={C.git} stroke="none" />
      <path d="M7 8.5v7M16.6 10.7c0 3.4-3.1 4-6.2 4.6" />
    </g>
  ),
  // Shell scripts → a ">_" prompt in a rounded rect.
  sh: (
    <>
      <rect x="3.3" y="4.6" width="17.4" height="14.8" rx="2.6" fill="none" stroke={C.slate} strokeWidth={1.6} />
      <path d="M7 9.4l3.1 2.6L7 14.6" fill="none" stroke={C.slate} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.4 14.8h4.2" stroke={C.slate} strokeWidth={1.7} strokeLinecap="round" />
    </>
  ),
  // Dockerfile → stacked containers on a whale body.
  docker: (
    <>
      <g fill={C.docker}>
        <rect x="4.2" y="11" width="3.1" height="3" rx="0.4" />
        <rect x="7.9" y="11" width="3.1" height="3" rx="0.4" />
        <rect x="11.6" y="11" width="3.1" height="3" rx="0.4" />
        <rect x="7.9" y="7.3" width="3.1" height="3" rx="0.4" />
        <rect x="11.6" y="7.3" width="3.1" height="3" rx="0.4" />
      </g>
      <path d="M3.4 14.6h14.3c.2 1.7-.6 3.4-2 4.2-1.7 1-3.9 1.2-5.9 1.2-3 0-5.6-1-6.3-4.2a4.6 4.6 0 0 1-.1-1.2Z" fill={C.docker} />
      <path d="M17.9 13.2c.7-.5 1.6-.6 2.4-.3-.2-.9-1-1.2-1.7-1.2" fill="none" stroke={C.docker} strokeWidth={1.2} strokeLinecap="round" />
    </>
  ),

  // Unknown → a neutral document that themes with the row (currentColor).
  file: (
    <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
      <path d="M6.5 3.8h6.4L17.5 8.4V19.2A1.4 1.4 0 0 1 16.1 20.6H6.5A1.4 1.4 0 0 1 5.1 19.2V5.2A1.4 1.4 0 0 1 6.5 3.8Z" />
      <path d="M12.6 3.9V8.6h4.6" />
    </g>
  ),
};

/* ── extension → kind (special filenames are matched first, in resolveKind) ── */
const EXT: Record<string, Kind> = {
  ts: "ts", mts: "ts", cts: "ts",
  tsx: "tsx",
  js: "js", mjs: "js", cjs: "js",
  jsx: "jsx",
  json: "json", jsonc: "json", json5: "json",
  rs: "rs",
  py: "py", pyw: "py", pyi: "py",
  md: "md", mdx: "md", markdown: "md",
  css: "css",
  scss: "scss", sass: "scss",
  html: "html", htm: "html", xhtml: "html", xml: "html", vue: "html", svelte: "html",
  toml: "toml",
  yaml: "yaml", yml: "yaml",
  lock: "lock",
  png: "img", jpg: "img", jpeg: "img", gif: "img", webp: "img", svg: "img",
  bmp: "img", ico: "img", tif: "img", tiff: "img", avif: "img",
  sh: "sh", bash: "sh", zsh: "sh", fish: "sh",
};

/** Resolve a filename to an icon kind. Special filenames win over extension;
 *  unknown types fall back to the neutral generic document. */
function resolveKind(rawName: string): Kind {
  const name = rawName.toLowerCase();

  // exact / prefix special filenames (highest fidelity)
  if (name === "package.json") return "npm";
  if (name === "package-lock.json") return "lock";
  if (name === "tsconfig.json" || /^tsconfig\..+\.json$/.test(name)) return "tsconfig";
  if (name === "cargo.toml") return "cargo";
  if (name === "cargo.lock" || name === "yarn.lock" || name === "pnpm-lock.yaml" || name === "bun.lockb")
    return "lock";
  if (name === "dockerfile" || name.startsWith("dockerfile.") || name.endsWith(".dockerfile"))
    return "docker";
  if (/^readme(\.[a-z0-9]+)?$/.test(name)) return "readme"; // readme, readme.md/.txt/.rst — NOT readmelater.js
  if (/^\.git(ignore|attributes|modules|config|keep)$/.test(name)) return "git"; // real git dotfiles — NOT .gitlab-ci.yml

  // extension (leading-dot dotfiles like ".env" have their dot at index 0 → no ext)
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  if (ext && ext in EXT) return EXT[ext];

  return "file";
}

/**
 * FileTypeIcon — a self-colored, self-contained 14×14 file-type glyph for the tree.
 * Layout only from `.tw-ico`; color lives on the inline SVG attributes (never CSS).
 */
export function FileTypeIcon({
  name,
  className = "tw-ico",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={14}
      height={14}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPH[resolveKind(name)]}
    </svg>
  );
}
