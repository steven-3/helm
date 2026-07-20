# helm — DESIGN.md

**The single source of truth for helm's visual system.** Every screen, component, and color in helm resolves to a token defined here. Components consume the **semantic tier only** — never a raw hex, never a primitive. To reskin or re-tone helm, edit a value here; nothing downstream is hand-authored.

> **v4 · "Helm Deck."** The flat void grows layered depth. Three explicit elevation tiers carry a real (subtle) shadow + border-light logic; a glass-matte hybrid is admitted for **transient surfaces only** (palette/omnibar, menus, the attention inbox) under a strict recipe; and a **seat-color identity system** threads one hue per agent seat — Claude indigo, GPT teal, Kimi amber, Sonnet violet, plus four custom slots — through pane borders, roster dots, board cards, mission tree, and fleet cards, so a 16-session grid reads by color at a glance. Type tightens for data surfaces; motion stays gated to state changes. **The terminal well stays void `#08090a` in the default theme.** v4 is **purely additive**: every v3.1 token keeps its name and value, and v4 ships a **theme engine** (§13.5) — a registry of 12 AA-gated themes whose override maps cascade over this same contract. History: v3.1 "Integrated Work Surface" (focus ring, compact density, selection, status surfaces, badges, keycaps, overlay motion — §12, all intact); v3 structural system (§1–§11, intact except where a section says "evolved by v4"). Every text/surface pair, new and old, is gated against **WCAG AA** with a real sRGB contrast script — the v4 gate lives in the theme registry itself (§13.5).

---

## 1. Product brief

helm is a custom **agent-cockpit desktop app** (Tauri v2 / WebView2) — an IDE-lite shell around a terminal, the daily driver for AI-assisted development on Windows + WSL. One expert user, all day, very long sessions. It exists because Warp feels like a **bottleneck**; helm must feel **fast, light, precise** — a professional instrument, not a consumer app. The UI is dense and information-rich: terminal, file tree, agent roster, status bar, and a right-hand widget "Stage" on screen at once.

- **Emotional goal (one):** *Focused control.* Calm-but-alert. Aaker dimension: **Competence**, with a note of **Sophistication** (near-black, restrained, containment-deep like Linear).
- **Domain:** developer tool / command center. Inherits terminal + IDE conventions (Jakob's Law); spends its novelty budget on ONE signature, not on reinventing chrome.
- **Density:** every surface is a high-density work surface. There is **no** low-density marketing screen — which decides the glass-vs-matte question globally (§3).

---

## 2. Principles (each can veto a concrete choice)

1. **Legibility over ambiance.** Dense small text is everywhere (roster rows, tree, status bar, terminal). Any effect that costs a caption's contrast is rejected. → *vetoes glass-on-content, low-contrast tricks, anything behind text.* (This is why the chrome switched to **Inter**: mono at 11–12px was harder to scan than Linear's UI sans — a readability fix.)
2. **The terminal is the hero; chrome recedes.** Chrome must never out-shout terminal content. In helm the terminal is the **deepest** surface — a void well the chrome plates frame. → *vetoes loud accent chrome, borders-everywhere, decorative color; enforces 60-30-10 with chrome as the ~90% neutral.*
3. **Color is signal, not decoration.** Hue is spent only on function: agent identity, run/error state, the one primary action, the focus ring. → *keeps ≤3 hues per view; makes Claude/Codex color-coding legible precisely because color is scarce elsewhere.*
4. **Light and fast over rich and heavy.** The anti-Warp principle. No GPU-hungry effect competes with the terminal; motion is gated hard (keyboard-driven → mostly none). → *vetoes shadergradient / r3f / liquid-glass; enforces the motion frequency gate.*
5. **Density with air over cramped or sparse.** High information density is the point, structured by spacing + Gestalt grouping + **containment depth**, not boxes-in-boxes. → *vetoes over-bordering; separates structural zones with tonal surfaces, shared seams, and whitespace.*

---

## 3. Design language + effect-gate ruling

**Language: Matte / flat-dark command center, organized as one integrated work surface.** Depth comes from a **monotonic surface ladder**, shared 1px seams, and a restrained light-catching edge. Structural chrome is flush. Small self-contained cards may rise one step; menus, modals, and responsive overlays may float. Nothing earns a ring, radius, or shadow merely because it is a container.

**Glass-vs-matte ruling — global matte, with ONE v4 carve-out.** Every helm surface is dense → **solid, opaque surfaces everywhere content lives.** Glass remains forbidden on content by construction. **v4 carve-out (§13.2):** *transient* surfaces — the command palette/omnibar, menus, and the attention inbox — may use the tokenized glass recipe (translucent tint + backdrop blur + tier-2 border-light). They are momentary, modal, and sit above the work; they never carry sustained reading. Persistent chrome, cards, wells, and every data surface stay matte. The carve-out is a closed list: new glass consumers require a DESIGN.md amendment.

**Effect-gate verdict (honest).** helm is dense + dark + long-session + GPU-contended (xterm WebGL + local AI work). Decorative effects remain tightly gated:
- `shadergradient` / aurora — background-only, low-density-only; burns GPU the terminal needs. **No.**
- `react-three-fiber` — heavy dep for zero product need. **No.**
- `liquid-glass-js` / glassmorphism — density gate forbids glass on text. **No.**
- **diffuse decorative shadows** — muddy dense dark UI. **No.** A tight, low-spread ambient shadow is allowed only when the surface actually sits above the work area.

**The signature is structural, not decorative — three mechanisms + one accent:**
1. **Continuous workspace.** An active tab meets its terminal directly; the pane toolbar, terminal well, and split cells share edges with no interstitial padding or nested panel radius.
2. **Grooves + the void well.** The terminal is the **void** (`#08090a`) and the chrome plates (`#101112`) frame it. Plate↔chrome seams read as grooves — a light zone edge (`#252626`) on the plate side with the darker neighbor as the dark side.
3. **Selective elevation — three tiers (evolved by v4, §13.1).** Raised cards receive one subtle edge highlight and a micro-drop (T1). Floating plates add a tight ambient shadow and a slightly larger radius (T2); the modal top layer deepens the same recipe (T3). Embedded, selected, raised, floating, modal, and editable are distinct roles, never interchangeable decoration.
4. **The single indigo `#5E6AD2`** (§4.2), spent only on the focus ring, the rare primary button, active-selection bars, and links. *(v4 adds a fifth mechanism: the seat-color identity system, §4.4 — hue as wayfinding across the fleet, still functional, never decorative.)*

*(One optional, opt-in, backlog flourish: a near-invisible static top-edge indigo glow on the titlebar — gated, off by default. Not in v1.)*

---

## 4. Palette (near-neutral surfaces, cool-slate text, AA-gated)

Near-neutral greys (surfaces, C≈.0025) carry ~90% of the UI; the cool-**slate** richness (h≈260, C≈.013) lives in the **text**. One **indigo** accent is the system's own color. Agent identity is the **seat-color system** (§4.4, v4) — four fixed seat hues + four custom slots — with the legacy two-agent aliases (§4.3) preserved. Status hues appear only on state. All ratios measured on base `#08090a` unless noted.

### 4.1 Neutrals — surface + text ramp (12-step)
| Step | Hex | Role | : base |
|---|---|---|---|
| n1 | `#08090a` | **void** — app frame · **terminal well** | — |
| n2 | `#101112` | **chrome** — rail/sidebar/tabbar/statusbar/titlebar/stage | — |
| n3 | `#151617` | **raised** — cards, summary groups, Stage cards | — |
| n4 | `#171819` | hover | — |
| n5 | `#1b1c1d` | active / selected / nested / input fill | — |
| n6 | `#1e1f20` | chip · **subtle hairline** (divider on dark) | — |
| n7 | `#272829` | **card hairline** · default control border | — |
| n8 | `#33363c` | **strong border** · control boundary · scrollbar thumb | — |
| n9 | `#62666d` | idle dot · disabled fg · **never readable text** | 3.45 |
| n10 | `#767b83` | muted terminal/meta chrome | 4.68 |
| n11 | `#aaafb7` | **secondary text** — the readable **floor** | 9.04 |
| n12 | `#d0d6e0` | **primary text** — cool slate strong | 13.64 |

