# Helm

Helm is a fast, focused desktop cockpit for AI-assisted development. It keeps terminals, coding agents, files, live session state, and agent-generated UI widgets in one native workspace.

![Helm application icon](src-tauri/icons/icon.png)

## Install

Download the newest version from [GitHub Releases](https://github.com/steven-3/helm/releases/latest):

- Windows: use the `setup.exe` installer for the simplest per-user installation, or the `.msi` package for managed installation.
- macOS: use the universal `.dmg`, which supports both Apple Silicon and Intel Macs.

The initial packages are not code-signed. Windows SmartScreen or macOS Gatekeeper may therefore ask you to confirm that you trust the app. Code signing can be enabled later by adding the platform certificates to GitHub Actions secrets.

## What it does

- Runs native terminal sessions with tabs and split panes.
- Switches quickly between shell, Claude, Codex, and custom agent commands.
- Shows files and live agents without taking focus away from the terminal.
- Receives links, copy fields, images, and widgets from terminal programs over Helm's OSC bridge.
- Uses a dense, dark, keyboard-first interface built for long development sessions.

## Development

Requirements: Node.js 22+, Rust stable, and the [Tauri v2 platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run desktop:dev
```

Useful checks and builds:

```sh
npm run typecheck
npm run build
npm run desktop:build
```

## Releasing a version

1. Move completed entries from `Unreleased` into a dated section in `CHANGELOG.md`.
2. Synchronize the version across npm, Tauri, and Cargo:

   ```sh
   npm run version:set -- 0.2.0
   ```

3. Commit the changes and tag the commit:

   ```sh
   git tag v0.2.0
   git push origin main v0.2.0
   ```

The release workflow builds Windows and universal macOS packages, then attaches them to a published GitHub Release. Previous tags, release pages, and `CHANGELOG.md` provide the version history.
