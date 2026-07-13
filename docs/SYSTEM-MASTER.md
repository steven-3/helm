# SYSTEM-MASTER — Portable UI + Multi-Model Dev System (evidence-graded)

**What this is.** The single consolidated, evidence-graded playbook for building a *portable* system (lives in `~/.claude/`, reusable on every project) that makes (a) UI come out near-perfect and non-generic, and (b) multi-model "ClaudeX" development reliably excellent. Synthesized from ~227-agent research (12 clusters, 213 verified claims: 55 survived, 158 flagged — but **only 3 actually refuted**; the rest are *true-but-overstated*) plus a deep-dive sweep. Where this contradicts the earlier drafts (`CLAUDEX-ORCHESTRATION-PLAN.md`, `UI-RESOURCE-KIT.md`), **this doc wins** and the correction is noted.

**Evidence tags** (on every actionable rec):
- **[HIGH]** — official / demonstrated / multi-source, survived verification.
- **[MEDIUM]** — credible, single good source.
- **[LOW]** — folklore / one-off / marketing.
- **[OVERSTATED→default]** — the *fact* is true and faithfully sourced, but auto-applying it as a rigid always-rule is wrong. Reach for it as a **default**; let context override.

**The single most important nuance in this whole doc:** most "killed" claims are **overstated, not false**. Emil Kowalski's easing numbers, duration budgets, and anti-slop rules are *faithfully transcribed and sound as defaults* — they were flagged only because (a) the "NEVER / ONLY / always" absolutism is stronger than Emil's own sources (his tips say *"try"* and *"can feel off,"* not *"never"*), and (b) a few specific numbers are contested by other authorities (Material Design brackets stagger differently; the Geist `[4,8,12,16,24,32,48,64]` spacing array is fabricated; Rauno's box-shadow focus-ring contradicts WCAG). **Ship them as the defaults an agent reaches for, not as a linter that hard-fails.**

---

## Part 0 — TL;DR (read only this if nothing else)

The highest-value, best-evidenced moves, ranked. Each is one line + tag.

1. **VERIFY the subagent-routing test FIRST (step 0 of everything).** Run `claudex-opus`, spawn one Opus subagent, confirm `proxy.log` shows the `claude` backend hit. Your proxy routes by model-name string, so GitHub #43869 (native subagent routing "broken") likely does **not** affect you — but this is an assumption until you see the log line. **[HIGH — #43869 is real & confirmed; your immunity is MUST-VERIFY]**
2. **Adopt cross-model *review* as the core discipline — it beats same-model review.** Different training → different failure modes; a GPT/Gemini critic flags what a Claude critic misses (structural assumptions vs. small details). This is the strongest orchestration consensus in the entire corpus, stronger than any plan-vs-implement direction. **[HIGH]**
3. **UI is built by Opus, always — that seat is non-negotiable.** Demonstrated 5-UI head-to-head: Opus won 4/5 + tied 1; GPT output "reads like Tailwind UI starter templates." Sam Altman conceded the frontend gap ("we get looksmaxxed on frontend"). Your original "ClaudeX was worst" bakeoff was **invalid** — plain `claudex` = all-GPT, no Opus. **[HIGH]**
4. **Install Emil Kowalski's `emil-design-eng` + `apple-design` skills (MIT) and graft his motion numbers into `DESIGN.md` — as DEFAULTS.** Easing tokens, duration budgets, never-ease-in, never-`scale(0)`, animate-only-transform/opacity, origin-aware popovers, frequency-gate. Motion-only, zero design-language conflict, composes on any system. **[HIGH as defaults / OVERSTATED→default as absolute law]**
5. **Close your one real UI gap: a pre-emit self-critique + HARD GATE.** You already have ~4 of the 5 anti-slop pillars (DESIGN.md, design-taste, railway-visual-verify). The missing one is the Hallmark-style "score the output before emitting; any axis <3 forces a revision" block. **[HIGH]**
6. **Make visual verification refuse to rubber-stamp: a *separate* agent, deterministic gates first, checklist not vibes.** LLMs/VLMs are demonstrably bad at grading their *own* output (self-critique *collapses* performance — Game-of-24 / graph-coloring evidence). Fix: fresh agent sees only artifact+criteria; run overflow/a11y/contrast gates *before* any LLM judgment. **[HIGH]**
7. **Upgrade the launcher to `--main-model` + a `cx-<brain>-<hands>` alias matrix, then A/B the plan/implement flip on YOUR work.** "GPT plans / Opus implements" has one running artifact (weak); "Opus plans+corrects / GPT reviews+implements" is thread-consensus. Nobody has settled it — make flipping one flag and measure. `claudex-run.PROPOSED.sh` already drafts this. **[MEDIUM]**
8. **Reference-ground before generating: wire Mobbin MCP (you already pay + it's connected).** Feeding real shipped screens is the anti-slop lever with the strongest *demonstrated shipping* evidence — and only Mobbin + Refero expose an agent-callable MCP for grounding. **[HIGH]**
9. **Keep orchestration FLAT: strong orchestrator owns the loop, subagents are leaves.** Nesting works (5 levels, since ~June 2026) but deep model-mixed trees lose context across handoffs (subagent returns a ~420-token summary of 6,100 tokens read). Anthropic + Cognition both say multi-agent *hurts* coding's coupled, write-heavy work. **[HIGH]**
10. **Verification ordering is a hard rule: rules/linters > visual > LLM-as-judge.** Anthropic ranks these explicitly; they call naked LLM-as-judge "generally not a very robust method." Put `tsc`/lint/axe/overflow gates first; use the VLM only for the residual "does it match the design." **[HIGH]**
11. **Conserve Fable: CTO-only. Daily driver = ClaudeX (GPT brain + Opus hands) to spread load across both subs.** You ran out of Fable; reserve it (via `fusion`) for the hardest architecture calls only. **[HIGH — your own constraint + cost data]**
12. **Defer the terminal/agent-team track until the website builder ships.** WezTerm + tmux is the right eventual stack, but Claude Code's native primitives (Agent Teams, `/loop`, worktrees, Routines) cover most of it — prove you've hit their limits before building custom. **[HIGH]**

---

# PART 1 — The UI system (portable, `~/.claude/`)

## 1.1 The 5-pillar anti-slop recipe (CONSENSUS)

Every credible source converges on the same five families. This is the spine.

| # | Pillar | Tag | You have it? |
|---|--------|-----|--------------|
| 1 | **Declare a committed aesthetic BEFORE any code** — one named direction + compact token system (4–6 named hex, 2+ type roles, one "signature" element) stated in text first. Inverts next-token-median sampling. | **[HIGH]** — Anthropic official frontend-design skill + cookbook, demonstrated w/ 3 before/afters | ✅ `design-foundation` |
| 2 | **Real-reference grounding, decomposed COMPOSITIONALLY** — feed real shipped UI (Mobbin/screenshots); assign *specific decisions to specific references* ("nav from A, density from B, destructive-action handling from C"), don't clone one. Strongest *demonstrated-shipping* evidence of any technique. | **[HIGH]** — Mobbin MCP writeups w/ shipped before/afters; Anthropic cookbook | ⚠️ partial (`design-reference-to-code` pulls X/Refero; wire Mobbin) |
| 3 | **Locked design tokens / DESIGN.md source-of-truth** — 3-tier (primitive→semantic→component), capped palette (~60/30/10), no arbitrary Tailwind values. Best *durable* fix. | **[HIGH]** — braingrid demonstrated token code; DESIGN.md is now an industry convention (designmd.directory) | ✅ `DESIGN.md` |
| 4 | **Screenshot / visual-feedback loop** — render → screenshot → compare to reference → iterate (2–3 rounds). | **[HIGH]** — Anthropic best-practices; the ImageMagick `<5%` diff gate is **[OVERSTATED→default]** (works, but "5%" is one HN shipper's number, not a universal threshold) | ✅ `railway-visual-verify` |
| 5 | **Pre-emit self-critique + HARD GATE** — score before emitting; any axis below bar forces a revision pass; block on fail. **← YOUR BIGGEST GAP.** | **[HIGH]** — Hallmark (MIT, ~1.8k★) is the well-specified public instance: 6-axis 1–5 score, any axis <3 = revise; ~57–65 pattern-match "slop gates" run with no extra LLM latency | ❌ **missing** |

**Verdict:** you cover ~4 of 5. The gap is **Pillar 5**. Add a pre-emit critique-and-gate step to `design-taste` (or a new `ui-gate` skill): 6-axis score (Philosophy/Hierarchy/Execution/Specificity/Restraint/Variety), block if any <3, plus a pattern-match ban-list that runs deterministically. Mine Hallmark's 65-gate list + Trystan-SA's `interaction-states-pass` / `hierarchy-rhythm-review` for content — **adapt to DESIGN.md tokens, do not wholesale-adopt** (their palettes/stacks would fight yours).

> **Correction vs. earlier draft:** `CLAUDEX-ORCHESTRATION-PLAN.md` treated the `taste-skill` (Leonxlnx) upstream as the main reference to cherry-pick. Research refines this: **Anthropic's own `frontend-design` skill is the closer philosophical match** to your DESIGN.md model ("the brief's own words always win") and the best-behaved — quote *its* 3-cluster slop taxonomy and restraint rules. taste-skill's Pre-Flight checklist + AI-tells list are still worth lifting, but its Section-3 stack/aesthetic defaults structurally *compete* with a source-of-truth model (it infers the look from the brief; it has no first-class "obey DESIGN.md" hook).

## 1.2 The motion / craft layer (Emil Kowalski + Rauno) — DEFAULTS, not law

**Install (MIT, drop-in, motion-only — safe wholesale next to DESIGN.md):**
- `emil-design-eng` — the crown jewel (UI polish + Animation Decision Framework). **[HIGH]**
- `apple-design` — WWDC fluid-interface physics (springs, interruptibility, gesture handoff). Adopt if you have any drag/sheet/swipe surface. **[HIGH]**
- Optionally `review-animations` (motion code-review rubric → Before/After/Why table) — graft into your PR-review posture. **[HIGH]**

Install: `npx skills add emilkowalski/skills` (strip Emil's fixed one-line greeting gate). Also worth wiring as a *review command*: **Vercel Web Interface Guidelines** (`vercel-labs/web-interface-guidelines`, MIT) — ~80 pure interaction/a11y/perf rules, **zero visual-language lock-in**, the safest wholesale adoption in the entire survey; it's the a11y floor `design-taste` under-specifies. **[HIGH]**

**The portable numbers to graft into `DESIGN.md` — every one is a DEFAULT an agent reaches for unless context says otherwise:**

| Rule | Default value | Tag | The "don't hard-enforce" nuance |
|------|--------------|-----|-------------------------------|
| **Easing tokens** | `--ease-out: cubic-bezier(0.23,1,0.32,1)`; `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`; `--ease-drawer: cubic-bezier(0.32,0.72,0,1)` | [OVERSTATED→default] | Numbers verbatim from Emil's files; "built-in easings too weak" is his opinion. Use as the default set; don't ban bare `ease` on hover (Sonner deliberately uses `ease`). |
| **Never `ease-in` on UI** | ease-out for enter/exit, ease-in-out for on-screen move, ease for hover, linear for constant | [OVERSTATED→default] | The physics is real (ease-in withholds motion during the frames the user watches). But it's a default, not absolute — ease-in is correct for things that *exit offscreen* (Comeau). |
| **Duration budget** | button 100–160ms · tooltip 125–200ms · dropdown 150–250ms · modal/drawer 200–500ms · "UI <300ms" | [OVERSTATED→default] | Faithful to Emil's table + NN/g corroborates. Treat >300ms as "needs a reason," **not** an auto-fail. |
| **Never `scale(0)` entrance** | start `scale(0.9–0.97)` + `opacity:0` | [OVERSTATED→default] | Emil's own source says *"can feel off… try 0.9+"* — soft, not "never." Great default; don't auto-rewrite blindly. |
| **Press feedback** | `:active { transform: scale(0.97) }` ~160ms ease-out on pressables | [OVERSTATED→default] | Sane default; the design systems it invokes don't universally back scale-as-default. Offer, don't impose. |
| **Origin-aware popovers** | `transform-origin: var(--radix-*-content-transform-origin)`; modals stay `center` | [HIGH core / default framing] | Radix + Base UI docs confirm the vars; modal carve-out correct. The one rule closest to hard. |
| **Frequency gate** | 100+/day or keyboard-initiated → **no animation**; occasional → standard; rare → can delight | [HIGH] — verbatim decision matrix, multi-source | This one is strong; Raycast ships no command-palette animation deliberately. |
| **Animate only `transform`/`opacity`; never `transition: all`** | exact property lists | [OVERSTATED→default] | Industry-consensus perf heuristic — keep as a lint. But Comeau: moving to transform "isn't always" possible; the FM `x/y/scale`-vs-transform-string caveat is real & **confirmed by Motion's own docs**. |
| **Stagger group entrances** | 30–80ms per item; never block input | [OVERSTATED→default] | Direction right; the *exact window* is contested (Material brackets it differently). Default, not gospel. |
| **prefers-reduced-motion** | reduce ≠ zero: keep opacity/color, drop transform/overshoot | [HIGH core] | Well-sourced. (The paired "gate all hover behind `@media (hover:hover)`" is weaker — apply judiciously.) |
| **Springs** | Apple-style `{duration:0.5, bounce:0.2}`; keep bounce 0.1–0.3; avoid bounce in most UI | [OVERSTATED→default] | Config verbatim from Emil + Vercel Labs skill. Bounce-is-slop for chrome is corroborated. |

**Rauno's Web Interface Guidelines (interfaces.rauno.me)** — micro-craft interaction rules (label-focuses-input, form-submits-on-Enter, toggles-apply-immediately, mousedown-not-click menus, box-shadow focus rings, tabular-nums, `clamp()` display sizes, 16px+ inputs). **[HIGH content / OVERSTATED→default as "lint all of them"]** — verbatim from a primary source, but Rauno himself calls the doc *"mostly generic, somewhat opinionated,"* and the box-shadow focus-ring rule actually **contradicts WCAG technique C40** (which uses outline). Adopt as a checklist; don't hard-lint every item.

## 1.3 Anthropic's own frontend-aesthetics method — the canonical [HIGH] playbook

The best-evidenced anti-slop method, published by Anthropic, demonstrated with before/afters:
1. **Guide specific design *dimensions* individually** (typography, color, motion, background) — not "make it nice."
2. **Reference inspirations BY NAME** (IDE themes, cultural aesthetics like "solarpunk") without being prescriptive enough to clone.
3. **Explicitly call out the defaults to AVOID.** Their verbatim block bans Inter/Roboto/Arial/system fonts, "purple gradients on white," and even Claude's own tic of converging on Space Grotesk.
Plus: extreme type contrast (weights 100/200 vs 800/900, size jumps 3×+ not 1.5×); state your font choice in text before coding; **"sometimes less is more — extra animation contributes to the feeling that the design is AI-generated"** (direct quote — guard against reflexive fade-in-on-everything).

**The official artifact:** the `frontend-design` skill/plugin (~300k–455k installs across sources, Apache-2.0), publicly endorsed by Ethan Mollick ("ends the purple gradient and Arial font tyranny and actually considers audience"). **[HIGH]**. It's the closest upstream to your DESIGN.md stance — mine it, keep DESIGN.md authoritative.

> **Moving-target caveat [HIGH]:** the "recommended fonts" lists expire. Space Grotesk and Geist were 2025 picks and are now *themselves* flagged as tells. Even Anthropic's own house style (cream `#F4F1EA` + serif + terracotta) is now a recognizable "made-by-Claude" default the community warns against. **Rotate default directions per niche; periodically refresh allow/deny font lists.**

## 1.4 Reference / tooling verdict table

**What has a real MCP an agent can drive** (the load-bearing fact — most galleries are human-only):

| Tool | Role | Agent-driveable? | Verdict | Tag |
|------|------|-----------------|---------|-----|
| **Mobbin** | Reference grounding (621k screens / 142k flows) | ✅ MCP (`api.mobbin.com/mcp`, you pay + connected, session tools live) | **Primary grounding.** Images only, no code out. Wire into `design-reference-to-code`. | [HIGH] |
| **Refero** | Reference grounding + token-level "Styles" | ✅ MCP (`api.refero.design/mcp`) + a `refero_skill` | **Second grounding source.** Its Styles tool returns type/color/spacing direction (unique). Pro-gated, 8k calls/mo — cache. | [HIGH] |
| **Figma Dev Mode MCP** | Design canvas w/ read+**write** MCP (25 tools, `get_design_context`→React+Tailwind, `get_variable_defs`→tokens, Code Connect) | ✅ (session-verified: `mcp__claude_ai_Figma__*` live) | Use when design lives in Figma + a team DS exists. But its React+Tailwind is a **heuristic/lossy reconstruction** of a vector doc — scaffolding, not production; always screenshot-diff. | [HIGH] |
| **Paper.design** | Design canvas where the canvas *is* HTML/CSS → `get_jsx` lossless | ✅ local write MCP (21 tools; $16/mo yearly, open alpha) | The one tool genuinely built for AI design→code with write-back. Trial free tier; don't make load-bearing (alpha). | [MEDIUM] |
| **v0 Platform API** | Headless codegen, `chat.files` egress | ✅ API/SDK (beta) | Strongest pure code-EXTRACTION surface if you want headless generation. | [HIGH] |
| Dribbble / Awwwards / Land-book / Page Flows / Nicelydone / httpster / Recent(ex-Godly) / bestdesignsonx | Human galleries | ❌ (screenshot-only) | Human mood-board only. (bestdesignsonx *is* harvestable via an open Supabase REST API — 8,172 rows, direct media + X permalinks — but **no taxonomy**; use as a ranked X-post feed, not a queryable library.) | [MEDIUM] |

**Component libraries — the one fact that matters:** shadcn's **namespaced registries** let you pull ONE component's JSON without adopting the source library's theme (`npx shadcn add @ns/name` → lands in *your* tokens). **[HIGH]** This is *the* integration pattern. Register each lib as a namespace once; always re-skin to DESIGN.md.

- **beUI** (MIT, React 19 + TW4 + Framer Motion, `@beui`): motion primitives + app-grade widgets (scheduler, command palette, dock). Aesthetic matches your Obsidian-monochrome direction (`REF-beui.png`). **Cherry-pick + re-tokenize; verify Motion/TW4/React19 fit in `package.json` first.** [HIGH — verify compat]
- **Magic UI / Cult UI / Origin UI / Motion-Primitives / Kokonut / Skiper / HextaUI** — all MIT copy-paste via shadcn CLI. Magic UI = marketing micro-interactions; Origin UI = accessible app/form primitives; Motion-Primitives = raw motion. Magic UI's LICENSE is **plain MIT** (the "no-compete clause" rumor is false for the free tier — but its **paid Pro tier does restrict**, so check per-component). [HIGH]
- **Aceternity** — landing "wow" spectacle. **License risk flag:** the "free components are MIT" claim is *contradicted by the vendor's own terms* — verify each component's license before shipping commercially. [MEDIUM]
- **SKIP for `src/`:** **OriginKit** — Framer-first, React path is a no-op-shim adapter, unconfirmed license + API-key-gated + no repo. Impedance mismatch with your shadcn stack; shadcn MCP + your tokens do the job. (Possible narrow use as a *motion reference* for `engine/`-generated sites only.) [MEDIUM]

**Anime.js vs Motion verdict [HIGH]:** **Motion** (motion.dev, ex-framer-motion) is the default for *product-app UI* — its declarative `<motion.div layout>` / `AnimatePresence` / gesture props track React state automatically, which is what app UI needs (state-driven enter/exit). **Anime.js v4** (MIT, ~24.5KB, imperative, superb timeline + 2D-grid stagger + SVG) leans *creative/landing/showpiece* work, driven from `useEffect` with `createScope().revert()` cleanup. Sensible split: **Motion for the app, Anime.js dropped in for a marketing page or one choreographed showpiece.** (GSAP only for the deepest timeline/plugin needs — and note its Webflow-compete license clause; Motion & Anime.js are both unencumbered MIT.)

## 1.5 X / gallery accounts worth following (human grounding)

Seed the "follow for shipped UI craft" list from **makers, not influencers** (Maggie Appleton's canonical roster, cross-verified live) [HIGH]:
- **Priority (interaction/motion/components):** @raunofreiberg (Vercel, Web Interface Guidelines), @pacocoursey (Linear), @emilkowalski (Sonner/Vaul), @steveruizok (tldraw), @Wattenberger (GitHub).
- **Round out to ~12–15** [MEDIUM]: @shadcn (shadcn/ui + v0), @jh3yy (CSS/animation), @Ibelick (motion-primitives), @samselikoff (buildui, Framer Motion recipes), @pontusab (Midday). Plus @BCiechanowski, @szymon_k, @asallen for craft depth.
- **Operationalize:** don't scrape a live feed — feed *specific* chosen post media through `design-reference-to-code`'s "pull from tweet" mode. Use **bestdesignsonx.com** as a ranked discovery firehose to *find* which authors to follow, then follow them directly.

---

# PART 2 — The dev / orchestration system (portable)

## 2.1 The model-role verdict (evidence-graded)

**THE key insight, stronger than any plan-vs-implement direction: cross-model REVIEW beats same-model review.** [HIGH] — the real consensus across the `/codex` plugin docs, HN, and the OpenAI community. Rationale: *"Claude reviewing Claude's plan produces polished criticism of small details while missing structural assumptions; a GPT or Gemini critic flags different issues because of different training biases."* The value is **diversity of failure modes**, not one model being globally better at planning. Build your loop around this before optimizing anything else.

| Task | Who | Tag | Evidence |
|------|-----|-----|----------|
| **UI / design build** | **Opus, always** | **[HIGH]** | kilo.ai 5-UI test: Opus 4.7 won 4/5 + tied pricing; GPT "reads like Tailwind UI starter templates," Opus "wider design vocabulary." Altman conceded the gap. Corroborated by Composio, GrowwStacks. |
| **Adversarial review** | **A DIFFERENT family than the builder** | **[HIGH]** | Cross-model review = the real consensus (above). Kills self-preference bias (a model over-rewards its own family). |
| **Deep reasoning / cross-module correctness / planning** | **Opus** (strongest Claude) | **[HIGH, w/ caveat]** | Opus leads on reasoning (HLE, GraphWalks long-context). *Caveat:* the SWE-bench Pro "69 vs 59" gap is **compromised** — DeepSWE audit found its verifiers wrong ~32% of the time. Direction holds; the exact margin doesn't. |
| **Agentic terminal / bulk implementation** | **GPT** (faster, cheaper, ~72% fewer output tokens) | **[HIGH]** | GPT edges Opus on Terminal-Bench (78 vs 75). *But the "$155 vs $15 / 10×" and "$23.42" cost datapoints are FABRICATED citations* — the real Opus-vs-GPT per-task cost gap is ~1.4×, not 10×. |
| **Mechanical (renames, mass edits, boilerplate)** | **GPT @ medium** or Sonnet | **[MEDIUM]** | Taste doesn't matter; cost/speed do. (Your memory bans haiku for subagents — use Sonnet.) |
| **Exploration / locate code** | GPT or Sonnet @ medium | [MEDIUM] | Read-only, cheap. |

**The plan/implement flip — present both honestly, then A/B:**
- **"GPT plans/explores → Opus implements"** (the surprising direction): rests on **one running artifact** (remorses' Opencode plugin) and one dev's taste claim — *"GPT-5 is great at exploring/planning but bad at writing readable code; Opus writes nice code but is bad at architecture."* **[LOW — one artifact]**
- **"Opus plans+corrects → GPT reviews adversarially + bulk-implements"** (`/codex` plugin loop: Opus plans → Codex reviews → Opus refines → implement → Codex reviews → Opus corrects → commit): **thread-consensus** on the OpenAI community (~50-pt comment: *"if the issue is well-refined first with 5.5-Thinking, Codex behaves much better afterwards"*). **[MEDIUM]**
- **Honest verdict:** nobody has settled the *direction* on real work. **Make flipping one flag and measure on YOUR tasks** (§2.2). The one thing that's settled: UI hands = Opus, and review = cross-family.

**Usage conservation [HIGH — your constraint]:** **Fable = CTO-only** (hardest architecture calls / final big-feature reviews, invoked via `fusion`). **Daily driver = ClaudeX** (GPT brain + Opus hands) to spread load across *both* your Codex and Claude subs instead of burning one. Route by need: cheap mechanical → GPT/Sonnet; UI + correctness-critical → Opus; stuck-hard → Fable/fusion.

## 2.2 The launcher upgrade + alias matrix

**Blocker (current):** your live `~/.local/bin/claudex-run` hard-codes `MAIN_MODEL="gpt-5.6-sol"` — you literally cannot flip the brain. **Fix:** `claudex-run.PROPOSED.sh` already adds `--main-model` (defaults subagent to match main, so any brain/hands combo is one flag) and keeps the backend-aware `--subagent-effort` injection. Review it, replace the launcher.

**Alias matrix (`cx-<brain>-<hands>`, self-documenting; add after the launcher swap):**

> **⚠️ Pins vs. uniform — the S2 routing finding (verified 2026-07-12) [HIGH]:** a global
> `CLAUDE_CODE_SUBAGENT_MODEL` **OVERRIDES** each agent def's `model:` pin. Precedence:
> **env `CLAUDE_CODE_SUBAGENT_MODEL` > agent-def `model:` > parent.** Every
> `--subagent-model X` alias below EXPORTS that env var → it forces ONE *uniform* subagent
> model and **clobbers the pins**: under `cx-opus-gpt`, `ui-builder`'s Opus pin loses and
> UI builds on GPT, breaking "Opus builds UI, always." **`cx-opus-route` is THE daily
> driver** for the Opus-brain-routes-per-task model — it passes `--subagent-model def`,
> which does NOT export the env var, so the agent-def pins win (`ui-builder`→Opus,
> `impl-worker`→GPT, generic subagents→parent Opus). Use the uniform
> `cx-gpt-opus`/`cx-opus-gpt`/`cx-opus` **only for bakeoffs**, never for per-task routing.

```bash
# ⭐ Opus brain; subagents routed BY THEIR AGENT-DEF model: pins — THE DAILY DRIVER.
# No CLAUDE_CODE_SUBAGENT_MODEL export => pins win: ui-builder->Opus, impl-worker->GPT, generic->Opus.
alias cx-opus-route='claudex-run --main-model claude-opus-4-8 --subagent-model def'
# ── UNIFORM-subagent modes below: every subagent = ONE model, CLOBBERS agent-def pins. BAKEOFFS ONLY. ──
# GPT brain + Opus hands (uniform)
alias cx-gpt-opus='claudex-run --main-model gpt-5.6-sol   --subagent-model claude-opus-4-8 --subagent-effort max'
# Opus brain + GPT hands (uniform) — THE FLIP, for hard-logic bakeoffs
alias cx-opus-gpt='claudex-run --main-model claude-opus-4-8 --subagent-model gpt-5.6-sol   --subagent-effort xhigh'
# All-Opus — pure Claude top-to-bottom (baseline for UI comparison)
alias cx-opus='claudex-run     --main-model claude-opus-4-8 --subagent-model claude-opus-4-8 --subagent-effort max'
# All-GPT — cheap, both subs off Claude (throwaway/mechanical)
alias cx-gpt='claudex-run       --main-model gpt-5.6-sol   --subagent-model gpt-5.6-sol'
```
Keep existing `claudex`/`claudex-opus`/`claudex-opus-max` — the new ones are additive.

**⚠️ MUST-VERIFY — the subagent-routing test (do this FIRST, step 0 of the whole program):**
GitHub issue **#43869 is real and confirmed** — in *native* Claude Code, subagent model routing silently falls back to the parent model across all documented mechanisms (frontmatter `model`, `CLAUDE_CODE_SUBAGENT_MODEL`, per-invocation param). Your setup *likely dodges it* because you route **proxy-side by model-name string** (`claude-*`→Anthropic backend, `gpt-*`→codex backend), not via CC's internal model switch. **But that is an assumption.** Confirm it: run `claudex-opus`, spawn one Opus subagent, and check `~/.cli-proxy-api/proxy.log` shows the `claude` backend being hit (not the codex backend). If the log shows codex, routing is NOT working and you must pin per-agent `model:` with a **full model ID, never a bare alias** (the alias path is the buggy one — though note: the detailed code-level root-cause trace in the research, `resolveTeammateModel()` in `spawnMultiAgent.ts`, was **fabricated/unverifiable**; the "full-ID not alias" heuristic is the salvageable part).

> The `<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>` directive in **claude-code-router** is a *genuinely implemented and tested* alternative way to pin individual subagents cross-provider [HIGH] — worth knowing as a fallback if your CLIProxyAPI name-string routing ever proves flaky.

## 2.3 Orchestration architecture (mostly [HIGH] primary Anthropic)

- **Pattern: orchestrator-worker.** A lead coordinates; specialized subagents run in parallel. Anthropic's multi-agent lead+workers beat single-agent Opus by **90.2%** on their research eval. **[HIGH]** — but that gain is for *read-heavy/parallelizable* work.
- **Loop: gather context → take action → verify work → repeat.** **[HIGH]**
- **Stay FLAT — orchestrator owns the loop, subagents are leaves.** Nesting works (capped at exactly **5 levels**, fixed, since v2.1.172) but every handoff is lossy *by design*: a subagent that reads 6,100 tokens returns a ~420-token summary — "full tool outputs and intermediate reasoning are gone." **[HIGH]** Deep model-mixed trees compound this. Reserve at most one extra level for a verifier-per-finding.
- **Multi-agent HURTS coding's typical shape.** Both Anthropic *and* Cognition converge: don't fan out sequential phases of the same feature (planning/impl/testing "share too much context"), tightly-coupled components, or shared-state work. Cognition's Flappy-Bird example: two blind subagents produce a Mario background + inconsistent bird → the combiner inherits two miscommunications. **Keep coupled-feature implementation single-threaded** (matches your existing single-author-loop decision). Fan out only genuinely independent units (per-file migration, per-endpoint audit), each in an isolated worktree. **[HIGH]**
- **Cost multipliers to budget:** agents ~4× tokens vs chat; multi-agent ~15× vs chat (or 3–10× vs single-agent); Agent Teams ~7× when teammates run plan-mode. **[HIGH]** Don't make the verbose model the bulk implementer on large mechanical work.

**The 4-primitive decision table (official) — pick by task shape, not by default to "agents" [HIGH]:**

| Primitive | Who decides next | Where results live | Use when |
|-----------|-----------------|-------------------|----------|
| **Subagents** | Claude, turn-by-turn | Claude's context | Default. Most delegation. A few tasks/turn. Isolated context, only final summary returns. |
| **Skills** | Claude follows instructions | Claude's context | Inject domain knowledge cheaply (~100 tok metadata always-loaded, <5k body on trigger, bundled files ~free). Move heavy CLAUDE.md content here; keep CLAUDE.md <~200 lines. |
| **Agent Teams** | Lead supervises peers | Shared task list + mailbox | Only when workers must *argue with each other* (competing-hypothesis debugging). Flat (3–5 peers), disjoint files, no /resume, ~7× cost. Experimental (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). |
| **Dynamic Workflows** | The script | Script variables (Claude's context holds only the final answer) | Repo-wide audits/migrations; resumable; caps 16 concurrent / 1,000 total. Have Claude write the script, review it, test on a slice first. |

**Verification ordering (hard rule) [HIGH]:** **rules/linters > visual > LLM-as-judge.** Anthropic ranks these explicitly and calls naked LLM-as-judge "generally not a very robust method." Your `npm run build:server` + `tsc --noEmit` are the primary reviewer; screenshot/visual second; LLM-judge is a supplement, never the gate. Build a small (~20-case) eval early but keep a human for edge cases (their judge missed a real bias — preferring SEO content farms over authoritative PDFs).

---

# PART 3 — Visual verification that doesn't rubber-stamp

**This is a specific, named pain of yours ("obvious broken UI, agent says it looks great"). It has a well-documented root cause and demonstrated fixes.**

**Root cause [HIGH]:** LLMs/VLMs are demonstrably bad at verifying their *own* output. Self-critique measurably **degrades** performance — GPT-4 showed "significant performance collapse with self-critique" on Game-of-24, Graph-Coloring, and STRIPS planning (Kambhampati et al., arXiv:2402.08115, ICLR 2025), and *the content of the self-criticism barely mattered*. VLMs specifically tend to approve their own initial visual answer. So "agent screenshots its own work and says it looks great" is a **known-unreliable signal by default.** Anthropic names the trap directly: *"The trust-then-verify gap… Claude produces a plausible-looking implementation… If you can't verify it, don't ship it."*

**The demonstrated fixes (design your verify-agent around these):**

1. **A FRESH / SEPARATE agent that sees only artifact + criteria — never the build reasoning.** Ideally a different model family (kills self-preference bias). Anthropic's own prescription: *"a verification subagent [that] has a fresh model try to refute the result, so the agent doing the work isn't the one grading it."* This is the single highest-leverage change. **[HIGH]**
2. **Deterministic grounding BEFORE any LLM judgment.** Extract real rendered state and gate on it:
   - **Responsive overflow gate:** render at 320/375/414/768/1440, assert `document.scrollWidth <= clientWidth` (no horizontal scroll). Catches the #1 "obviously broken" class VLMs wave through. **[HIGH — deterministic]**
   - **axe-core** for contrast/labels; **assert no console errors**; min 16px mobile body; 44×44 touch targets; test light *and* dark independently.
   - For "did I break what worked": deterministic **visual-regression diff** (argos OSS / Percy / Chromatic) against a committed baseline. (Useless for first-time-wrong generated UI — that's where the reference-VLM + gates carry.) **[HIGH]**
   - Feed the judge **screenshot + accessibility-tree + console together** — the a11y tree gives semantic anchoring pixels lack. A screenshot alone is weaker. **[MEDIUM]**
3. **Checklist, not vibes.** Replace "rate this UI 1–10" with **binary per-criterion verdicts, each with an evidence string**: *"overflow: NO — scrollWidth 375=clientWidth"; "contrast: FAIL — #999 on #fff = 2.8:1."* Force a reason per item; **forbid a bare verdict.** Constrain output to forced `YES/NO` + one-sentence reason, and **"when unsure, answer NO"** (bias to fail removes the rubber-stamp default). **[HIGH]**

**Where a VLM judge IS reliable vs. blind (calibrate accordingly) [HIGH]:**
- ✅ **Gross defects** and **clearly-worse-vs-better A/B** against a known-good reference (pairwise hits 93% when the two differ a lot).
- ❌ **Fine/subtle diffs** — pairwise collapses to ~50% (coin-flip) when the difference is small; VLMs are weak on visual-regression (12–45%) and can't infer usability from pixels. Use **pairwise-against-reference**, not solo scoring.
- Bias controls: run pairwise in **both orders** and require agreement (kills position bias); use a **different family** than the generator; anchor rubric to content not tone/length.
- **Calibrate once:** build a ~20–50 screenshot gold set (include known-broken ones), run the judge, tune the rubric until it reliably flags the broken ones. An uncalibrated "looks great" is worthless.

*Optional enhancer [MEDIUM]:* overlaying a numbered grid on the screenshot before asking "where is X" roughly doubled bounding-box accuracy on COCO — useful for localizing misalignment/overflow, though not UI-benchmarked directly.

**Concrete verify-agent design:** a `visual-verify` subagent (different family from the UI builder) that (1) runs the deterministic gate script first and **hard-fails on any overflow/console-error/contrast miss before looking**, (2) receives screenshot + a11y-tree + the target reference, (3) answers a fixed binary checklist with evidence per item, (4) does pairwise-vs-reference for subjective match, (5) defaults ambiguity to FAIL. Slot it as the verify step in `railway-visual-verify` (screenshot is already mandatory evidence there — good; your CLAUDE.md already forbids local render).

> **Correction vs. earlier draft:** the draft said "route verification to a fresh agent, use a checklist." Research *confirms and hardens* this and adds the load-bearing missing half: **deterministic gates must run FIRST and independently** — the VLM is provably unreliable exactly where the gates are cheap and objective. Don't rely on "ask the model to look carefully"; that's the thing shown not to work.

---

# PART 4 — Terminal / agent-team track (LATER — after the builder ships)

Brief by design. **Do not start until the website builder ships** — prove you've hit the limits of native primitives first.

- **Terminal:** **WezTerm** is the only strong cross-platform GPU emulator with native multiplexing that runs first-class on Windows + drives WSL directly (WslDomain). Set `default_domain` to launch straight into WSL for Mac-like splits/tabs. **[HIGH]**
  - **Ghostty has NO official Windows build** (Linux/macOS only; unofficial forks exist but the team asks them not to claim endorsement). Run it WSL-side only, if at all. **[HIGH]**
  - **Windows Terminal** is a capable native host (split panes, broadcast-input) but is **explicitly unsupported by Claude Code's Agent-Teams split-pane mode.** **[HIGH]**
- **tmux is the load-bearing dependency** on Windows/WSL: required for Agent-Teams split panes (names tmux/iTerm2 only — *not* Zellij, *not* Windows Terminal, *not* VS Code terminal), for claude-squad, and to keep `/loop`/detached sessions alive. WezTerm's native mux won't give you durable detachable sessions by default. Minimal stack: **WezTerm → WSL → tmux → claude.** **[HIGH]**
- **Use native Claude Code primitives before building custom [HIGH]:** subagents + `--worktree` isolation (`.worktreeinclude` copies `.env`), experimental **Agent Teams** (flat lead + 3–5 peers), **`/loop`** (in-session recurring) / **`/goal`** (condition-driven) / **Routines** (cloud, machine-off, cron/GitHub-triggered, `claude/*` branches only). Add **claude-squad** (8.1k★, tmux+worktrees, actively maintained) only if you want a persistent cross-agent (Claude+Codex+Aider) TUI. Graduate to the **Agent SDK** only for a truly custom director.
- **Do NOT build on:** Crystal (deprecated Feb 2026), Vibe Kanban (sunsetting despite 27k★), code-conductor (near-stale). **[HIGH]**

---

# PART 5 — The execution plan (evidence-gated, ordered)

### DO NOW (high-confidence or free)
- [ ] **0. MUST-VERIFY the subagent-routing test** (§2.2). Run `claudex-opus`, spawn an Opus subagent, confirm `proxy.log` hits the `claude` backend. **Everything downstream assumes this passes.** [HIGH]
- [ ] **1. Install `emil-design-eng` + `apple-design` skills** (`npx skills add emilkowalski/skills`; strip the greeting gate). Motion-only, MIT, zero conflict. [HIGH]
- [ ] **2. Graft Emil's motion numbers into `DESIGN.md` as a "Motion defaults" section** — framed as defaults ("reach for these unless the context says otherwise"), NOT a hard linter. [HIGH as defaults]
- [ ] **3. Install Vercel Web Interface Guidelines as a review command** (`/web-interface-guidelines`). The a11y/interaction floor, zero design conflict. [HIGH]
- [ ] **4. Wire Mobbin MCP into `design-reference-to-code`** as the grounding step (you already pay + it's connected). Add the compositional-decomposition prompt discipline ("nav from A, density from B"). [HIGH]
- [ ] **5. Add Pillar 5 — a pre-emit self-critique + hard gate** to `design-taste` (or new `ui-gate` skill): 6-axis score, block if any <3, + deterministic pattern-match ban-list. Mine Hallmark + Trystan-SA for content, adapt to DESIGN.md tokens. [HIGH]
- [ ] **6. Build the `visual-verify` subagent** (Part 3): deterministic gate script (overflow/axe/console) runs FIRST → then a *different-family* judge answers a binary checklist with evidence, defaults ambiguity to FAIL, pairwise-vs-reference for subjective match. Calibrate on a ~20-screenshot gold set. [HIGH]
- [ ] **7. Build the `ui-builder` agent def pinned to Opus** so the GPT brain routes all UI work to it regardless of alias. Loads design-taste + DESIGN.md; DESIGN.md wins; self-checks against Pillar-5 gate before returning. [HIGH]
- [ ] **8. Upgrade the launcher** (replace with `claudex-run.PROPOSED.sh`) + add the `cx-<brain>-<hands>` alias matrix. [HIGH — mechanism verified]
- [ ] **9. Adopt cross-model review as standard**: any nontrivial diff gets an adversarial review from a *different family* than the builder. [HIGH]

### A/B TEST FIRST (real but unsettled — measure on YOUR work)
- [ ] **10. The plan/implement flip.** Pick one representative hard-logic task; run `cx-gpt-opus` vs `cx-opus-gpt` vs `cx-opus` vs native `codex`. Judge: correctness, fix-rounds needed, code quality. Do the same with one UI task (expect Opus-hands to win visually). **Two bakeoffs, done right this time** (the last one compared GPT-only twice — invalid). [MEDIUM]
- [ ] **11. Trial Paper.design free tier** as a mock→JSX preview path alongside your artifact/Higgsfield preview. Don't make it load-bearing (alpha). [MEDIUM]
- [ ] **12. Wire Refero MCP** as a second grounding source (its token-level "Styles" is unique); cache aggressively (8k calls/mo). [HIGH — value; verify budget]
- [ ] **13. Trial the ImageMagick `compare` diff gate** in the visual loop — but treat "5%" as a starting knob to tune, not a universal threshold. [OVERSTATED→default]

### SKIP / DEFER
- [ ] **OriginKit for `src/`** — Framer-first, shim adapter, license risk. shadcn MCP + your tokens instead. [SKIP for src]
- [ ] **taste-skill (Leonxlnx) wholesale** — its Section-3 stack/aesthetic defaults fight DESIGN.md. Lift only its Pre-Flight checklist + AI-tells list. [DEFER to cherry-pick]
- [ ] **Deep model-mixed nesting** (GPT→Opus→Sonnet→…) — lossy handoffs; stay flat. [SKIP]
- [ ] **Terminal / agent-team build** — until the builder ships; use native primitives first. [DEFER — Part 4]
- [ ] **Crystal / Vibe Kanban / code-conductor** — dead/dying. [SKIP]
- [ ] **Aceternity components in commercial output** — verify each component's license first (vendor contradicts the "free = MIT" claim). [GATE on license check]

---

# PART 6 — What got CUT and why (honesty section)

### The 3 things actually REFUTED (false, not just overstated)
1. **The claimed code-level root-cause of the #43869 routing bug was FABRICATED.** The research asserted `resolveTeammateModel()` in `src/tools/shared/spawnMultiAgent.ts` passes aliases unresolved → hardcoded Opus fallback. **That file and all five cited symbols don't exist** — the trace was invented. **What survives:** the bug is real, and the "use a full model ID, not a bare alias" heuristic is a real workaround (just differently-caused than stated). *Impact on you:* low — you route proxy-side by name string, hence step 0's test rather than trusting any internal-mechanism claim.
2. **A mis-cited "Section 3.A, lines 126-142" tech-stack lock-in was attributed to the wrong file.** That description belongs to the *external* Leonxlnx/taste-skill (1,206 lines), not your local `design-taste` (84 lines, which has none of it). Don't conflate the two when deciding what to adopt.
3. **"curated.design → craftwork.design" redirect nuance overstated** (minor): the redirect is real, but the "no programmatic access at all" framing was slightly off. Immaterial — it's a human gallery either way.

### The biggest OVERSTATED→default corrections (true, but don't hard-enforce)
- **Emil's easing/duration/scale/spring numbers** — faithfully transcribed, sound as **defaults**; his own sources say *"try"/"can feel off,"* not *"never."* Ship as defaults, not a hard linter. (The single most important nuance — see the top of this doc and §1.2.)
- **"Animate ONLY transform/opacity"** — keep as a lint, but Comeau notes it "isn't always" possible; it's a strong default, not a law.
- **The Geist spacing array `[4,8,12,16,24,32,48,64]` is fabricated** — no source yields it. Use a 4px grid, but don't cite that exact array as "Vercel's."
- **Stagger "30–80ms"** — direction right, exact window contested (Material brackets it differently).
- **Rauno's rules as "canon / lint all of them"** — verbatim from a primary source, but he calls it *"somewhat opinionated,"* and his box-shadow focus-ring rule contradicts WCAG C40. Checklist, not hard-lint.
- **Model cost/benchmark claims** — the Opus-wins-UI head-to-head is TRUE and well-sourced; but **SWE-bench Pro margins are compromised** (~32% bad verifiers) and several **cost datapoints ($155/$15, $23.42, "10×") are fabricated citations** — real Opus-vs-GPT cost gap ≈1.4×. Trust the *direction* (Opus reasons deeper/pricier, GPT faster/cheaper on terminal), distrust the exact numbers.
- **Multi-agent "consistent 3–15× cost"** — the raw numbers are verbatim-accurate but conflate three different denominators (vs chat vs single-agent vs Agent-Teams). Real, but don't quote as one figure.

### Could NOT be verified (treat as unknown/folklore)
- **The @poistudioltd viral Figma+Claude post** — X paywalled (HTTP 402), Nitter dead, no writeup quotes the status ID. Author confirmed (Bobo Wong, Poi Studio HK, Framer-based studio); *exact content unverifiable.* **Do not reconstruct "their workflow."** But the general Figma→Claude consensus it likely gestures at is solid: official MCP (`mcp.figma.com/mcp`), prep the file first (Auto Layout + named Variables + semantic layers), work section-by-section, screenshot-feedback loop ("Claude is a superb front-end engineer and a blind designer"). [consensus HIGH; the specific post LOW/unverifiable]
- **Reddit threads** — the research tool was hard-blocked from reddit.com and all mirrors (403/Anubis). Reddit-attributed claims come via search-engine indexing, not raw threads; upvote counts unverified. The trustworthy vote-signal is HN + the OpenAI Developer Community (both readable directly).
- **"Persona priming" ("act as a senior designer with 20 yrs…")** — repeated everywhere, **no measured proof it beats plain constraints.** Folklore. [LOW]
- **"Hands-off AI one-shots bespoke design"** — every success story is heavy human guidance + iteration; working designers are split-to-skeptical. Position the builder as *committed-direction + reference + verification loop with human-in-loop*, and **rotate default directions per niche** (the cream/serif/terracotta look now reads as "made by Claude"). [HIGH — set expectations]