**Extra slate tiers** (Linear's dim-body / name tones, between the ramp steps): `--slate-name #c4cad3` (names/titles, 11.6:1) · `--slate-body #8a8f98` (comfortable-reading **prose only**, 6.13:1) · `--slate-place #818790` (input placeholder — AA on the input fill: 5.01 raised / 4.72 nested). *(Linear's `#52565c` "faint" section-label tier fails AA at 2.70:1 — helm deliberately does **not** ship it; helm's section labels are functional and stay `--text-secondary`.)*

**Depth primitives** (positional — do not fit the single ramp): `--void #08090a` · `--chrome #101112` · `--chrome-hi #141516` (glow origin) · `--sheet #121314` (content plate) · `--panel-float #161718` (floating overlay) · `--ring #0e0f10` (outer ring / groove) · `--hair-panel #222324` (overlay border) · `--hair-zone #252626` (same-elevation seam) · `--hair-top #232425` (chrome top edge) · `--hair-control #64686f` (3:1 editable boundary) · neutral light-edge alphas `.055/.085` · `--ambient-shadow rgba(0,0,0,.72)` (floating surfaces only).

### 4.2 helm accent — indigo (Linear's `#5E6AD2`) · the system's own color
`solid #5E6AD2` · `hover #6E7AE0` · `text/link #9aa0ee` (**8.20:1**) · `subtle-bg #1b1f38` · `ink #fafbff` (near-white). **Focus ring = `#5E6AD2`** (3.63–4.24:1 vs the surfaces it outlines — clears the 3:1 non-text floor). **Primary solid button = `#5E6AD2` bg + `#fafbff` ink (4.54:1)** — *dark ink FAILS on indigo (4.24:1), hence near-white.* Reserved for: primary action, focus ring, active selection, links, info. Restrained — never decorative, never sprayed (≤10% of a view).

### 4.3 Agent identity — legacy two-agent aliases (superseded by §4.4, kept intact)
Hexes are **unchanged** from v1 — contrast only *rose* on the darker `#08090a` base.
| Agent | solid (dot) | text (label) | subtle (tint) | border | label : base |
|---|---|---|---|---|---|
| **Claude** | `#df8352` | `#f1a278` | `#2e1c12` | `#5a3620` | **9.66:1** · warm-orange |
| **Codex** | `#62c5b9` | `#81d6cb` | `#10312d` | `#1a4e48` | **11.78:1** · teal |
| *generic* | `#62666d` (n9) | `#aaafb7` (n11) | — | n8 | grey |

Orange↔teal is warm/cool + far in hue → distinguishable under deuteranopia/protanopia. Because Claude-orange sits near danger-red, **agent identity and error state are never encoded by color alone** — the roster pairs every dot with a distinct **glyph** and a **text label that names the agent** (`claude`/`codex`). **Identity (dot + glyph + agent word) is kept visually separate from run state (§4.5).** The recolor did **not** touch these hues — agent identity is load-bearing.

**v4 note:** the `--claude-*` / `--codex-*` / `--agent-*` tokens above remain valid and rendered components keep working unchanged. New seat-aware surfaces bind the **§4.4 seat system** (`--seat-*`), where the Claude seat wears the system indigo and GPT inherits this same teal family. The legacy warm-orange survives as the default hue of custom slot 1, so no identity color is lost.

### 4.4 Seat-color identity (v4) — one hue per seat, readable at fleet scale

With up to 16 concurrent sessions, the scarce resource is the operator's attention; **hue becomes wayfinding**. Every agent seat owns a color family that threads **pane borders, roster dots, tab strips, board cards, mission-tree nodes, and fleet cards** — the whole operation reads by color at a glance. The rules that keep it signal, not decoration (§2 principle 3):

1. **Identity is never color alone.** A seat mark is always **dot/edge + distinct glyph + the seat word** (`claude` / `gpt` / `kimi` / `sonnet` / the custom name). Color is the accelerant, not the carrier.
2. **Identity ≠ state.** Seat hue says *who*; the §4.5 status set says *how it's going* (running/idle/error/attention). The two never mix in one indicator: a running Claude pane shows a **Claude-indigo dot** (identity) with the pulse/state chip doing the *running* part (state).
3. **Four tiers per seat, same shape as §4.3:** `solid` = dots/edges/fills (non-text, ≥3:1) · `text` = the AA label tier (≥4.5) · `subtle` = tint background · `border` = quiet structural edge. Consumed via `[data-seat]` → `--seat-current-*` (§13.3).
4. **Seat hues are identity constants across themes** — like the ANSI palette, they stay recognizable when the app re-skins; light themes re-tone the text/subtle/border tiers for AA (§13.3), hues preserved.

| Seat | Hue family | solid | text : base (dark) | text : base (light) |
|---|---|---|---|---|
| **Claude** | **indigo** — the system's own `#5E6AD2` family; the primary agent wears the system color | `#5E6AD2` | `#9aa0ee` · **8.20:1** | `#4a52c4` · **6.22:1** |
| **GPT** | **teal** (the legacy Codex family) | `#62c5b9` | `#81d6cb` · **11.78:1** | `#0e7a70` · **5.07:1** |
| **Kimi** | **amber** (gold-leaning, clear of warning `#f0bf00`) | `#d99a3d` | `#f0bd6e` · **11.59:1** | `#7d5c00` · **6.02:1** |
| **Sonnet** | **violet** | `#a878e8` | `#c79bf0` · **8.90:1** | `#7a35c2` · **6.57:1** |
| **custom-1** | ember (the legacy Claude warm-orange, preserved) | `#df8352` | `#f1a278` · **9.66:1** | `#ac4c1c` · **5.38:1** |
| **custom-2** | rose | `#e06c8f` | `#f49ab8` · **9.64:1** | `#b02a58` · **6.17:1** |
| **custom-3** | sky | `#5fa8e6` | `#8cc4f0` · **10.69:1** | `#2a62a0` · **6.11:1** |
| **custom-4** | sage | `#9cb86a` | `#bcd68e` · **12.48:1** | `#557429` · **5.23:1** |

The four custom slots ship these defaults and are user-recolorable per agent (the agents page / `.helm/agents.json` carry a `color` field). **Separation notes:** Kimi-amber and §4.5 warning-amber are near neighbors by design constraint — they are disambiguated by *role* (identity glyph + seat word vs. state icon + state word), never relied on as the sole distinction, per rule 1. Claude-indigo and the accent are the *same* hue on purpose: the orchestrator's seat is the system seat; its identity still carries the `claude` glyph + word everywhere the accent alone would be ambiguous.

### 4.5 Status (state only — never ambient; Linear-measured)
| Role | solid | text | subtle | text : base |
|---|---|---|---|---|
| success/done | `#27a243` | `#56c96e` | `#122a19` | 9.47 · true green |
| danger/error | `#ef4e51` | `#f47b74` | `#3a1516` | 7.53 · (`#bf494a` = tiny-icon red) |
| warning/attention | `#c49d04` | `#f0bf00` | `#332804` | 11.54 · amber (bright `#f0bf00`) |
| info | = indigo `#5E6AD2` | `#9aa0ee` | `#1b1f38` | 8.20 |
| idle | `#62666d` (n9) | — | — | steady grey dot |

**Run/idle/error/attention semantics:** *running* = the agent's own color + a slow pulse (§8); *idle* = grey n9 (steady); *error* = danger red; *done* = success green; *attention/needs-input* = warning amber + pulse. Always with an icon. `*-text` = word/icon on dark surfaces (AA); `*-solid` = dots/rings/fills only, **not** text.

### 4.6 File-type icons (functional-color exception — muted, code-concentrated)
The FilesView tree carries a **muted, void-tuned file-type icon palette** (material-icon-theme / seti lineage), sanctioned here as a functional-color exception **alongside the ANSI palette (§5) and agent identity (§4.3)** — it is signal, not decoration (§2 principle 3). It lives self-contained in `src/components/file-icons.tsx` as inline SVG presentation attributes — the **second** sanctioned raw-hex island after §5's terminal theme; `components.css` is never touched. **Restraint rule (this is what keeps the tree from reading as rainbow noise):** saturated-but-muted hue is spent **only on genuine code / language files** — ts, tsx, js, jsx, json, rs, py, css, scss, html/vue/svelte, images — plus a few **iconic tool marks** (npm, Docker, git). Every **secondary** type — markdown, readme, yaml, toml, shell, lockfiles, the tsconfig / Cargo config icons, and the generic fallback — recedes to **near-neutral slate** in the `--text-secondary`/`--text-disabled` family, so hue stays scarce and therefore meaningful. All fills are non-text marks measured **≥3:1 on the void** (code fills ≈4.76–9.8:1; neutral slates ≈5.6–6.2:1; inner monograms ≥3.5:1); icons are 14×14, `aria-hidden` (the filename carries the semantics) and cannot introduce horizontal overflow.

---

## 5. Terminal ANSI palette (reads as one system with the chrome)

Terminal background = `#08090a` (void), foreground = **bright slate `#e4e7ec`** (16.08:1). The default terminal typeface is **JetBrains Mono** (§6), with Monaspace Neon/Argon and IBM Plex Mono available in Settings. The 16 ANSI colors are tuned for legibility on the void and pulled toward the chrome's hues — **ANSI blue → the indigo family**, **ANSI cyan → the Codex-teal family** — so the terminal never looks like a bolted-on theme. Contrast on `#08090a` quoted.

| # | Name | Hex | : bg | | # | Name | Hex | : bg |
|---|---|---|---|---|---|---|---|---|
| 0 | black | `#3e424b` | 1.98 dim | | 8 | br-black | `#565c66` | 2.96 |
| 1 | red | `#ef5350` | 5.72 | | 9 | br-red | `#f47b74` | 7.53 |
| 2 | green | `#40b869` | 7.86 | | 10 | br-green | `#5bd080` | 10.23 |
| 3 | yellow | `#d7b02a` | 9.62 | | 11 | br-yellow | `#f0bf00` | 11.54 |
| 4 | blue | `#6e79e0` | 5.19 | | 12 | br-blue | `#9aa0ee` | 8.20 |
| 5 | magenta | `#a878e8` | 6.18 | | 13 | br-magenta | `#c79bf0` | 8.90 |
| 6 | cyan | `#45b6ad` | 8.11 | | 14 | br-cyan | `#7fd9ce` | 12.07 |
| 7 | white | `#aaafb7` | 9.04 | | 15 | br-white | `#e4e7ec` | 16.08 |

*(ANSI 0/8 are dim-by-spec — for dim text/backgrounds, not for body legibility.)* Cursor = `#9aa0ee` (indigo accent text). Selection bg = `#23262c` (neutral raised). "Bold as bright" on. These 16 are inlined in `src/lib/terminal-theme.ts` (xterm renders to canvas and cannot read CSS vars — the one sanctioned raw-hex exception, terminal content only). **v4 note:** this palette is the **Helm Void default** — the terminal well stays `#08090a` there. Under the §13.5 theme engine each theme carries its own AA-gated xterm palette (terminal bg always == the theme's `--n-1`), and `deriveTerminalTheme()` maps app tokens → an xterm theme for user themes.

---

## 6. Type

**Fonts — Linear's actual pairing (a deliberate readability fix over v1's mono-forward chrome):**
- `--font-sans` = **"Inter"**, ui-sans-serif, system-ui, "Segoe UI", sans-serif → **the DEFAULT body/UI font.** All chrome: labels, roster, tree, tabs, status bar, **wordmark**, dialogs, settings, empty states, hints.
- `--font-mono` = **"JetBrains Mono"**, ui-monospace, "Cascadia Code", Menlo, Consolas, monospace → reserved for genuinely-mono content: **code, tabular data, file-paths, IDs, refs.** (breadcrumbs, path input, file contents, copyable values, the status-bar branch/model/clock, switcher model/version ids.)
- **Terminal default** = **"JetBrains Mono"** for stable xterm metrics; bundled **Monaspace Neon**, **Monaspace Argon**, and **IBM Plex Mono** remain selectable per-user in Settings. The terminal is the user's reading surface, so this choice remains user-switchable.

**Why:** Inter is what Linear ships for its UI — it reads cleanly at 11–13px where helm's chrome is dense, and gives the "calm, professional instrument" tone. Mono is now a **signal** (this is data/a path/an id), not the whole chrome — a stronger, more legible system than mono-everywhere. Type-pairs are deliberate: the switcher shows the agent name in Inter next to the model id in JetBrains Mono; the roster name (Inter) sits above a model/id sublabel.

**Loading:** Inter + JetBrains Mono load via `@fontsource` in `src/main.tsx`; Monaspace faces are bundled `@font-face` (`src/styles/fonts.css`); IBM Plex Mono weights (400/600/italic) remain via `@fontsource` for the terminal picker option. xterm measures glyph metrics at `term.open()`, so the selected terminal face is loaded via FontFaceSet **before** open/restyle — the binding lives in `src/lib/terminal-theme.ts` `TERM_FONTS`.

**Scale** (dense, ratio ~1.2; `font-variant-numeric: tabular-nums` globally so counters and data do not jitter):
| Token | px / line-height | Use |
|---|---|---|
| `text-nano` | 9 / 1.25 | **data-viz axis labels + compact numeric badges ONLY** — never prose/UI copy; must pair with ≥ `--text-secondary` color |
| `text-micro` | 11 / 1.35 | status bar, badges, tiny meta |
| `text-caption` | 12 / 1.4 | roster rows, file tree, secondary labels |
| `text-sm` | 13 / 1.45 | **default dense UI / controls** |
| `text-base` | 14 / 1.5 | terminal default, comfortable body |
| `text-md` | 16 / 1.55 | sustained prose / spacious dialog body |
| `text-lg` | 20 / 1.4 | panel headers, section titles |
| `text-xl` | 24 / 1.3 | sparse headings |
| `text-2xl` | 32 / 1.2 | empty states |
| `text-display` | 44 / 1.1 | welcome / empty-terminal hero, wordmark moments |

**Weights:** Inter 300 / 400 / 500 / 600 / 700; **300** reserved for large display numerals (extreme-weight contrast lives at the big sizes; dense chrome stays 400–600). Mono 400 / 500 / 600.

**Density carve-out (honest):** 11–13px is used for dense chrome and compact setting labels — all of it clears AA with large margins (§4) and never drops below the `--text-secondary` floor. Explanatory settings copy uses 14px; sustained prose and dialog body copy use 16px when space allows. `--text-body` is limited to copy at 14px or larger. **v4 adds one tier:** `text-caps` 10px tracked caps for section/axis labels on data surfaces (§13.4).

---

## 7. Spacing · radius · elevation

**Spacing** — a 4px structural grid (+1/2/6 for hairline density): `0, 1(px), 2, 4, 6, 8, 12, 16, 20, 24, 32, 48, 64`. Component layouts may use deliberate optical values such as 10, 14, 18, and 28px when the grid looks mechanically misaligned; those exceptions stay local and must not create a second global scale. **Density rides the same grid:** control heights, list-row heights, and list paddings are tokens (`--control-h-*`, `--row-h-*`, `--list-pad-*`, §12.2) with a `:root[data-density="compact"]` re-map — every value in both densities stays on this grid.

**Radius** — crisp/technical and role-based: `xs 3 · control 5 · panel 8 · floating 10 · chip 4 · shell 12 · pill 9999`. **The window shell is the one rounded structural exception:** the outer app frame rounds to `--radius-shell` (**12px**), applied on the painted `.app` root as a real `overflow:hidden` content clip so its children (titlebar/status-bar corners) can never flash a square edge mid-resize under the transparent, decorations-off window. **Every embedded inner chrome zone — rail, sidebar, tabs, terminal, pane toolbar, Stage, status bar — stays 0** and takes its corners from the shell's clip, never its own radius. Nested geometry must be concentric: an inner radius is the outer radius minus its inset.

**Elevation — containment first, shadow only when spatially true.** The roles are explicit (v4 binds the elevated ones to the §13.1 tier tokens):

| Role | Recipe | Where |
|---|---|---|
| **Embedded** (T0) | shared surface + one seam; radius 0; no shadow | titlebar, rail, sidebar, tabs, pane toolbar, terminal, desktop Stage |
| **Selected** | local fill or direct surface continuity + a 2px accent marker | active tab, active roster row, focused pane |
| **Raised** (T1) | `--elev-1-surface` + `--elev-1-shadow` (== v3 `--shadow-raised` + micro-drop); small panel radius | summary, setting, profile, and Stage cards that are meaningful units |
| **Floating** (T2) | `--elev-2-surface` + `--elev-2-shadow` (== v3 `--shadow-floating`); floating radius | switcher, menus, palette/omnibar (glass, §13.2), and Stage/sidebar as responsive overlays |
| **Modal** (T3) | `--elev-3-surface` + `--elev-3-shadow` over `--scrim`; floating radius | modal dialogs — the one top layer |
| **Editable** | `--surface-active` + `--border-control`; 2px focus outline | inputs, search, and path fields; boundary contrast is 3:1+ |

Recessed **content wells** (terminal, copyable value, file/image preview) drop to `--surface-sheet` or `--surface-base`. Modal scrim: `rgba(4,5,6,.66)`. Adjacent panels must have a distinguishable ladder step or shared seam before shipping — the anti-bleed canary. A wrapper never repeats its child's border, radius, and shadow. **Radius is the tell for the shell↔chrome boundary:** only the outer `.app` frame is rounded (`--radius-shell`, 12px, as an `overflow:hidden` clip); every Embedded zone it contains is radius 0 and meets the bezel flush, so the whole interior reads as one continuous instrument rather than a stack of rounded containers. **The border-light rule (v4 formalizes):** every elevated tier carries (a) an *inset 1px top light edge* — `--edge-highlight` on T1, the stronger `--edge-highlight-strong` on T2/T3 — and (b) a *1px ring* — `--border-default` on T1, `--edge-ring`/`--border-panel` on T2/T3 — and (c) a *drop that deepens with altitude*: none on T0, micro on T1, tight ambient on T2, deepest on T3. Light themes re-compose all three per the §9 precedent (light lifts with a top gloss + soft cool drop).

---

## 8. Motion (Emil defaults, grafted; frequency-gated HARD)

```css
--ease-out:    cubic-bezier(0.23, 1, 0.32, 1);    /* enter/exit */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);   /* on-screen A→B */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);    /* sheets */
--dur-fast: 120ms;  --dur-2: 180ms;  --dur-3: 220ms;  --dur-4: 280ms;
--dur-overlay: var(--dur-3);  --ease-overlay: var(--ease-out);  /* overlay/popover enter (§12.5) */
--dur-drawer:  var(--dur-4);   /* right-drawer slide-in — pairs with --ease-drawer */
```
**Frequency gate first (helm is keyboard-driven, high-frequency):**
- **No animation / instant:** tab switch, pane focus, palette open, roster updates, keyboard actions. (Raycast ships zero palette animation on purpose — match that.)
- **Standard motion (occasional):** Stage widget arrival (`opacity 0→1` + `scale .97→1`, `--dur-2 --ease-out`), toasts, modal/drawer (`--dur-4`).
- **The one ambient motion:** running-agent pulse (`opacity 1↔.55`, ~1.6s `--ease-in-out`). Nothing else pulses.

Rules: animate **only** `transform`/`opacity`, never `transition: all`. Press feedback `scale(.97)` is limited to low-frequency, explicitly pressable affordances such as primary buttons, the CopyBox field, and switcher menu items — never tabs, pane focus, roster rows, or keyboard navigation. **Focus = `outline`** (indigo `#5E6AD2`, 2px, 1–2px offset) — never a box-shadow ring. `prefers-reduced-motion`: drop transforms + the pulse, keep opacity fades.

**Implementation — the occasional/rare motions run on the Motion library** (motion.dev, `motion/react`), presets in `src/lib/motion.ts` with every duration/ease mirrored from the `--dur-*`/`--ease-out` tokens above: **Stage card arrival** (`cardMotion`, `opacity 0→1`+`scale .97→1`, `--dur-2`), the **switcher popover** (`menuMotion`, top-left origin, 180ms), the **Settings scrim+modal** (`scrimMotion` opacity / `modalMotion` `opacity`+`scale .98→1` from center, `--dur-3`/`--dur-4`), the **Stage dock reveal/collapse** (`dockMotion`, x-slide+opacity — **never width**), and **press feedback** (`whileTap scale .97` on the CopyBox field + switcher items + any primary button). Enter/exit is orchestrated by `<AnimatePresence>`; the bundle stays lean via `LazyMotion`+`domAnimation` (`m.*` only, `strict`). `prefers-reduced-motion` is honored **globally** by `<MotionConfig reducedMotion="user">` (drops transform/scale, keeps the opacity fade — reduce ≠ zero). **The frequency gate is unchanged:** tab switch, pane focus/mount, rail, roster, sidebar, palette, keyboard actions stay **INSTANT** (no Motion); the FilesView **tree-expand stays a CSS keyframe**; the **running-agent pulse stays the only ambient motion** (CSS, `global.css`).

---

## 9. Token contract (copy-paste; components consume the semantic tier ONLY)

Dark-first. Primitives → semantic. A component writes `var(--surface-panel)` / `var(--text-primary)` — never `#101112`, never `--n-2`.

```css
:root {
  /* ── TIER 1 · PRIMITIVES (raw ramps — never used directly in components) ── */
  --n-1:#08090a; --n-2:#101112; --n-3:#151617; --n-4:#171819; --n-5:#1b1c1d; --n-6:#1e1f20;
  --n-7:#272829; --n-8:#33363c; --n-9:#62666d; --n-10:#767b83; --n-11:#aaafb7; --n-12:#d0d6e0;
  --slate-body:#8a8f98; --slate-name:#c4cad3; --slate-place:#818790;
  --void:#08090a; --chrome:#101112; --chrome-hi:#141516; --sheet:#121314; --panel-float:#161718;
  --ring:#0e0f10; --hair-panel:#222324; --hair-zone:#252626; --hair-top:#232425; --hair-control:#64686f;
  --light-edge:rgba(255,255,255,.055); --light-edge-strong:rgba(255,255,255,.085); --ambient-shadow:rgba(0,0,0,.72);
  --indigo-solid:#5E6AD2; --indigo-hover:#6E7AE0; --indigo-text:#9aa0ee; --indigo-subtle:#1b1f38; --indigo-ink:#fafbff;
  --claude-solid:#df8352; --claude-text:#f1a278; --claude-subtle:#2e1c12; --claude-border:#5a3620;
  --codex-solid:#62c5b9;  --codex-text:#81d6cb;  --codex-subtle:#10312d;  --codex-border:#1a4e48;
  --red-solid:#ef4e51; --red-text:#f47b74; --red-subtle:#3a1516; --red-icon:#bf494a;
  --green-solid:#27a243; --green-text:#56c96e; --green-subtle:#122a19;
  --amber-solid:#c49d04; --amber-bright:#f0bf00; --amber-text:#f0bf00; --amber-subtle:#332804;

  /* ── TIER 2 · SEMANTIC (roles — the stable contract components bind to) ── */
  --surface-base:var(--n-1);      /* app bg + terminal well (void) */
  --surface-panel:var(--n-2);     /* chrome: rail/sidebar/tabbar/statusbar/titlebar/stage */
  --surface-sheet:var(--sheet);   /* content plate (recessed content wells, preview frames) */
  --surface-raised:var(--n-3);    /* cards, summaries, self-contained groups */
  --surface-hover:var(--n-4);
  --surface-active:var(--n-5);
  --surface-overlay:var(--panel-float);  /* floating menus + modal */

  --text-primary:var(--n-12);
  --text-name:var(--slate-name);   /* names / titles */
  --text-secondary:var(--n-11);    /* floor for ALL readable/informational text */
  --text-body:var(--slate-body);   /* dim body PROSE only (≥14px reading copy) */
  --text-disabled:var(--n-9);      /* inactive controls + non-text marks ONLY — never readable text */
  --terminal-muted:var(--n-10);    /* helm-authored terminal chrome, 4.68:1 on base — NOT ANSI dim */
  --text-on-accent:var(--indigo-ink); /* near-white ink on solid indigo (dark ink fails) */
  --text-link:var(--indigo-text);
  --text-placeholder:var(--slate-place); /* input placeholder — AA on the input fill */

  --border-subtle:var(--n-6);   /* hairline separators + panel↔terminal edge */
  --border-default:var(--n-7);  /* card hairline · default control border */
  --border-strong:var(--n-8);   /* emphatic structural edge */
  --border-control:var(--hair-control); /* editable/input boundary, WCAG non-text 3:1 */
  --border-zone:var(--hair-zone);/* boundary between two SAME-elevation chrome zones (rail↔sidebar) */
  --border-panel:var(--hair-panel);/* floating overlay / menu / modal border */
  --border-focus:var(--focus-ring); /* pre-v3.1 alias — new code uses --focus-ring */
  --edge-ring:var(--ring);      /* double-edge OUTER ring: box-shadow:0 0 0 1px var(--edge-ring) */
  --scrollbar-thumb:var(--n-8); --scrollbar-thumb-hover:var(--n-9);
  --focus-ring:var(--accent-solid); --focus-ring-width:2px; --focus-ring-offset:2px; /* §12.1 */
  --selection-bg:var(--accent-subtle); /* §12.3 — ::selection bg; .xterm excluded */

  --accent-solid:var(--indigo-solid); --accent-hover:var(--indigo-hover);
  --accent-text:var(--indigo-text);   --accent-subtle:var(--indigo-subtle);

  --action-primary-bg:var(--indigo-solid); --action-primary-bg-hover:var(--indigo-hover); --action-primary-text:var(--indigo-ink);
  --action-neutral-bg:var(--n-5); --action-neutral-bg-hover:var(--n-4); --action-neutral-text:var(--n-12); --action-neutral-border:var(--n-8);

  --agent-claude:var(--claude-solid); --agent-claude-text:var(--claude-text); --agent-claude-subtle:var(--claude-subtle);
  --agent-codex:var(--codex-solid);   --agent-codex-text:var(--codex-text);   --agent-codex-subtle:var(--codex-subtle);
  --agent-generic:var(--n-9);

  --status-success:var(--green-solid); --status-danger:var(--red-solid); --status-warning:var(--amber-solid);
  --status-info:var(--indigo-solid); --status-idle:var(--n-9);
  --status-danger-text:var(--red-text);     --status-danger-subtle:var(--red-subtle);
  --status-success-text:var(--green-text);  --status-success-subtle:var(--green-subtle);
  --status-warning-text:var(--amber-text);  --status-warning-subtle:var(--amber-subtle);
  --status-danger-surface:rgba(239,78,81,.22);  --status-success-surface:rgba(39,162,67,.22);  /* §12.4 — light rebinds to the opaque *-subtle tints */
  --status-warning-surface:rgba(196,157,4,.22); --status-info-surface:rgba(94,106,210,.22);
  --badge-bg:var(--accent-solid); --badge-text:var(--indigo-ink); /* unread-count pill */
  --kbd-bg:var(--n-5); --kbd-border:var(--n-7); --kbd-text:var(--n-11); /* keycap hint chip */

  /* depth roles — embedded seams first, elevation only when real */
  --glow-chrome:linear-gradient(135deg, var(--chrome-hi) 0px, var(--surface-panel) 480px);
  --glow-plate:radial-gradient(280px 200px at 0 0, var(--surface-hover), var(--surface-overlay) 46%, var(--surface-overlay) 100%);
  --scrim:rgba(4,5,6,.66);
  --edge-highlight:var(--light-edge); --edge-highlight-strong:var(--light-edge-strong);
  --shadow-control:inset 0 1px 0 var(--edge-highlight),0 0 0 1px var(--edge-ring);
  --shadow-raised:inset 0 1px 0 var(--edge-highlight),0 0 0 1px var(--border-default);
  --shadow-floating:inset 0 1px 0 var(--edge-highlight-strong),0 0 0 1px var(--edge-ring),0 14px 34px -20px var(--ambient-shadow);

  /* type / space / radius */
  --font-sans:"Inter",ui-sans-serif,system-ui,"Segoe UI",sans-serif;              /* chrome/UI — DEFAULT body */
  --font-mono:"JetBrains Mono",ui-monospace,"Cascadia Code",Menlo,Consolas,monospace; /* code · data · tnum · paths · IDs */
  --text-nano:9px; --lh-nano:1.25; --text-micro:11px; --lh-micro:1.35; --text-caption:12px; --lh-caption:1.4;
  --text-sm:13px; --lh-sm:1.45; --text-base:14px; --lh-base:1.5; --text-md:16px; --lh-md:1.55;
  --text-lg:20px; --lh-lg:1.4; --text-xl:24px; --lh-xl:1.3; --text-2xl:32px; --lh-2xl:1.2; --text-display:44px; --lh-display:1.1;
  --sp-px:1px; --sp-2:2px; --sp-4:4px; --sp-6:6px; --sp-8:8px; --sp-12:12px;
  --sp-16:16px; --sp-20:20px; --sp-24:24px; --sp-32:32px; --sp-48:48px; --sp-64:64px;
  --radius-xs:3px; --radius-control:5px; --radius-panel:8px; --radius-floating:10px; --radius-chip:4px; --radius-shell:12px; --radius-pill:9999px;
  --target-compact:32px; --target-comfortable:40px;
  /* density — cozy defaults (§12.2); :root[data-density="compact"] re-maps to 20/28/36 · 20/28 · 4/6 */
  --control-h-sm:24px; --control-h-md:32px; --control-h-lg:40px;
  --row-h-compact:24px; --row-h-cozy:32px; --list-pad-y:6px; --list-pad-x:8px;
}
```
*(The light theme ships as a `:root[data-theme="light"]` block in `tokens.css`, re-mapping the SAME semantic names to different primitives — zero component edits. §5 ANSI + §8 motion tokens + the `[data-density="compact"]` re-map live in supplementary blocks in `tokens.css`, outside the §9 color/type/space contract.)*

---

## 10. Component recipes (starting points for ui-builder)

- **Neutral button (default):** `--action-neutral-bg`, text `--action-neutral-text`, 1px `--action-neutral-border`, `--radius-control`, min-height `--target-compact` (32px); hover → `--action-neutral-bg-hover`. Primary navigation and window chrome target `--target-comfortable` (40px).
- **Primary button (rare):** `--action-primary-bg` (indigo) + `--action-primary-text` (**near-white** ink — dark ink fails on indigo), press `scale(.97)`.
- **Danger:** default soft = `--status-danger-subtle` bg + `--status-danger-text` + red border; solid only for hard confirmations.
- **Input:** `--surface-active` bg, 1px `--border-control`, focus → 2px `outline` `--border-focus` (indigo). Placeholder `--text-placeholder`. Text 13px. **Path/search-of-a-path fields set `--font-mono`; plain query fields stay `--font-sans`.** Composite fields put focus on their wrapper with `:focus-within`.
- **Card / raised element:** use only when the content is a meaningful standalone unit. `--surface-raised`, `--shadow-raised`, `--radius-panel`; do not add the same treatment to its parent wrapper. Content wells inside it drop to `--surface-sheet` or `--surface-base`.
- **Floating plate (menu / modal):** `background:var(--glow-plate)` + `border:1px var(--border-panel)` + `--shadow-floating` + `--radius-floating`. `transform-origin` follows the content origin (§8).
- **Roster row:** default **transparent on `--surface-panel`** — *not* always-raised; hover → `--surface-hover`; selected → `--surface-active` + 2px left **indigo** bar. **Sidebar is 272px at the 1440px reference width; responsive overlays may narrow to 252/240px.** **Two clusters, kept visually separate:** (1) *identity* = agent color **dot + distinct glyph + the agent word** in the sublabel — never color alone; name in `--text-name` (Inter); (2) *state* = its **own** dot/icon **+ state word** in a dedicated non-truncating column. Running/needs-input → pulse (§8); readable sublabels use `--text-secondary`.
- **Tab:** Inter 12px, agent-color identity strip (top 2px); active = `--surface-base` (continuous with the terminal void) + `--text-primary`. Tabs are square structural segments, not floating pills or cards.
- **Chrome plate (sidebar / desktop Stage):** `background:var(--glow-chrome)`; border to the terminal = `--border-subtle`; border to a same-elevation zone = `--border-zone`. These are embedded at desktop widths and gain floating treatment only when they become overlays.
- **Status bar:** Inter labels; the branch / model / clock (data) set `--font-mono` (`.st-strong`, tnum).
- **Terminal:** bg `--surface-base` (void), fg bright slate, ANSI §5, cursor indigo, selection neutral, default font **JetBrains Mono** — 14px full-width; 13px permitted in compact split panes (≲560px); never below 13px. Monaspace Neon/Argon and IBM Plex Mono remain user-selectable.

---

## 11. helm-specific do / don't

**Do:** lean on the **surface ladder + shared seams** for structural grouping; use the **groove/void-well** composition; reserve elevation for meaningful raised/floating surfaces; keep hue for function; set chrome in **Inter**, reserve **JetBrains Mono** for code/data/paths/IDs (with tabular numerals); keep roster **identity separate from run state**; make the running pulse the only ambient motion; use 2px `outline` focus rings; test the density canary at every breakpoint.
**Don't:** add glass/blur to any content surface; repeat border + radius + shadow on a wrapper and its child; round embedded workspace regions; use diffuse decorative shadows; use a **system-ui/Roboto/Geist/Space-Grotesk** default or set chrome copy in mono; let the accent become decorative; encode agent or error by color without an icon; **use `--text-disabled`/n9 (or ANSI dim) for readable text**; use `text-nano` (9px) for anything but data-viz axes/badges; use `transition: all`, `will-change` by default, or box-shadow focus rings; use pure `#000`/`#fff` for surfaces/text.

---

## 12. System extensions (v3.1) — focus · density · selection · status surfaces · badges · keycaps · overlay motion

v3.1 deepens the token system; it does not re-tone a single existing value. Everything here follows the §9 rules: components consume the semantic tier only, and the light theme inherits by primitive re-map except where a role is explicitly re-composed (stated per token).

### 12.1 Focus ring — one indicator, tokenized

The focus ring is the system's ONE keyboard-focus indicator: an `outline`, never a box-shadow ring (§8/§11). Its geometry is now tokenized so every component restates the same ring instead of hand-writing a `2px`:

| Token | Value | Notes |
|---|---|---|
| `--focus-ring` | `var(--accent-solid)` → `#5E6AD2` | same indigo in both themes — 3.86–4.24:1 across dark void/panel/raised, 4.24–4.62:1 across light base/chrome/raised; clears the 3:1 non-text floor everywhere |
| `--focus-ring-width` | `2px` | outline width |
| `--focus-ring-offset` | `2px` | default offset; list rows and clipped frames may pull it inset (negative) per component — width and color never change |

`--border-focus` remains as a pre-v3.1 alias bound to `--focus-ring`; new code uses `--focus-ring`. The single base rule lives in `global.css` (`:focus-visible`), removes the default outline only via `:focus:not(:focus-visible)` (keyboard modality, never mouse), and is scoped OFF `.xterm` — the terminal paints its own focus on canvas; a DOM outline inside the well is always wrong.

### 12.2 Density — `data-density="compact"` (sizes only; type never shrinks)

Density is a MODE axis orthogonal to theme: `[data-theme]` owns color, `[data-density]` owns size. Both compose on the same element (`<html data-theme="light" data-density="compact">`); neither references the other. Default (no attribute) = **cozy** — the v3 measurements already in use.

| Token | cozy (default) | compact | Use |
|---|---|---|---|
| `--control-h-sm` | 24 | 20 | icon buttons, tight toolbar controls |
| `--control-h-md` | 32 | 28 | default buttons/inputs (= `--target-compact` in cozy) |
| `--control-h-lg` | 40 | 36 | primary nav / window chrome (= `--target-comfortable`) |
| `--row-h-compact` | 24 | 20 | dense list rows — file tree, search results |
| `--row-h-cozy` | 32 | 28 | reading rows — roster, command palette |
| `--list-pad-y` | 6 | 4 | block padding inside list surfaces (explorer, palette, results) |
| `--list-pad-x` | 8 | 6 | inline padding inside list surfaces |

Rules: every value stays on the §7 4px grid (+2/6 hairline steps). **Type sizes and the §4 contrast floor never change with density** — compact tightens chrome, not legibility. `--target-*` hit-target minimums are NOT remapped; compact `--control-h-md` (28px) still clears the desktop-pointer floor. Components bind control/row heights to these tokens instead of hardcoding px; a local one-off size remains a §7 violation.

### 12.3 Selection + scrollbars

- **`::selection` = `--selection-bg`** (`var(--accent-subtle)`): dark `#1b1f38` (text-primary on it **11.06:1**), light `#eaecfb` (**14.16:1**). Background only — text color is never overridden, so syntax-highlighted selections stay readable. `.xterm` is excluded: xterm paints its own selection on canvas from the §5 theme (`--term-selection` stays its CSS mirror).
- **Scrollbars** (token-driven in `global.css`; contract restated): thin — 10px track with a 2px inset, so a 6px visible thumb, hairline-consistent; track and corners transparent so horizontal+vertical junctions never paint a swatch; thumb `--scrollbar-thumb` (n8), hover `--scrollbar-thumb-hover` (n9). Hover **brightens on dark and darkens on light** — each theme's own interaction convention, arriving by primitive re-map with no light override.

### 12.4 New semantic tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `--status-danger-surface` | `rgba(239,78,81,.22)` | `var(--red-subtle)` `#fdeceb` | tinted bg for status chips/pills — always pairs with `--status-danger-text` (**5.96** void / **5.54** panel · light **4.76**) + an icon (§4.5) |
| `--status-success-surface` | `rgba(39,162,67,.22)` | `var(--green-subtle)` `#e6f5ea` | same — **7.24 / 6.70** · light **4.51** |
| `--status-warning-surface` | `rgba(196,157,4,.22)` | `var(--amber-subtle)` `#fbf3d9` | same — **8.29 / 7.61** · light **4.83** |
| `--status-info-surface` | `rgba(94,106,210,.22)` | `var(--indigo-subtle)` `#eaecfb` | same — **6.72 / 6.19** · light **5.43** |
| `--badge-bg` / `--badge-text` | indigo `#5E6AD2` / ink `#fafbff` (**4.54:1**) | same indigo / `#fbfbff` (**4.55:1**) | unread/attention count pill — the ONE solid-indigo element allowed on chrome besides the primary button |
| `--kbd-bg` / `--kbd-border` / `--kbd-text` | n5 `#1b1c1d` / n7 `#272829` / n11 `#aaafb7` (**7.74:1**) | `#e3e7ee` / `#dbdee6` / `#565d6b` (**5.33:1**) | keycap hint chip — shortcut cheatsheet, palette key hints. Set in `--font-mono` at `--text-micro`/`--text-nano`, radius `--radius-xs`; never raw hex |
| `--selection-bg` | §12.3 | §12.3 | `::selection` background |

**Why the status surfaces exist alongside the opaque `*-subtle` tints:** the subtles are tuned for the **void only** — on panel/overlay steps they read off-ladder. The dark surfaces are the hue solid at a uniform **.22 alpha**, so one token composites correctly over ANY ladder step (ratios above quoted over void/panel). Over the near-white light ladder an alpha of the hue solid cannot reach AA with its text tier (measured 4.08–4.39 at .10 over chrome), so the light role rebinds to the tuned opaque tints — same role, re-composed per theme (the `--scrim` precedent). A chip is always surface + matching `--status-*-text` + icon, never color alone (§4.5). **The scrim/backdrop token already exists — it is `--scrim`** (dark `rgba(4,5,6,.66)`, light `rgba(17,19,26,.42)`); v3.1 deliberately introduces no second name for it.

### 12.5 Motion additions

Two role bindings over the §8 scale — no new durations or eases, the scale stays single-source:

| Token | Binding | Use |
|---|---|---|
| `--dur-overlay` / `--ease-overlay` | `--dur-3` (220ms) / `--ease-out` | overlay/popover enter (fade + scale `.98→1`); modals keep `--dur-4` |
| `--dur-drawer` | `--dur-4` (280ms) | right-drawer slide-in — pairs with `--ease-drawer` |

The frequency gate is unchanged: tab switch, pane focus, palette open, roster updates, and every keyboard-initiated action remain instant. When `src/lib/motion.ts` gains overlay/drawer presets, it mirrors these tokens like the rest of §8.

---

## 13. System extensions (v4) — elevation tiers · glass · seat identity · data-surface type · theme engine

v4 "Helm Deck" deepens the system the way v3.1 did: **purely additive**. Every v3.1 token keeps its name and value (the §9 contract and §12 extensions are untouched); v4 adds new token families, one carve-out to the §3 matte ruling, and the theme engine. Wave-2 components consume these; v3 components render unchanged against them.

### 13.1 Elevation — three tiers above Embedded, with a formal border-light rule

v3's Raised/Floating recipes become explicit **tiers**, each binding surface + border-light + drop in one token trio. The v3 `--shadow-control` / `--shadow-raised` / `--shadow-floating` remain valid; new code binds the tier tokens.

| Tier | Tokens | Recipe (dark) | Role |
|---|---|---|---|
| **T1 · Raised** | `--elev-1-surface` / `--elev-1-border` / `--elev-1-shadow` | `--surface-raised` + inset top edge (`--edge-highlight`) + 1px `--border-default` ring + micro-drop `0 2px 8px -4px rgba(0,0,0,.5)` | meaningful standalone cards: summary, setting, Stage cards, board cards, fleet cards |
| **T2 · Floating** | `--elev-2-surface` / `--elev-2-border` / `--elev-2-shadow` | `--surface-overlay` + strong top edge + 1px `--edge-ring` + tight ambient `0 14px 34px -20px` (identical to v3 `--shadow-floating`) | switcher, menus, popovers, palette/omnibar (with §13.2 glass), attention inbox |
| **T3 · Modal** | `--elev-3-surface` / `--elev-3-border` / `--elev-3-shadow` | `--surface-overlay` + strong top edge + ring + deepened ambient (`0 24px 56px -20px` + `0 6px 16px -8px`), always over `--scrim` | modal dialogs — the single top layer |

**The border-light rule, formalized:** every elevated tier = *(a) inset 1px top light edge* (T1 `--edge-highlight`, T2/T3 `--edge-highlight-strong`) + *(b) 1px ring* (T1 `--border-default`; T2/T3 `--edge-ring`/`--border-panel`) + *(c) a drop that deepens with altitude* (none → micro → tight → deep). Light themes re-compose all three from a top gloss + soft cool drops (same role, re-composed — the `--scrim` precedent; values in `tokens.css`). Utility classes `.elev-1/.elev-2/.elev-3` live in `global.css`. Rules unchanged from v3: elevation is earned by role, never decoration; a wrapper never repeats its child's border + radius + shadow; embedded zones stay radius 0.

### 13.2 Glass — the glass-matte hybrid, transient surfaces ONLY

The §3 carve-out, specified. **Allowed on exactly:** the command palette/omnibar, menus (context menus, dropdowns), and the attention inbox. **Forbidden everywhere else** — content, cards, wells, persistent chrome stay matte. The recipe is tokenized so all three consumers render identically:

| Token | Dark | Light | Role |
|---|---|---|---|
| `--glass-bg` | `rgba(19,20,22,.78)` | `rgba(251,251,253,.8)` | the overlay plate at ~80% — the surface beneath stays *suggested*, never readable through |
| `--glass-blur` | `16px` | same | backdrop blur |
| `--glass-saturate` | `1.35` | same | backdrop saturation lift (keeps the blurred underlayer from going muddy) |
| `--glass-border` | `--border-panel` | `--border-panel` | the 1px ring |
| `--glass-shadow` | strong top edge + ring + `0 18px 44px -18px` ambient | re-composed soft drop | T2/T3 border-light logic |

Consumed as the single `.glass` class in `global.css`, which ships the two hard fallbacks: **`@supports` no backdrop-filter → solid `--surface-overlay`**; **`prefers-reduced-transparency: reduce` → solid `--surface-overlay`, no blur.** Legibility is therefore never dependent on the effect. Measured text on the glass composite (worst case, over the void): secondary **8.51:1** dark / **6.40:1** light; primary **12.84:1** / **16.09:1** — and glass surfaces never host sustained reading anyway. Motion for glass surfaces is the existing overlay binding (`--dur-overlay`/`--ease-overlay`, §12.5): opacity + scale `.98→1`, 220ms, nothing ambient.

### 13.3 Seat-color identity — tokens, consumption, and the AA table

The §4.4 system lands as four-token families per seat — `--seat-<name>-{solid,text,subtle,border}` for `claude`, `gpt`, `kimi`, `sonnet`, `custom-1..4` — plus a consumption convention: set **`data-seat="<name>"`** on any element and it gains `--seat-current-{solid,text,subtle,border}` bindings (`global.css`); the utilities `.seat-dot` (8px identity dot), `.seat-edge` (2px left identity strip — pane borders, board cards), `.seat-label` (the seat word, AA text tier), and `.seat-chip` (subtle bg + border + text) consume them. Unset/unknown seats fall back to the neutral generic tier. **Usage rules (restated from §4.4):** identity is dot/edge + glyph + seat word, never color alone; identity ≠ state (§4.5 owns running/error/attention); seat hues are constants across themes — light themes re-tone text/subtle/border only.

**Measured (sRGB script):** dark text tiers on the void — claude **8.20** · gpt **11.78** · kimi **11.59** · sonnet **8.90** · custom-1 **9.66** · custom-2 **9.64** · custom-3 **10.69** · custom-4 **12.48** (all ≥4.5 ✓). Light text tiers on the base — **6.22 / 5.07 / 6.02 / 6.57 / 5.38 / 6.17 / 6.11 / 5.23** (✓). Solid dots — dark **4.24–9.69:1**, light **3.18–5.21:1** (≥3:1 non-text ✓). Seat-chip pairs (text on subtle) — dark **6.65–9.59:1**, light **4.59–5.68:1** (✓). Seat text tiers also hold ≥**6.00:1** on every shipped dark theme's base (worst: Nord). The legacy `--agent-claude`/`--agent-codex` aliases (§4.3) remain for back-compat during the Wave-2 migration.

### 13.4 Tightened type + denser data-surface rules

One new type tier (the scale otherwise stands): **`--text-caps: 10px` / `--lh-caps: 1.3` / `--tracking-caps: .07em`** — the tracked-caps tier for **section/axis labels on dense data surfaces** (board column headers, fleet chips, digest-card labels, settings group labels). Rules: always rendered uppercase (the consumer sets `text-transform`), always `--text-secondary` or stronger, never body copy — it replaces the v3 habit of reaching for 11px micro labels where a *label* (not text) is wanted; `text-nano` stays reserved for data-viz axes/badges.

**Data-surface rules (board, fleet, attention, digests — Wave 2 binds these):** rows bind `--row-h-compact`/`--row-h-cozy` (density-aware, §12.2) — never a hardcoded px; numerics set `--font-mono` + `tabular-nums` and **right-align**; timestamps/ids/paths set `--font-mono` at `text-caption`; section headers use the caps tier + `--text-secondary`; identity columns (seat) lead with the dot + glyph + word (§13.3); state columns keep the icon + word in a dedicated non-truncating column (the v3 roster rule, generalized). Density stays on the §7 grid; compact mode tightens rows, never type.

### 13.5 Theme engine — registry, application mechanics, the 12 shipped themes

**Model.** A theme is `{ id, name, kind: "dark" | "light", tokens: { --var: color, … }, terminal: ITheme }` — a **partial override map** over this contract plus an xterm palette. Registry: `src/lib/themes/index.ts` (data + validation, no DOM). Engine: `src/lib/theme.ts`.

**Application.** `applyThemeById(id)`: sets `<html data-theme="<id>">` + `<html data-theme-kind="<kind>">`, injects the override map as one `:root[data-theme="<id>"]{…}` rule in a `<style id="helm-theme-overrides">` element appended after the bundled styles (equal specificity → document order decides; theme overrides win over the kind re-map, which wins over `:root`). `[data-theme-kind]` owns the §9 light semantic re-map (its selectors were extended — `[data-theme="light"]` keeps working forever); `color-scheme` tracks the kind in `global.css` (the v3.1 opaque-canvas fix, generalized). The xterm canvas gets `theme.terminal` applied imperatively, exactly as v3 did with `applyTheme`. **Legacy path intact:** `applyTheme("dark"|"light")` maps to `helm-void`/`helm-light` 1:1 — the settings store and every existing caller work unchanged. Unknown ids fall back to Helm Void, never a blank screen.

**The gate is in the registry.** `auditTheme()` resolves every theme (base ← kind re-map ← overrides) and checks **35 pairs per theme** — text ladder on base/panel/raised, placeholder on input, accent text/ink/ring, status text tiers, all 8 seat text tiers, terminal fg + the non-dim ANSI set — against WCAG AA (4.5 text / 3.1 non-text) with the same sRGB math this document has always quoted. It re-runs in dev builds and warns on any regression. ANSI gating is polarity-aware: on light terminals the roles invert (§5 light re-map) and 7/15 are the exempt "light greys" while 0/8 become strong darks.

**The 12 shipped themes** (all pairs pass; measured core ratios below, on each theme's base):

| Theme | Kind | Character | primary | secondary | accent text | ink/solid | term fg |
|---|---|---|---|---|---|---|---|
| **Helm Void** | dark | The v4 default — *is* `:root`; terminal stays `#08090a` | 13.64 | 9.04 | 8.20 | 4.54 | 16.08 |
| **Helm Light** | light | "Daylit Instrument" — *is* the §9 re-map | 16.22 | 6.45 | 6.22 | 4.55 | 14.35 |
| **Ghost** | dark | Near-monochrome minimal; one desaturated periwinkle | 14.31 | 8.78 | 10.48 | 6.53 | 15.72 |
| **Carbon** | dark | IBM Carbon gray-100 layers, productive blue | 16.45 | 10.59 | 7.68 | 5.46 | 16.16 |
| **Abyss** | dark | Deep-sea blue-black, cyan signal | 14.37 | 8.90 | 12.06 | 5.73 | 15.42 |
| **Neon Tokyo** | dark | tokyonight-night, blue-hour neon | 11.14 | 8.52 | 8.29 | 7.39 | 11.14 |
| **Synthwave** | dark | '84 outrun — hot pink on ultraviolet dusk | 12.40 | 8.09 | 8.02 | 7.26 | 12.58 |
| **Dracula** | dark | The classic, purple on Transylvania night | 14.81 | 8.37 | 7.76 | 6.37 | 14.81 |
| **Nord** | dark | Arctic frost, polar-night blues | 10.80 | 6.76 | 7.29 | 7.25 | 10.80 |
| **Solarized Dark** | dark | The precision palette, measured on base03 | 13.23 | 6.06 | 7.15 | 4.54 | 6.06 |
| **Paper** | light | Warm paper field, sepia ink, helm indigo kept | 14.13 | 7.02 | 5.96 | 4.55 | 13.57 |
| **Arctic** | light | Cool blue-white, steel-blue signal | 14.81 | 7.03 | 5.94 | 4.55 | 13.89 |

*(Danger/success/warning text tiers pass on all 12 — range 4.76–14.13; full matrix is reproducible via `auditAllThemes()`.)*

**Pairs adjusted to pass (honest list):** Nord's canonical aurora red `#bf616a` measures 4.33:1 on its void — its text tier and ANSI red brightened to `#d68a92`/`#d2757e`. Solarized's canonical chromatics fail AA on base03 (red 4.3, green 3.9, yellow 3.4, magenta 3.6) — the ANSI and status text tiers brightened (`#e25c5a`, `#a3b83a`, `#d3a92c`, `#db5a99`) and the blue-solid ink deepened to `#032032` (4.54). Paper/Arctic bright-green/blue/cyan ANSI and Paper's bright-black tuned to the floor. Helm Light's ANSI 7/15 are the intentional "light greys" (§5 polarity note above). Everything else is canonical.

**User themes.** `validateTheme(input)` (registry) is the Wave-2 settings gate: shape + id (slug, no collision with shipped ids), color formats (hex/rgb/hsl/`var()`), optional explicit `terminal` palette (else `deriveTerminalTheme()` maps the token overrides onto the same-kind base — `src/lib/terminal-theme.ts`), then the AA floor on the core reading pairs (primary + secondary on base, terminal fg, accent ink). It returns every error at once, never throws. User themes live in settings JSON and are exportable; the gallery + live preview land in Wave 2 (U4).

---

## 14. Verification

- **Contrast:** every pair in §4–§5 gated against WCAG AA via an sRGB contrast script; measured ratios quoted. Body/readable text clears AA on its surface; the one Linear tier that fails (`#52565c` faint, 2.70:1) is **not shipped**. ✅
- **Retone AA highlights (measured):** primary 13.64 · secondary 9.04 · body-prose 5.5 (on modal) · muted 4.68 · placeholder 5.01 · accent-text 8.20 · focus-ring 3.6–4.2 (UI 3:1) · primary-ink-on-indigo 4.54 · claude 9.66 · codex 11.78 · all 14 non-dim ANSI ≥5.19 on the void. ✅
- **v3.1 pairs (measured, both themes):** selection 11.06 dark / 14.16 light · status-surface + text 5.54–8.29 dark (over panel/void), 4.51–5.43 light · badge 4.54 dark / 4.55 light · kbd 7.74 dark / 5.33 light · focus ring 3.86–4.24 dark, 4.24–4.62 light (UI 3:1 non-text). ✅
- **v4 pairs (measured, registry gate §13.5):** all 12 shipped themes pass the 35-pair audit — text ladder 5.07–16.45 · accent text 5.94–12.06 · accent ink 4.54–7.39 · status text 4.76–14.13 · seat text 8.20–12.48 dark / 5.07–6.57 light · seat chips 6.65–9.59 dark / 4.59–5.68 light · glass text 8.51 dark / 6.40 light · every non-dim ANSI ≥4.5 per theme (canonical-palette adjustments listed in §13.5). ✅
- **v4 additive guarantee:** no v3.1 token was renamed or re-valued; the only edits to existing blocks are selector *extensions* (`[data-theme="light"]` → `, [data-theme-kind="light"]`) — same rules, wider trigger. ✅
- **Ongoing:** build against this file, then run deterministic overflow/console/contrast checks and visual review at the desktop reference (1440×900), an intermediate desktop width (1200), and the configured Tauri minimum (940×600). Widths below 940px are outside the supported desktop window contract. Both themes ship — test every surface in dark AND light, and at both densities once components bind the §12.2 tokens. Keep this contract synced with `src/styles/tokens.css`.
