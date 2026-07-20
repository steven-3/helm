# Helm — Architecture (current state)

> **Living document — update with every release. Sessions orient here instead of re-scanning the repo.**
> Snapshots *what Helm is now*, not the build plan. Visuals are owned by `DESIGN.md` (v5 "Linear Dark");
> per-release history is in `CHANGELOG.md`.

## Why Helm exists

Warp is hated for a reason: heavy, opinionated, "feels like a bottleneck." Helm is not another terminal —
it's a **cockpit**. The terminal is table stakes; the reason Helm is worth building is the layer terminals
*can't* give you:

- **The agent→UI channel** — when an agent in a pane needs you to open a link, copy a value, confirm a
  choice, or look at an image, it surfaces as a real widget in Helm's chrome instead of drowning in
  scrollback. This is the differentiator, now generalized into Stage cards + the board/memory/attention verbs.
- **A glanceable fleet** — live sessions, seat colors (Claude/GPT/Kimi/Sonnet), what each is running, who
  needs you *right now*.
- **IDE-lite chrome** — file tree, code editor, embedded preview, per-pane model switching — around a
  terminal that stays spacious. Everything native primitives already do well, Helm **wraps and surfaces**.

## Locked decisions

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| 1 | Runtime | **Tauri v2, scratch-built** | ~7 MB, low RAM — kills the bottleneck feel. `portable-pty` = WezTerm's own crate. |
| 2 | Layout | **IDE cockpit → Mission Control (v4)** | Activity rail + surface router; terminal deck always mounted; docks collapse so the terminal never feels cramped. |
| 3 | Agent→UI channel | **In-band OSC 5379 + `helm` shim + token HTTP** | Emitter is whatever runs in the pane (claude/codex/cx-*/any program) → must be in-band; survives WSL/SSH/tmux. MCP is a semantic overlay, not the spine. |
| 4 | Terminal renderer | **xterm.js built-in/canvas, WebGL opt-in** | WSLg/WebKit context loss caused black tabs + glyph drift; canvas is the safe default. |
| 5 | Orchestration | **Surface native primitives** | Wrap Agent Teams / worktrees / loops; don't reinvent. |

Rejected (on file): Electron (RAM), forking Wave Terminal (block-replaces-scrollback fights the panes vision),
MCP-as-spine (Claude-only, strands codex), file-watch channel (loses pane-association over SSH).

## Tech stack

- **Shell:** Tauri v2 (`macos-private-api`), WebView2 on Windows. App version pinned in `package.json` +
  `src-tauri/Cargo.toml` (0.4.1 → **0.5.0** at the release tag).
- **Frontend:** React 19.1, TypeScript 5.8, Vite 7, Zustand 5. Terminal: xterm.js 5.5 + addons
  fit / search / web-links / canvas / webgl / unicode11. Editor: CodeMirror 6 + `@codemirror/language-data`.
  Motion 12. Fonts: Inter, JetBrains Mono, IBM Plex Mono (`@fontsource/*`).
- **Rust core (`src-tauri/`):** `portable-pty` 0.8, `serde`/`serde_json`, `tokio` (net/sync/time/io-util),
  `reqwest` 0.12 (rustls-tls — no system TLS), `image` 0.25, `ignore` 0.4 (gitignore-aware search),
  `regex`, `rand` 0.9, `subtle` (constant-time token compare), `uuid`, `base64`. Plugins:
  `updater`, `process`, `clipboard-manager`, `opener`, `dialog`.

## Process architecture (Rust, `src-tauri/src/`)

WebView owns all UI + one xterm.js instance per pane. Rust owns everything native; the WebView never touches
FS/processes directly — all through `invoke()`. PTY output streams WebView-ward over a Tauri `Channel<Bytes>`;
keystrokes/resize go Rust-ward via commands. Modules + their IPC commands (all registered in `lib.rs`,
`Result<T, String>`):

- **`pty.rs`** — PTY lifecycle via portable-pty: `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`. Each PTY
  gets env `HELM=1`, `HELM_PANE=<id>`, bridge port/token, and the shim dir on `PATH`; direct-spawn commands
  are tokenized with quote-aware argument parsing.
- **`shells.rs`** — `shell_detect`: enumerates CMD, PowerShell 5, pwsh, Git Bash, and every named WSL distro,
  including UTF-16 decoding for Windows command output.
- **`integration.rs`** — `shell_integration_status`, `shell_integration_preview`, `shell_integration_install`:
  manages marked Helm blocks in supported shell rc files, with preview-before-write.
- **`bridge.rs`** — agent→UI bridge: `bridge_info` (port+token for the shim), `bridge_respond` (return
  channel for ask/confirm). Runs a loopback HTTP listener on an ephemeral port with a 32-byte random Bearer
  token; parses `StageRequest` JSON (same struct for OSC 5379 and HTTP).
- **`fs.rs`** — `fs_read_dir`, `fs_read_file`, `fs_write_file`, `fs_file_mtime` (editor external-change
  poll — drvfs has no inotify), `image_read`, `read_file_base64`.
