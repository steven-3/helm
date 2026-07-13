# UI Resource Kit — tools, sources, and how each plugs into the pipeline

Curated from your links + research. Each entry: what it is, whether an agent can USE it programmatically, and where it fits. Marketing claims flagged.

## The pipeline shape (where everything slots)

```
REFERENCE IN  →  MOCK/PREVIEW  →  BUILD  →  VERIFY
(what to make)   (see it first)   (code)    (judge it)
```

- **Reference IN** = Mobbin, bestdesignsonx, Dribbble/Refero, X accounts → real examples as grounding
- **MOCK/PREVIEW** = Paper.design, Figma (+MCP), Higgsfield mockups, Claude artifacts
- **BUILD** = your `design-reference-to-code` skill → React in `src/`, DESIGN.md wins
- **VERIFY** = fresh agent + checklist + Railway screenshot (never the builder)
- **CRAFT LAYER (cross-cutting)** = Emil's motion skills + your `design-taste` → the taste that stops slop

---

## TIER 1 — adopt now (highest value, lowest friction)

### Emil Kowalski's skills — `github.com/emilkowalski/skills` ⭐⭐
MIT, pure markdown, **actively maintained** (last push 2026-07-11), self-contained (no MCP/npm needed). This is the single best thing in your whole list. Emil = design engineer at Linear, ex-Vercel, author of Sonner + Vaul. His skills encode the *exact motion numbers* generic design skills lack.

**The two to graft:**
- **`emil-design-eng`** (679 lines) — THE crown jewel. Concrete cubic-beziers (`--ease-out: cubic-bezier(0.23,1,0.32,1)`), duration budgets (button 100–160ms, modal 200–500ms, **hard rule UI <300ms**), the "when NOT to animate" frequency table (keyboard actions → never animate), "never `scale(0)`", origin-aware popovers, spring guidance. Fold the easing tokens + duration table into `DESIGN.md`; lift the decision checklist into `design-taste`.
- **`apple-design`** (282 lines) — Apple fluid-interface physics: interruptibility, two-param springs with *shipped values* (drawer `damping 0.8 / response 0.3`), momentum projection + velocity-handoff + rubber-band math. Adopt if you have any drag/sheet/swipe surface (you build Vaul-style UI, so yes).

**Also useful:** `review-animations` (motion code reviewer, 10 standards, Before/After/Why output — graft into your verify posture), `animation-vocabulary` (description→precise-term glossary, good as reference doc). `improve-animations` = whole repo-audit workflow, skip unless you want a motion sweep.

Full text saved: `scratchpad/emil-skills/`. **Action:** cherry-pick numbers into `DESIGN.md`, install `emil-design-eng` + `apple-design` as skills (strip Emil's fixed one-line greeting gate).

### Mobbin — `mobbin.com` (you pay, MCP connected) ⭐
The **reference IN** layer. ~621k real app/web screens, searchable. Your MCP tools return **images inline (base64, viewable) + metadata**:
- `search_sections` — page blocks (Hero/Features/Pricing + Style filters: Brutalist/Editorial/Minimal). **Most useful for React section builds.**
- `search_screens` — individual screens
- `search_flows` — multi-step journeys (onboarding, checkout)

**Images only — no code out.** It grounds *what to make*; a build agent turns the image into React. Gotcha: global search may not hard-filter by app name (fuzzy). **Action:** wire into `design-reference-to-code` as a reference source — "search_sections for pricing sections" → feed images to build agent.

---

## TIER 2 — strong, adopt when relevant

### Paper.design — `paper.design` ⭐
Code-native design canvas (canvas IS HTML/CSS, not SVG). **Ships an authenticated MCP with WRITE access (~24 tools)** — `get_jsx` returns JSX, emits Tailwind. This is the one tool genuinely built for AI design-to-code: mock in Paper → Claude Code pulls JSX → your `src/`. Free tier = 100 MCP calls/week (enough to test); Pro $20/mo.
**Caveat:** open alpha ("APIs can change, features can break"), export fidelity un-benchmarked. **Action:** try the free tier as a MOCK/PREVIEW option alongside your artifact/Higgsfield preview. Don't make it load-bearing yet.

### Anime.js — `animejs.com` (v4)
Lightweight JS animation engine (CSS/SVG/DOM/JS-objects, timeline + stagger). *[research pending — fit verdict below when sweep lands]*

### beUI — `beui.dev`
Animated component library. You already have `REF-beui.png` as a reference. *[research pending]*

### OriginKit — `originkit.dev`
*[research pending — component kit vs template]*

---

## TIER 3 — reference/inspiration sources (human browse, not programmatic)

### bestdesignsonx.com
Curated gallery of best UI posted on X. *[research pending — organization + whether linkable]*

### Figma + Claude (poistudio method)
The viral workflow. *[research pending — reconstructing from secondary sources since the X post is paywalled]*. General consensus method: Figma MCP (read) → Claude pulls design context → build. Paper.design is the write-capable alternative.

---

## Model choice for UI (practitioner consensus)
*[research pending — folding in what X/Reddit actually say about Opus vs GPT vs Fable for visual taste]*. Working assumption stands: **Opus/Fable > GPT on visual taste**; GPT competitive on reasoning not design.

---

## What to do with this kit
1. **Graft Emil's motion numbers into `DESIGN.md` + `design-taste`** — biggest single quality win.
2. **Wire Mobbin `search_sections` into `design-reference-to-code`** as a grounding step.
3. **Trial Paper.design free tier** as a mock→JSX preview path.
4. Keep bestdesignsonx / X accounts as human inspiration; feed screenshots into the build skill when something's worth cloning.
5. Component libs (beUI/OriginKit/Anime.js) — pull specific components/effects as needed, always re-skinned to DESIGN.md tokens. Never adopt a lib's visual language wholesale.
