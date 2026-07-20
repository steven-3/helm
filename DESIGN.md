# Helm Design System v5: Linear Dark

**Status:** authoritative visual source of truth for Helm.

**Surface classification:** PRODUCT. Helm is a dense desktop developer tool, so the quiet product tier governs every screen.

> v5, **Linear Dark**, fully supersedes v4, **Helm Deck**. The supplied Linear Dark screenshots are ground truth. When a generic design rule conflicts with a pinned screenshot measurement below, the screenshot wins. v5 keeps Helm's terminal void, stable semantic token names, typography pairing, focus model, density axis, motion gate, accessibility floor, theme engine, and seat identity system. It retires glass, persistent gradients, visible border-light effects, distinct sidebar plates, and raised-card decoration that is not spatially justified.

---

## 1. Product brief

Helm is an all-day agent-cockpit desktop app around a terminal. It is a professional work surface, not a consumer dashboard or marketing page.

- **Primary job:** keep terminals, files, agents, tasks, and attention signals readable at a glance.
- **Emotional goal:** focused control.
- **Character:** calm, exact, dense, fast.
- **Reference posture:** Linear's dark product UI: one continuous graphite field, precise hairlines, compact controls, sparse indigo, and strong text hierarchy.
- **Hero:** the terminal.
- **Reference viewport:** 1440 × 900.
- **Supported desktop minimum:** 940 × 600.

---

## 2. Principles

1. **One field, not stacked plates.** App frame, titlebar, rail, sidebar, non-terminal work surfaces, and docked Stage use the same core surface. Columns separate with 1px hairlines only.
2. **The terminal is the exception.** Helm Void's terminal remains `#08090a`, deeper than the shared chrome field.
3. **Legibility over atmosphere.** No blur, translucency, texture, or glow behind working content.
4. **Elevation must be spatially true.** Embedded surfaces have no shadow. A floating Stage card, menu, popover, or modal may use one soft, tight shadow.
5. **Color is operational.** Indigo means Helm focus/action. Seat hues identify ownership. Status hues report state.
6. **Compact, not cramped.** Controls are 26–28px, list rows 28–30px, and typography remains readable.
7. **Frequent work is instant.** Keyboard-driven and repeated interactions do not animate.

---

## 3. Core visual language

### 3.1 Same-surface shell

The dominant screenshot silhouette is a single uninterrupted `#101113` field.

- app frame: `#101113`;
- titlebar: `#101113`;
- activity rail: `#101113`;
- sidebar: `#101113`, with no distinct fill;
- tab and pane chrome: `#101113`;
- docked Stage: `#101113`;
- Fleet, Board, Settings, Agents, and other non-terminal main surfaces: `#101113`;
- separation: 1px hairlines, never alternating panel fills;
- terminal canvas: `#08090a` Helm-specific exception.

The same-surface rule is the primary visual correction from v4. A sidebar must read as a column in the same workspace, not as a raised or differently tinted panel.

### 3.2 Signature element: Seat Edge

The named signature element remains the **Seat Edge**: a narrow square-ended identity rule attached to the edge of a seat-owned item.

- 3px on cards and selected identity rows;
- 2px on tabs and tiny terminal affordances;
- always paired with a seat glyph or word nearby;
- never used as a generic separator;
- never expanded into a full seat-colored card;
- never used to encode run state.

### 3.3 Material ruling

- persistent surfaces are opaque and matte;
- embedded regions are shadowless;
- cards embedded in a page use hairlines only;
- menus and modals are opaque floating plates;
- Stage cards use the explicit floating-card exception in §11;
- compatibility tokens named `glass` or `glow` remain, but resolve to opaque flat material;
- backdrop blur is not part of Linear Dark.

---

## 4. Helm Void palette

Helm Void is the only shipped theme re-toned by v5. All non-Helm-Void theme override maps and terminal palettes keep their existing declared values.

### 4.1 Pinned core colors

| Role | Value | Rule |
|---|---:|---|
| terminal void | `#08090a` | Helm-specific terminal exception |
| app/chrome/sidebar/main | `#101113` | the shared field |
| floating Stage card | `#17181B` | floating-card exception only |
| selected | `#1A1C1F` | current row/tab/control selection |
| hover | `#1C1D21` | reversible pointer feedback |
| primary text | `#E8E9EB` | headings, values, active text |
| secondary text | `#8A8F98` | labels, metadata, explanatory copy |
| Helm accent | `#5E6AD2` | focus, links, rare primary action |

