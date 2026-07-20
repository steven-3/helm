# Helm Design System v5: Linear Dark

**Status:** authoritative visual source of truth for Helm.

**Surface classification:** PRODUCT. Helm is a dense desktop developer tool, so the quiet product tier governs every screen.

> v5, **Linear Dark**, fully supersedes v4, **Helm Deck**. v4's glass-first transient surfaces, visible border-light elevation, chrome gradients, and decorative depth are retired. v5 keeps the stable token contract, terminal void, typography, density system, focus treatment, motion gate, accessibility floor, theme engine, and seat identity model, then re-composes them as a flatter, sharper, border-led work surface. Components consume semantic tokens only. Raw color values belong in the token source or the terminal-theme exception, never in component CSS.

---

## 1. Product brief

Helm is an agent-cockpit desktop app built with Tauri, React, and xterm.js. It is an all-day professional instrument around a terminal, not a consumer dashboard and not a marketing surface.

- **Primary job:** keep terminals, files, agents, tasks, and attention signals readable at a glance.
- **Emotional goal:** focused control.
- **Character:** calm, exact, dense, fast.
- **Reference posture:** Linear's dark product surfaces: flat graphite planes, strong type hierarchy, precise seams, scarce indigo, and minimal ornament.
- **Hero surface:** the terminal. Chrome frames it and recedes.
- **Reference viewport:** 1440 × 900. Supported desktop minimum: 940 × 600.

---

## 2. Principles

Each principle may veto a visual decision.

1. **Legibility over atmosphere.** Text and data must remain readable through long sessions. No blur, transparency, texture, or glow may sit behind working content.
2. **The terminal is the deepest plane.** The terminal well stays `#08090a` in Helm Void. Surrounding chrome is lighter, never louder.
3. **Flat planes before elevation.** Structure comes from surface steps and shared seams. Shadows exist only where a surface is physically above another surface.
4. **Color is operational.** Indigo marks Helm focus and primary action. Seat hues identify ownership. Status hues report state. No hue is decorative.
5. **Density with hierarchy.** Compact does not mean cramped. Group spacing, typography, and alignment do more work than boxes.
6. **Instant frequent work.** Keyboard-driven and repeated interactions do not animate.
7. **One system at every scale.** Fleet, board, settings, Stage, terminal chrome, menus, and drawers use the same surface, radius, focus, and state grammar.

---

## 3. Visual language

### 3.1 Core idiom: ruled workspace

Helm reads as one continuous ruled workspace:

- solid graphite planes;
- hard shared seams;
- square embedded regions;
- compact controls with small radii;
- no persistent gradients;
- no persistent blur;
- no decorative glow;
- no diffuse card shadows;
- one deep terminal void framed by quieter chrome.

### 3.2 Signature element: Seat Edge

The named signature element is the **Seat Edge**: a narrow, square-ended identity rule attached to the left or top edge of an owned surface.

- **3px** on cards, fleet/session rows, and selected roster rows;
- **2px** on tabs and very small terminal affordances;
- always paired with a seat glyph or seat word nearby;
- never used as a generic divider;
- never used to encode run state;
- never turned into a glow.

The Seat Edge makes a cropped Helm surface recognizable without converting the interface into a rainbow.

### 3.3 Material ruling

- Persistent chrome is opaque and matte.
- Cards are opaque and border-led.
- Menus and popovers are opaque floating plates.
- Drawers are opaque anchored sheets.
- Modals are opaque plates over a scrim.
- Glass token names remain for compatibility, but resolve to the matte floating recipe in v5.
- Backdrop blur is not part of Linear Dark.

---

## 4. Helm Void palette

Helm Void is the only shipped theme whose palette is re-toned by v5. All non-Helm-Void theme override values remain unchanged.

### 4.1 Neutral ramp

| Token | Value | Role |
|---|---:|---|
| `--n-1` | `#08090a` | terminal and deepest void |
| `--n-2` | `#151617` | persistent chrome |
| `--n-3` | `#191a1b` | raised/card plane |
| `--n-4` | `#202223` | hover plane |
| `--n-5` | `#262829` | active, selected, input fill |
| `--n-6` | `#242628` | subtle seam and compact chip |
| `--n-7` | `#303234` | default card/control border |
| `--n-8` | `#404346` | strong boundary and scrollbar |
| `--n-9` | `#666b73` | disabled marks only |
| `--n-10` | `#7d838c` | terminal/meta muted tier |
| `--n-11` | `#abb1ba` | readable secondary text floor |
| `--n-12` | `#e5e8ed` | primary text |