- **`store.rs`** — `.helm/` project store: `helm_store_read`, `helm_store_write` (atomic, mkdir -p),
  `helm_store_write_b64`, `helm_store_list`.
- **`worktree.rs`** — `worktree_list` (path/branch/head/dirty), `worktree_add`, `worktree_remove`.
- **`recorder.rs`** — flight recorder ndjson: `recorder_append` (buffered), `recorder_read(from_line)`.
- **`proxy.rs`** — `proxy_http` (loopback/LAN only) — CLIProxyAPI discovery + LLM side-tasks.
- **`voice.rs`** — `voice_transcribe` (spawns whisper-cli on 16k mono WAV), `voice_download_model` (streamed,
  emits `voice://download` progress), `voice_setup_whisper` (managed whisper-cli v1.9.1 + base-model download
  into app data).
- **`search.rs`** — `search_project` (gitignore-aware text/regex, Rust `ignore`+`regex`).
- **`sys.rs`** — `env_info`, `fs_exists`, and the full git surface: `git_status`, `git_stage`/`_unstage`/
  `_stage_all`/`_unstage_all`, `git_commit`, `git_diff`, `git_branch_list`, `git_checkout`,
  `git_create_branch`, `git_discard`, `git_push`, `git_pull`, `git_fetch`. (Windows: no console flash on spawn.)

## Frontend map (`src/`)

**Stores (`src/store/`)** — Zustand, one slice per domain:
`panes` (pane topology, agent/model, spawn/switch; `resolveProfileSpawn` runs an agent profile inside its bound
terminal profile / WSL distro) · `roster` (live pane list) · `workspace` (tabs/splits/restore, tab colors) ·
`layout` (Mission Control surfaces; terminal deck always-mounted) · `settings` (schema v11 in localStorage
`helm.settings.v2`; `onboardingCompletedVersion`, `recentProjects`, and `TerminalProfile.terminalProfileId`) ·
`stage` (per-pane widget cards + pins) · `blocks` (per-session command blocks + agent turns, xterm marker refs) ·
`board` (kanban, self-healing JSON) · `swarm` (missions, roles, mailbox) · `memory` (shared markdown + graph +
provenance) · `attention` (cross-session ask/confirm/blocked queue) · `recorder` (session streams + digests) ·
`modelhub` (seat→model pins, launchers, proxy probe) · `voice` (capture/transcribe/improve, `managedSetup`) ·
`updater` (check/download/install state) · `editor` (CodeMirror tabs/dirty) · `explorer` (file tree root,
`openFolder`) · `search` · `git` · `prompts` · `customAgents` · `palette` (recents) · `notifications` ·
`cheatsheet` · `lightbox` · `env` · `resizing`.

**Libs (`src/lib/`)** — `terminal-session` (xterm↔pty binding) · `blocks` (block extraction / turn-md) ·
`shell-integration` (OSC 133 marks) · `osc` (5379 parser) · `stage-detect` (agent-turn heuristics) ·
`ipc` (typed invoke wrappers, §3.2) · `dispatch` (card→pane pipeline) · `context-pack` (`.helm/tasks/*.md`
writer) · `prompt-improver` (proxy chat) · `wav` (AudioWorklet 16k PCM) · `contract` (AgentKind / seat types)
· `theme` + `terminal-theme` + `themes/` (12-theme registry) · `fuzzy` (quick open / palette scoring) ·
`shortcuts` · `commands` · `bootstrap` · `motion` · `editor-lang`.

**Components (`src/components/`)** — grouped:
- *Shell / Mission Control:* `ActivityRail`, `Titlebar`, `StatusBar`, `Sidebar`, `TabBar`, `Omnibar`
  (prefix-routed `> @ # +`), `FleetHome` (Open Folder dialog + recent projects), `TopSplitter`,
  `WindowResizeGrips`. Per-tab broadcast is palette-command-only (`tab.toggleBroadcast`).
- *Terminal & blocks:* `TerminalPane`, `Pane`, `SplitPanes`, `TerminalSearch`, `BlockGutter` (seat-colored
  chips via `data-seat`), `TermContextMenu`, `ScrollPill`, `AgentSwitcher`, `agent-view`.
- *Stage cards:* `Stage`, `AskCard`, `ChoiceCard`, `ConfirmCard`, `CommandCard`, `CopyBox`, `LinkCard`,
  `MdCard`, `JsonCard`, `TableCard`, `DiffCard`, `ProgressCard`, `ImagePreview`.
- *Board / Swarm:* `BoardView`, `BoardCard` (`seatHueFor` — shared seat→hue resolver; delete affordances in
  card menus and the drawer), `SwarmView`, `MissionTree`.
- *Memory / Attention / Recorder:* `MemoryView`, `MemoryGraph`, `AttentionInbox`, `DigestCard`.
- *Files / Editor / Preview:* `FilesView`, `FilePreview` (text→editor, images→lightbox), `EditorPane`,
  `EditorTabs`, `QuickOpen`, `PreviewPane` (localhost iframe), `DiffView`, `ScmView`, `SearchView`,
  `ImageLightbox`, `file-icons`.