### 4.2 Neutral ramp

| Token | Value | Role |
|---|---:|---|
| `--n-1` | `#08090a` | terminal and deepest void |
| `--n-2` | `#101113` | shared app/chrome/main field |
| `--n-3` | `#17181B` | floating Stage card / raised exception |
| `--n-4` | `#1C1D21` | hover |
| `--n-5` | `#1A1C1F` | selected / active / input fill |
| `--n-6` | `#222328` | subtle hairline and compact chip |
| `--n-7` | `#2A2B31` | default card/control border |
| `--n-8` | `#3A3C43` | strong boundary and scrollbar |
| `--n-9` | `#60646C` | disabled marks only |
| `--n-10` | `#767B83` | terminal/meta muted tier |
| `--n-11` | `#8A8F98` | secondary readable text |
| `--n-12` | `#E8E9EB` | primary text |

Additional roles:

- `--slate-name: #D6D8DC` for names and titles;
- `--slate-body: #8A8F98` for prose;
- `--slate-place: #7F858E` for placeholders.

### 4.3 Positional primitives

| Token | Value | Role |
|---|---:|---|
| `--void` | `#08090a` | terminal |
| `--chrome` | `#101113` | shared shell field |
| `--chrome-hi` | `#101113` | compatibility alias, no gradient |
| `--sheet` | `#101113` | same-surface embedded content |
| `--panel-float` | `#17181B` | floating plates |
| `--ring` | `#0C0D0E` | outer groove |
| `--hair-panel` | `#303238` | floating border |
| `--hair-zone` | `#25262B` | column hairline |
| `--hair-top` | `#222328` | top hairline |
| `--hair-control` | `#686C74` | editable boundary |

Top-light tokens are transparent in Helm Void.

### 4.4 Accent and status

The accent remains:

- solid/focus/primary: `#5E6AD2`;
- hover: `#6E7AE0`;
- readable accent text: `#9AA0EE`;
- subtle accent fill: `#1B1F38`;
- ink on solid accent: `#FAFBFF`.

Status families remain green, red, amber, indigo, and neutral. Status always includes an icon or word.

---

## 5. Seat identity

Seat hue values are retained from v4 so identity remains stable across themes.

| Seat | Solid | Text | Subtle | Border |
|---|---:|---:|---:|---:|
| Claude | `#5E6AD2` | `#9AA0EE` | `#1B1F38` | `#3D4488` |
| GPT | `#62C5B9` | `#81D6CB` | `#10312D` | `#1A4E48` |
| Kimi | `#D99A3D` | `#F0BD6E` | `#2C2010` | `#54401C` |
| Sonnet | `#A878E8` | `#C79BF0` | `#241534` | `#4A2E70` |

Rules:

1. Seat color is an edge, tiny dot, glyph, or compact chip.
2. Default panels and cards remain neutral.
3. Identity and run state are separate indicators.
4. Large seat-color fills and glows are forbidden.
5. Custom slots and light-theme remaps remain intact.

---

## 6. Terminal

- Helm Void background remains `#08090a`.
- Existing ANSI palette, cursor, selection, and selectable terminal fonts remain.
- JetBrains Mono remains the default terminal face.
- Terminal cells never receive blur, gradients, card radius, or drop shadow.
- Pane and tab chrome sit on the same `#101113` shell field.
- Split separators are 1px hairlines inside larger pointer hit areas.
- The xterm palette remains the sanctioned raw-color exception because canvas cannot consume CSS variables.

---

## 7. Typography

### 7.1 Families

- Inter: all product chrome, navigation, controls, headings, labels, cards, and prose.
- JetBrains Mono: terminal, code, paths, versions, IDs, branch names, timestamps, and tabular data.

### 7.2 Scale and hierarchy

- 9px: numeric badges and data-viz axes only;
- 10px: tracked section labels only;
- 11px: version chips and compact metadata;
- 12px: dense rows and secondary labels;
- 13px: default body and control text, including Stage-card body;
- 14px: comfortable prose and terminal default;
- 16px+: sparse headings and dialog copy.

Use at most four sizes and two weights on one surface. Values lead; labels support.

---

## 8. Spacing, density, and target geometry