Additional text roles:

- `--slate-name: #d0d5dd` for names and titles;
- `--slate-body: #90969f` for prose at 14px or larger;
- `--slate-place: #8d939c` for placeholders on active inputs.

### 4.2 Positional primitives

| Token | Value | Role |
|---|---:|---|
| `--void` | `#08090a` | terminal well |
| `--chrome` | `#151617` | persistent chrome |
| `--chrome-hi` | `#151617` | compatibility alias, no gradient lift |
| `--sheet` | `#101112` | recessed toolbars and content wells |
| `--panel-float` | `#18191a` | menus, popovers, modals |
| `--ring` | `#0d0e0f` | outer groove/ring |
| `--hair-panel` | `#383b3e` | floating plate border |
| `--hair-zone` | `#292b2d` | major zone seam |
| `--hair-top` | `#242628` | top seam |
| `--hair-control` | `#747982` | editable control boundary |

`--light-edge` and `--light-edge-strong` are transparent in Helm Void. They remain named for theme compatibility.

### 4.3 Helm accent

Indigo remains Helm's system color.

| Role | Value |
|---|---:|
| solid/focus/primary | `#5E6AD2` |
| hover | `#6E7AE0` |
| text/link | `#aab0ff` |
| subtle | `#20254b` |
| ink on solid | `#fafbff` |

Use it for focus, the rare primary action, active selection, links, and Helm-owned information. It must remain under roughly ten percent of a view.

### 4.4 Status

The v4 status families remain semantically intact:

- success: green;
- danger: red;
- warning/attention: amber;
- info: Helm indigo;
- idle: neutral.

A status always includes a word or icon. Status color never substitutes for a label.

---

## 5. Seat identity

Seat hues are operational wayfinding, not ambient decoration.

| Seat | Solid | Text | Subtle | Border |
|---|---:|---:|---:|---:|
| Claude | `#5E6AD2` | `#9aa0ee` | `#1b1f38` | `#3d4488` |
| GPT | `#62c5b9` | `#81d6cb` | `#10312d` | `#1a4e48` |
| Kimi | `#d99a3d` | `#f0bd6e` | `#2c2010` | `#54401c` |
| Sonnet | `#a878e8` | `#c79bf0` | `#241534` | `#4a2e70` |

The four custom slots and legacy Claude/Codex aliases remain available and keep their established hue families.

Rules:

1. Identity is Seat Edge or dot plus glyph plus seat word where space permits.
2. Identity and run state are separate indicators.
3. Large filled seat-color surfaces are forbidden.
4. Seat subtle fills are limited to compact identity chips and glyph tiles.
5. Default card and panel backgrounds remain neutral.
6. Theme-specific light text/subtle/border remaps remain unchanged.

---

## 6. Terminal

The terminal is sacred working content.

- Helm Void terminal background remains `#08090a`.
- Default terminal foreground and ANSI palette remain the established v4 Helm Void set.
- Cursor remains indigo.
- Terminal selection stays neutral and low-noise.
- The terminal uses JetBrains Mono by default; selectable terminal fonts remain supported.
- Terminal cells never receive blur, gradients, card radius, or drop shadow.
- Pane toolbars may sit on `--surface-sheet`; the xterm canvas itself stays on `--surface-base`.
- Split separators are one-pixel seams inside larger pointer hit areas.

The xterm palette is the sanctioned raw-color exception because canvas rendering cannot consume CSS variables.

---

## 7. Typography

### 7.1 Families

- `--font-sans`: Inter for product chrome, controls, labels, navigation, dialogs, and prose.
- `--font-mono`: JetBrains Mono for terminal text, code, paths, model IDs, branch names, timestamps, and tabular data.

Inter is a deliberate product-font choice, not an unconsidered default. Mono is a data signal, not the interface's personality.

### 7.2 Scale

The existing type token names remain stable:

- nano 9px: numeric badges and data-viz axes only;
- caps 10px: tracked section labels only;
- micro 11px: status and compact metadata;
- caption 12px: dense rows and secondary labels;
- small 13px: default controls and UI copy;
- base 14px: comfortable copy and terminal default;
- medium 16px: sustained prose and dialog copy;
- large 20px, xl 24px, 2xl 32px, display 44px: sparse headings only.

Use at most four sizes and two weights in one surface. Values lead; labels support.

---

## 8. Spacing, density, and target sizes

- Structural grid: 4px, with 1px, 2px, and 6px hairline/density steps.
- Stable spacing tokens: `1, 2, 4, 6, 8, 12, 16, 20, 24, 32, 48, 64`.
- Group gap is generally twice the internal element gap.
- Cozy and compact density modes remain orthogonal to theme.
- Type sizes never shrink in compact density.
- Desktop controls retain the existing compact pointer model. Critical, destructive, and primary controls use the larger target where space permits.
- No component invents a second spacing scale when a token exists.

---

## 9. Radius and geometry

Linear Dark uses small role-based radii:

| Token | Value | Role |
|---|---:|---|
| `--radius-xs` | 2px | tiny icon controls and keycaps |
| `--radius-chip` | 3px | chips and compact labels |
| `--radius-control` | 4px | buttons, fields, rows |
| `--radius-panel` | 6px | cards and grouped controls |
| `--radius-floating` | 8px | menus and modals |
| `--radius-shell` | 8px | Windows 11 window bezel |
| `--radius-pill` | 9999px | true pills, dots, toggles only |

Rules:

- Embedded zones remain square and inherit only the outer shell clip.
- Tabs are rectangular segments, not pills.
- Sidebars and Stage are square while docked.
- Full-height edge drawers have no radius on the anchored edge.
- Nested radii must remain concentric.
- Do not round a container merely because it contains content.

---

## 10. Surface and depth contract

### 10.1 Roles

| Role | Recipe | Examples |
|---|---|---|
| Void | `--surface-base` | terminal, deepest workspace |
| Chrome | `--surface-panel` | titlebar, rail, sidebar, Stage, status bar |
| Recessed | `--surface-sheet` | tabbar, pane toolbar, code/data wells |
| Raised | `--surface-raised` + 1px ring | cards and standalone settings groups |
| Floating | `--surface-overlay` + border + tight shadow | menus, popovers, palettes |
| Modal | floating recipe over `--scrim` | settings, cheatsheet, lightbox chrome |
| Editable | `--surface-active` + `--border-control` | fields, dropdown triggers, search |

### 10.2 Shadow rules

- T0 embedded: no shadow.
- T1 raised: one border/ring, no drop shadow.
- T2 floating: border plus one tight ambient shadow.
- T3 modal: border plus a slightly deeper tight shadow.
- Diffuse ambient card shadows are forbidden.
- Top-light inset highlights are transparent in Helm Void.
- `--glow-chrome` resolves to the flat panel color.
- `--glow-plate` resolves to the flat overlay color.
- Glass compatibility tokens resolve to the opaque floating plate.

### 10.3 Seam rules

- Major zones use `--border-zone`.
- Panel-to-terminal boundaries use `--border-subtle` or `--border-zone`, never both.
- Adjacent list rows generally use hover fill, not a box around every row.
- Long lists do not place top and bottom borders on every item.
- Wrappers never repeat a child's border, radius, and shadow.

---

## 11. Component idioms and states

Every touched component ships default, hover, focus-visible, active, disabled, loading, error, and empty behavior where those states apply.

### 11.1 Controls

- Neutral button: active neutral fill, default border, primary text.
- Primary button: solid indigo with near-white ink; rare.
- Danger: danger text and border at rest; tinted danger surface on hover/armed confirmation.
- Focus: a real 2px outline using `--focus-ring`; never a box-shadow ring.
- Active/press: immediate feedback only on explicitly pressable, low-frequency actions.
- Disabled: reduced emphasis, no hover response, correct cursor.
- Loading: layout-shaped skeleton or in-control progress, not a generic page spinner.

### 11.2 Navigation and rows

