# helm — Architecture & Build Plan

> A custom agent-cockpit desktop app. An IDE-lite shell wrapped around a terminal, built to be the daily driver for AI-assisted development on Windows + WSL. The anti-Warp: light, fast, yours.

This document is the brainstorm deliverable and the source of truth for **what** helm is and **how** it's built. Visual language (palette, tokens, matte-vs-glass) is owned separately by `DESIGN.md`, derived via the `design-foundation` method.

---

## 1. Why helm exists

Warp is hated for a reason: heavy, opinionated, "feels like a bottleneck." helm is not another terminal — it's a **cockpit**. The terminal is table stakes (every emulator has one). The reason helm is worth building is the layer terminals *can't* give you:

- **The Claude→UI widget channel** — when an agent in a pane needs you to open a link, copy a value, or look at an image, it surfaces as a real clickable widget in helm's chrome instead of getting lost in scrollback. This is the differentiator.
- **A glanceable agent roster** — see live sessions, which are Claude vs Codex, what each is running.
- **IDE-lite chrome** — file tree, image/preview surface, per-pane model switching — around a terminal that stays spacious.

Research (`SYSTEM-MASTER.md` PART 4) concluded "don't build custom — WezTerm + tmux + native primitives cover most of it." helm overrides that **only** on the grounds above: the widget channel and cockpit chrome are exactly what native tooling can't do. Everything native primitives already do well (orchestration, worktrees, `/loop`, Agent Teams), helm **wraps and surfaces** — it does not reinvent.

---

## 2. Locked architecture decisions

| # | Decision | Choice | Why (short) |
|---|----------|--------|-------------|
| 1 | Runtime / base | **Tauri v2, scratch-built** | ~7 MB, low RAM — kills the "bottleneck" feel and the WSL-RAM pain. Own every pixel (dogfood the design system from zero). `portable-pty` = WezTerm's own crate, so the research's WezTerm endorsement is satisfied *inside* the app. Crib wiring from 2026 refs (Terminon, Terax, `tauri-plugin-pty`). |
| 2 | Layout / IA | **IDE cockpit** | Activity rail (icons + live roster badges) · collapsible left sidebar (Files/Roster swap) · center terminal (tabs + split panes) · collapsible right **Stage** dock (auto-reveals for images/widgets) · status bar · custom titlebar. Terminal is the center of gravity; both docks collapse so it never feels cramped. |
| 3 | Claude→UI channel | **In-band OSC 5379 + `helm` shim** | The emitter is "whatever runs in the pane" (claude, codex, cx-*, any program) — so the channel must be in-band. An escape sequence rides the pane's own PTY bytes: pane-association is free, and it survives WSL/SSH/tmux/docker. MCP is a **phase-2 semantic overlay** (Claude-native, bidirectional), not the spine. |