- structural grid: 4px, with 1px, 2px, and 6px density steps;
- normal controls: 28px;
- compact controls: 26px;
- normal rows: 30px;
- compact rows: 28px;
- switch track: 28 × 16px;
- standard internal horizontal padding: 8–12px;
- group gap is generally twice the internal element gap;
- density mode changes size, never typography or contrast;
- long-session desktop density is intentional. Touch-specific 44px sizing is not applied to the fixed desktop cockpit.

---

## 9. Radius and geometry

| Token | Value | Role |
|---|---:|---|
| `--radius-xs` | 3px | tiny icon controls and keycaps |
| `--radius-chip` | 4px | version/status chips |
| `--radius-control` | 6px | buttons, fields, rows |
| `--radius-panel` | 8px | grouped panels and embedded cards |
| `--radius-floating` | 12px | floating Stage cards, menus, and modals |
| `--radius-shell` | 8px | Windows 11 window bezel |
| `--radius-pill` | 9999px | toggles, dots, true pills only |

Embedded zones remain square and inherit only the outer shell clip. Tabs are rectangular. Docked sidebar and Stage have no independent outer radius.

---

## 10. Surface and depth contract

| Role | Recipe | Examples |
|---|---|---|
| Terminal void | `--surface-base` | xterm canvas |
| Shared field | `--surface-panel` / `--surface-sheet` | shell, titlebar, rail, sidebar, main views, docked Stage |
| Selected | `--surface-active` | selected row, active control |
| Hover | `--surface-hover` | pointer feedback |
| Floating card | `--surface-raised` + hairline + tight shadow | Stage card only |
| Floating plate | `--surface-overlay` + panel hairline + tight shadow | menus, popovers, modals |
| Editable | selected fill + control hairline | inputs, search, dropdown trigger |

Rules:

- embedded and persistent surfaces have no drop shadow;
- same-elevation columns separate with one 1px hairline;
- sidebar has no distinct background;
- T1 generic raised content uses a hairline only;
- the Stage card receives its own spatially justified tight shadow;
- floating overlays use one compact ambient shadow, never a diffuse glow;
- wrapper and child never repeat border, radius, and shadow.

---

## 11. Screenshot-grounded component specifications

### 11.1 Same-surface titlebar

- background exactly matches the app field;
- no gradient, inset highlight, or distinct top plate;
- one 1px bottom hairline;
- 40px structural height remains the Helm window-drag exception;
- wordmark and project/path hierarchy use primary and secondary text only;
- window controls remain rectangular hit regions with 26–28px visual glyph controls.

### 11.2 Sidebar and columns

- rail, sidebar, center chrome, and docked Stage share the same fill;
- rail↔sidebar, sidebar↔center, and center↔Stage use single 1px hairlines;
- no secondary sidebar wash;
- rows are 28–30px with 6px radius;
- selected rows use `#1A1C1F` plus a restrained Seat Edge where ownership matters;
- hover uses `#1C1D21`.

### 11.3 Floating Stage card

The Stage card is Helm's one recurring floating-card exception and must be precise:

- background `#17181B`;
- 12px radius;
- one neutral hairline;
- one soft, tight shadow because the card floats above the same-surface Stage column;
- 12px internal padding;
- header contains a small icon plus card/agent name;
- header metadata/version is an 11px bordered chip, mono when it is a version or source identifier;
- body copy is 13px Inter;
- inline code uses compact JetBrains Mono chips;
- agent/status identity is a tiny glyph or avatar plus text, never a large color block;
- pinned state may add a 2px indigo top rule without adding another shadow.

### 11.4 Stage composer

- composer is inset on `#101113` inside the `#17181B` card;
- 28px overall control height;
- 6px control radius;
- leading/trailing actions use the established icon set when markup provides them;
- send is a compact circular action when an icon is available;
- current text-only Send markup remains a compact 28px control until a separate TSX change supplies the icon;
- focus uses the global outline.

### 11.5 Timeline/comment treatment

- comments and timeline entries sit directly on the card surface, not inside nested cards;
- each row uses a tiny avatar/status glyph, 13px body, secondary timestamp, and a single vertical rhythm;
- event separators are spacing or one hairline, never a border box per comment;
- mono chips identify commits, files, versions, and commands.

### 11.6 DiffCard and git row