- Rail active state: neutral fill plus a square 3px indigo marker.
- Selected roster row: neutral active fill plus a square 3px Seat Edge.
- Tab active state: direct continuity with the terminal plus a 2px top Seat Edge.
- Tree/list row: transparent at rest, neutral hover, active fill when selected.
- Hover-revealed actions must remain reachable through focus and touch/click parity.

### 11.3 Cards and data surfaces

- Cards use a neutral raised fill and one border/ring.
- Card identity uses a Seat Edge, never a full seat-color background.
- Data wells recess to `--surface-sheet` or `--surface-base`.
- Numeric columns use mono, tabular numerals, and right alignment.
- Empty states are quiet, specific, and use existing iconography.
- Error states stay inline and recoverable.

### 11.4 Overlays

- Dropdowns, menus, palettes, and context menus are opaque `--surface-overlay` plates.
- Menus use small row radii and a clear active row.
- Drawers are anchored sheets with one separating seam.
- The command palette opens instantly because it is keyboard-initiated.
- No overlay uses backdrop blur in Linear Dark.

---

## 12. Motion and accessibility

### 12.1 Motion

The existing motion token names and Motion presets remain.

- No animation: tab switch, pane focus, palette open, roster update, keyboard navigation.
- Minimal color transitions: hover and reversible control feedback.
- Standard occasional motion: drawers, modals, toasts, Stage card arrival.
- The running-agent opacity pulse remains the only ambient animation.
- Never use `transition: all`.
- Never use `ease-in`.
- Never enter from `scale(0)`.
- Never animate layout dimensions for UI motion.
- Reduced motion removes transform travel and pulse, while preserving useful opacity/color feedback.

### 12.2 Accessibility

- Readable text meets WCAG AA on its intended surface.
- Focus-visible is always an outline.
- Color never carries identity or status alone.
- Placeholder text remains readable on the input fill.
- Disabled color is not used for readable informational copy.
- Interactive icons have labels or accessible names.
- Overflow is contained at 940 × 600 and above.
- The terminal owns its canvas focus and selection behavior.

---

## 13. Theme engine and compatibility

The theme model remains `{ id, name, kind, tokens, terminal, blurb }`.

- Theme and density remain independent axes.
- `data-theme-kind` continues to drive dark/light semantic behavior.
- All existing semantic token names remain stable.
- Helm Void receives the v5 palette and material behavior.
- All non-Helm-Void shipped theme override values remain unchanged.
- Light-theme token values remain unchanged.
- CSS material rules become flatter across the product, while each theme retains its declared colors.
- Unknown theme IDs still fall back to Helm Void.
- The registry contrast audit remains authoritative.

### 13.1 v4 features explicitly superseded

The following v4 decisions no longer govern Helm Void:

- translucent glass menus and palettes;
- backdrop blur and saturation;
- persistent chrome gradients;
- visible top-light border highlights;
- drop shadows on raised cards;
- broad panel glow recipes;
- 8/10px inner-panel rounding as a default visual signature.

Compatibility token names remain so components and user themes do not break.

### 13.2 Deliberate v4 keeps

The following v4 decisions remain load-bearing:

- the `#08090a` terminal well;
- Inter for UI and JetBrains Mono for data/terminal;
- semantic-token-only component CSS;
- the theme registry and contrast audit;
- seat identity families and `[data-seat]` bindings;
- identity separate from run state;
- focus, selection, density, status-surface, badge, and keycap semantics;
- the motion frequency gate and reduced-motion behavior;
- shell clipping and the 8px Windows 11 outer radius;
- the terminal ANSI palette and user-selectable terminal fonts.

---

## 14. Verification contract

Before shipping a Linear Dark change:

1. Confirm no component raw hex was introduced.
2. Confirm no pure black was introduced.
3. Confirm no persistent gradient, blur, or decorative glow remains in the Helm Void core shell.
4. Confirm Seat Edge use is restrained and paired with glyph/text identity.
5. Confirm focus-visible, disabled, loading, error, and empty states remain designed.
6. Confirm no `transition: all`, `ease-in`, or `scale(0)` exists in touched UI.
7. Run TypeScript and production build once after the complete batch.
8. Keep this document, `src/styles/tokens.css`, `src/lib/themes/index.ts`, and the architecture design pointer synchronized.
