# ClaudeX Orchestration — Findings + Plan

## 1. The mystery solved: why ClaudeX made the worst UI

Your `~/.local/bin/claudex-run` launcher sets **`CLAUDE_CODE_SUBAGENT_MODEL`** (line 100). That env var decides what model every subagent runs. Three aliases in `.bashrc`:

| Command | Main model | Subagents run |
|---|---|---|
| `claudex` | gpt-5.6-sol | **gpt-5.6-sol** |
| `claudex-opus` | gpt-5.6-sol | claude-opus-4-8 |
| `claudex-opus-max` | gpt-5.6-sol | claude-opus-4-8 @ max effort |

**So in your UI bakeoff, if you launched plain `claudex`: GPT was the brain AND GPT built the UI. No Opus involved anywhere.** That fully explains "ClaudeX was worst" — you were comparing:
- **Opus (plain)** — Opus brain + Opus hands
- **Codex (plain)** — GPT brain + GPT hands (native Codex CLI)
- **ClaudeX plain** — GPT brain + GPT hands, but through Claude Code's UI/harness + a proxy

ClaudeX-plain and Codex-plain are the *same models*. If ClaudeX looked worse than Codex, the delta is harness/prompt/proxy overhead, not intelligence. And both GPT-only setups losing to Opus on **UI** matches the broadly-known result: **Opus/Fable-class models have better visual taste than GPT.** GPT benchmarks "on par with Fable" on *reasoning*, not on subjective design quality — those are different skills.

Takeaway: your instinct is right. **GPT for planning/reasoning, Claude for building UI.** The `claudex-opus` alias already does exactly that. You just weren't running it in the bakeoff.

## 2. Facts that change the plan (verified, current Claude Code)

- **Nested subagents now work — up to 5 levels deep** (shipped v2.1.172, June 2026). This is NEW. It used to be "only main thread spawns agents." So your dream chain — *GPT → spawns Opus → Opus spawns Sonnet → Opus reviews → back to GPT* — is now **mechanically possible**. The `+N` in FleetView = descendant count (agents that agent spawned, rolled up), not depth.
- **BUT nesting inherits the model badly for your setup.** `CLAUDE_CODE_SUBAGENT_MODEL` is one global value. When Opus (a subagent) spawns its own subagent, that grandchild also routes through the same proxy and picks up the subagent model — you can't cleanly say "Opus's children should be Sonnet" via env. Per-agent `model:` frontmatter is the only fine-grained lever, and every model must be reachable through your proxy.
- **Effort is global per model.** Your launcher comment (lines 4–8) nails it: `/effort` in-session hits *both* the sol orchestrator and the subagent model. `--subagent-effort` pins the subagent model to a fixed effort regardless. Good — that's the knob for "Opus subagents at max, GPT brain at high."

## 3. Recommended architecture — DON'T build the deep tower

Your instinct toward *GPT → Opus → Sonnet → review → GPT* is seductive but **wrong for now**. Reasons:

1. **Every layer loses information.** Handoffs across model families (GPT plans → Opus implements → GPT consolidates) leak context. Two family-crossings per task is where quality dies. You already *felt* this ("ClaudeX somehow worst").
2. **Cost + latency multiply.** 4-model chains for one task burn tokens and wall-clock for marginal gain.
3. **Nesting is 3 weeks old.** Unproven at depth. Debugging a 4-level model-mixed tree is misery.

### The setup to actually run: **two-tier, task-routed**

**Tier 1 — Brain (main loop):** `gpt-5.6-sol` @ high/xhigh. Plans, decomposes, routes, consolidates, reasons about problems. This is where GPT's frontier reasoning earns its keep.

**Tier 2 — Hands (flat subagents, no grandchildren):** picked *per task type*:

| Task type | Subagent model | Why |
|---|---|---|
| **UI / design build** | **Opus @ max** (`claudex-opus-max`) | Best visual taste. Non-negotiable. |
| **Problem-solving impl** (logic, backend, refactor) | **Opus @ high**, or GPT subagent | Either works; Opus safer for correctness-critical |
| **Mechanical** (renames, mass edits, boilerplate) | **GPT @ medium** or Sonnet | Cheap, fast, taste doesn't matter |
| **Exploration / locate code** | **GPT or Sonnet @ medium** | Read-only, cheap |
| **Review** | **Opus @ high** (adversarial) | Independent family from GPT brain = real second opinion |

**Key rule: subagents are LEAVES.** GPT brain spawns them, they return, GPT consolidates. No agent spawns its own agent. Flat = debuggable, cheap, no information tower.

### When you DO want the review loop
Not nested — **orchestrated by the brain**, sequentially:
1. GPT brain plans + writes the task spec.
2. GPT spawns Opus-max implementer → returns diff.
3. GPT spawns a *separate* Opus reviewer (adversarial: "find what's broken") → returns findings.
4. GPT decides: accept, or send findings back to a fresh implementer. Max 2 rounds.
5. GPT consolidates.