- DiffCard retains the Stage floating-card shell;
- its git summary row is compact and same-surface, with file/branch identity in mono;
- additions and deletions use semantic green/red text and quiet row tint only;
- the diff well is inset `#101113`, 8px radius, one hairline, and both-axis scroll;
- a tiny status/avatar glyph may precede the source word;
- no gradient fade or nested floating shadow.

### 11.7 States

Every touched component preserves default, hover, focus-visible, active, disabled, loading, error, and empty behavior where applicable.

- focus: real 2px outline, never shadow ring;
- disabled: reduced emphasis and no hover response;
- loading: layout-shaped skeleton or in-control progress;
- error: inline recoverable treatment;
- empty: specific, quiet copy with existing icons;
- hover-revealed actions remain available through keyboard focus.

---

## 12. Motion and accessibility

### 12.1 Motion

- interaction transitions: 120–160ms;
- color/hover: `ease`;
- occasional enter/exit: `ease-out`;
- on-screen movement: `ease-in-out`;
- keyboard actions, tab switching, pane focus, palette open, and search open are instant;
- running-agent opacity pulse remains the only ambient animation;
- never use `transition: all`, `ease-in`, or `scale(0)`;
- reduced motion drops transform travel and pulse while preserving useful color/opacity feedback.

### 12.2 Accessibility

- primary and secondary text meet WCAG AA on the shared field;
- focus-visible is always an outline;
- color never carries identity or status alone;
- placeholder text remains readable on selected/input fill;
- disabled color is not used for informational copy;
- terminal focus and selection remain canvas-owned;
- no horizontal overflow at supported desktop widths.

---

## 13. Theme engine and compatibility

- Theme model remains `{ id, name, kind, tokens, terminal, blurb }`.
- Theme and density remain independent axes.
- Existing semantic token names remain stable.
- Helm Void receives the v5 palette and material behavior.
- All non-Helm-Void shipped theme override maps and terminal palettes remain unchanged.
- Light-theme declared values remain unchanged.
- Unknown IDs still fall back to Helm Void.
- Registry contrast auditing remains authoritative.

### 13.1 v4 decisions superseded

- translucent glass menus and palettes;
- backdrop blur and saturation;
- chrome gradients;
- distinct sidebar/dock fills;
- visible top-light highlights;
- drop shadows on embedded cards;
- broad glow recipes;
- oversized inner-control rounding.

### 13.2 Deliberate v4 keeps

- terminal well `#08090a`;
- Inter and JetBrains Mono pairing;
- terminal ANSI palette and selectable terminal fonts;
- semantic-token-only component CSS;
- theme registry and contrast audit;
- seat identity families and `[data-seat]` bindings;
- identity separate from state;
- focus, selection, density, status-surface, badge, and keycap semantics;
- motion frequency gate and reduced-motion handling;
- shell clipping and 8px Windows 11 outer radius.

---

## 14. Helm-specific deviations from the screenshots

Only these deviations are permitted:

1. **Terminal void:** Helm keeps `#08090a` instead of merging the xterm canvas into `#101113`, because terminal contrast, ANSI tuning, and long-session legibility are load-bearing.
2. **Titlebar height:** the titlebar remains 40px because it is also the native drag/control strip in a decorations-off Tauri window.
3. **Terminal and split hit areas:** visible seams remain 1px, but invisible pointer hit areas stay larger for resizing.
4. **Text-only Ask send control:** the current DOM contains a text label and no icon. This CSS-only pass keeps it as a compact 28px control rather than inventing an off-system glyph. A circular icon button requires a separate authorized TSX markup change.
5. **Other shipped themes:** their declared palette values remain unchanged by mandate, even though the shared component geometry becomes flatter.

No other visual drift from the pinned Linear Dark values is intentional.

---

## 15. Verification contract

1. No component raw hex.
2. No pure black surface.
3. No persistent gradient, blur, or decorative glow in the core shell.
4. App/chrome/sidebar/main resolve to the same Helm Void surface.
5. Columns separate by one hairline.
6. Stage cards match the §11.3 recipe.
7. Seat color remains restrained and paired with glyph/text identity.
8. No `transition: all`, `ease-in`, or `scale(0)` in touched UI.
9. TypeScript and production build run once after the complete correction batch.
10. Keep this document, `src/styles/tokens.css`, `src/lib/themes/index.ts`, and the architecture pointer synchronized.