- *Fleet tooling:* `RosterView`, `ModelHubPanel`, `VoiceButton`/`VoicePanel`, `AgentsPage`/`AgentManager`,
  `PromptsLibrary`, `SkillsPanel`, `TemplatePicker` (1–16 pane grids).
- *Onboarding:* `onboarding/OnboardingWizard` + six skippable steps for theme, shell/default profile,
  shell integration, Model Hub, managed voice setup, and extras; version-gated and re-runnable from Settings.
- *System surfaces:* `Settings`, `ThemeGallery`, `UpdaterCard`, `NotificationCenter`, `CommandPalette`,
  `ShortcutCheatsheet`, `ui/Dropdown` (tokenized listbox replacing all native selects), `icons`.

## `.helm/` project store (created lazily in project root)

```
.helm/
  board.json                     # {columns:[{id,name,cardIds}], cards:{[id]:Card}}
  memory/*.md                    # frontmatter: name, description, links[], author{agent,seat,session}, created, updated
  memory/INDEX.md                # auto-generated, one line per memory
  missions/<id>/mission.json     # tree, roles, status
  missions/<id>/mailbox/*.md     # role messages (read-before-work)
  tasks/<id>.md                  # dispatch context packs
  recordings/<sessionId>.ndjson  # flight recorder stream (cap 10MB, rotate)
  prompts.json                   # [{id,title,body,tags}]
  agents.json                    # [{id,name,seat,launcher,systemPrompt,color}]
```
`Card = {id,title,body,status:'todo'|'doing'|'review'|'done',seat?,paneId?,sessionId?,timeline:[{ts,kind,msg}],files?}`

## Bridge protocol

- **Transport:** OSC `ESC ] 5379 ; <json> BEL` (consumed by the frontend handler, never hits scrollback) OR
  token-authed loopback HTTP (same `StageRequest` struct). `helm` shim (`shim/helm{,.cmd,.ps1}`) reads
  port+token from env and emits; `shim/helm-mcp.mjs` is the MCP bridge (`memory_search`/`memory_add` over the
  same files); `shim/helm-shell-integration.{sh,ps1}` injects OSC 133 A/B/C/D prompt marks for command blocks.
- **Card kinds:** `copy` `link` `img` `widget` `table` `json` `md` `diff` `progress` `confirm` `choice` `ask`.
- **v0.4 verbs:** `task.progress` / `task.done` / `task.blocked` (`{t,id,msg?}`) → board+attention timelines;
  `memory.write` (`{t,name,desc?,links?,body?}`) → `.helm/memory/`; `attention.ask` (alias of `ask`).
  Shim: `helm task done|progress <id> [-m msg]`, `helm memory add <name> --desc <d> [--links a,b]`.

## Release / update pipeline

1. Tag `v*` → `.github/workflows/release.yml` builds Windows NSIS/MSI + macOS universal DMG on the **private**
   `steven-3/helm` repo via `tauri-apps/tauri-action`, signed with `TAURI_SIGNING_PRIVATE_KEY`;
   `createUpdaterArtifacts: true` + `includeUpdaterJson` produce `.sig` files and `latest.json`.
2. `node scripts/publish-release.mjs [vX.Y.Z]` (run locally, needs `gh`) mirrors installers + `.sig` +
   `latest.json` to the **public** feed `steven-3/helm-releases`, rewriting `latest.json` URLs to the public
   repo so the updater downloads without auth. Optional CI automation via `RELEASE_PAT`.
3. In-app `tauri-plugin-updater` polls
   `https://github.com/steven-3/helm-releases/releases/latest/download/latest.json` (pubkey in
   `tauri.conf.json`), verifies the minisign signature, downloads, installs, relaunches
   (`tauri-plugin-process`). `scripts/set-version.mjs` keeps `package.json` + `Cargo.toml` + tag in sync.

## Design pointer

`DESIGN.md` v5 "Linear Dark" supersedes v4 "Helm Deck" and owns all visuals: a flat, border-led graphite
field with 1px hairline seams, compact 26–28px controls, opaque floating overlays, and glass retired. Seat colors
are small operational marks through the Seat Edge identity rule (Claude indigo / GPT teal / Kimi amber / Sonnet
violet + 4 custom, bound via `[data-seat]` → `--seat-current-*` in `global.css`), alongside the theme engine
(`src/lib/themes/`). The Helm Void terminal remains the deliberate `#08090a` exception. Do not hard-code color
here.

## Directory map

```
src-tauri/src/     Rust core (one module per subsystem above) + tauri.conf.json, Cargo.toml
src/store/         Zustand domain stores
src/lib/           frontend logic (no JSX): sessions, ipc, dispatch, theme, bridge parsing
src/components/    React UI (grouped above)
src/styles/        tokens.css, global.css, blocks.css, editor.css
src/lib/themes/    theme registry (12 curated themes)
shim/              helm CLI + MCP bridge + shell-integration snippets
scripts/           set-version.mjs, publish-release.mjs
.github/workflows/ release.yml (signed multi-platform build → private repo)
docs/              ARCHITECTURE.md (this) + historical design and release documents
DESIGN.md          visual system (v5)   ·   CHANGELOG.md   ·   BRAND.md
```
