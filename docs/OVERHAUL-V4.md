# Helm v0.4.0 — "Command Deck" Overhaul Master Spec

> Single source of truth for the v0.4.0 wave. Every workstream agent reads this doc first,
> owns ONLY the files in its ownership block, and implements to the contracts in §3.
> DESIGN.md v4 (workstream D) governs all visuals. Repo CLAUDE.md auto-commit rule is
> suspended for workstream agents — the orchestrator commits per workstream.

## 0. Goals

1. **In-app auto-update** — check, download, install, relaunch from inside Helm. Feed = public repo `steven-3/helm-releases`.
2. **BridgeSpace feature parity** (the ~99%): command blocks, kanban board w/ agent dispatch, swarm orchestration, shared agent memory, real code editor, embedded localhost browser, workspace templates (1–16 panes), drag-drop skills, prompts library, agents page, theme gallery, tab colors, terminal context menu, drag-file-to-pane, scroll-to-bottom pill, quick open.
3. **Three improvements over the reference** (§5).
4. **Three new features** (§6): Attention Queue, Worktree Fleet, Flight Recorder.
5. **User-mandated adds**: Model Hub (CLIProxyAPI wiring) + Voice prompting (local whisper + prompt improver).
6. **Two drastic design changes** (§7): Mission Control UX restructure + "Helm Deck" visual system v4.
7. Ship as v0.4.0. Update CHANGELOG.md (backfill 0.2.0–0.3.1 from git log), refresh docs/ARCHITECTURE.md to current state.

## 1. Current architecture (verified 2026-07-20)

- Tauri v2 + Rust (`src-tauri/`): PTY via portable-pty (`pty.rs`), fs (`fs.rs`), git (`sys.rs`), project search (`search.rs`), agent↔UI bridge: OSC 5379 + token-authed local HTTP server (`bridge.rs`). IPC = `#[tauri::command]` fns registered in `lib.rs:15-51`.
- Frontend: React 19 + Zustand 5 + Vite 7 + xterm.js 5.5 (`src/`). Stores in `src/store/` (panes, roster, stage, settings, layout, workspace, git, explorer, search, palette, notifications, env, resizing, lightbox, cheatsheet). Libs in `src/lib/` (terminal-session, osc, commands, shortcuts, fuzzy, theme, terminal-theme, bootstrap, stage-detect, motion).
- Stage widget cards: Ask/Choice/Command/Confirm/CopyBox/Diff/Json/Link/Md/Progress/Table in `src/components/`.
- Shim CLI: `shim/helm{,.cmd,.ps1}` + `shim/helm-mcp.mjs` (MCP bridge).
- Settings: localStorage `helm.settings.v2` (`src/store/settings.ts`).
- Release: `.github/workflows/release.yml` on `v*` tags → Windows NSIS/MSI + macOS DMG on the PRIVATE repo. No updater.
- Design: `DESIGN.md` v3.1 — dark-first matte, void `#08090a`, plates `#101112`, indigo accent `#5E6AD2`, Inter + JetBrains Mono.
- Env gotchas: drvfs (no inotify — poll for file watching), WSLg (no screenshots), no jq on machine.

## 2. Workstreams & file ownership

No two Wave-1 agents touch the same file. Wave 2 may edit Wave 1 files (sequential).

### Wave 1 (parallel)

