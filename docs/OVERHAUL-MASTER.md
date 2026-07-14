# helm — OVERHAUL MASTER (two-phase execution doc)

> **You are a fresh session picking up helm to OVERHAUL its terminal system.** This doc aggregates every reported bug plus a brainstormed "make it better" roadmap into one executable plan. It is written so you can run **Phase 1 (fix the bugs) → Phase 2 (make it better)** autonomously, overnight, while the user sleeps.
>
> The code has already been mapped for you — root causes and `file:line` anchors are inline below. **Do not re-map the codebase.** Read this doc, skim the two source-of-truth files it points to, then orchestrate.

---

## 0. How to use this doc — READ FIRST

**Your role: ORCHESTRATOR ONLY. You do not write code.** You spawn agents, review their diffs, integrate, verify, and commit. Every line of code is written by a subagent. This protects your context so you can hold the whole overhaul in one session.

**This is a fire-and-forget run.** The user is asleep and cannot answer questions. Where a choice is genuinely open, a **DEFAULT is already chosen and marked `⟦DEFAULT⟧`** — take it, and log it in §6 Morning Review so the user can override. **Never block waiting for input. Never wake the user.**

**Read order (minimal):**
1. This doc, fully.
2. `DESIGN.md` §1–§6 + `src/styles/tokens.css` — the visual law (skim; it is the source of truth for palette/type/space).
3. `docs/ARCHITECTURE.md` §4 — the OSC 5379 channel spec — **only if/when you start WS-6 (Stage).**

Do **not** open `SYSTEM-MASTER.md` (46 KB of research background — unneeded).

**The visual system is SETTLED. Do not re-litigate it.** helm is DESIGN.md v3 "Integrated Work Surface": void `#08090a`, chrome `#101112`, one indigo accent `#5E6AD2`, **Inter** for UI + **JetBrains Mono** for code/terminal, Claude-orange `#df8352` / Codex-teal `#62c5b9` identity. Colored file-type icons and terminal ANSI are the sanctioned functional-color exceptions. Do not propose a new palette, font, or "theme."

---

## 1. What helm is (context primer, 30s)

A custom **agent-cockpit desktop app** (Tauri v2 / WebView2) — an IDE-lite shell around a terminal, the daily driver for AI-assisted dev on Windows + WSL. The **anti-Warp**: light, fast, precise. The terminal is the hero; chrome recedes.

**The differentiator = the Claude→UI widget channel.** When a tool running in a pane wants you to copy a value, open a link, or look at an image, it should surface as a real clickable widget in the **Stage** dock — not get lost in scrollback. This is the reason helm exists, and (see WS-6) it is the single most broken thing right now.

**Stack:** React 19 + TS + Vite + Zustand + xterm.js (frontend); Rust `src-tauri` PtyManager on `portable-pty`, streamed over a Tauri `Channel`. State in `src/store/*`. Everything native goes through `invoke()`.

---

## 2. Orchestration law — HOW YOU WORK (non-negotiable)

This is the user's established house method (from `docs/CLAUDEX-ORCHESTRATION-PLAN.md`). Follow it exactly.

### 2.1 The one rule that matters most
**The orchestrator owns the loop; agents stay FLAT.** You spawn subagents; they return; you consolidate. **No agent spawns its own agent.** Flat = debuggable, cheap, no information tower. You hold every review loop yourself.

### 2.2 Routing table — pick the agent by task type
| Task type | Agent | Model | Notes |
|---|---|---|---|
| **UI / visual / layout / motion / CSS / components** | `ui-builder` | Opus @ max | Non-negotiable. Builds against DESIGN.md; runs design-taste self-critique automatically. |
| **Mechanical / backend / Rust / wiring / stores / bulk edits** | `impl-worker` | GPT | Batches ALL edits then ONE verify pass. |
| **Root-cause research / "why is this broken" / locate code** | `Explore` | — | Read-only. Returns conclusions + `file:line`, not file dumps. |
| **Hard design/architecture decision** (2 defensible options) | `fusion` skill *or* a plain Opus agent | Opus | Use for the WS-4 session-model and WS-6 detection-strategy calls. |
| **Adversarial review of a diff** | fresh `ui-builder`/`Explore`/general Opus, or `caveman:cavecrew-reviewer` | Opus, **different instance than the builder** | "Find what's broken." |

### 2.3 The review loop (orchestrated, sequential, max 2 rounds)
For each workstream: **1)** you write the task spec → **2)** spawn the implementer → returns a diff → **3)** spawn a **separate, fresh** adversarial reviewer (never the builder; ideally a different model family) that sees only the diff + acceptance criteria and is told to find defects → **4)** you decide: accept, or send findings to a **fresh** implementer (max 2 fix rounds) → **5)** consolidate, verify, commit.

**The builder never judges its own work.** For UI, the reviewer gets only a screenshot + the acceptance checklist; **"looks good" is a banned answer** — it must cite specific evidence per checklist item, and ambiguity defaults to FAIL.

### 2.4 Context hygiene (protect your own window)
- Agents return **conclusions + a diff summary + `file:line`**, never whole files. You rarely read source directly — you already have the maps below.
- Use the **task list** (TaskCreate/TaskUpdate) as shared memory across workstreams.
- Don't re-explore what this doc already maps. If an agent needs detail, it re-reads — that's *its* context, not yours.

