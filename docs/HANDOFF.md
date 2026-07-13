# helm — Build Execution Handoff (design + mockup locked → **parallel build**)

**You are a fresh session picking up helm to BUILD v1, fast, by fanning out agents.** Design is locked, the mockup gate passed. Your job: scaffold once, then run a **UI track and a functionality track in parallel** against a fixed integration contract, and integrate. Read this, then `docs/ARCHITECTURE.md` (full architecture + OSC spec §4) and `DESIGN.md` (visual law) + `mockup/cockpit.html` (the pixel target).

**Effort:** high/max. **Repo:** `/mnt/e/Projects/helm` (git `main`, `.gitignore` in place, **no commits yet** — commit only when the user asks).

---

## What helm is (30s)
A custom **agent-cockpit desktop app** (Tauri v2 / WebView2) — an IDE-lite shell around a terminal, the daily driver for AI dev on Windows + WSL. The anti-Warp: light, fast, precise. Differentiator = the **Claude→UI widget channel** (agents surface clickable widgets in the chrome via in-band OSC, not scrollback) + a glanceable **agent roster** + IDE chrome around a terminal that stays spacious.

## What's DONE (do NOT redo)
1. **Design — LOCKED.** `DESIGN.md` is final: matte flat-dark "command center," **azure** helm accent (`#0082ce`), mono-forward IBM Plex, agent color-coding (Claude `#df8352` orange, Codex `#62c5b9` teal), full OKLCH/WCAG-AA token contract in §9. Components consume the **semantic tier only** — never a raw hex. *(A darker/violet re-tone was explored and reverted per the user — stay azure. Do not re-litigate palette.)*
2. **Mockup gate — PASSED.** `mockup/cockpit.html` is a token-faithful static cockpit (rail · Roster · terminal split w/ realistic ANSI · Stage widgets · status bar · titlebar), graded clean on contrast + identity. **This is your fidelity bar — port its markup/components to React.** (`mockup/cockpit-azure.html` is an identical backup.)
3. **Env prep — partly done** (see next section): Rust toolchain installed; Node/bun present; dev target chosen (Linux/WSLg).

## What's LEFT = v1 scope ("done" bar)
Terminal runs (PTY spawn shells/WSL/`claude`/`codex`/`cx-*`, tabs, ≥1 split, per-pane model/agent switcher) · file-tree sidebar (browse cwd, open→preview in Stage) · image preview in Stage · **OSC channel + `helm` shim + click-to-copy AND image widget end-to-end** · roster of live panes (agent icon + state) · basic settings (theme/background). Backlog (NOT v1): MCP overlay + return channel, orchestration UI, Monaco, more widget types, session persistence, ⌘K palette, broadcast input, SSH, auto-update. Full phasing in `ARCHITECTURE.md` §6–§7.

---

