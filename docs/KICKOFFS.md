# Kickoff Prompts — paste one per fresh local Claude session (Opus 4.8, max effort)

Each is a fresh `claude` session in its own terminal tab. All local (full `~/.claude/` + proxy + filesystem access). Set model Opus 4.8, `/effort max` before pasting.

**Order:** launch **S1 + S2 + S3 in parallel now** (they build the `~/.claude/` system). Launch **S4 (helm) AFTER** — it uses the system as its proof case (Opus-brain orchestrates GPT+Opus hands, UI-quality layer makes helm's own UI good, hooks keep it on-rails). Helm folder: `/mnt/e/Projects/helm` (created). No git commit needed.

Shared context every session reads first: `/mnt/e/Projects/helm/docs/SYSTEM-MASTER.md` (the research + evidence) and `/mnt/e/Projects/helm/docs/BUILD-SPLIT.md` (package defs).

**GLOBAL-BUILD RULE (applies to EVERY session below):** The system is UNIVERSAL — build it in `~/.claude/` (hooks, agents, skills) so it works on every project. Do NOT put system files inside any specific project. The ONLY project-specific artifact allowed is the P3 Lead-Scout *adapter* (which wires the universal layer into this one repo's DESIGN.md as a proof case) — everything else is global. If you find any system file living inside a project (e.g. leftover in Lead-Scout), move it OUT to the global home. Keep projects unclutttered: only project-specific things stay in a project.

---

## SESSION 1 — P1: Rule-enforcement hooks

```
Read /mnt/e/Projects/helm/docs/SYSTEM-MASTER.md and /mnt/e/Projects/helm/docs/BUILD-SPLIT.md package P1 first.

Build a UNIVERSAL rule-enforcement layer in ~/.claude/ (works for every project, not just this repo). The problem: rules in skills/prompts DRIFT — the model forgets caveman mode, forgets UI guidelines, forgets batching instructions after a few turns. Skills are suggestions; I need enforcement that's mechanical.

Build (hooks in ~/.claude/hooks/ + settings.json):
1. A hook that force-injects UI design guidelines whenever a UI-building agent or skill fires — so it can NEVER be skipped, unlike a skill.
2. A hook that enforces implementer batching: agents must make ALL related edits then run ONE build/verify check, never verify-after-every-tiny-edit. (This fixes a real pain: an agent spent 2 hours doing a quarter of the work because it build-checked after each of ~30 micro-edits.)
3. Audit which rule types MUST be hooks vs which can stay skills, and why. Document the principle: "enforce via hook not prompt."

Investigate current ~/.claude/settings.json + existing hooks (there's a lead-scout-guard.cjs PreToolUse hook as a reference pattern). Use the Claude Code hooks docs (via claude-code-guide agent or context7). Test each hook actually fires. Deliverable: working hooks + a short doc. Commit nothing to Lead-Scout — this is global ~/.claude/ config. Show me what you built + how you proved each hook fires.
```

---

## SESSION 2 — P2: Model-router + pinned agent defs

```
Read /mnt/e/Projects/helm/docs/SYSTEM-MASTER.md and /mnt/e/Projects/helm/docs/BUILD-SPLIT.md package P2 first.

Goal: Opus-brain-main that intelligently routes work to the right model per task — Opus subagents for UI, GPT subagents for complex logic — with model PINNED in each agent def (not chosen at spawn time).

ALREADY PROVEN: cross-provider routing works. The proxy log showed `provider=claude model=claude-opus-4-8` AND `provider=codex model=gpt-5.6-sol` in the same run. So the launcher's CLAUDE_CODE_SUBAGENT_MODEL routing is confirmed. The proxy is CLIProxyAPI, launcher at ~/.local/bin/claudex-run, config ~/.cli-proxy-api/.

Build:
1. Upgrade ~/.local/bin/claudex-run to add a --main-model flag (draft ready at /mnt/e/Projects/helm/docs/claudex-run.PROPOSED.sh — review it, then install). Add a cx-<brain>-<hands> alias matrix to ~/.bashrc (cx-opus-gpt = Opus brain + GPT hands, cx-opus, cx-gpt-opus, etc.).
2. Create ~/.claude/agents/ui-builder.md: model: claude-opus-4-8, effort max, task = build UI, loads design guidelines.
3. Create ~/.claude/agents/impl-worker.md: model: gpt-5.6-sol, with a baked-in batching instruction (all edits then ONE check).
4. ONE OPEN TEST: does an agent-def `model:` override route through the proxy the same way CLAUDE_CODE_SUBAGENT_MODEL did? Test it — spawn ui-builder + impl-worker from an Opus-main session (cx-opus-route — NOT cx-opus-gpt, whose CLAUDE_CODE_SUBAGENT_MODEL export would clobber the very pins under test), flip proxy debug on (~/.cli-proxy-api/config.base.yaml debug: true, restart proxy), confirm the log shows ui-builder hitting provider=claude and impl-worker hitting provider=codex. Revert debug after.

Global ~/.claude/ config, no Lead-Scout commit. Show me the working setup + the routing-test proof.
```

---

## SESSION 3 — P3: UI-quality system (EXTEND the user's existing design system, promote it global)

```
Read /mnt/e/Projects/helm/docs/SYSTEM-MASTER.md (Parts 1 + 3) and /mnt/e/Projects/helm/docs/BUILD-SPLIT.md package P3 first.

CRITICAL CONTEXT — DO NOT BUILD FROM SCRATCH. The user already has a sophisticated, research-backed design system. Your job is to EXTEND it with new research findings, PROMOTE it to global, and reconcile a few external sources — never replace or duplicate it. Read these IN FULL before doing anything:
- ~/.claude/skills/design-foundation/SKILL.md — the METHOD skill (global). Discovery→language→palette→tokens→build; OKLCH+APCA rigor; single-source-of-truth. This is the backbone: it DERIVES the right design system per product so design isn't sporadic, builds a coarse foundation + source of truth from the start, and makes later/new design follow the established principles + be fixable from one place. THIS IS AUTHORITATIVE — it wins on all design DECISIONS.
- /mnt/e/Projects/Lead-Scout-Finder/.claude/skills/design-taste/SKILL.md — the passive anti-slop pass (project-scoped, 84 lines).
- /mnt/e/Projects/Lead-Scout-Finder/.claude/skills/design-reference-to-code/SKILL.md — reference/screenshot/X → code (project-scoped).
- /mnt/e/Projects/Lead-Scout-Finder/.claude/skills/railway-visual-verify/SKILL.md — the visual verify loop (project-scoped).
- /mnt/e/Projects/Lead-Scout-Finder/.ai/design-system/ — the VERIFIED KNOWLEDGE BASE (DESIGN-METHOD.md is the primary source; token-scaffold/; references/apple-design.md which already adapts Emil's apple-design; TOOLS.md; META-TOOL-VERDICT.md). design-foundation reads this.

THE PROBLEM TO FIX: the universal design SUBSTANCE (.ai/design-system/ KB) is trapped inside the Lead-Scout project, and design-taste/design-reference-to-code are project-scoped — but the user wants a GLOBAL system supporting every project. Fix the trap.

DO THIS:

1. PROMOTE TO GLOBAL (de-clutter the project):
   - Move /mnt/e/Projects/Lead-Scout-Finder/.ai/design-system/ → ~/.claude/design-system/ (the KB is universal; design-foundation's SKILL.md already supports reading it from a global path — update its path references from `<repo>/.ai/design-system/` to `~/.claude/design-system/`, keeping the "if a project has its own, prefer that" fallback).
   - Promote design-taste + design-reference-to-code from Lead-Scout's .claude/skills/ to ~/.claude/skills/ (global). Lead-Scout keeps ONLY its DESIGN.md (the filled-in result) + any project-specific adapter. Leave railway-visual-verify project-scoped (it's Railway/Lead-Scout-specific) but generalize its verify LOGIC into a global verify skill (see step 4).

2. ADD THE MISSING PILLAR — pre-emit self-critique + HARD GATE (Hallmark-style: before emitting UI, score it on a few axes; any axis below threshold forces a revision pass). The research confirms this is the one anti-slop pillar the user's system lacks. Add it INTO design-taste (extend, don't make a competing skill).

3. RECONCILE EXTERNAL SOURCES — evidence-based, design-foundation stays AUTHORITATIVE (it wins on palette/stack/fonts/language decisions; external sources only add anti-slop DISCIPLINE, never override a decision the method made):
   - taste-skill (tasteskill.dev / github.com/Leonxlnx/taste-skill): DO NOT install its 13 skills wholesale — its v2 hard-codes a COMPETING visual language (forces Tailwind v4, motion/react, Phosphor, BANS Inter/serif/Fraunces as defaults, single-accent lock, no-pure-black, mandates generated imagery, landing-pages-only) that fights the user's DESIGN.md-source-of-truth model. INSTEAD cherry-pick its portable, non-conflicting DISCIPLINE into design-taste: the AI-tells ban-list, the pre-flight checklist, the em-dash ban — and specifically mine gpt-tasteskill (its GPT/Codex-tuned stricter variant) since the user's impl-worker agent is GPT-5.6. Also fold in output-skill's completeness discipline (no placeholders / no half-finished / no skipped sections). Skip the visual-style presets (soft/minimalist/brutalist — design-foundation DERIVES the language) and the imagegen skills (design-reference-to-code covers gen). Optionally mine stitch-skill's DESIGN.md export format to improve the user's DESIGN.md shape.
   - Emil Kowalski apple-design + emil-design-eng (github.com/emilkowalski/skills, MIT): the user's references/apple-design.md ALREADY adapts apple-design — verify it's current and ADD emil-design-eng's motion NUMBERS as DEFAULTS into the KB's motion reference + design-taste's checklist (easing tokens, duration budgets, frequency-gate, never-ease-in, never-scale0, origin-aware popovers, animate-only-transform/opacity).
     NUANCE (from verification): these are DEFAULTS, not a hard linter. Flagged "overstated" — sound as defaults but the never/always absolutism exceeds Emil's own wording, and a couple specifics are wrong (Geist spacing array fabricated; Rauno box-shadow focus-ring contradicts WCAG — the KB already enforces APCA, keep that). Ship as "reach for these unless context overrides."

4. MOBBIN GROUNDING (universal): wire the Mobbin MCP (already connected: mcp__mobbin__search_sections|search_screens|search_flows) into design-reference-to-code as a reference-grounding step — research shows real-reference grounding is the top-evidenced anti-slop lever. Pattern: search_sections for the pattern (e.g. pricing/onboarding) → feed the real screens as compositional reference → build. Decompose, don't clone.

5. NON-RUBBER-STAMP VERIFY (universal skill, generalize railway-visual-verify's logic): a UI verifier that does NOT approve broken UI. Research root cause: models are demonstrably bad at judging their OWN output (self-critique COLLAPSES performance). So: a FRESH/separate agent seeing only artifact+criteria (not the build reasoning), DETERMINISTIC gates FIRST (overflow, contrast, a11y-tree, console errors), THEN limited LLM judgment against a checklist — "looks good" is banned as an answer. Keep railway-visual-verify as the Lead-Scout-specific driver that calls this global verify logic.

6. CURATED EFFECTS CATALOG (universal reference, NOT defaults): create a small catalog doc in ~/.claude/design-system/ of heavy visual-EFFECT libraries the ui-builder can pull from ONLY for showpiece moments (hero backgrounds, landing flourishes, logo treatments) — and ONLY when design-foundation's effect-gate allows (foundation applies glass/glow/gradient LAST and lets any principle veto them; these are gated, never baseline). Catalog these with fit + cost notes: shadergradient (github.com/ruucm/shadergradient — animated WebGL shader gradient bg), liquid-logo (github.com/paper-design/liquid-logo — metallic/liquid logo effect), liquid-glass-js (github.com/dashersw/liquid-glass-js — Apple liquid-glass; NOTE design-foundation gates glass behind a density check, so this is opt-in per the method not a default), react-three-fiber (github.com/pmndrs/react-three-fiber — React renderer for Three.js, the 3D engine under shadergradient; heavy dep). Rule in the catalog: these are per-project opt-in effects chosen THROUGH design-foundation's gate, re-skinned to DESIGN.md tokens — never auto-applied, never a source of the visual language. They fit showpiece surfaces (a landing hero, the helm cockpit's own chrome, engine/-generated mock sites), not everyday product UI.

PARALLEL-SAFETY: You are ONE of 3 sessions (NOTE: S1 hooks + S2 router/agents are ALREADY DONE — ui-builder + impl-worker agents exist; you can see them. So no real contention, but still stay in lane). YOUR LANE: ~/.claude/skills/, ~/.claude/design-system/, and Lead-Scout's design files ONLY. Do NOT touch ~/.claude/settings.json, ~/.claude/hooks/, ~/.bashrc, ~/.local/bin/, or ~/.claude/agents/. When you MOVE files, use git mv / cp+verify and keep backups.

Deliverable: the promoted-global design system (foundation + taste + reference-to-code + KB all in ~/.claude/, extended with the gate + Emil numbers + taste-skill discipline + Mobbin grounding + non-rubber-stamp verify), Lead-Scout left with only its DESIGN.md + adapter, and a short map of what moved where + what you reconciled and why. Show me it works (run design-taste on a sample, show the gate firing, show a Mobbin-grounded reference pull).
```

---

## SESSION 4 — P4: Helm (agent cockpit) (custom wrapper app — full weekend build)

**NOTE: this is the biggest package. It's a CUSTOM DESKTOP APP, not a terminal config. Brainstorm architecture FIRST (ask me questions one at a time), then build a real v1. Scope to a working v1 this weekend; stub/backlog the rest with a clear roadmap.**

```
Read /mnt/e/Projects/helm/docs/SYSTEM-MASTER.md Part 4 and /mnt/e/Projects/helm/docs/BUILD-SPLIT.md package P4 first.

I'm building a custom "agent cockpit" desktop app — my daily driver for AI dev, replacing Warp (which I hate: bad UI, feels like a bottleneck). It's NOT just a terminal — it's an IDE-lite shell around one, on Windows + WSL. START by brainstorming the architecture with me (ask questions ONE at a time — stack, layout, the Claude→UI channel), then build a working v1 this weekend and give me a roadmap for the rest.

MUST-HAVE features (v1 target — get the core working, backlog the polish):
1. Embedded terminal (xterm.js or similar) with panes/tabs — runs my shells, WSL, Claude Code / Codex / the cx-<brain>-<hands> aliases.
2. Per-pane model/agent switcher — spin up a claude, cx-opus-route, cx-opus, or codex session fast.
3. Agent roster panel — see my live sessions/agents with ICONS (this is a Claude Code session, this is a Codex session, this agent is running X) — at-a-glance what's alive.
4. File-tree sidebar — browse my directory, open files.
5. Image-preview pane — pull up an image fast; when Claude wants to show me a reference/screenshot, it renders INLINE in the UI, not lost in scrollback.
6. Claude→UI interaction widgets — the key differentiator. When Claude needs me to: open a link → a clickable popup; copy something → a click-to-copy box (not hunting through terminal text); see an image → it appears in the preview pane. DESIGN THIS CHANNEL YOURSELF — research the options (Claude emits a marker/escape sequence the app parses, or writes a small file the app watches, or an MCP tool the app exposes) and pick the best. This is a real design decision — investigate before committing.
7. Settings — theme + background customization at minimum.

BUILD APPROACH:
- Stack: recommend Tauri (Rust+webview, lighter) vs Electron — pick with reasons, ask me if it matters to me.
- FIRST evaluate open-source AI-terminal / agent-cockpit projects as a possible base (SYSTEM-MASTER Part 4 lists candidates) — fork the best if one fits and isn't stale; otherwise scratch. Report what you found.
- For agent orchestration UNDER the hood: use Claude Code's native primitives (Agent Teams, background agents, /loop, the Agent SDK) — don't reinvent the orchestration, just give it a UI. Prove how far native gets.
- Apply the P3 UI-quality layer to the app's OWN interface (this app's UI should not be slop — dogfood it).

Standalone: new repo/dir (e.g. /mnt/e/Projects/helm/). This is a universal tool, not part of Lead-Scout. Document the architecture + setup so it's reproducible. 

Deliverable: brainstorm doc → v1 that at minimum runs a terminal + shows the file tree + previews an image + does ONE Claude→UI widget (link or copy-box) end-to-end → a roadmap for the rest. Be honest about what's v1 vs backlogged.
```

---

## After all 4 land
Each session reports back what it built + proof. You bring the results together; I (or a fresh consolidation session) verify they compose into the one system. Then back to the website builder.