Rejected, with reasons on file: Electron (heavy RAM — the thing we're fleeing), forking Wave Terminal (its block-replaces-scrollback paradigm fights the panes+chrome vision; Electron+Go mass), MCP-as-spine (Claude-only, strands codex panes, needs session-id plumbing), file-watch channel (loses pane-association, breaks over SSH).

---

## 3. System architecture

```
┌───────────────────────── Tauri app (helm) ─────────────────────────┐
│                                                                     │
│  WebView2 (frontend: React + TS + Vite)                             │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ Cockpit shell (DESIGN.md-themed)                           │     │
│  │  rail │ Files/Roster │  xterm.js panes  │  Stage dock       │     │
│  │                         (webgl renderer)   (widgets/images) │     │
│  │                          ▲          │                        │     │
│  │        registerOscHandler(5379)  onData/onResize             │     │
│  └──────────┼───────────────────────────┼──────────────────────┘    │
│             │ invoke() / Channel<bytes>  │ invoke()                  │
│  Rust core (src-tauri)                   ▼                           │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ PtyManager (portable-pty)  ·  FsService  ·  Clipboard/Opener│     │
│  │  spawn wsl.exe / pwsh / bash / claude / codex / cx-*        │     │
│  │  stream stdout→Channel, stdin←invoke, resize, kill          │     │
│  └───────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
        │ each PTY spawned with env: HELM=1, HELM_PANE=<id>, PATH+=shim
        ▼
   the shell / agent running inside the pane
```

**Process model.** Webview owns all UI + xterm.js instances (one per pane). Rust owns everything native: PTY lifecycle via `portable-pty`, filesystem reads for the tree + image preview, clipboard, and OS "open". The webview never touches the FS or processes directly — everything goes through `invoke()` (sandboxed, the Terax pattern). PTY output streams webview-ward over a Tauri `Channel<Bytes>`; keystrokes/resize go Rust-ward via commands.

**Terminal rendering.** xterm.js with the WebGL addon (perf), fit addon (resize), web-links addon. ANSI/truecolor palette comes from `DESIGN.md` so the terminal and the chrome read as one system.

**WSL / Windows specifics (crib from Terax/Terminon):** launch WSL by spawning `wsl.exe` through the same PTY interface; ConPTY on Win10 1809+; normalize cwd to backslashes before ConPTY (`CreateProcessW` misbehaves on forward-slash cwd). Shell detection order on Windows: `pwsh.exe` → `powershell.exe` → `cmd.exe`.

---

## 4. The Claude→UI channel (the differentiator) — spec

### 4.1 Transport — custom OSC sequence
- **Sequence:** `ESC ] 5379 ; <json> BEL`  (OSC code `5379` chosen private-safe — avoids 7/8/52/133/633/777/1337).
- **Payload (v1):** `{"v":1,"t":<type>,...}`
  - `{"t":"copy","text":"…","label":"…?"}` — click-to-copy box
  - `{"t":"link","url":"…","label":"…?"}` — clickable link card
  - `{"t":"img","path":"…"}` — image preview (helm's Rust core reads the file; `"b64"` field is the remote/SSH fallback)
  - `{"t":"widget","html":"…"}` — generic escape hatch (sandboxed render)
- **Frontend handler:** `term.parser.registerOscHandler(5379, data => { dispatch(paneId, parse(data)); return true; })`. Returning `true` **consumes** the sequence — it never renders to scrollback. The handler closure knows its `paneId` because the xterm instance *is* the pane → **pane-association is free**. xterm's parser buffers partial OSC across chunked PTY reads, so no hand-rolled reassembly.

### 4.2 Emit API — the `helm` shim
A tiny script installed on PATH inside every shell helm spawns. It just prints the OSC sequence:
```
helm copy [--label L] <text|-   >   # - reads stdin
helm link <url> [label]
helm img  <path> [--b64]
helm widget <json|file>
```
Every PTY is spawned with `HELM=1`, `HELM_PANE=<id>`, `HELM_VERSION`, and the shim dir prepended to `PATH`. If `HELM` is unset (shim run outside helm), it degrades to a plain readable fallback (e.g. prints the URL) instead of emitting garbage. So the "API" an agent uses to drive helm's UI is **one shell command** — explicit, scriptable, debuggable, and works identically for claude, codex, cx-*, or a bash one-liner.

### 4.3 Stage rendering
Dispatch pushes a typed event into per-pane Stage state; the Stage dock renders the widget and **auto-reveals** if collapsed. Widgets are real components: `CopyBox` (click → Tauri clipboard), `LinkCard` (click → Tauri opener), `ImagePreview` (Rust reads path → render). All themed by `DESIGN.md`.

### 4.4 Phase-2 overlay — MCP (roadmap, not v1)
helm hosts an MCP server; each pane's Claude gets it registered (`HELM_PANE` → session routing). Adds (a) typed, discoverable tools (`helm_preview_image`, `helm_show_link`, `helm_copy`) so Claude needn't shell out, and (b) a **return channel** the OSC lane can't do: `helm_pick_file` (opens the tree, returns the chosen path to Claude), `helm_ask` (popup, returns the answer). OSC stays the universal spine; MCP is the premium Claude-native lane on top.

---

## 5. Orchestration — surface native primitives, don't reinvent

Under the hood, agent orchestration stays on **Claude Code native primitives** (Agent Teams, background agents, `/loop`, `/goal`, worktrees, the Agent SDK). helm's job is to give them a **face**, not a replacement:

- **v1:** the roster shows helm's own live panes/sessions (each pane knows its command + model + state: running/idle/error), color-coded Claude vs Codex.
- **Roadmap:** read real Agent-Teams membership/status, list background agents, drive `/loop`, manage worktrees, spawn/route from the UI. That's where helm becomes a true cockpit for the system, not just a pretty terminal.

---

## 6. v1 scope — honest (ships this weekend)

**In v1 (the "done" bar = terminal runs + file tree + image preview + ONE widget end-to-end + roadmap):**
- Tauri app + cockpit shell (rail · Files/Roster sidebar · center terminal · Stage · status bar · custom titlebar), themed by `DESIGN.md`.
- Terminal: PTY spawn of shells / WSL / `claude` / `codex` / `cx-*`; tabs; at least one split (h/v); **per-pane model/agent switcher** (sets what the pane launches).
- File-tree sidebar: browse cwd, open a file (preview in Stage; full editor is backlog).
- Image-preview in the Stage.
- **OSC channel + `helm` shim + click-to-copy AND image widgets end-to-end** (copy is the minimal proof; image is the hero).
- Roster: helm's own live panes with model/agent icon + state.
- Settings: theme + background (basic).

**Explicitly backlog (not v1, and said so):**
- MCP overlay + return channel · deep native-orchestration control (spawn Agent Teams from UI, `/loop` control, worktree manager) · full code editor (Monaco) · more widget types (tables/JSON-tree/diff/forms) · session persistence & restore · broadcast input · command palette (⌘K) · SSH/remote panes · auto-updater · gated effect chrome (shadergradient/liquid-glass, only if `design-foundation`'s effect-gate allows).

---

## 7. Roadmap (phased)

- **P0 — v1 core (this weekend):** section 6.
- **P1 — deepen the differentiator:** MCP overlay + return channel (`helm_pick_file`, `helm_ask`); more widget types (tables, JSON tree, diff, forms); Stage history.
- **P2 — orchestration UI:** real Agent-Teams roster (membership/status), background-agent list, `/loop` control, worktree manager, spawn/route from UI. "Give the native primitives a UI."
- **P3 — craft & flow:** command palette (⌘K), session persistence/restore, broadcast input, Emil motion defaults, gated effect chrome, deeper settings/themes.
- **P4 — reach:** SSH/remote panes, auto-update, plugin surface, cross-machine.

---

## 8. Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Shell | Tauri v2 | WebView2 on Windows (preinstalled Win11) |
| Frontend | React + TypeScript + Vite | |
| Terminal | xterm.js + webgl/fit/web-links addons | |
| PTY | `portable-pty` (Rust, wezterm crate) | streamed via Tauri `Channel`; `tauri-plugin-pty` as a fallback |
| State | Zustand (light) | per-pane + global cockpit state |
| Styling / tokens | **derived by `design-foundation` → `DESIGN.md`** | matte-vs-glass, palette, type/spacing/elevation TBD by the foundation pass |
| Channel | custom OSC 5379 + `helm` shim | MCP overlay in P1 |
| Icons | TBD by foundation (lucide / phosphor) | roster + rail need a consistent set |

---

## 9. Dogfooding — helm is built *using* the system

helm is the proof case for the whole `~/.claude/` system (`BUILD-SPLIT.md` P4, Wave 2):
- **`design-foundation` runs FIRST** → derives helm's dark-developer-tool `DESIGN.md` (OKLCH ramps, WCAG/APCA gates, semantic 12-step tokens). Nothing visual is built before it lands.
- **All UI/visual work → `ui-builder`** (Opus, pinned) against `DESIGN.md`; self-critiques for AI-slop before returning.
- **Mechanical/bulk work → `impl-worker`** (GPT, pinned) — scaffolding, PTY wiring, per-file boilerplate; batches edits then one verify pass.
- **`visual-verify`** (fresh agent, deterministic gates first) checks helm's own UI as it's built — never rubber-stamped.
- Enforcement hooks keep it on-rails.

---

## 10. Open questions / risks

- **portable-pty WSL launch** — confirm `wsl.exe` under ConPTY + the backslash-cwd gotcha (Terax solved it; crib the exact handling).
- **xterm custom-OSC chunking** — verify partial-OSC reassembly across PTY reads (xterm should own this; confirm in a spike).
- **Per-pane switcher semantics** — v1: the switcher sets the *launch command*; switching model = a new session in that pane (the CLIs don't hot-swap models mid-session anyway).
- **Effect chrome** — `design-foundation`'s effect-gate will likely restrain heavy effects for a dense dev tool; treat shadergradient/glass as opt-in flourishes, re-skinned to tokens, not defaults.
- **WebView2 + webgl perf** — expected fine; validate with a busy `xterm` + any background effect early.