## Environment — exact state + the ONE blocker
- **OS:** Ubuntu 24.04 in WSL2, **WSLg works** (`DISPLAY=:0`, `/mnt/wslg`). → **Dev target = Linux/WSLg**: `tauri dev` opens a real window here, so you can run + iterate. Windows/WebView2 is the eventual *ship* target; write the Windows-specific PTY handling (below) but validate it on a Windows package build later.
- **Rust:** installed via rustup (userspace). Activate with `source "$HOME/.cargo/env"` (rustc/cargo 1.97). 
- **Node:** v24 + npm 11 + **bun 1.3** available (no pnpm/yarn).
- **Tauri CLI:** not installed — use the **npm** CLI at scaffold (`npm i -D @tauri-apps/cli`), avoids a cargo compile. `create-tauri-app` is non-interactive: `npm create tauri-app@latest <name> -- -m npm -t react-ts --tauri-version 2 -y -f` (scaffold into a clean temp dir, then relocate `src/ src-tauri/ index.html vite.config.* tsconfig* package.json` into the repo root so you don't clobber `docs/ DESIGN.md mockup/ .git`).
- **⛔ ONE user blocker — passworded sudo (you cannot run it):** the Linux webview system libs. Ask the user to run, via the `!` prefix:
  ```
  ! sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev pkg-config
  ```
  This blocks ONLY `cargo build`/`tauri dev` (the Rust shell). The frontend (Vite/React/xterm) and all UI work run without it — so **start there** and fold the shell in once the libs land.

---

## Build strategy — scaffold once, then FAN OUT two tracks

### Phase 1 — Scaffold (sequential prereq, `impl-worker`)
Tauri v2 + React + TS + Vite + xterm.js (`@xterm/xterm` + addon-fit/addon-web-links) + Zustand. Wire the `DESIGN.md` §9 `:root` tokens into `index.css` (single source; if Tailwind, forward utilities to the vars — no parallel hex literals). Load IBM Plex Mono + Sans (bundle or `@fontsource`). Verify `vite dev` serves + `tsc --noEmit` clean. (`tauri dev` verification waits on the sudo libs.) **Land the integration contract below as real TypeScript stubs in this phase** so both tracks compile against it.

### Phase 2 — Two parallel tracks (spawn `ui-builder` + `impl-worker` concurrently, in one message)
They share nothing but the contract, so they don't collide:

**Track A — Functionality (`impl-worker`, GPT, pinned).** Mechanical/backend, batches edits then one verify pass:
- Rust `PtyManager` (`portable-pty`): spawn shells/`wsl.exe`/`pwsh`/`bash`/`claude`/`codex`/`cx-*`; stream stdout→frontend over a Tauri `Channel<Bytes>`; stdin/resize/kill via commands. **WSL/Windows:** launch `wsl.exe` through the same PTY; ConPTY on Win10 1809+; **normalize cwd to backslashes before ConPTY** (crib Terax). Shell-detect order on Windows: `pwsh.exe`→`powershell.exe`→`cmd.exe`.
- Rust `FsService`: sandboxed `read_dir`/`read_file`/`read_image` via `invoke`.
- Rust `Clipboard` + `Opener` commands.
- **OSC channel:** the `helm` shim (prints `ESC ]5379;{json} BEL`; commands `copy|link|img|widget`; env injection `HELM=1 HELM_PANE=<id> HELM_VERSION PATH+=shim`; degrades gracefully if `HELM` unset). Spawn every PTY with that env. (Parser/dispatch lives in Track B's frontend.) → **full spec: `ARCHITECTURE.md` §4.**
- Zustand store *implementations* behind the contract.

**Track B — UI (`ui-builder`, Opus, pinned). MAKE IT GENUINELY GOOD-LOOKING** — this is a priority:
- Port `mockup/cockpit.html` to real React components against `DESIGN.md`: custom **titlebar**, **activity rail** (icons + live roster badges), collapsible **Files/Roster sidebar**, **tab bar** + **split panes** chrome + **per-pane model/agent switcher**, xterm pane host, right **Stage dock** (auto-reveals), **status bar**.
- **Stage widgets** as real components: `CopyBox` (→ clipboard cmd), `LinkCard` (→ opener cmd), `ImagePreview` (→ Rust image read). Themed by `DESIGN.md`; arrival motion per §8.
- **Roster** panel: agent glyph + color dot + agent word + separate non-truncating state column (running-pulse/idle/needs-input/error), Claude vs Codex color-coded; rail badges. (§10 recipe — sidebar ≥272px.)
- Basic **settings** (theme/background).
- **UI-quality mandate:** `DESIGN.md` is law and `mockup/cockpit.html` is the fidelity bar. Use the **design-taste** skill (ui-builder runs its pre-emit self-critique automatically) and treat the mockup as a **design-reference-to-code** source. No generic/AI-slop chrome; match the mockup's density, mono-forward identity, tonal elevation, hairlines, and restrained accent. Self-critique before returning.

### Phase 3 — Integrate + drive
Wire xterm ↔ Channel (feed bytes to `term.write`), keystrokes/resize→commands, `registerOscHandler(5379)`→parse→dispatch to the Stage store per pane. Prove **click-to-copy + image preview end-to-end**. Run the app (`tauri dev` once libs land) and confirm the v1 "done" bar.

---

## Integration contract (freeze this in Phase 1 so tracks run parallel)
TypeScript in `src/lib/contract.ts` (names indicative — refine once, then hold stable):
```ts
// Tauri commands (Rust #[tauri::command])
pty_spawn(o:{paneId:string; command:string; args?:string[]; cwd?:string; cols:number; rows:number; env?:Record<string,string>}):Promise<void>
pty_write(paneId:string, data:string):Promise<void>
pty_resize(paneId:string, cols:number, rows:number):Promise<void>
pty_kill(paneId:string):Promise<void>
fs_read_dir(path:string):Promise<Array<{name:string; path:string; dir:boolean}>>
fs_read_file(path:string):Promise<{text?:string; b64?:string; mime:string}>
image_read(path:string):Promise<{b64:string; mime:string; w:number; h:number}>
clipboard_write(text:string):Promise<void>
opener_open(url:string):Promise<void>
// PTY output: Tauri Channel<Uint8Array> per spawn, event {paneId, bytes} -> term.write
// OSC 5379 payloads: {v:1, t:'copy'|'link'|'img'|'widget', ...}  (ARCHITECTURE §4)
```
Zustand stores (shape is the seam): `usePanes` (panes/tabs/splits/active, each pane {id,command,model,agent:'claude'|'codex'|'shell',cwd,state}) · `useRoster` (derived sessions {id,agent,model,state:'running'|'idle'|'needs-input'|'error',task}) · `useStage` (per-pane widgets[] {type,payload}, autoReveal) · `useLayout` (sidebar:'files'|'roster'|null, stageOpen). **Track B builds against stub stores; Track A fills them.**

---

## Routing + working rules (dogfooding)
- **UI/visual → `ui-builder`** (Opus, pinned). **Mechanical/backend/bulk → `impl-worker`** (GPT, pinned). Spawn both **concurrently** for Phase 2 (one message, multiple Agent calls). Use the task list to track; the `Workflow` tool is available if you want deterministic orchestration, but concurrent Agent spawns against the contract are enough.
- **Visual-verify is de-prioritized per the user** — do NOT run the separate verify-gate agent on every surface. Rely on `ui-builder`'s built-in design-taste self-critique for quality; only spot-check if something looks visibly off.
- `design-foundation` is **done**; evolve `DESIGN.md` only if a real token gap appears (it already carries the promoted type/space scale, `--terminal-muted`, `--border-zone`, `--status-*-text`, `text-nano`, and the roster identity/state recipe from the mockup gate).

## Specs NOT to re-derive (locked)
- **OSC channel:** code `5379`; `ESC ]5379;{"v":1,"t":"copy|link|img|widget",…} BEL`; shim `helm copy|link|img|widget`; env injection; xterm swallows via registered handler (returns `true`, never hits scrollback; parser buffers partial OSC across chunks). → **ARCHITECTURE §4.**
- **Per-pane switcher:** sets the launch command; switching model = new session in that pane (CLIs don't hot-swap).
- **Image widget:** pass a **path** (Rust reads it); base64 is the remote/SSH fallback.
- **MCP overlay + return channel** (`helm_pick_file`, `helm_ask`): **phase 2, not v1.**
- **Cribs (2026 refs):** [Terminon](https://github.com/Shabari-K-S/terminon) (Tauri v2 + xterm + portable-pty + WSL multishell), [Terax](https://github.com/emee-dev/terax-ai-tauri-terminal) (OSC-133, channel PTY streaming, ConPTY backslash-cwd fix), [tauri-plugin-pty](https://github.com/Tnze/tauri-plugin-pty) (turnkey fallback).

## Repo state
- `DESIGN.md` — visual law (azure, final). `mockup/cockpit.html` (+ `-azure.html` backup) — the fidelity target.
- `docs/ARCHITECTURE.md` — architecture + OSC spec §4 + roadmap. `docs/HANDOFF.md` — this file. Planning context digested: `docs/SYSTEM-MASTER.md` PART 4, `docs/BUILD-SPLIT.md` P4.
- git `main`, `.gitignore` set, **no commits yet** — commit only when the user asks.
