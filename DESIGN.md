# helm — DESIGN.md

**The single source of truth for helm's visual system.** Every screen, component, and color in helm resolves to a token defined here. Components consume the **semantic tier only** — never a raw hex, never a primitive. To reskin or re-tone helm, edit a value here; nothing downstream is hand-authored.

> Derived via the `design-foundation` method (discovery → principles → language → OKLCH palette → tokens → mockup). Every text/surface pair below was gated against **WCAG AA** with a real OKLCH→sRGB contrast script (not eyeballed); measured ratios are quoted inline. Dark-first; a light theme, if ever needed, is a semantic re-map over the same primitives (§10) — not a rewrite.

---

## 1. Product brief

helm is a custom **agent-cockpit desktop app** (Tauri v2 / WebView2) — an IDE-lite shell around a terminal, the daily driver for AI-assisted development on Windows + WSL. One expert user, all day, very long sessions. It exists because Warp feels like a **bottleneck**; helm must feel **fast, light, precise** — a professional instrument, not a consumer app. The UI is dense and information-rich: terminal, file tree, agent roster, status bar, and a right-hand widget "Stage" on screen at once.

- **Emotional goal (one):** *Focused control.* Calm-but-alert. Aaker dimension: **Competence**, with a note of **Sophistication** (dark, restrained, mono-forward).
- **Domain:** developer tool / command center. Inherits terminal + IDE conventions (Jakob's Law); spends its novelty budget on ONE signature, not on reinventing chrome.
- **Density:** every surface is a high-density work surface. There is **no** low-density marketing screen — which decides the glass-vs-matte question globally (§3).

---

## 2. Principles (each can veto a concrete choice)

1. **Legibility over ambiance.** Dense small text is everywhere (roster rows, tree, status bar, terminal). Any effect that costs a caption's contrast is rejected. → *vetoes glass-on-content, low-contrast tricks, anything behind text.*
2. **The terminal is the hero; chrome recedes.** Chrome must never out-shout terminal content. → *vetoes loud accent chrome, borders-everywhere, decorative color; enforces 60-30-10 with chrome as the 90% neutral.*
3. **Color is signal, not decoration.** Hue is spent only on function: agent identity, run/error state, the one primary action. → *keeps ≤3 hues per view; makes Claude/Codex color-coding legible precisely because color is scarce elsewhere.*
4. **Light and fast over rich and heavy.** The anti-Warp principle. No GPU-hungry effect competes with the terminal; motion is gated hard (keyboard-driven → mostly none). → *vetoes shadergradient / r3f / liquid-glass; enforces the motion frequency gate.*
5. **Density with air over cramped or sparse.** High information density is the point, structured by spacing + Gestalt grouping, not boxes-in-boxes. → *vetoes over-bordering; separates zones with tonal surfaces + whitespace.*

---

## 3. Design language + effect-gate ruling

**Language: Matte / flat-dark "command center."** The method names this exact fit — "dashboards, dev tools, monitoring, long low-fatigue sessions … the direct fix for *too dark / bleeds and breaks*." Depth comes from **lightening surfaces (tonal elevation)**, reinforced by **hairline borders**, never from heavy shadow or translucency.

**Glass-vs-matte ruling — global matte.** Every helm surface is dense → **solid, opaque surfaces everywhere.** Glass is forbidden on content by construction.

**Effect-gate verdict (honest).** helm is dense + dark + long-session + GPU-contended (xterm WebGL + local AI work). Every catalog effect is **vetoed for content surfaces**:
- `shadergradient` / aurora — background-only, low-density-only; helm has no such surface; burns GPU the terminal needs. **No.**
- `react-three-fiber` — heavy dep for zero product need. **No.**
- `liquid-glass-js` / glassmorphism — density gate forbids glass on text; raising opacity until text reads just reinvents a worse card. **No.**

**The signature is structural, not decorative:** a **mono-forward "engineered instrument" identity** (wordmark + labels + data in monospace), the **live color-coded agent-accent system** (§9), and **hairline-precise tonal panels**. The only sanctioned "effect" is elevation done well. *(One optional, opt-in, backlog flourish: a near-invisible static top-edge accent glow on the titlebar — gated, off by default. Not in v1.)*

---

## 4. Palette (OKLCH-authored, hex fallback, AA-gated)

Cool-neutral greys (hue 257) carry ~90% of the UI. One **helm accent** (azure) is the system's own color. Two **agent-identity** hues (Claude warm-orange, Codex teal) are strictly functional. Four status hues appear only on state.

### 4.1 Neutrals — 12-step, dark (hue 257)
| Step | Hex | OKLCH | Role |
|---|---|---|---|
| n1 | `#0c0f12` | `0.165 0.009 257` | app base · **terminal bg** |
| n2 | `#13161b` | `0.200 0.010 257` | panel (sidebar, status bar, tab bar) |
| n3 | `#1c2026` | `0.243 0.012 257` | raised (cards, inputs, roster rows) |
| n4 | `#24282e` | `0.275 0.013 257` | hover · overlay base |
| n5 | `#2b2f36` | `0.305 0.014 257` | active / selected |
| n6 | `#343a41` | `0.345 0.015 257` | subtle border / separator |
| n7 | `#424850` | `0.400 0.016 257` | default border |
| n8 | `#5b626b` | `0.492 0.017 257` | strong border · control boundary (3.12:1) |
| n9 | `#6f757e` | `0.560 0.016 257` | idle dot · disabled control fg · **never readable/informational text** |
| n10 | `#7e848c` | `0.610 0.015 257` | placeholder · muted terminal chrome (5.09:1 on n1) |
| n11 | `#acb2b9` | `0.760 0.013 257` | **secondary text** (8.99:1 on n1) |
| n12 | `#eceef1` | `0.948 0.005 257` | **primary text** (16.53:1 on n1) |

### 4.2 helm accent — azure (hue 245) · the system's own color
`solid #0082ce` · `hover #2b94df` · `text/link #6bb9f8` (9.08:1 on n1) · `focus #168dd9` (ring, 5.35:1) · `subtle-bg #05304e` · `border #014069`
Reserved for: primary action, focus ring, active selection, links, info. **Primary solid button = `solid` bg + `n1` ink (4.65:1).**

### 4.3 Agent identity (functional — always paired with an icon + label)
| Agent | solid (dot/chip) | text (label) | subtle (row tint) | border | contrast (label on n1) |
|---|---|---|---|---|---|
| **Claude** | `#df8352` | `#f1a278` | `#4e2b18` | `#6a391e` | 9.32:1 · hue 48 warm-orange |
| **Codex** | `#62c5b9` | `#81d6cb` | `#153d38` | `#18524c` | 11.36:1 · hue 185 teal |
| *generic/unknown* | `#6f757e` (n9) | `#acb2b9` (n11) | — | n7 | grey |

Orange↔teal is warm/cool + far in hue → distinguishable under deuteranopia/protanopia. Because Claude-orange (48°) sits near danger-red (25°), **agent identity and error state are never encoded by color alone** — the roster pairs every dot with a distinct **glyph** (Claude vs Codex mark) and a **text label that names the agent** (`claude`/`codex` — the identity word itself, not merely the model or task name). **Identity (dot + glyph + agent word) is kept visually separate from run state (§4.4)** — two clusters, not one blurred badge. Future agents (e.g. Gemini) get a reserved hue, not a recolor of these.

### 4.4 Status (state only — never ambient)
| Role | solid | text | subtle | note |
|---|---|---|---|---|
| success/done | `#45b164` | `#7ccd8e` (10.05:1) | `#193b22` | hue 150 |
| danger/error | `#d94543` | `#f47b74` (7.26:1) | `#581b1a` | hue 25 · **default danger button = subtle bg + text** (soft) |
| warning/attention | `#e9af41` | `#f4c26a` (11.69:1) | `#45310b` | hue 80 |
| info | = accent azure | `#6bb9f8` | `#05304e` | reuse helm accent |
| idle | `#6f757e` (n9) | — | — | steady grey dot |

**Run/idle/error/attention semantics:** *running* = the agent's own color + a slow pulse (§8); *idle* = grey n9 (steady); *error* = danger red; *done* = success green; *attention/needs-input* = warning amber + pulse. Always with an icon.

---

## 5. Terminal ANSI palette (reads as one system with the chrome)

Terminal background = `n1 #0c0f12`, foreground = `n12 #eceef1`. The 16 ANSI colors are tuned for legibility on n1 and drawn from the same hues as the chrome (ANSI blue ≈ helm accent, ANSI cyan ≈ Codex teal) so the terminal never looks like a bolted-on theme. Contrast on n1 quoted.

| # | Name | Hex | : n1 | | # | Name | Hex | : n1 |
|---|---|---|---|---|---|---|---|---|
| 0 | black | `#424850` | 2.08 dim | | 8 | br-black | `#5b626b` | 3.12 |
| 1 | red | `#df504d` | 4.93 | | 9 | br-red | `#f26a64` | 6.43 |
| 2 | green | `#4eb068` | 7.08 | | 10 | br-green | `#68ca80` | 9.47 |
| 3 | yellow | `#dca744` | 8.84 | | 11 | br-yellow | `#eec469` | 11.66 |
| 4 | blue | `#3093db` | 5.79 | | 12 | br-blue | `#5db2f7` | 8.40 |
| 5 | magenta | `#bc6ece` | 5.73 | | 13 | br-magenta | `#d78de8` | 8.11 |
| 6 | cyan | `#55bfb3` | 8.68 | | 14 | br-cyan | `#7cd7cc` | 11.39 |
| 7 | white | `#acb2b9` | 8.99 | | 15 | br-white | `#eceef1` | 16.53 |

*(ANSI 0/8 are dim-by-spec — for dim text/backgrounds, not for body legibility.)* Cursor = `#6bb9f8` (accent text). Selection bg = `#2b2f36` (n5). "Bold as bright" on.

---

## 6. Type

**Fonts — mono-forward, deliberately not Inter/Roboto/Geist/Space Grotesk:**
- `--font-mono` = **"IBM Plex Mono"**, "JetBrains Mono", ui-monospace, "Cascadia Code", Menlo, Consolas, monospace → terminal, code, data, labels, roster, tree, status bar, **wordmark**.
- `--font-sans` = **"IBM Plex Sans"**, ui-sans-serif, system-ui, "Segoe UI", sans-serif → prose, settings, dialogs, longer reading text.

Same superfamily = cohesion; "engineered instrument" semantics fit a technical cockpit; mono-forward *is* the terminal-native identity and the differentiator from generic SaaS.

**Scale** (dense, ratio ~1.2; `font-feature-settings: "tnum" 1` on all numeric/data):
| Token | px / line-height | Use |
|---|---|---|
| `text-nano` | 9 / 1.25 | **data-viz axis labels + compact numeric badges ONLY** — never prose/UI copy; must pair with ≥ `--text-secondary` color |
| `text-micro` | 11 / 1.35 | status bar, badges, tiny meta (mono, tabular) |
| `text-caption` | 12 / 1.4 | roster rows, file tree, secondary labels |
| `text-sm` | 13 / 1.45 | **default dense UI / controls** |
| `text-base` | 14 / 1.5 | terminal default, comfortable body |
| `text-md` | 16 / 1.55 | settings / dialog / prose body (reading floor) |
| `text-lg` | 20 / 1.4 | panel headers, section titles |
| `text-xl` | 24 / 1.3 | sparse headings |
| `text-2xl` | 32 / 1.2 | empty states |
| `text-display` | 44 / 1.1 | welcome / empty-terminal hero, wordmark moments |

**Weights:** mono 400 / 500 / 600; sans 400 / 500 / 600; **300** reserved for large display numerals (extreme-weight contrast lives at the big sizes, where the cockpit has room — dense chrome stays 400–600).

**Density carve-out (honest):** 11–13px is used **only** for dense chrome (roster/tree/status/data) — the method's "≥14px for genuinely dense data tables only" exception. All of it clears AA with large margins (§4). Reading surfaces (settings, dialogs, docs, prose) use **≥16px**. The lone sub-11px value, `text-nano` (9px), is quarantined to data-viz axis labels + numeric badges — never UI copy — and must use a `--text-secondary`-or-better foreground so it still clears AA.

---

## 7. Spacing · radius · elevation

**Spacing** — 4px grid (+2/6 for hairline density): `0, 1(px), 2, 4, 6, 8, 12, 16, 20, 24, 32, 48, 64`. One scale everywhere; no off-grid one-offs.

**Radius** — crisp/technical, small: `xs 3 · sm 5 · md 7 · lg 10 · xl 14 · pill 9999`. Controls 5, panels/cards 7–10, chips 5/pill. Squared-leaning = stable/precise.

**Elevation** — dark tonal ladder (luminance primary; shadow is *secondary* reinforcement per method §8):
| Level | Surface | Border | Shadow | Use |
|---|---|---|---|---|
| e0 | n1 | — | none | app base, terminal well |
| e1 | n2 | n6 | none | sidebar, status bar, tab bar |
| e2 | n3 | n6→n7 | none | cards, inputs, roster rows |
| e3 | n4 | n7 | `0 4px 12px -2px rgba(0,0,0,.40)` | dropdowns, tooltips, popovers |
| e4 | n4/n5 | n7 | `0 12px 32px -4px rgba(0,0,0,.55)` | modals, command palette |

Modal scrim: `rgba(6,8,11,.60)` (+ optional cheap 2px blur). Adjacent panels must have **distinguishable edges** (tonal step ≥ one level, or a hairline) before shipping — the anti-bleed canary.

---

## 8. Motion (Emil defaults, grafted; frequency-gated HARD)

```css
--ease-out:    cubic-bezier(0.23, 1, 0.32, 1);    /* enter/exit */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);   /* on-screen A→B */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);    /* sheets */
--dur-fast: 120ms;  --dur-2: 180ms;  --dur-3: 220ms;  --dur-4: 280ms;
```
**Frequency gate first (helm is keyboard-driven, high-frequency):**
- **No animation / instant:** tab switch, pane focus, palette open, roster updates, keyboard actions. (Raycast ships zero palette animation on purpose — match that.)
- **Standard motion (occasional):** Stage widget arrival (`opacity 0→1` + `scale .97→1`, `--dur-2 --ease-out`), toasts, modal/drawer (`--dur-4`).
- **The one ambient motion:** running-agent pulse (`opacity 1↔.55`, ~1.6s `--ease-in-out`). Nothing else pulses.

Rules: animate **only** `transform`/`opacity`, never `transition: all`. Press feedback `:active{transform:scale(.97)}` on primary buttons only (not high-frequency chrome). **Focus = `outline`** (accent `#168dd9`, 2px, 1–2px offset) — never a box-shadow ring (WCAG C40). `prefers-reduced-motion`: drop transforms + the pulse, keep opacity fades.

---

## 9. Token contract (copy-paste; components consume the semantic tier ONLY)

Dark-first. Primitives → semantic. A component writes `var(--surface-panel)` / `var(--text-primary)` — never `#13161b`, never `--n-2`.

```css
:root {
  /* ── TIER 1 · PRIMITIVES (raw ramps — never used directly in components) ── */
  --n-1:#0c0f12; --n-2:#13161b; --n-3:#1c2026; --n-4:#24282e; --n-5:#2b2f36; --n-6:#343a41;
  --n-7:#424850; --n-8:#5b626b; --n-9:#6f757e; --n-10:#7e848c; --n-11:#acb2b9; --n-12:#eceef1;
  --blue-solid:#0082ce; --blue-hover:#2b94df; --blue-text:#6bb9f8; --blue-focus:#168dd9; --blue-subtle:#05304e; --blue-border:#014069;
  --claude-solid:#df8352; --claude-text:#f1a278; --claude-subtle:#4e2b18; --claude-border:#6a391e;
  --codex-solid:#62c5b9;  --codex-text:#81d6cb;  --codex-subtle:#153d38;  --codex-border:#18524c;
  --red-solid:#d94543; --red-text:#f47b74; --red-subtle:#581b1a; --red-border:#7f2021;
  --green-solid:#45b164; --green-text:#7ccd8e; --green-subtle:#193b22;
  --amber-solid:#e9af41; --amber-text:#f4c26a; --amber-subtle:#45310b;

  /* ── TIER 2 · SEMANTIC (roles — the stable contract components bind to) ── */
  --surface-base:#0c0f12;      /* var(--n-1)  app bg + terminal */
  --surface-panel:var(--n-2);  /* sidebars, status bar, tabs */
  --surface-raised:var(--n-3); /* cards, inputs, roster rows */
  --surface-hover:var(--n-4);
  --surface-active:var(--n-5);
  --surface-overlay:var(--n-4);

  --text-primary:var(--n-12);
  --text-secondary:var(--n-11);  /* floor for ALL readable/informational text (idle, meta, hints, counts) */
  --text-disabled:var(--n-9);    /* inactive controls + non-text marks ONLY — never readable text */
  --terminal-muted:var(--n-10);  /* helm-authored terminal chrome (shim echoes, status lines), 5.09:1 on base — NOT ANSI dim (§5 0/8), which programs own */
  --text-on-accent:var(--n-1); /* dark ink on solid accent/status */
  --text-link:var(--blue-text);
  --text-placeholder:var(--n-10); /* input placeholder — §4.1 n10 (5.09:1 on base), NOT --text-disabled */

  --border-subtle:var(--n-6);  /* hairline separators (tonal-reinforcing) */
  --border-default:var(--n-7);
  --border-strong:var(--n-8);  /* control boundaries, 3:1 */
  --border-zone:var(--n-7);    /* major boundary between two SAME-elevation chrome zones (rail↔sidebar) — stronger than --border-subtle so the edge never bleeds */
  --border-focus:var(--blue-focus);

  --accent-solid:var(--blue-solid); --accent-hover:var(--blue-hover);
  --accent-text:var(--blue-text);   --accent-subtle:var(--blue-subtle);

  --action-primary-bg:var(--blue-solid); --action-primary-bg-hover:var(--blue-hover); --action-primary-text:var(--n-1);
  --action-neutral-bg:var(--n-3); --action-neutral-bg-hover:var(--n-4); --action-neutral-text:var(--n-12); --action-neutral-border:var(--n-7);

  --agent-claude:var(--claude-solid); --agent-claude-text:var(--claude-text); --agent-claude-subtle:var(--claude-subtle);
  --agent-codex:var(--codex-solid);   --agent-codex-text:var(--codex-text);   --agent-codex-subtle:var(--codex-subtle);
  --agent-generic:var(--n-9);

  --status-success:var(--green-solid); --status-danger:var(--red-solid); --status-warning:var(--amber-solid);
  --status-info:var(--blue-solid); --status-idle:var(--n-9);
  --status-danger-text:var(--red-text);     --status-danger-subtle:var(--red-subtle);
  --status-success-text:var(--green-text);  --status-success-subtle:var(--green-subtle);
  --status-warning-text:var(--amber-text);  --status-warning-subtle:var(--amber-subtle);
  /* status *-text = word/icon on dark surfaces (AA); *-solid = dots/fills only, NOT text */

  /* type / space / radius / elevation roles */
  --font-mono:"IBM Plex Mono","JetBrains Mono",ui-monospace,"Cascadia Code",Menlo,Consolas,monospace;
  --font-sans:"IBM Plex Sans",ui-sans-serif,system-ui,"Segoe UI",sans-serif;
  /* type scale (px / line-height) — the copy-paste contract is complete, not color-only (§6) */
  --text-nano:9px;      --lh-nano:1.25;   /* data-viz axes + badges ONLY, ≥ --text-secondary color */
  --text-micro:11px;    --lh-micro:1.35;
  --text-caption:12px;  --lh-caption:1.4;
  --text-sm:13px;       --lh-sm:1.45;     /* default dense UI / controls */
  --text-base:14px;     --lh-base:1.5;    /* terminal default (full-width) */
  --text-md:16px;       --lh-md:1.55;     /* reading floor: prose/settings/dialogs */
  --text-lg:20px;       --lh-lg:1.4;
  --text-xl:24px;       --lh-xl:1.3;
  --text-2xl:32px;      --lh-2xl:1.2;
  --text-display:44px;  --lh-display:1.1;
  /* spacing — 4px grid (+1/2/6 for hairline density) */
  --sp-px:1px; --sp-2:2px; --sp-4:4px; --sp-6:6px; --sp-8:8px; --sp-12:12px;
  --sp-16:16px; --sp-20:20px; --sp-24:24px; --sp-32:32px; --sp-48:48px; --sp-64:64px;
  --radius-control:5px; --radius-panel:8px; --radius-chip:5px; --radius-pill:9999px;
  --shadow-e3:0 4px 12px -2px rgba(0,0,0,.40); --shadow-e4:0 12px 32px -4px rgba(0,0,0,.55);
  --scrim:rgba(6,8,11,.60);
}
```
*(Future light theme = a `:root[data-theme="light"]` block re-mapping the SAME semantic names to different primitives — zero component edits. v1 ships dark only.)*

---

## 10. Component recipes (starting points for ui-builder)

- **Neutral button (default):** `--action-neutral-bg`, text `--action-neutral-text`, 1px `--action-neutral-border`, `--radius-control`, min-height 28px (dense) / 32px (comfortable); hover → `--action-neutral-bg-hover`.
- **Primary button (rare):** `--action-primary-bg` + `--action-primary-text` (dark ink), press `scale(.97)`.
- **Danger:** default soft = `--status-danger-subtle` bg + `--status-danger-text` + red border; solid only for hard confirmations.
- **Input:** `--surface-raised` bg, 1px `--border-strong`, focus → `outline` `--border-focus`. Text 13px, ≥16px where iOS-zoom-sensitive (n/a desktop but keep).
- **Roster row:** default **transparent on `--surface-panel`** — *not* always-raised (5 raised cards on a panel reads as card-soup, which §11 bans); hover → `--surface-hover`; selected → `--surface-active` + 2px left accent bar; reserve `--surface-raised` for pinned/grouped rows only. **Sidebar ≥272px** so the agent word + model sublabel never clip (task name ellipsizes, not identity). **Two clusters, kept visually separate:** (1) *identity* = agent color **dot + distinct glyph + the agent word** carried in the sublabel (`claude · opus-4.8`, `codex · gpt-5.6`) — never color alone, and the agent name is present as text, not just the model/task; (2) *state* = its **own** dot/icon **+ state word** (`running`/`idle`/`needs input`/`error`) in a dedicated column that **never truncates** (reserve its width; ellipsize the task name instead). Name/data in `--font-mono` 12px (`tnum`); running/needs-input → pulse (§8); readable sublabels use `--text-secondary` (never `--text-disabled`).
- **Tab:** mono 12px, agent-color underline/dot; active = `--surface-base` (continuous with terminal) + `--text-primary`; inactive = `--surface-panel` + `--text-secondary`.
- **Panel/Stage card:** `--surface-raised`, 1px `--border-subtle`, `--radius-panel`, header mono 12px `--text-secondary` uppercase-tracked.
- **Stage widget (copy/link/img):** e2 card; arrival animates per §8; copy → click feedback; link → accent text + external glyph.
- **Terminal:** bg `--surface-base`, fg `--text-primary`, ANSI §5, cursor `--blue-text`, selection `--n-5`, font `--font-mono` — **14px full-width / single pane; 13px permitted in compact split panes (pane width ≲ 560px); never below 13px.** helm-authored terminal chrome (shim echoes, injected status lines) uses `--terminal-muted`, **not** ANSI dim (0/8) — that's reserved for a program's own genuinely-dim output.

---

## 11. helm-specific do / don't

**Do:** lean on tonal elevation + hairlines for structure; keep hue for function; set data/labels in mono with `tnum`; keep roster **identity (dot + glyph + agent word) separate from run state (dot + state word)**, state text in its own non-truncating column; use `--border-zone` between same-elevation chrome zones (rail↔sidebar); make the running-pulse the only ambient motion; `outline` focus rings; test the density canary (smallest roster/tree/status text legible, adjacent panels distinguishable).
**Don't:** add glass/blur to any content surface; animate tab/pane/palette; use Inter/Roboto/Geist/Space Grotesk; let the accent appear more than ~10% of a view; encode agent or error by color without an icon; **use `--text-disabled`/n9 (or ANSI dim) for any readable text — idle/meta/hint/count text is `--text-secondary` or better**; use `text-nano` (9px) for anything but data-viz axes/badges; use `transition: all` or box-shadow focus rings; use pure `#000` or pure `#fff` for surfaces/text.

---

## 12. Verification

- **Contrast:** every pair in §4–§5 gated against WCAG AA via OKLCH→sRGB script; measured ratios quoted. Saturated accents cross-checked perceptually (desaturated for dark per Helmholtz-Kohlrausch). ✅
- **Mockup gate (pending):** next step — a token-faithful static cockpit mockup (dense work surface, the riskiest screen) built from §9 tokens, graded by a **fresh** `visual-verify` agent against these principles + deterministic gates, **before** wiring the real terminal. Iterate tokens (not code) on the result.
- **Ongoing:** `ui-builder` builds against this file; `visual-verify` (fresh agent, deterministic gates first) checks each surface; this doc stays synced with the tokens.
