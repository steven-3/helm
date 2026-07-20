# Next-session kickoff — Helm v0.5.0 "Identity & Onboarding"

Paste this prompt into a fresh session (cx-fable-route recommended; check Kimi quota first — see memory):

---

Read docs/ARCHITECTURE.md, DESIGN.md, and this file first. Two-part wave for Helm v0.5.0. Plan it as an orchestrated multi-agent wave like v0.4.0 (contracts + disjoint ownership; playbook memory applies — preflight the seats).

## Part 1 — First-run onboarding + guided setup

A first-launch flow (and re-runnable from Settings → "Run setup") that gets a user from install to fully-armed in under 2 minutes. Steps, each skippable:

1. **Welcome + theme pick** — live gallery (registry exists), 4–6 featured incl. Helm Void, Claude, Helm Light.
2. **Default shell/profile** — REAL shell detection like Warp/Windows Terminal: enumerate CMD, PowerShell (5+7), bash.exe, and every WSL distro by name (`wsl.exe -l -q` → e.g. "Ubuntu", "Ubuntu-24.04" as separate profiles launching `wsl.exe -d <distro>`). Auto-create detected profiles; pick default for new terminals (setting exists: defaultProfileId). User has 2 WSL distros today and only generic `wsl.exe` was offered — fix that.
3. **Shell integration (command blocks)** — explain the ✓/✗ blocks in one sentence, then ASK: "add one line to your profile?" per shell, and on yes, append the source line to the rc file (bashrc/PowerShell $PROFILE) automatically — with the exact diff shown before writing. Never silent.
4. **Model Hub** — proxy URL prompt (default 127.0.0.1:8317), probe, seat mapping quick-pick. Skip cleanly if no proxy.
5. **Voice** — one-button setup: download whisper-cli binary + base model to a managed dir (no path-pasting), test mic. Fix the current UX where users must supply their own binary path.
6. **Optional toggles w/ one-line explanations** — screen-reader DOM layer, auto update check, heuristic blocks.

Onboarding state in settings store; version-gate so upgrades can re-offer new steps.

## Part 2 — Visual identity refactor ("stop looking like cleaned-up VS Code")

User verdict on v0.4: too bland, too simple, glass too subtle to matter. Wanted: unique, memorable, still professional. This is a DESIGN.md v5 job (design-foundation method), then an app-wide component pass. Directions to explore (pick via mood-boards/mockups BEFORE building — show the user 2–3 distinct directions as HTML mockups and let them choose):
- Lean into the nautical "helm/bridge/command deck" identity for real: instrument-cluster status displays, radar-sweep agent monitor, engraved-metal texture accents — restrained, not kitsch.
- Crank the glass system from whisper to statement (visible refraction, layered light) OR go the opposite way: bold flat color-blocking with the seat-color system as the hero.
- Distinctive signature elements: custom titlebar treatment, non-rectangular surface language, a recognizable "Helm look" screenshot-test: could you identify this app from a cropped 200px screenshot?
Constraints: terminal legibility is sacred (well stays near-void in dark themes), WCAG AA holds, density improves (tab bar still fixed-height — fold density in), performance (no blur on scroll surfaces).

Also fold in these open items:
- **Agent profiles ignore shell choice**: agent launchers (claude / codex / cx-opus-route...) currently spawn inside PowerShell regardless. Add per-agent-profile "run inside terminal profile" selector (default = the default terminal profile) so e.g. claude launches inside the chosen WSL distro. This is the bridge between terminal profiles and agent profiles — design it as one coherent system, not two lists.
- **Board: delete task** — cards have no delete affordance (store has removeCard; UI never exposed it). Card menu + detail drawer.
- **Styled dropdowns** — native `<select>` elements render unstyled/OS-default all over (seat pickers, improver model, @-target...). Build one tokenized dropdown component (or style select consistently) and sweep every usage.
- Broadcast: demote per-tab titlebar button to palette command; keep capability.
- Tab bar density consumption (fixed 34/38px today).
- "Open Folder…" native dialog command + recent-projects list on Fleet Home (explorer-root flow works but is undiscoverable).
- Voice: bundle/auto-fetch whisper binary (see Part 1 step 5 — same work).
- Verify updater round-trip UX post-0.4.1 (badge, notes rendering, relaunch).

Ship as v0.5.0: build, ui-verifier full-survey gates (not hard-stop-only), CHANGELOG, ARCHITECTURE.md update, release + mirror to helm-releases.
