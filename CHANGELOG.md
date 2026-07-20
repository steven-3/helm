# Changelog

All notable changes to Helm are recorded here. Versions follow [Semantic Versioning](https://semver.org/) and this file follows [Keep a Changelog](https://keepachangelog.com/).

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