The brain holds the loop. Same shape as your existing `/big-feature`, just with GPT as the brain instead of Fable. **This is the single most important idea: the orchestrator owns the loop; agents stay flat.**

## 4. Usage preservation (you ran out of Fable)

- **Fable = CTO only.** Reserve Fable-5 for the hardest architecture calls / final reviews on big features, invoked deliberately (via `fusion` or a manual `--model`). Not the daily driver.
- **Daily driver = ClaudeX.** GPT brain (your Codex sub) + Opus hands (your Claude sub) spreads load across *both* subscriptions instead of burning one.
- **Route by need:** cheap mechanical work → GPT/Sonnet subagents; only UI + correctness-critical → Opus; only "I'm stuck, need max intelligence" → Fable/fusion.

## 5. UI-specific agent (your biggest ask)

You want a curated UI agent so design "doesn't suck." Two moving parts:

**(a) Which model builds UI → Opus.** Settled above. Make a dedicated agent def pinned to Opus so the GPT brain routes all UI work to it regardless of which alias launched the session.

**(b) The taste knowledge → keep your local `design-taste` skill, graft the best of upstream.**
- Your local `design-taste` (84 lines) + `design-reference-to-code` + `DESIGN.md`-as-source-of-truth is the right spine. **DESIGN.md must win** — that's what stops slop.
- Upstream `taste-skill` v2 (Leonxlnx, MIT, 1207 lines, *experimental*): DON'T adopt wholesale. It hard-codes a *competing* design language (Tailwind v4, motion/react, Phosphor, bans Inter/serif, accent-lock, mandates generated imagery) that fights your DESIGN.md, and it's scoped to landing pages only (explicitly excludes dashboards/app UI — the opposite of your `src/` product surface).
- **Cherry-pick the portable, high-value parts into your local skill:** its §9 "AI Tells" ban-list, the §14 pre-flight checklist, the hard em-dash ban. Those are stack-agnostic quality gates. Leave its palette/stack/imagery mandates behind.

Full upstream text saved at `scratchpad/skills_taste-skill_SKILL.md` (v2) and `_v1` for side-by-side.

**The design UI agent def:**
```yaml
---
name: ui-builder
description: Builds/edits product-app UI in src/. Best visual taste. Composes from DESIGN.md tokens + existing components, never invents a visual language. Invoked for any UI/component/layout/styling work.
model: claude-opus-4-8
effort: max
---
Load the design-taste skill and DESIGN.md before writing UI. DESIGN.md wins on
palette/fonts/effects over any generic advice. Compose from existing src/ components
and semantic tokens; extend local abstractions, don't replace them with stock shadcn.
Preserve keyboard/focus/a11y/responsive/dark-mode. After building, self-check against
the design-taste pre-flight list. Return the diff + a 3-line rationale.
```
Note: this only runs Opus if the model is reachable through your proxy. Verify Opus routes when set as an explicit agent `model:` (not just via the env var) — test before trusting it.

## 6. Visual verification that isn't stupid

