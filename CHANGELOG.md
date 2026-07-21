# Changelog

All notable changes to Helm are recorded here. Versions follow [Semantic Versioning](https://semver.org/) and this file follows [Keep a Changelog](https://keepachangelog.com/).

## [0.6.0] - 2026-07-21

### Added
- Live waveform while recording — the mic button and popout show input-reactive bars so you can see the mic is actually picking you up, plus elapsed time and an Esc-to-cancel hint.
- Two voice shortcuts, both user-rebindable: a toggle (press to start, press to stop) and a hold push-to-talk (hold to record, release to send). Double-tapping the hold key latches recording on until pressed again.
- Keyboard shortcut editor — the shortcut cheatsheet now lets you rebind any shortcut: click a row, press the new combo. Conflicts are flagged; overrides persist.
- Voice modes: Regular cleans up what you said (drops the ums and false starts, keeps your phrasing); Prompt restructures the transcript into a well-formed prompt for a coding agent, scaling structure to task size — a one-liner stays a one-liner, a multi-part task gets goal/requirements/constraints.
- Improver effort slider (fast ↔ deep) controlling reasoning effort and response budget.
- Voice history sidebar — a rail button opens your recent transcripts with raw and improved versions side by side, per-entry copy and delete.
- Voice popout — a small always-on-top widget that works outside Helm: speak, and the transcript is typed into whichever app has focus (and copied to the clipboard), Wispr-Flow style.
- Transcription vocabulary biasing — whisper is primed with technical terms and your recent commands so identifiers like "Tauri" or "Zustand" transcribe correctly.

### Fixed
- Voice transcripts actually reach the terminal: delivery previously bypassed bracketed-paste, so agent TUIs (Claude Code included) dropped the text. Transcripts are now pasted terminal-aware, always copied to the clipboard as a backup, and you're notified if no pane is available.
- "Improve prompt with an LLM" no longer hangs indefinitely — improvement times out (15–30 s by effort) and falls back to the raw transcript.
- Microphone selection is remembered — and now actually used for recording (previously the picked device was never wired into capture). Devices auto-enumerate when the panel opens; trailing hardware IDs are stripped from names; the device and model dropdowns are wide enough to read.
- Improver model list only shows current chat models — image, audio, embedding, and legacy models are filtered out, and the list is grouped by family, strongest first.
- Recording keeps going if you click out of the app or the window is hidden.

## [0.5.5] - 2026-07-20

### Added
- Agent profiles run inside your default terminal profile by default — pick Ubuntu in setup and `claude` launches inside it. Per-agent "Runs inside" override in Settings › Agent profiles (Default terminal / Directly / any shell or distro).
- Onboarding Model Hub step gains an auth-token field when the proxy requires a key.

### Fixed
- Model Hub probe distinguishes "Auth required" (HTTP 401/403 — proxy reachable, needs its API key) from "Unreachable", with a hint pointing at the token field.
- Agent launches from the pane switcher, Agents workspace, and command palette honor the terminal-profile binding (previously bypassed it).

## [0.5.4] - 2026-07-20

### Fixed
- Shell integration for bash/zsh/WSL no longer breaks on CRLF line endings: install now copies the snippet — carriage returns stripped — to `~/.config/helm/shell-integration.sh` in the target home (inside the distro for WSL) and sources that managed copy, instead of sourcing the shipped file from the install directory (`/mnt/<drive>/…` in WSL). Existing installs with the old block are reported as not installed; clicking Add repairs them in place. `.gitattributes` now pins `*.sh`/`shim/**` to LF so a Windows CI checkout can never poison the shipped scripts again.
- Helm-launched WSL terminals are now login shells (`--shell-type login`): `/etc/profile` and `~/.profile` load, so user PATH additions and launcher scripts work like they do in Windows Terminal. Persisted WSL profiles (the stock `wsl` profile and detected distros) are migrated on next start; detected profiles also refresh their command on re-detection.

## [0.5.3] - 2026-07-20

### Fixed
- Voice capture works in production builds — the audio worklet loaded from a `blob:` URL that WebView2's `script-src` CSP blocks; it now ships as a same-origin asset (no CSP relaxation). Affected the mic everywhere, including onboarding's mic test.
- Dropdown menus render again — the popover portal was silently discarded by AnimatePresence, so listboxes never mounted.

## [0.5.2] - 2026-07-20

### Fixed
- Shell integration now reaches WSL: install writes the distro's own `~/.bashrc` with a WSL-translated shim path, and Helm's environment (pane id, bridge port/token) is forwarded across the Windows→WSL boundary via `WSLENV` — command blocks work inside WSL terminals.
- Integration scripts no-op outside Helm (`$HELM` guard) instead of emitting prompt marks into other terminals.

### Changed
- Onboarding step 3 leads with your picked default shell; other shells collapse under a disclosure. Shell-integration installer rows added to Settings.

## [0.5.1] - 2026-07-20

### Fixed
- Onboarding step 2 shell selection works — detected-shell radio picks submitted an unprefixed profile id that the settings sanitizer rejected, so the default profile never changed.

## [0.5.0] - 2026-07-20

### Added

- First-run onboarding wizard with six skippable steps: theme, shell detection and default profile, shell-integration rc install with preview-before-write, Model Hub probe, one-button voice setup, and extras. Onboarding is version-gated and re-runnable from Settings.
- Real shell detection for CMD, PowerShell 5/7, Git Bash, and every WSL distro by name, with detected shells auto-created as profiles.
- Per-agent-profile terminal binding, allowing agents to launch inside a chosen WSL distro or shell.
- Managed voice setup with automatic whisper-cli and base-model download.
- Tokenized Dropdown component replacing all native selects.
- Board card deletion from the card menu and drawer.
- Open Folder dialog and recent projects on Fleet Home.
- Palette commands `tab.toggleBroadcast` and `project.openFolder`.

### Changed

- Complete visual redesign with `DESIGN.md` v5 “Linear Dark”: flat graphite planes, hairline borders, a monochrome-first hierarchy, and no glass.
- Stage cards restyled to the floating-card idiom.
- Tab bar now honors density mode, including a 30px compact height.
- Per-tab broadcast button demoted to the command palette.

## [0.4.1] - 2026-07-20

### Fixed
- Board cards can be dragged between columns on Windows (Tauri drag interception disabled).
- Voice capture works again (CSP allowed the audio worklet).
- Attention inbox and notification panels no longer cover the titlebar.
- Window corner radius matches Windows 11 DWM (8px) — corner stroke gap gone.
- Tab color dot only renders when a color is set.
- New tabs open in the explorer root instead of the app install folder.

### Added
- Default terminal profile setting (WSL/PowerShell/etc) with built-in WSL profile.
- Claude theme — warm dark with terracotta accent.

## [0.4.0] - 2026-07-20

### Added

- In-app auto-updater with signed Windows and macOS artifacts, a public update feed, download progress, installation, and relaunch.
- Agent-aware command blocks and turns with OSC 133 shell integration, gutter navigation, collapse/copy actions, a terminal context menu, file drop, and scroll-to-bottom controls.
- Kanban board with agent dispatch, context packs, live dispatch receipts, review state, and pane/session deep links.
- Swarm missions with role sessions, mission trees, mailboxes, optional worktree isolation, and targeted messaging.
- Shared project memory with Markdown provenance, generated indexes, search, backlink graph, context-pack injection, shim commands, and MCP tools.
- Attention inbox aggregating pending questions, confirmations, blocked tasks, and session alerts.
- Flight Recorder session streams and catch-up digests for commands, touched files, and errors.
- Worktree Fleet plumbing for fan-out, branch/worktree status, merge-back assistance, and cleanup.
- Model Hub for CLIProxyAPI discovery, seat-to-model pins, and generated pane launchers.
- Local voice prompting with WAV capture, whisper transcription, and optional prompt improvement.
- CodeMirror 6 editor with tabs, save/conflict state, language detection, external-change polling, and quick open.
- Embedded localhost preview with URL controls, refresh, and open-external support.
- Theme engine with 12 bundled themes, terminal palette derivation, live previews, and user theme overrides.
- Mission Control shell with Fleet Home, activity rail, surface routing, and a prefix-routed omnibar.
- Redesigned Settings plus prompts library, skills drag-and-drop, custom agents page, workspace template picker, and tab colors.

### Changed

- Visual system advanced to `DESIGN.md` v4 “Helm Deck”: three elevation tiers, constrained transient glass, denser data surfaces, and seat-color identity for Claude, GPT, Kimi, Sonnet, and custom seats.
- Workspace templates now support 1, 2, 4, 6, 8, 9, 12, or 16 panes.

## [0.3.1] - 2026-07-20

### Fixed

- Suppressed transient console windows when Helm spawns Git commands on Windows.

### Changed

- Added repository instructions for consistent automated change commits.

## [0.3.0] - 2026-07-19

### Added

- Project-wide, gitignore-aware text and regex search backed by Rust.
- Global shortcut registry and keyboard shortcut cheatsheet.
- Notification center with session, bell, card, hook, error, and info events.
- Broadcast input across panes in a tab.
- Workspace restore for tabs, splits, panes, and working directories.

### Changed

- Upgraded the design system to v3.1 with focus rings, compact density, themed selection and scrollbars, semantic status/badge tokens, and gated overlay motion.
- Improved the command palette with fuzzy scoring, match highlighting, recents, and shortcut chips.
- Connected image preview to the native file backend and strengthened UI accessibility.

### Fixed

- Kept the webview color scheme synchronized with light and dark themes, eliminating black corners on light themes.
- Contained overlay scrims within the rounded app shell and kept the notification drawer clear of titlebar controls.

## [0.2.0] - 2026-07-14

### Added

- Bidirectional Stage cards for ask, choice, and confirm flows, plus table, JSON, Markdown, diff, and progress cards with history and pinning.
- Passive agent-output detection for links, commands, copy values, and images, with a full-window image lightbox.
- OSC 777 hook bridge for Claude Code lifecycle events.
- Token-authenticated loopback HTTP bridge and zero-dependency MCP server with a response channel.
- VS Code-style source control for status, staging, commits, diffs, and branch operations.
- Ctrl+K command palette, terminal find, session persistence, tab rename/reorder, broadcast input, and search plumbing.
- Light theme, per-file type icons, draggable sidebar/Stage splitters, themed scrollbars, and native window resize grips.

### Changed

- Improved terminal rendering with the canvas renderer, Unicode 11, deterministic font loading, native paste, selection copy, and Shift+Enter newline handling.
- Agent CLI exits now return the pane to a live shell, with distinct Opus-route identity.

### Fixed

- Enabled the xterm proposed API required by the Unicode 11 addon.
- Preserved rounded shell corners while maximizing and resizing the frameless window.

## [0.1.0] - 2026-07-13

### Added

- Native Tauri desktop application with a custom Windows and macOS shell.
- Multi-pane terminal workspace with tabs, splits, agent switching, and live process state.
- Files and roster sidebars plus a Stage dock for links, copy actions, and image previews.
- OSC 5379 bridge and `helm` command shims for agent-to-UI messages.
- Settings for terminal font, size, shell, default agent, and workspace behavior.
- Branded Helm application icon and complete Windows/macOS icon sets.
- Automated versioned GitHub Releases with Windows MSI/NSIS installers and a universal macOS DMG.

[0.5.0]: https://github.com/steven-3/helm/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/steven-3/helm/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/steven-3/helm/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/steven-3/helm/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/steven-3/helm/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/steven-3/helm/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/steven-3/helm/releases/tag/v0.1.0
