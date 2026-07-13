# Build Split — 4 independent sessions, each fresh Opus-4.8 max

Each package = one clean session, self-contained, no dependency on the others (except P1 verify unblocks P2's routing — noted). Launch in parallel. All decisions come from `/mnt/e/Projects/helm/docs/SYSTEM-MASTER.md` (the research).

**Global vs repo (HARD RULE):** P1+P2+P3 build the UNIVERSAL system in `~/.claude/` (works on every project). P4/helm is its own standalone repo at `/mnt/e/Projects/helm`. **Nothing system-related goes inside a specific project.** The ONLY project-scoped artifact is P3's Lead-Scout *adapter* (universal layer wired into this repo's DESIGN.md as the proof case). If any system file is found sitting inside a project, move it OUT. These planning docs themselves now live in `/mnt/e/Projects/helm/docs/` (moved out of Lead-Scout), not in the app repo.

---

## P1 — Rule-enforcement hooks (the "rules don't stick" fix)
**Why first-priority:** every other rule (caveman, UI-inject, batching) is worthless if it drifts. Hooks = code = can't be forgotten. This is the spine.
**Scope:** `~/.claude/hooks/` + `settings.json`
**Build:**
- Hook that force-injects UI guidelines when a UI agent/skill fires (not a skill the model can skip).
- Hook that enforces implementer batching ("all edits then ONE build check", never per-edit) — the fix for the 2-hour 30-verify-loop pain.
- Audit why caveman/skills drift; document which rules MUST be hooks vs which can stay skills.
- Deliverable: working hooks + a short doc "enforce via hook not prompt: the rule."
**Evidence base:** SYSTEM-MASTER Part 2 (verification ordering, orchestrator owns loop) + the finicky-GPT-in-Claude-harness diagnosis.

## P2 — Model-router + pinned agent defs (Opus-brain auto-picks GPT vs Opus hands)
**Depends on:** P1's routing-verify idea — but routing already PROVEN works (proxy log showed `provider=claude model=claude-opus-4-8` + `provider=codex model=gpt-5.6-sol` same run). One open q: does agent-def `model:` override route through proxy like the env var did — TEST first.
**Scope:** `~/.claude/agents/` + launcher upgrade
**Build:**
- Upgrade `~/.local/bin/claudex-run` → add `--main-model` (draft ready at `/mnt/e/Projects/helm/docs/claudex-run.PROPOSED.sh`). Add `cx-<brain>-<hands>` alias matrix.
- `ui-builder.md` agent: `model: claude-opus-4-8`, effort max, loads DESIGN.md + emil skills.
- `impl-worker.md` agent: `model: gpt-5.6-sol`, batching instruction baked in.
- Opus-main routes by task type → correct agent → model pinned in def.
- Verify agent-level model routing through proxy (the one open test).
**Evidence base:** SYSTEM-MASTER Part 2 + TL;DR #3 (Opus builds UI), #7 (launcher flip), your Opus-main pivot.

## P3 — EXTEND the existing design system + promote it global (NOT from scratch)
**Scope:** `~/.claude/skills/` + `~/.claude/design-system/` (promoted from the project) + Lead-Scout adapter
**User already has (read in full, extend don't replace):** `design-foundation` (global METHOD skill — derives per-product design system, source-of-truth, OKLCH+APCA, THE authority on decisions) + `design-taste` + `design-reference-to-code` + `railway-visual-verify` (project-scoped) + `.ai/design-system/` verified KB (DESIGN-METHOD.md primary source, token-scaffold, references/apple-design.md already adapts Emil).
**Build:**
- **Promote to global:** move `.ai/design-system/` → `~/.claude/design-system/`; promote design-taste + design-reference-to-code to `~/.claude/skills/`. Lead-Scout keeps only DESIGN.md + adapter. Fixes the "universal substance trapped in one project" problem.
- **Add missing pillar:** pre-emit self-critique + HARD GATE into `design-taste` (score UI before emit, low = redo). The one pillar the system lacks.
- **Reconcile external (design-foundation stays AUTHORITATIVE — external adds DISCIPLINE only, never overrides decisions):** cherry-pick taste-skill's ban-list + pre-flight + em-dash ban + gpt-tasteskill (GPT-tuned, matters — impl-worker is GPT) + output-skill completeness into design-taste. DO NOT install taste-skill's 13 skills wholesale (v2 hard-codes competing Tailwind-v4/Phosphor/font-bans/accent-lock that fight DESIGN.md). Skip its visual-style presets (foundation derives language) + imagegen (reference-to-code covers). Add Emil motion NUMBERS as DEFAULTS.
- **Mobbin grounding:** wire mcp__mobbin__search_sections into design-reference-to-code (top-evidenced anti-slop lever).
- **Non-rubber-stamp verify:** global verify skill — fresh agent, deterministic gates first, checklist not vibes; railway-visual-verify becomes the Lead-Scout driver calling it.
**Evidence base:** SYSTEM-MASTER Part 1 + Part 3. **Nuances: Emil numbers = DEFAULTS not hard linter (overstated); taste-skill = discipline-only, foundation wins (verified conflict).**

## P4 — Helm (agent cockpit) (custom wrapper app — biggest package)
**Scope:** standalone new repo (/mnt/e/Projects/helm/), universal tool. NOT a terminal config — a custom desktop app (Tauri/Electron) wrapping a terminal. Brainstorm architecture first, build a working v1 this weekend, roadmap the rest.
**Build (v1 core + backlog):**
- Embedded terminal (xterm.js) + panes/tabs, runs shells/WSL/claude/codex/cx- aliases.
- Per-pane model/agent switcher.
- Agent roster panel with ICONS (Claude vs Codex sessions, what's live).
- File-tree sidebar (browse + open files).
- Image-preview pane (inline images; Claude shows references in-UI not scrollback).
- **Claude→UI widget channel** (the differentiator): clickable link popups, click-to-copy boxes, inline images. SESSION DESIGNS the mechanism (marker/escape-seq parse vs file-watch vs MCP tool) — real design decision, investigate first.
- Settings: theme + background.
- Orchestration UNDER the hood = Claude Code native primitives (Agent Teams, background agents, /loop, Agent SDK) — give them a UI, don't reinvent.
- Dogfood P3 UI-quality on the app's own interface.
- FIRST eval open-source AI-terminal/cockpit projects as a base (fork if good + not stale, else scratch).
**Evidence base:** SYSTEM-MASTER Part 4. Flags: Ghostty no Windows build; Windows Terminal unsupported by Agent-Teams split-pane; Tauri lighter than Electron.
**v1 done = terminal runs + file tree + image preview + ONE Claude→UI widget end-to-end + roadmap.**

---

## Launch order (resequenced — S4 uses the system)
**Wave 1 (parallel, now):** P1 + P2 + P3. These build the `~/.claude/` system (hooks, router, UI-quality). Independent of each other.
**Wave 2 (after wave 1 lands):** P4 (helm). Build it USING the system — Opus-brain orchestrates GPT+Opus hands (P2), UI-quality layer (P3) makes helm's own UI good from the start, hooks (P1) keep it on-rails. Helm is the proof case / dogfood of the whole system.
- Each session reads `/mnt/e/Projects/helm/docs/SYSTEM-MASTER.md` first, then its package section.
- Folder: `/mnt/e/Projects/helm` (already created, sibling to Lead-Scout). No git commit of `.ai/` docs (gitignored); helm gets its own repo when P4 runs.