Your real pain: "obvious broken UI, agent says looks great." Fixes:
- **Never let the model that BUILT the UI also be the one that judges it.** Self-judgment is where "yeah looks good" on broken UI comes from. Route verification to a *fresh* agent that never saw the build reasoning, ideally a different family (GPT brain judges Opus's UI, or a second Opus with only the screenshot + acceptance checklist).
- **Force objective checks, not vibes.** The verify agent gets a *checklist* per the `railway-visual-verify` skill: does the hero render, is nav aligned, any overflow, contrast, mobile at 390px. Yes/no per item with the screenshot as evidence. "Looks good" is banned as an answer.
- **Screenshot is mandatory evidence.** No verification without a Railway-dev screenshot attached (your CLAUDE.md already forbids local render — good). The verifier must cite what it sees in the image.

## 7. Concrete next steps (in order)

1. **Re-run the UI bakeoff correctly:** `claudex-opus-max` (GPT brain + Opus-max hands) vs plain Opus vs plain Codex. THAT tells you if the GPT-brain/Opus-hands split actually wins. Current bakeoff was invalid (compared GPT-only twice).
2. **Verify Opus routes via agent `model:` frontmatter** through your proxy (not just the env var). One throwaway test agent.
3. **Build the `ui-builder` agent def** (§5) in `.claude/agents/`.
4. **Graft upstream ban-list + pre-flight into local `design-taste`** (§5b). Don't swap the skill.
5. **Add a `verify` agent** that's always a different instance from the builder, checklist-driven (§6).
6. **Make `claudex-opus` (or `-max`) your default alias** for real feature work; keep plain `claudex` for cheap/throwaway.
7. **Reserve Fable/fusion** for stuck-hard moments only (§4).

## 7b. The model-flip question (your new idea) — YES, make flipping trivial; NO, don't hard-pick a direction

You asked: *maybe Opus should be the brain and GPT the implementer, since GPT is frontier and might write better code.* Good instinct. The honest answer:

**There is no single right direction. It splits by task, and nobody knows the winner without YOUR bakeoff.** Practitioner consensus on plan/implement model-splits is thin and contradictory. So the correct move is: **make flipping a one-word choice, then measure on your real work.**

### The reasoning per task type
- **UI/design:** the taste lives in whoever writes the final markup. **Hands = Opus, always.** Brain (planner) matters less. So flipping the brain barely affects UI quality — what matters is Opus does the building. Never GPT hands for UI.
- **Hard logic / algorithms / subtle bugs:** the value is in the *reasoning*, and that's where a frontier model earns it. Two defensible configs, genuinely worth A/B-ing:
  - **GPT brain + Opus hands** (your current `claudex-opus`): GPT decomposes, Opus implements cleanly. Good when planning is the hard part.
  - **Opus brain + GPT hands** (the flip): Opus decomposes, GPT solves the gnarly core. Good when the *implementation* is the hard part and you want frontier reasoning on the actual code.
- **General feature work:** default to GPT-brain + Opus-hands. It's the safe baseline; flip only when you suspect the implementation reasoning is the bottleneck.

### The blocker + the fix
Your launcher **hard-codes `MAIN_MODEL="gpt-5.6-sol"` (line 22)** — you literally cannot flip the brain today. Two things unblock it:
1. **The already-possible flip (no code):** plain `claude` (not `claudex-run`) = Opus brain. But then subagents don't route through your proxy, so you can't spawn GPT hands. Dead end for *mixing*.
2. **The real fix:** I drafted `.ai/claudex-run.PROPOSED.sh` — adds `--main-model`, defaults subagent to match main, so ANY brain/hands combo is one flag. Review it, then replace `~/.local/bin/claudex-run`.

### The alias matrix (add to `.bashrc` after the launcher upgrade)
```bash
# ---- ClaudeX model matrix: <brain>-<hands> ----
# GPT brain (frontier planner) + Claude hands (taste) — DAILY DRIVER for features/UI
alias cx-gpt-opus='claudex-run --main-model gpt-5.6-sol --subagent-model claude-opus-4-8 --subagent-effort max'
# Opus brain (decompose) + GPT hands (frontier code) — THE FLIP, for hard-logic bakeoffs
alias cx-opus-gpt='claudex-run --main-model claude-opus-4-8 --subagent-model gpt-5.6-sol --subagent-effort xhigh'
# All-Opus — pure Claude, taste top-to-bottom (baseline for UI comparison)
alias cx-opus='claudex-run --main-model claude-opus-4-8 --subagent-model claude-opus-4-8 --subagent-effort max'
# All-GPT — cheap, both subs off Claude (throwaway / mechanical)
alias cx-gpt='claudex-run --main-model gpt-5.6-sol --subagent-model gpt-5.6-sol'
```
Keep your existing `claudex`/`claudex-opus`/`claudex-opus-max` aliases too — the new ones are additive and self-documenting (`cx-<brain>-<hands>`).

### The bakeoff that settles it
Pick ONE representative hard-logic task from the website builder (a real bug or a gnarly feature). Run it four ways: `cx-gpt-opus`, `cx-opus-gpt`, `cx-opus`, native `codex`. Judge: correctness, did it need fewer fix rounds, code quality. **That result — not theory — tells you your default for problem-solving.** Do the same with one UI task (expect Opus-hands configs to win visually). Two bakeoffs, done right this time (last one compared GPT-only twice — invalid).

## 8. The terminal / agent-team idea — separate track, not now

You want a better terminal (hate Warp) + autonomous agent teams + easy model-switcher. Legit, but **do not start this until the website builder ships.** It's a whole product. When you're ready, the honest options:
- **Agent teams / autonomous background work:** Claude Code already has this — background agents, `/loop`, scheduled routines, Agent Teams (2–5 peers that message each other). Start there before building anything custom; you likely don't need a new tool, just the primitives you already own.
- **Terminal UX:** the pain is Warp, not the shell. Alternatives worth a look when you get there: a plain fast terminal (Windows Terminal / WezTerm / Ghostty) + tmux for pane/session management (this gives you the Mac-like control + easy session switching you miss). A custom "director agent that orchestrates other agents in panes" is buildable on tmux + Claude Code SDK — but that's a project, and Agent Teams may already cover 80% of it.
- **Rule:** prove you need custom tooling by hitting the limits of the built-in primitives first. Don't build a terminal to avoid finishing the builder.

## 9. What to ignore
- **bencium marketplace** — you're right, 5 months stale, skip.
- **The "100-agent" repos** — impressive demos, mostly. Your two-tier task-routed setup beats a 100-agent swarm for real work: swarms are for embarrassingly-parallel breadth (audit 100 files), not for quality on one hard task. Use Workflows (you have them) when you genuinely need that breadth; don't cargo-cult the swarm.