### 2.5 Batching, parallelism, collisions
- Implementers make **all related edits, then one** `typecheck`+`build`. Never build-after-every-edit.
- Run **independent workstreams concurrently** (multiple Agent calls in one message).
- **Serialize edits to shared files.** The terminal cluster (WS-3/4/5) all touch `src/lib/terminal-session.ts` + `src/components/TerminalPane.tsx` + `src-tauri/src/pty.rs` → run them as one coordinated pass or strictly in sequence, never as parallel writers.
- `Workflow` is available if you want deterministic fan-out for a mechanical batch (e.g. the WS-8 git commands or the WS-7 icon map), but concurrent Agent spawns + the task list are the default. **You hold the loop either way.**

### 2.6 Failure handling
If a workstream is blocked (missing decision, environment limit, or an agent can't crack a root cause after 2 rounds), **park it, log it in §6, and move on.** Never spin. Never fabricate a "fix" you couldn't verify.

### 2.7 Git discipline ⟦DEFAULT⟧
- Work on a branch: **`git checkout -b overhaul`** (do not commit to `main`).
- Commit **per completed + reviewed workstream** with a clear conventional message (`fix:` / `feat:`). This keeps progress durable and reviewable in the morning.
- **Do NOT push and do NOT open a PR** — the user hasn't asked. Leave everything local.
- Reconcile the working tree's **half-landed borderless-window change** (WindowResizeGrips.tsx new; tauri.conf/capabilities/App/CSS modified) into the WS-1 commit rather than reverting it.
- Co-author trailer on commits per the repo convention.

---

## 3. PHASE 1 — FIX THE BUGS

Eight workstreams. Each: **Symptoms → Root cause (`file:line`) → Fix approach → Owner → Acceptance → Notes.** The dependency graph and a suggested launch order are at the end (§3.9).

Every root cause below is already verified by a mapping pass — treat them as findings to act on, not hypotheses to re-derive. Where behavior can only be confirmed in a live window, it's flagged **`⟨live-test⟩`** and belongs in §6, not in a "done" claim.

---

### WS-1 · Window chrome: resize affordance, rounded corners, resize lag
**Symptoms.** Resize cursor looks "special," not the standard OS one; can't resize vertically; can't resize diagonally; window feels hard-constrained. Rounded corners disappear during resize and the base corners aren't round enough. Resizing is laggy.

**Root cause.**
- All 8 grips (4 edges + 4 corners) *are* wired to `startResizeDragging` (`src/components/WindowResizeGrips.tsx:17-49`), but hit-targets are **4px edges / 9px corners** (`src/styles/components.css:30-39`). Because the window is borderless + transparent (`src-tauri/tauri.conf.json:20-21`), the OS draws **no** resize border — these thin strips are the *only* affordance. The standard `ns/ew/nwse/nesw` cursors exist but only appear inside the 4/9px band, so it reads as "no affordance"; the 4px-tall N/S strips are nearly unhittable (vertical) and the 9×9px corners are practically unhittable (diagonal). Not absent — too small.
- Rounded corners: `--radius-shell:10px` intended on `.app` (`components.css:25`, `tokens.css:148`) is **overridden to `border-radius:0`** by a later same-specificity rule in the "2026 product shell" block (`components.css:520-523`, again `:777`). Corners render square; any rounding at rest is OS-applied (DWM/macOS) and can't mask a square content edge, so corners flash square/black mid-resize. There is no content-side rounded clip.
- Resize lag: transparent + `macOSPrivateApi` whole-window alpha compositing each frame (`tauri.conf.json:21,26`; WebView2 borderless-transparent resizes slowly) + full-window gradient repaint (`.app` `--glow-chrome`, `components.css:522`; sidebar/stage gradients `540,641`) + **un-throttled per-frame xterm reflow** — the per-pane `ResizeObserver` (`TerminalPane.tsx:141-147`) is gated only for divider drags, never for window resize — + no window-resize debounce anywhere.

**Fix approach.**
1. **Grips:** enlarge hit-targets to a comfortable band — edges ~**6–8px**, corners ~**16–20px** — corners layered above edges, covering the full perimeter with no dead seam; keep the standard directional cursors. Verify all 4 edges + 4 corners drag-resize.
2. **Rounded shell ⟦DEFAULT⟧:** the outer shell **is rounded at ~12px** ("round enough"); inner chrome zones stay radius-0 (embedded, per DESIGN.md). Put the radius on the *winning* `.app` rule, add a real content clip (`overflow:hidden` + radius on the actually-painted root), and delete/fix the conflicting `border-radius:0` overrides (`components.css:520-523,777`). Update DESIGN.md to resolve its own ambiguity: **outer shell = `--radius-shell`; inner chrome = 0.**
3. **Resize lag:** add a Tauri `onResized` (or window-resize) listener that sets a global **"window-resizing" flag suspending all xterm reflow** during the gesture (extend the existing `data-pane-resizing` gate to window resize) and refits **once** on settle; paint an **opaque background during resize** (restore a solid `backgroundColor`/fallback so the compositor isn't doing per-frame alpha); reduce full-window gradient repaint (contain the gradient to a non-resizing layer or use a solid base).

**Owner.** `ui-builder` for grips + rounded-shell + DESIGN.md update; `impl-worker` for the `onResized` wiring + reflow-suspend gate. A short `Explore`/Opus spike first to confirm whether keeping `transparent:true` is worth the resize cost on WSLg/Windows, or whether an opaque window with CSS rounding is the better call ⟨live-test⟩.

**Acceptance.** All 4 edges + 4 corners resize with correct native cursors and a comfortable grab band; corners stay rounded (~12px) at rest **and** during resize; resize is smooth with no per-frame TUI reflow; min-size sane.

**Notes.** The `.app` duplicate-rule conflict is the highest-leverage single fix here. `⟨live-test⟩` transparent-corner + resize feel on real Windows can't be confirmed headlessly.

---

### WS-2 · Draggable panes + terminal scrollbar
**Symptoms.** Can't drag the stage/agents/terminal pane boundaries to rebalance widths (requested before, still not done). A scrollbar sometimes appears in the terminal pane on vertical resize (should never).

**Root cause.**
- Top-level layout is **fixed-width flexbox, no splitter library** (`src/App.tsx:80-158`): rail 48px, sidebar 272px, center `flex:1`, stage 300px (`components.css:70,104,249,356`). The layout store holds **only booleans** (`src/store/layout.ts:8-45`) — sidebar/stage are show/hide, never width. The *only* user-resizable surfaces are terminal panes **within** a tab (`src/components/SplitPanes.tsx:29,100-181`, per-tab flex ratios). Sidebar↔center and center↔stage boundaries are not draggable.
- Scrollbar: xterm's `.xterm-viewport` is hard-set `overflow-y:scroll` (`node_modules/@xterm/xterm/css/xterm.css`; helm only restyles its background, `components.css:352`, and sets 10px width `global.css:40`). On window resize the refit is rAF-deferred and gated only for divider drags, so in the one-frame gap where the container shrinks before the refit, rows transiently exceed the viewport → the default scrollbar flashes. Transient, not persistent overflow.

**Fix approach.**
1. **Draggable top-level splitters:** add drag handles at **sidebar↔center** and **center↔stage**, reusing the existing `SplitPanes` divider pattern (pointer + keyboard, rAF-batched, min-width clamp, collapse-below-threshold). Persist widths in the layout store (add `sidebarWidth`, `stageWidth`; clamp min/max; keep show/hide composable with width). Rebalancing the stage larger by shrinking the terminal is the target interaction.
2. **Scrollbar:** extend the resize-suspend gate (shared with WS-1) to window resize so the refit doesn't lag the shrink; style the xterm viewport scrollbar **thin/overlay, themed** (`--scrollbar-thumb`), `overflow-y:auto` (not forced `scroll`) or reserve a stable gutter so shrinking never flashes a fat default bar.

**Owner.** `ui-builder` (splitter interaction + scrollbar styling), `impl-worker` (layout-store width state + persistence).

**Acceptance.** Drag sidebar and stage boundaries to resize; widths persist across restart; min widths enforced; no scrollbar flash on vertical resize; any visible scrollbar is thin and on-theme.

**Notes.** Shares the "resizing" suspend gate with WS-1 and WS-3 — **define that gate once** and have all three consume it.

---

### WS-3 · Terminal performance + rendering glitches
**Symptoms.** Input in Claude Code feels laggy. Characters get "weirdly spaced" / extra lines appear then fix themselves; the Claude Code banner is cut off.

**Root cause** (`src/components/TerminalPane.tsx`, `src/lib/terminal-theme.ts`, `src-tauri/src/pty.rs`).
- **Active renderer is the DOM renderer** — xterm's slowest path. Only `FitAddon` + `WebLinksAddon` are loaded (`TerminalPane.tsx:60-63`); no Canvas/WebGL addon exists in `package.json`. The code comments claiming a "Canvas renderer" (`TerminalPane.tsx:135-137`) and the CSS targeting `.xterm-screen canvas` (`components.css:630`) are **stale/dead** — nothing creates that canvas. This is the primary input-lag cause.
- **No `unicode11` addon** → wide glyphs (emoji/CJK/powerline/nerd) are counted as 1 cell, so the inner program's wrapping disagrees with xterm's → blank/extra lines and misalignment.
- **Font measured against a fallback** before the mono face is ready: `loadTermFont` races a 2500ms timeout (`terminal-theme.ts:76-90`) and xterm measures the grid at `open()`; if the face isn't loaded the cell width is wrong until the `document.fonts.ready` refit → the "weird spacing" that later "fixes."
- **Cutoff:** `fitNow` only refits when dimensions differ and the host is settled (`TerminalPane.tsx:80-90`); cols/rows lag the real PTY size mid-layout until the next refit → trailing output clipped.
- PTY bytes cross IPC as a JSON `number[]` (`contract.ts:77-79`, rebuilt `commands.ts:43`) — wasteful for bursty TUI output (secondary perf drag).

**Fix approach.**
1. **Renderer ⟦DEFAULT⟧:** add **`@xterm/addon-canvas`** and make it the active renderer — a large win over DOM while avoiding the WebGL/EGL context-loss fragility that ARCHITECTURE.md deliberately dodged on WSLg. Additionally allow **`@xterm/addon-webgl` behind a setting**, with a context-loss handler that auto-falls-back to canvas. (Canvas default, WebGL opt-in.)
2. Add **`@xterm/addon-unicode11`** and set `term.unicode.activeVersion = '11'`.
3. **Font-load ordering:** `await` the selected terminal face via `document.fonts.load` **before** `term.open()`/measurement; remove the 2500ms race; keep the `fonts.ready` refit as a backstop.
4. Only if lag persists after (1): reduce IPC overhead (compact byte transfer instead of `number[]`).

**Owner.** Opus/`Explore` spike to confirm canvas behaves on WSLg + pick the WebGL fallback shape; `impl-worker` for addon wiring + font-load ordering; adversarial review.

**Acceptance.** Input is visibly snappier in a real `claude`/`codex` TUI ⟨live-test⟩; box-drawing/powerline/emoji align with no phantom lines; no cutoff after resize; the active renderer is confirmed canvas (not DOM).

**Notes.** Terminal-cluster file collision with WS-4/WS-5 — coordinate. Subjective "lag" is `⟨live-test⟩`; verify what you can headlessly (renderer active, unicode set, font loaded) and defer the feel to §6.

---

### WS-4 · Session model: Ctrl-C should drop to a live shell (+ opus-route identity)
**Symptoms.** Open a non-shell session (claude / codex / opus-route), Ctrl-C out of it, and you should land back at a normal shell **in the same pane** — the agent sessions are "just a shell that auto-launched a CLI." Today that doesn't behave right.

**Root cause.** Every non-shell agent launches as **`$SHELL -lic '<command>'`** (`src-tauri/src/pty.rs:385-425`; tests `:551-561`) — the CLI is the child of a `-c` command-shell that **exits when the command exits**, so quitting the CLI tears down the PTY/pane rather than leaving a live prompt. The reader thread waits on that shell (`pty.rs:157-162`), and `onData` forwards `\x03` verbatim (`terminal-session.ts:140-144`). *(Whether bash lingers vs. exits under `-lic` is exactly the ambiguous bit — resolve it by changing the model, not by trusting the current one.)*
Separately: `AgentKind = "claude"|"codex"|"shell"` (`contract.ts:12`) and the `opus-route` profile carries agent `"claude"` (`settings.ts:33-66`), so **opus-route panes are indistinguishable from claude** in all agent-keyed UI/state.

**Fix approach.**
1. **Re-parent the launch ⟦DEFAULT⟧:** spawn the pane's PTY as a **plain interactive shell as the ROOT process** (`$SHELL -il`), then **write the launch command into the PTY** (`pty_write("<cmd>\n")`) as if typed. When the CLI exits or is Ctrl-C-quit, the user is naturally back at the same live shell prompt in the same pane and can rerun/relaunch. Update the exit/state semantics and the agent-switch respawn path (`terminal-session.ts:336-370`) to match. This is the tmux/standard-terminal pattern and directly satisfies the user's ask.
2. **opus-route identity:** make opus-route a distinguishable kind or carry a sub-label so its panes/roster entries aren't confused with claude.

**Owner.** `fusion` (or Opus) decision spike to confirm current behavior in a live window and lock the re-parent pattern → `impl-worker` for `pty.rs` + respawn wiring → **adversarial review** (behavior-critical).

**Acceptance.** ⟨live-test⟩ Launch `claude` in a pane → exit it → land at a live shell prompt in the **same** pane, run a command, relaunch the agent; pane state reflects agent→shell transition. opus-route panes are visibly distinct from claude.

**Notes.** The real gate is the live morning test (§6). Do rigorous reasoning + review now; don't claim it works unless it was run.

---

### WS-5 · Clipboard + selection (stale paste; Ctrl-C copies selection)
**Symptoms.** Pasting inserts a **stale** clipboard value — dictating with Wispr Flow then pasting yields old text until a manual Ctrl-C "refresh." And, like Warp, selecting text + Ctrl-C should **copy** the selection instead of firing SIGINT immediately.

**Root cause.** **Split-brain clipboard.** Copy goes to the system clipboard via the Tauri plugin (`@tauri-apps/plugin-clipboard-manager`, `commands.ts:16,73`; only used by `CopyBox`). But terminal **paste rides xterm's built-in *webview* clipboard read** — there is no custom paste code (no `readText`/`onpaste`). On WSLg/WebKitGTK the webview's clipboard read can return a cached/stale value while the native clipboard is fresh → stale paste. And `onData` always forwards `\x03` (`terminal-session.ts:140-144`); the only intercepted key is Shift+Enter (`:154-168`) — **Ctrl-C fires SIGINT even with an active selection**; no select-to-copy exists.

**Fix approach.**
1. **Fresh paste:** intercept paste (Ctrl-V / Shift-Insert / Ctrl-Shift-V / context menu) and route it through the **native Tauri clipboard `readText()`**, then write to the PTY — bypassing the stale webview read.
2. **Ctrl-C semantics ⟦DEFAULT⟧:** in the key handler, if `term.hasSelection()` when Ctrl-C is pressed → copy the selection via the native plugin `writeText()` and **do not** send SIGINT (optionally clear the selection); if there's no selection → send `\x03` as today. Add explicit `Ctrl-Shift-C` copy. (Auto-copy-on-mouse-select is optional/secondary.)

**Owner.** `impl-worker` (paste + key handling in `terminal-session.ts`, plugin calls) + a small research confirm of the WSLg webview-clipboard staleness; adversarial review.

**Acceptance.** ⟨live-test⟩ Dictate with Wispr Flow → paste immediately inserts the **new** text (no manual refresh); select + Ctrl-C copies and does **not** interrupt; empty-selection Ctrl-C still interrupts; Ctrl-Shift-V pastes fresh.

**Notes.** Terminal-cluster file collision with WS-3/WS-4. Clipboard freshness is WSLg-specific → `⟨live-test⟩` in §6.

---

### WS-6 · The Stage / Claude→UI channel — THE HERO. Invest the most here.
**Symptoms.** The AI asks "copy this 32-char string" / shows a generated image / gives a link — and **nothing appears in the Stage**. The feature the whole app is built around feels dead. The user also wants: click an image to expand it as a **full-window overlay**; when told "run this command," get a one-click way to run it.

**Root cause** (verified). The Stage is **UI-complete but ingest is cooperative-only** (~55%). The OSC 5379 lane is fully wired end-to-end (`terminal-session.ts:130-138` → `osc.ts:13-23` → `stage.ts:24-39`), with real `CopyBox`/`LinkCard`/`ImagePreview`/`FilePreview` cards. **But content only surfaces if a program explicitly emits `ESC ]5379;…BEL` via the `helm` shim.** Claude Code / Codex don't emit it, so ordinary output surfaces **nothing** — there is **zero passive detection**. Gaps: no "command" artifact type; no image lightbox (`ImagePreview.tsx:57` `<img>` has no `onClick`; `App.tsx` renders no overlay); the `widget` html type is a stub (no `case "widget"` in `Stage.tsx:20-36`); cards are append-only with no surfaced dismiss.

**Fix approach — two complementary tracks.** Track 1 is the priority (works for *any* tool); Track 2 makes Claude first-class.

1. **PASSIVE DETECTION (primary).** Add a scanner over the pane's output stream that heuristically surfaces artifacts **without tool cooperation**. Scan *new complete lines* (debounced, rolling window — never re-scan 5000 rows of scrollback per byte), dedupe, and push typed cards to the per-pane Stage store:
   - **URLs** → `LinkCard` (reuse the WebLinksAddon matcher already in `TerminalPane.tsx:63`; route matches to the Stage).
   - **Copyable tokens** → `CopyBox`: trigger conservatively on explicit cues ("copy this", "copy:", "here's your…") **and/or** high-entropy standalone tokens (hashes, keys, UUIDs, base64 ≥ N chars), and fenced/backtick single values.
   - **Commands** → a **NEW `command` artifact type** with a **"Run in pane"** button that writes the command into the active PTY. This is the user's explicit ask. **Security: never auto-run — require a click, show the exact command verbatim, no hidden mutation.**
   - **Images** → `ImagePreview`: detect filesystem paths ending in an image extension that exist on disk (Rust already reads paths via `image_read`), plus "generated/saved image at …" announcements.
   - Make the whole detector **toggleable in Settings** and tuned to avoid false-positive spam.
2. **MAKE THE AI EMIT (secondary, higher-fidelity for Claude).** Ship a small **Claude Code hook / output-style / skill** that calls the `helm` shim (`helm copy|link|img`) when Claude wants the user to copy/open/see something — the cooperative lane done right. Roadmap continuation: the **MCP return channel** (`helm_copy`, `helm_show_link`, `helm_preview_image`, and the bidirectional `helm_pick_file`, `helm_ask`) from `ARCHITECTURE.md §4.4`.
3. **IMAGE LIGHTBOX.** Add `onClick` to `ImagePreview` → a **full-window overlay** (mirror the existing Settings-modal overlay pattern) showing the image large; click-scrim / Esc to dismiss. Explicitly requested.
4. **Finish the cards.** Implement the `widget` case in `Stage.tsx` (currently falls through to a placeholder); surface the dismiss/clear control the store already supports (`dismiss`/`clearPane`).

**Owner.** A `fusion`/Opus **design spike** on the detection strategy + heuristics + security model first. Then `impl-worker` (detector, `command` type + PTY write-back, `widget` case, shim hook) and `ui-builder` (image lightbox, command card, Stage polish) — coordinated. **This is the flagship; give it the deepest review.**

**Acceptance.** ⟨live-test⟩ With real Claude Code in a pane: printing "Copy this: `<hash>`" → a `CopyBox` appears in the Stage; a URL → a `LinkCard`; a shown/generated image → an `ImagePreview` **and** clicking it opens a full-window lightbox; a fenced command → a "Run" card that types it into the pane on click. Ordinary output produces **no** false-positive spam. Detection is toggleable.

**Notes.** Highest value + highest subtlety. Tune heuristics conservatively; a noisy Stage is worse than a quiet one. The `img`/`file` payloads already round-trip through Rust, so the lightbox is additive UI, not new backend.

---

### WS-7 · File explorer — colored, per-type icons
**Symptoms.** Every entry in the file tree shows a folder icon regardless of type.

**Root cause** (verified). The icon choice is a single ternary picking only `ic-folder`/`ic-files` (`src/components/FilesView.tsx:167-169`), and those two SVGs are the **byte-identical folder path** in `src/components/icons.tsx` (`ic-files:47-49`, `ic-folder:106-108`). So directories and files draw the same glyph. **No icon library is installed** — all iconography is a hand-rolled inline-SVG sprite.

**Fix approach.** Add a **colored, per-language file-icon set** + an extension/filename→icon map at `FilesView.tsx:167-169`.
- **Icon source ⟦DEFAULT⟧:** vendor a curated **colored** set derived from **material-icon-theme / vscode-icons / seti-ui** SVGs (they give real per-language glyphs: ts/tsx/js/json/rust/py/md/css/html/toml/yaml/lock/images/git, plus special filenames `package.json`, `Cargo.toml`, `.gitignore`, `Dockerfile`), integrated as a sprite to match the existing pattern — keeps deps light and matches the hand-rolled approach. (A monochrome lib like lucide/react-icons is *rejected* — the user specifically wants the colored JSON/TS look.)
- Folders get proper open/closed glyphs; unknown types get a sensible generic file icon.

**Owner.** `Explore`/Opus to pick + vet the set → `ui-builder` to integrate on-design (colored file icons are a sanctioned *functional* color exception like ANSI/agent identity — keep them tasteful and legible on the void tree, not rainbow noise) → `impl-worker` can wire the extension map. Verify.

**Acceptance.** The tree shows distinct colored icons for common types + proper folder open/closed; unknown types fall back sensibly; all icons legible on `#08090a`.

---

### WS-8 · Source control → VS Code parity
**Symptoms.** Source control is very basic; should approach VS Code's Source Control tab.

**Root cause** (verified). It's a **read-only status viewer** (~15%): a flat changed-files list (`src/components/Sidebar.tsx:32-56`, badge+path `:46-51`, stub hint "Staging + commit land in P1." `:52`), fed by a 15s poll (`src/store/git.ts`). Backend shells to real `git` but exposes **only** `git_status` (`src-tauri/src/sys.rs:95-124`; registered `lib.rs:17-27`); the porcelain parse **collapses the staged/unstaged split**. No stage/unstage, commit, diff, branch, or push/pull anywhere.

**Fix approach.**
1. **Backend** (`sys.rs`, following the existing shell-to-`git` pattern; parse porcelain **v2** or `-z` to preserve staged-vs-worktree): add commands `git_stage`, `git_unstage`, `git_stage_all`, `git_unstage_all`, `git_commit(msg, amend?)`, `git_diff(path, staged?)`, `git_branch_list`, `git_checkout`, `git_create_branch`, `git_discard`, `git_push`, `git_pull`, `git_fetch`. Register all in `lib.rs`. Fix the parse to keep the staged/unstaged distinction.
2. **UI** (`ScmView` + a new `DiffView`): VS Code shape — **STAGED CHANGES** and **CHANGES** groups with counts; per-file inline stage/unstage (`+`/`−`) + stage-all/unstage-all; a **commit message box** + commit button; branch name with ahead/behind + a **sync/push/pull** affordance; **per-file diff** (red/green hunks) opened in the center workspace or a side panel; discard; branch switcher. Refresh on action (keep the poll as a backstop).

**Owner.** `impl-worker` (all Rust git commands + store + wiring — mechanical, batched) + `ui-builder` (ScmView + DiffView to parity, on-design; the diff view is the meaty piece) → adversarial review.

**Acceptance.** Staged/unstaged groups; stage/unstage per file + all; write a message and commit; view a per-file red/green diff; switch branches; push/pull; ahead/behind shown and actionable — matching the VS Code Source Control shape.

**Notes.** Largest single workstream, but **fully parallel** (own files: `sys.rs`, `lib.rs`, `git.ts`, `Sidebar.tsx`, new `DiffView`). Good one to launch first so it runs while you drive the others.

---

### 3.9 Phase-1 dependency graph + launch order
```
Independent, launch concurrently:
  WS-8 (source control)   ── own files, biggest → start FIRST, runs in background
  WS-7 (file icons)       ── own files
  WS-6 (stage/hero)       ── own files (osc/stage/Stage/ImagePreview/App overlay); deepest review
  WS-1 (window chrome)  ─┐
  WS-2 (draggable panes)─┼─ share the "resizing-suspend" gate → define it ONCE, coordinate
                          │   (WS-1 & WS-2 touch App.tsx/CSS/layout store — sequence their commits)
Terminal cluster — SERIALIZE (all touch terminal-session.ts / TerminalPane.tsx / pty.rs):
  WS-3 (perf/render) → WS-4 (session model) → WS-5 (clipboard)
     run as one coordinated terminal pass, or strictly in order; never parallel writers
```
Suggested cadence: kick off WS-8, WS-7, WS-6 in parallel first (independent), plus a shared "resizing gate" mini-task; then WS-1/WS-2; then the terminal cluster as a single sequenced pass. Review + commit each as it lands.

---

## 4. PHASE 2 — MAKE IT BETTER

Run after Phase 1 lands (or interleave the independent items if agents are idle). Prioritized by ideological value: **deepen the differentiator first.** Scale depth to any token budget the user set at launch (`budget` directive); if none, do Tier A fully, then B, then C/D as time allows. Log what you shipped vs. deferred in §6.

### Tier A — Deepen the differentiator (the Stage / Claude→UI channel). Highest value; this is why helm exists.
- **Bidirectional widgets.** Interactive cards that send input **back** to the pane: approve/deny buttons, option pickers, a text-reply field. Turns the Stage from a display into a control surface. Owner: `ui-builder` + `impl-worker` (PTY write-back + a return-payload type).
- **More widget types:** JSON tree, table, markdown, unified diff, progress/status. Owner: `ui-builder`.
- **MCP return channel** (`ARCHITECTURE.md §4.4`): host an MCP server; per-pane `HELM_PANE` routing; typed tools `helm_copy` / `helm_show_link` / `helm_preview_image`, and the bidirectional `helm_pick_file` (opens the tree, returns a path to Claude) + `helm_ask` (popup → answer). OSC stays the universal spine; MCP is the Claude-native premium lane. Owner: `impl-worker` (server + wiring), `ui-builder` (pick/ask UI).
- **Stage history + pinning + per-artifact actions** (save image, reveal in tree, copy path, re-run command). Owner: `ui-builder` + store work.
- **Ship the "light up the Stage" helm skill/hook** productized from WS-6 Track 2, so any Claude Code pane populates the Stage out of the box.

### Tier B — Cockpit for the system (the roadmap P2 vision: "give the native primitives a face").
- **Real agent roster:** read Claude Code Agent-Teams membership/status + background-agent list + live task/model/state, beyond helm's own panes. Owner: `impl-worker` + `ui-builder`.
- **Orchestration UI:** `/loop` control, a worktree manager, spawn/route agents from the UI.
- **Command palette (⌘K):** switch panes, spawn agents, run helm commands, jump to files. Owner: `ui-builder`.

### Tier C — Terminal power + ergonomics.
- **Search in terminal** (`@xterm/addon-search`), copy-mode, better scrollback nav.
- **Session persistence/restore:** reopen panes/tabs/cwd/agent on launch. (Respect drvfs no-inotify — poll or persist explicitly.)
- **Tab reordering, per-pane rename/title, broadcast-input** across panes, quick-split shortcuts, zoom-a-pane.

### Tier D — Craft, polish, performance.
- **Motion:** apply Emil defaults (easing tokens already in `tokens.css §8`) tastefully to Stage arrivals, sheet/drawer, overlays; **keyboard actions get no animation** (frequency gate). Owner: `ui-builder`.
- **Empty states, focus rings, micro-interactions, settings depth, light theme** (a semantic token re-map per DESIGN.md §9 — near-zero component edits).
- **Performance:** the byte-IPC encoding (`number[]`→compact), the WebGL-gated renderer path, render-churn (`TabSurface` subscribes to the whole panes map, `SplitPanes.tsx:47`; idle-timer flips re-render the tab surface, `terminal-session.ts:57-79`) — scope subscriptions.
- **First-run onboarding** that demonstrates the Stage differentiator.

---

## 5. Verification protocol (be honest; respect the environment)

**Hard gates, every workstream:** `npm run typecheck` and `npm run build` must pass before you commit. An implementer that says "done" without a clean build is not done.

**UI surfaces:** render headlessly and have a **fresh** agent (not the builder) check a screenshot against the acceptance checklist — "looks good" is banned; cite evidence per item; ambiguity = FAIL. Use it on the hero surfaces (Stage, source control, file tree, window chrome).

**Environment reality (from prior sessions — respect these):**
- **WSLg cannot screenshot the Tauri window and cannot inject input.** So live PTY/terminal behaviors — input lag, Ctrl-C→shell, paste freshness, select+Ctrl-C, real-clipboard, window-resize feel, transparent corners on Windows — **cannot be verified headlessly.** Do rigorous code review + reasoning, and **defer the behavioral confirmation to §6 Morning Review.** Do **not** claim a `⟨live-test⟩` item works.
- **Headless Chromium against the Vite dev server renders the chrome** (despite the WSLg block) — use it for visual checks of the React UI. Playwright can drive the Zustand store to stage states. `ps --ppid` inspects the process tree.
- **drvfs has no inotify** — file-watching is unreliable; prefer explicit reads/polling.

**Never rubber-stamp.** The builder never verifies its own output. If you can't verify something, say so and route it to §6.

---

## 6. MORNING REVIEW

**A. Shipped** — every item built → adversarially reviewed (fresh agent, evidence-per-item) → fixed → typecheck+build gated → committed on `overhaul`:

| Commit | Item | What changed | Status |
|---|---|---|---|
| `707007e` | WS-1 window chrome | 8 resize grips enlarged (edges 7px / corners 18px), `.win-ctrls` raised above grips, 12px rounded shell + clip, `windowResizing` gate + opaque-during-resize paint | built ✓ reviewed ✓ · resize feel `⟨live-test⟩` |
| `c783bc2` | WS-7 file icons | Colored per-type SVG set + open/closed folders, no duplicate glyphs, DESIGN.md §4.5 | built ✓ reviewed ✓ |
| `4647990` | WS-4 session model | Agent panes = `$SHELL -il` root + typed launch cmd → Ctrl-C/exit drops to live shell in same pane; `"opus"` AgentKind + v3 settings migration | built ✓ reviewed ✓ · Ctrl-C-to-shell `⟨live-test⟩` |
| `99feb6c`+`e96d3d0` | WS-3 terminal render | Canvas addon (DOM fallback) + unicode11 (`^0.8.0`, `allowProposedApi:true`) + awaited font before `term.open()` + reflow-suspend on resize | built ✓ reviewed ✓ · input latency `⟨live-test⟩` |
| `ba6ebfb` | WS-8 source control | Rust porcelain-v2 `-z` status + 13 git commands (toplevel-anchored, argv-safe); VS Code-style `ScmView` + `DiffView` | built ✓ reviewed ✓ cargo ✓ |
| `99b66f2` | WS-2 draggable panes | Sidebar↔center & center↔stage splitters (clamp/collapse, persisted), thin stable terminal scrollbar, maximize squares corners | built ✓ reviewed ✓ |
| `7e8da0a` | WS-5 clipboard | Native paste → `term.paste()` (fresh, bracketed); Ctrl-C copies selection else SIGINT; Ctrl+Shift+C; Shift+Enter→LF | built ✓ reviewed ✓ · paste freshness `⟨live-test⟩` |
| `7e48b0a` | WS-6 Stage HERO | Passive detector (URL/token/command/image cards, unread dot, toggle), command Run-in-pane, sandboxed widget iframe, image lightbox, `shim/helm` OSC → `/dev/tty`; security review PASSED | built ✓ reviewed ✓ security ✓ · real-Claude flow `⟨live-test⟩` |
| `6b5fd93` | **Track-2 Claude hook bridge** | OSC 777 `helm;` ingest (Claude Code `terminalSequence` allowlist; same `parseOsc` validation as 5379, foreign 777 passes through) + `shim/helm hook` subcommand (PostToolUse Write/Edit → img/copy card; /dev/tty 5379 preferred, 777 terminalSequence fallback; jq or python3; silent no-op outside helm) + `docs/CLAUDE-HOOKS.md` opt-in snippet. Cooperative cards now reach the Stage even in the alternate buffer | built ✓ hook paths tested detached ✓ · real Claude turn `⟨live-test⟩` |
| `68c34bc` | **P2-A bidirectional widgets** | OSC `confirm`/`choice`/`ask` → interactive Stage cards; click writes response verbatim + Enter to the SAME pane PTY, idempotent answered guard. Security FIX-FIRST round applied: control-char rejection + length caps in `osc.ts`, defense-in-depth re-check in `respond()`, 50-widget/pane FIFO cap, cards always show the LITERAL send bytes in mono (label can't mask hostile bytes). Visual review PASS on real measurements (248px no-overflow, contrast ≥4.5:1, focus rings, Enter submits) | built ✓ security-reviewed ✓ visual-reviewed ✓ · stdin round-trip `⟨live-test⟩` |

**B. Defaults I took ⟦DEFAULT⟧ — override any that are wrong:**
- Rounded outer shell 12px, inner chrome radius-0 (DESIGN.md §7); kept `transparent:true` + `macos-private-api` (needed for corners); maximize squares corners.
- Canvas renderer default; WebGL deferred to a setting (Tier D).
- Session model = `$SHELL -il` as PTY root + typed launch command.
- Muted colored file icons (DESIGN.md §4.5).
- Passive Stage detection ON (`stageDetect` toggle); commands NEVER auto-run — click required; bidirectional widget responses user-click-only, same-pane, single-shot.
- Confirm-card default sends: `yes → "y"`, `no → "n"` when the program omits them.
- Interactive OSC payload caps: prompt 2000 / send-string 512 / label+placeholder 200 chars, control chars rejected (drop, not truncate); 50 widgets per pane (FIFO evict).
- Git: branch `overhaul`, incremental commits, **not pushed, no PR**.

**C. MUST TEST LIVE (WSLg cannot screenshot the Tauri window or inject input — verified by review/reasoning only):**
1. Input snappy in a real `claude` TUI; glyph alignment; no cutoff after resize (WS-3).
2. Ctrl-C / exit out of claude/codex/opus-route drops to a live shell in the same pane; launch cmd resolves under `$SHELL -il` (a p10k/rc reading stdin could eat it — fallback: gate the write on first output); no orphaned CLI (WS-4).
3. Wispr paste → fresh text on all 4 trigger paths; multi-line paste doesn't mis-submit (WS-5).
4. Select + Ctrl-C copies without interrupting; empty Ctrl-C SIGINTs; Ctrl+Shift+C (WS-5).
5. Resize smooth; corners rounded on Windows; maximize squares; all 8 grips grab; window controls clickable at corners (WS-1/2).
6. Real Claude output → Stage cards + lightbox. Check whether claude/codex run the ALTERNATE buffer — the passive detector skips it; if so, Track-2 hook is the fix (WS-6).
7. **P2-A round-trip:** run e.g. `printf '\033]5379;{"v":1,"t":"confirm","prompt":"deploy?"}\007'; read x; echo "got: $x"` in a pane → click Yes → the waiting `read` should print `got: y`.
8. **Track-2 hook bridge:** add the `docs/CLAUDE-HOOKS.md` snippet to `~/.claude/settings.json`, run Claude Code in a helm pane, have it Write/Edit a file → copy/img card should appear even while Claude holds the TUI. Manual smoke first: `printf '\033]777;helm;{"v":1,"t":"copy","text":"hi"}\007'` → copy card.

**D. Parked / blocked:**
- WS-4: `pty_kill` signals the shell PID only (not the process group) — a SIGHUP-ignoring child could orphan; normal reap is via master-fd-drop SIGHUP. Agent panes rarely reach done/error now (Exit is tied to the shell) — intended.
- WS-6: widget iframe ships `csp:null` — sandbox blocks scripts (proven inert in-browser) but a passive `<img>` beacon from widget HTML is possible; add CSP after live-testing it doesn't break assets.
- WS-2: no load-time center-floor (masked by breakpoints); static `aria-valuemax`.
- P2-A: interactive cards survive the emitting program's exit (shell then reads stdin). Mitigated by literal-send-bytes display + control-char/length validation, not eliminated — the pane can't know when the emitter exits under the WS-4 shell-root model. Consider auto-expiring interactive cards on pane output activity if live use shows risk.
- Track-2: hook config is opt-in (documented snippet), NOT auto-installed into `~/.claude/settings.json` — mutating user config unsupervised was out of bounds. Windows shims (`helm.cmd`/`helm.ps1`) carry a TODO for hook parity (untestable here). `Stop`-event turn-summary card deliberately skipped pending live feel.
- Phase 2 remaining (deliberately not rushed unsupervised — need live-agent testing or larger architecture): Tier A — MCP return channel (per-pane `HELM_PANE` routing, `helm_copy`/`helm_ask`/`helm_pick_file`), ~~Track-2 hook~~ (SHIPPED `6b5fd93`), Stage history/pinning, more widget types (table/json/markdown/diff/progress). Tier B — agent roster, orchestration UI, ⌘K palette. Tier C — terminal search, session persistence, tab reorder/rename, broadcast-input. Tier D — motion polish, empty states, light theme, byte-IPC perf, WebGL setting, onboarding.

---

## 7. Kickoff prompt (paste this into the fresh session)

```
Read /mnt/e/Projects/helm/docs/OVERHAUL-MASTER.md in full, then skim DESIGN.md §1–6 + src/styles/tokens.css.

You are the ORCHESTRATOR for an overnight overhaul of helm. You do NOT write code —
you spawn agents, review their diffs adversarially, integrate, verify, and commit.
Set /effort max.

Execute Phase 1 (all 8 workstreams) then Phase 2 (by tier), following the doc's
orchestration law exactly: orchestrator owns the loop, agents stay flat, route
UI→ui-builder(Opus)/mechanical+backend→impl-worker(GPT)/research→Explore, review
with a fresh adversarial agent (max 2 rounds, "looks good" banned), batch edits then
one verify, DESIGN.md wins, protect your own context by delegating.

Work on a branch `overhaul`, commit per reviewed workstream, do NOT push or open a PR.
Respect the WSLg verification limits — don't claim live PTY/clipboard/resize behaviors
work when they can't be verified headlessly; defer those to the Morning Review.
Take the marked ⟦DEFAULT⟧ decisions, log them in §6, and never wake me.
Fill in §6 Morning Review before you stop. Go.
```

---
*Root-cause maps in §3 were produced by a codebase-mapping pass and are current as of this doc. Source of truth for visuals: `DESIGN.md` + `src/styles/tokens.css`. Architecture + OSC spec: `docs/ARCHITECTURE.md`.*