**A. Rust platform + release pipeline** (backend-worker)
Owns: `src-tauri/**` (all new Rust), `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
`.github/workflows/release.yml`, `scripts/publish-release.mjs`, `package.json` (Rust-driven deps only: `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`), `shim/**`.
Delivers: §4.1 updater, §4.2 new IPC commands (worktrees, .helm store, session recorder, voice, model hub HTTP, board bridge verbs).

**B. Terminal engine upgrades** (impl-worker)
Owns: `src/lib/terminal-session.ts`, `src/lib/blocks.ts` (new), `src/store/blocks.ts` (new),
`src/components/TerminalPane.tsx`, `src/components/BlockGutter.tsx` (new), `src/components/TermContextMenu.tsx` (new), `src/components/ScrollPill.tsx` (new), `src/store/panes.ts`, `src/components/SplitPanes.tsx`, `src/lib/shell-integration.ts` (new), `src/styles/blocks.css` (new).
Delivers: §4.3 command blocks, context menu, drag-file→path, scroll pill, 16-pane grid + templates data model, tab colors (model only).

**C. Domain stores (TS)** (backend-worker)
Owns: `src/store/board.ts`, `src/store/swarm.ts`, `src/store/memory.ts`, `src/store/attention.ts`, `src/store/recorder.ts`, `src/store/modelhub.ts`, `src/store/voice.ts`, `src/store/updater.ts` (all new), `src/lib/ipc.ts` (new — typed invoke wrappers per §3.2), `src/lib/dispatch.ts` (new), `src/lib/prompt-improver.ts` (new), `src/lib/wav.ts` (new), `src/lib/context-pack.ts` (new).
Delivers: §4.4–§4.9 domain logic, zero UI.

**D. Design system v4 + theme engine** (ui-builder)
Owns: `DESIGN.md`, `src/styles/tokens.css`, `src/lib/theme.ts`, `src/lib/terminal-theme.ts`, `src/lib/themes/` (new dir — theme registry + ~12 curated themes), `src/styles/global.css`.
Delivers: §7.2 visual system v4 + §4.10 theme engine. MUST keep existing token names working (additive; rename only with app-wide grep-verified sweep — global.css/tokens.css only, do not touch component files).

**E. Editor** (impl-worker)
Owns: `src/components/EditorPane.tsx`, `src/components/EditorTabs.tsx`, `src/components/QuickOpen.tsx` (new), `src/store/editor.ts` (new), `src/lib/editor-lang.ts` (new), `src/styles/editor.css` (new), `package.json` (CodeMirror deps only), `src/components/FilePreview.tsx` (integrate: text files → editor).
Delivers: §4.11 CodeMirror 6 editor.

### Wave 2 (parallel, after Wave 1 merges)

- **U1** (ui-builder): Mission Control shell — §7.1. Owns `App.tsx`, activity rail, `FleetHome.tsx`, `Omnibar.tsx`, layout store edits.
- **U2** (ui-builder): Board UI + Swarm mission view (`BoardView.tsx`, `SwarmView.tsx`, cards, mission tree).
- **U3** (ui-builder): Memory graph UI, Attention inbox, Flight Recorder digest cards.
- **U4** (ui-builder): Settings redesign + theme gallery + Model Hub UI + Voice UI + updater card.
- **U5** (ui-builder): Blocks visual pass, editor chrome, embedded browser `PreviewPane.tsx`.
- **I1** (impl-worker): wiring — palette commands, shortcuts, prompts library, skills drag-drop, agents page, workspace template picker.

### Wave 3
Build + typecheck + cargo check, debugger fix loop, ui-verifier gates, CHANGELOG, ARCHITECTURE.md refresh, version 0.4.0, commits.

## 3. Contracts (all agents implement/consume EXACTLY these)

### 3.1 `.helm/` project directory (created lazily in project root)

```
.helm/
  board.json          # kanban: {columns:[{id,name,cardIds}], cards:{[id]:Card}}
  memory/             # *.md w/ frontmatter: name, description, links[], author{agent,seat,session}, created, updated
  memory/INDEX.md     # auto-generated index (one line per memory)
  missions/<id>/      # mission.json (tree, roles, status) + mailbox/*.md
  tasks/<id>.md       # dispatch context packs
  recordings/<sessionId>.ndjson   # flight recorder event stream
  prompts.json        # prompts library [{id,title,body,tags}]
  agents.json         # custom agent configs [{id,name,seat,launcher,systemPrompt,color}]
```
Card: `{id,title,body,status:'todo'|'doing'|'review'|'done',seat?,paneId?,sessionId?,timeline:[{ts,kind,msg}],files?:string[]}`

### 3.2 New IPC commands (Rust, A implements; C wraps in `src/lib/ipc.ts`)

```
helm_store_read(project_root, rel_path) -> String            # read .helm file
helm_store_write(project_root, rel_path, content) -> ()      # atomic write, mkdir -p
helm_store_list(project_root, rel_dir) -> Vec<Entry>
worktree_list(repo) -> Vec<{path,branch,head,dirty}>
worktree_add(repo, branch, base) -> {path}                   # under .helm-worktrees/<branch> sibling dir
worktree_remove(repo, path, force) -> ()
recorder_append(project_root, session_id, ndjson_line) -> () # buffered append
recorder_read(project_root, session_id, from_line) -> Vec<String>
proxy_http(method, url, headers, body) -> {status, body}     # loopback/LAN only — for CLIProxyAPI
voice_transcribe(wav_path, model_path, binary_path) -> {text}  # spawns whisper-cli, 16k mono wav
voice_download_model(model_id, dest_dir) -> {path}           # streamed download w/ progress event `voice://download`
update_publish_meta() -> handled by plugin — see §4.1
```
Existing command style: snake_case fns in module files, registered in `lib.rs`. Errors: `Result<T, String>`.

### 3.3 Bridge verbs (extend OSC 5379 / HTTP bridge + shim)

Existing StageRequest gains `kind` values: `task.progress`, `task.done`, `task.blocked`, `memory.write`, `attention.ask` (alias of existing ask). Shim: `helm task done <id> [-m msg]`, `helm task progress <id> -m msg`, `helm memory add <name> --desc <d> [--links a,b]`. A implements shim+Rust; C consumes events in board/memory/attention stores via existing event channel.

### 3.4 Store surface (C implements; Wave 2 UI consumes — keep names)

- `useBoard`: `load(root)`, `addCard`, `moveCard`, `dispatchCard(id)` → `lib/dispatch.ts`, `timeline(id)`.
- `useSwarm`: `startMission(brief, roles[])`, `missionTree`, `sendTo(agentId|'all', msg)`, `abort(id)`.
- `useMemory`: `index`, `search(q)`, `graph()` (nodes+edges from links[]), `write(entry)`, provenance on every entry.
- `useAttention`: `queue` (pending asks/confirms/blocked-tasks across ALL sessions, w/ ts+session+urgency), `resolve(id, answer)`, `focusSession(id)`.
- `useRecorder`: auto-subscribes pane lifecycle; `digest(sessionId, sinceTs)` → `{commands,filesTouched,errors,summaryMd}`.
- `useModelHub`: `probe()` (GET `{proxyUrl}/v1/models` via `proxy_http`), `seats` (map seat→model), `launchers` (generate env/command for a pane: `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, model pin), `status`.
- `useVoice`: `start()`, `stop()` → wav via `lib/wav.ts` (AudioWorklet capture 16k mono PCM), transcribe → `improve(transcript, context)` via `prompt-improver.ts` (chat-completion through proxy; falls back to raw transcript), result → active pane paste.
- `useUpdater`: `check()`, `download()`, `install()` (relaunch), `state` (idle/available/downloading/ready/error, progress, notes).

### 3.5 Dispatch pipeline (`lib/dispatch.ts`)

card → context pack (`lib/context-pack.ts` writes `.helm/tasks/<id>.md`: title, body, acceptance, memory INDEX excerpt, `helm task` usage) → pick seat launcher from `useModelHub` (or card.seat) → spawn pane via panes store in project cwd → send command (launcher + prompt referencing task file) → card.status='doing', link paneId/sessionId → bridge verbs move it onward. Board never blocks on agent; timeline records every hop.

## 4. Feature specs (parity + adds)

**4.1 Updater** — `tauri-plugin-updater` + `tauri-plugin-process`. `tauri.conf.json`: `bundle.createUpdaterArtifacts: true`, plugin config w/ endpoint `https://github.com/steven-3/helm-releases/releases/latest/download/latest.json` and pubkey `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDc1NDUxMzE5MkNCQTQ1MjEKUldRaFJib3NHUk5GZGRrK212VzB4bHh6TkpsNCtaR296THdSR1hGRWpyOTAxRTdBRTRQamxFNTUK`. CI: sign w/ `TAURI_SIGNING_PRIVATE_KEY` (secret exists), upload artifacts+`.sig` to the private repo's release AND generate `latest.json`. `scripts/publish-release.mjs`: run locally — pulls release assets via `gh`, creates matching release on `steven-3/helm-releases`, uploads installers+sigs+latest.json (documents optional `RELEASE_PAT` for full CI automation). UI (Wave 2 U4): settings card + startup silent check + "Update ready — Restart" pill in titlebar.

**4.2** IPC per §3.2. Recorder: append-only ndjson `{ts,kind:'out'|'in'|'osc'|'lifecycle',data}` — cap 10MB/session, rotate.

**4.3 Command blocks** — shell integration via OSC 133 (A/B/C/D prompt marks) injected through shell rc snippet (`shim/helm-shell-integration.{sh,ps1}`, opt-in setting + docs); fallback heuristic = prompt-regex detect. Block = {cmd, startMarker, endMarker, exitCode, ts, agentTurn?}. Store keeps per-session block list w/ xterm marker refs. UI: slim gutter chips + collapsible regions + click-to-copy cmd/output, ✓/✗ exit chip, timestamp on hover; "agent-aware" mode per §5.2. NO Warp-style full block re-chroming — scrollback stays a terminal.

**4.4 Board** — §3.1 schema, §3.5 dispatch, columns todo/doing/review/done. Review column: shows diff stat via existing git commands; approve→done (optional auto-commit prompt).

**4.5 Swarm** — mission brief → coordinator plan (spawned coordinator session writes `mission.json` tasks via `helm` shim) → helm spawns role sessions (builder×N/scout/reviewer) per task w/ context packs, each in own worktree when `useWorktrees` flag set. Mailbox: `.helm/missions/<id>/mailbox/` md files; role prompts instruct read-before-work. Mission tree state from task.* bridge verbs. @-target: command bar routes text to one/all role panes (pty_write). MVP honest scope: roles are prompt templates + plumbing, no magic.

**4.6 Memory** — `.helm/memory/*.md`, frontmatter per §3.1, INDEX.md regenerated on write. `helm memory add` shim verb. Graph from `links[]` + backlinks. Provenance stamped from session. Context packs embed INDEX excerpt (§5.3). MCP: extend `shim/helm-mcp.mjs` with `memory_search`/`memory_add` tools reading the same files.

**4.7 Attention Queue** — aggregates: Stage ask/confirm/choice cards (already in stage store), `task.blocked`, long-idle-with-bell sessions. Sorted by age×urgency. Inbox UI (U3): J/K navigate, Enter answer inline (re-uses Stage card renderers), badge count in rail + tray-style titlebar dot.

**4.8 Worktree Fleet** — "Fan out" flow: pick task/card + N seats → per seat: `worktree_add` (branch `helm/<slug>-<seat>`), spawn pane grid in worktree cwd w/ seat launcher + context pack. Fleet view chip per pane: branch, dirty count, ahead/behind. Merge-back assistant: per worktree — diff stat, "merge to main" (ff/rebase attempt via git commands, surface conflicts as list), cleanup button (worktree_remove).

**4.9 Flight Recorder** — recorder store taps pane output stream (cheap: ring buffer→flush) + OSC events. Digest on demand ("since I last looked"): parse recording for commands run (via blocks), files touched (OSC/diff), errors (exit≠0), then LLM one-paragraph summary through proxy (skip gracefully if proxy down). Digest card per session in Fleet Home.

**4.10 Theme engine** — theme = token override map (JSON) applied as CSS vars on `:root[data-theme]` + terminal palette mapping. Registry in `src/lib/themes/`. Ship ~12: Helm Void (default, =v4), Helm Light, Ghost, Carbon, Abyss, Neon Tokyo, Synthwave, Dracula, Nord, Solarized Dark, Paper, Arctic. User themes: JSON in settings, editable, exportable. Live preview grid in settings (U4). Terminal theme derives from app theme automatically.

**4.11 Editor** — CodeMirror 6: `codemirror`, `@codemirror/language-data` (lazy langs), search, tabs (editor store), dirty indicators, Ctrl+S save (fs write via existing/new IPC), Quick Open Ctrl+P (fuzzy over project files — reuse `fuzzy.ts` + `search_project`/fs list), external-change detection by mtime poll (drvfs: NO inotify), theme bridged from tokens. FilePreview delegates text files to editor (images keep lightbox path).

**4.12 Embedded browser** — `PreviewPane.tsx`: iframe + URL bar (localhost only allowlist), refresh, open-external button. CSP in `tauri.conf.json` gains `frame-src http://localhost:* http://127.0.0.1:*`. Graceful blocked-site message otherwise.

**4.13 Parity smalls** — terminal context menu (copy/paste/clear/split/close/rename), drag file from explorer/OS onto pane → quoted path written to pty, scroll-to-bottom floating pill w/ new-output count, tab color dots (8 accent choices, stored on workspace tab), workspace templates picker (1/2/4/6/8/9/12/16 grid presets), prompts library (save/reuse, palette-searchable, insert into active pane), agents page (custom agents: name/seat/launcher/system-prompt/color → usable in dispatch + new-pane menu), skills drag-drop (list `~/.claude/skills` + project skills, drag onto pane → types `/skill` invocation).

## 5. Three improvements over the reference

**5.1 Dispatch receipts (board)** — BridgeBoard dispatches fire-and-forget; Helm cards carry a live timeline (spawn→progress→blocked→review→done) fed by the bridge verbs, deep-link card↔pane both directions, and the review column shows the actual git diff stat produced by that agent's session. Board is a control surface, not a sticky-note wall.

**5.2 Agent-aware blocks** — Warp/BridgeSpace blocks segment shell commands. Helm blocks additionally segment agent turns inside claude/codex sessions (via stage-detect + OSC hook events): jump-to-last-answer, collapse reasoning noise, copy-turn-as-markdown. Terminals full of agent output become navigable transcripts.

**5.3 Compounding memory** — BridgeMemory = shared markdown+graph. Helm memory adds provenance (which agent/seat/session wrote it), git-friendly plain files, AND auto-injection: every dispatched agent's context pack embeds the memory INDEX excerpt — memory is read by default, not by discipline. Plus `helm memory add` one-liner so agents write it mid-run.

## 6. Three new features (not in reference, not in Helm)

1. **Attention Queue** (§4.7) — the "16 agents, who needs me *right now*" inbox. Single keyboard-driven queue of every pending question/approval/block across all sessions.
2. **Worktree Fleet** (§4.8) — safe parallelism productized: fan a task out to N seats in isolated git worktrees w/ merge-back assistant. Kills the file-collision problem BridgeSwarm hand-waves with "ownership".
3. **Flight Recorder** (§4.9) — persisted session streams + "since you looked away" digests per session. Walk back to your desk and read 4 one-paragraph catch-ups instead of 4 scrollbacks.

## 7. Two drastic design changes

**7.1 Mission Control (UX)** — App IA reshaped around the fleet, not the terminal grid:
- **Fleet Home** — new default surface: session cards (live status, seat color, digest, attention badges), board summary strip, memory recency, update pill. One glance = whole operation.
- **Omnibar** (Ctrl+K evolves) — one input, four verbs: run command in pane / prompt an agent / open file / dispatch task. Prefix-routed (`>` cmd, `@` agent, `#` file, `+` task), fuzzy everywhere.
- **Get-to-work flow** — first-run + new-project: project picker → template → seats (from Model Hub) → go. Under 30 seconds to a working multi-agent grid.
Rationale: with 16 sessions the scarce resource is user attention; navigation reorients around "what needs me" over "where is my terminal".

**7.2 Helm Deck (visual, DESIGN.md v4)** — evolve v3.1's flat void into layered depth: 3-tier elevation w/ real (subtle) shadow+border light logic, glass-matte hybrid ONLY on transient surfaces (palette/omnibar, menus, attention inbox), **seat-color identity system** — each agent seat gets a hue (Claude indigo, GPT teal, Kimi amber, Sonnet violet, custom pick) threading pane borders, roster, board cards, mission tree, fleet cards — the app becomes readable by color at a glance. Type scale tightened, denser data surfaces, motion only on state changes. Full spec authored by D as DESIGN.md v4; taste gate: no gradient soup, contrast AA holds, terminal well stays void.

## 8. Verification (Wave 3)

- `npm run typecheck` && `npm run build` && `cargo check` (in src-tauri) green.
- Debugger seat fixes all build/type errors (no fake-green: paste real command output).
- ui-verifier binary checklist on: Fleet Home, Board, Settings/themes, blocks gutter, editor (screenshots via headless chromium against `npm run dev` — WSLg trick from memory).
- Updater dry-run: `latest.json` schema validated against plugin docs; version gate logic unit-checked.
- CHANGELOG 0.4.0 + backfill; ARCHITECTURE.md refreshed w/ §1-style current map + "keep me updated each release" header rule.
