# helm OVERHAUL — SESSION HANDOFF

> Pick up an overnight overhaul of **helm** (Tauri v2 / React agent-cockpit terminal). You are the **ORCHESTRATOR**: spawn subagents, review their diffs adversarially, integrate, verify, commit. You do **not** write code yourself (except tiny doc/§6 edits).

Repo: `/mnt/e/Projects/helm` · Branch: **`overhaul`** · **Do NOT push, do NOT open a PR** (user hasn't asked). Commit locally, per reviewed workstream.
(Note: `docs/HANDOFF.md` is the OLD v1-build handoff — ignore it; THIS file is current.)

---

## 0. Original goal

Execute `docs/OVERHAUL-MASTER.md` end-to-end, overnight, autonomously:
- **Phase 1** — fix 8 workstreams (WS-1…WS-8) of reported bugs.
- **Phase 2** — "make it better" roadmap, by tier (A→D), scaled to token budget (none set → do Tier A, then B/C/D as quality allows).
- Take the marked **`⟦DEFAULT⟧`** decisions, never wake the user, log everything in **§6 Morning Review** of `docs/OVERHAUL-MASTER.md`.

Differentiator = the **Stage** (Claude→UI widget channel): tools surface clickable widgets (copy/link/image/command) in the right-hand Stage dock instead of losing them in scrollback. That was the most-broken thing (WS-6) and got the deepest investment.

Visual law is **settled** in `DESIGN.md` v3 + `src/styles/tokens.css` (void `#08090a`, chrome `#101112`, indigo `#5E6AD2`, Inter UI + JetBrains Mono, Claude-orange/Codex-teal). Don't re-litigate.

---

## 1. Orchestration law (keep doing this)

- Orchestrator owns the loop; **agents stay flat** (no agent spawns agents).
- Routing: **UI → `ui-builder`** (Opus); **mechanical/backend/Rust → `impl-worker`** (GPT); **read-only search → `Explore`/`code-scout`**; **adversarial review → a fresh `general-purpose` Opus** (never the builder).
- Per workstream: spec → build → **fresh adversarial reviewer** ("looks good" BANNED; evidence per item; ambiguity = FAIL) → fix (max 2 rounds) → verify → commit.
- Hard gate before commit: **`npm run typecheck` AND `npm run build`** (+ **`cargo check --manifest-path src-tauri/Cargo.toml`** for Rust). Run the authoritative gate **yourself** at a quiescent tree; don't trust self-reports.
- Batch edits, one verify. Serialize writers on shared files; parallelize disjoint file sets.

### Environment (WSLg)
- **Cannot screenshot the Tauri window or inject input** → live PTY/clipboard/resize/terminal behaviors go to §6, never claimed working.
- **Headless Chromium vs the Vite dev server renders the React chrome** — dev server = **port 1420** (Tauri default, NOT 5173). Reviewers drive Zustand stores from the page to stage states. This verified WS-2/WS-6/WS-8 UI.
- `drvfs` no inotify → explicit reads/polling.

### Gotchas learned
- Two agents running `npm run build` at once race on `dist/` → false failures. Have agents run **typecheck only**; orchestrator runs the authoritative build alone.
- A reviewer's dev server + a concurrent writer on the same module = HMR compile race → false console errors. Don't launch writers while a visual reviewer's dev server is up.
- Shared files (`contract.ts`, `DESIGN.md`, `package-lock.json`) carry multiple WS — stage source files per-workstream; let a shared file ride the first relevant commit, note it in the body. `git add -p` is NOT available here.
- The safety classifier (`claude-opus-4-8[1m]`) intermittently went down and blocked a subagent's `npm run typecheck` — when that happens, verify yourself.
- `@xterm/addon-unicode11` MUST be **^0.8.0** (0.9.0 dropped peer-deps) and the Terminal needs **`allowProposedApi:true`** or it throws at mount → blank app.

---

## 2. DONE — Phase 1 complete (8/8), each built → adversarially reviewed → fixed → verified → committed

Branch `overhaul`, on `614120a release: Helm v0.1.0`:

| Commit | WS | What shipped |
|---|---|---|
| `707007e` | **WS-1** window chrome | 8 grips enlarged (edges 7/corners 18px) + `.win-ctrls` raised (controls clickable at corners); 12px rounded shell + clip; `src/store/resizing.ts` `windowResizing` gate + Tauri `onResized` opaque-during-resize paint. |
| `c783bc2` | **WS-7** file icons | Colored per-type SVG set (`src/components/file-icons.tsx`) + open/closed folders; no dup glyphs; hue on code files only; DESIGN.md **§4.5** sanction. |
| `4647990` | **WS-4** session model | Agent panes = `$SHELL -il` root + typed launch cmd → Ctrl-C/exit drops to live shell in same pane. New `"opus"` AgentKind + v3 settings migration. |
| `99feb6c` | **WS-3** terminal render | Canvas addon (guarded, DOM fallback) + unicode11 + awaited font (2s bound) before `term.open()` + reflow-suspend on window resize. |
| `e96d3d0` | **WS-3 fix** | `allowProposedApi:true` (unicode11 needs it; was crashing the app). |
| `ba6ebfb` | **WS-8** source control | Rust porcelain-v2 `-z` (staged/unstaged/untracked + ahead/behind) + 13 git commands (toplevel-anchored, argv-safe); VS Code `ScmView` + `DiffView` (guards oversized/minified + merge diffs). |
| `99b66f2` | **WS-2** draggable panes | `TopSplitter` sidebar↔center & center↔stage (clamp/center-floor/collapse), persisted widths, terminal scrollbar auto+stable+thin (no fat bar), maximize squares corners. |
| `7e8da0a` | **WS-5** clipboard | Native paste → `term.paste()` (fresh + bracketed/normalized); Ctrl-C copies selection else `\x03`; Ctrl+Shift+C; Shift+Enter→LF. |
| `7e48b0a` | **WS-6** Stage HERO | Passive detector (`src/lib/stage-detect.ts` @ `term.onLineFeed`): URL/token/command/on-disk-image cards, `reveal:false`+unread dot, `stageDetect` toggle. `command` card (Run-in-pane, verbatim same-pane, **not OSC-injectable**), `widget` in **empty-sandbox iframe**, image **lightbox** (focus-trapped), dismiss+Clear, link scheme-gate. `shim/helm` → OSC to **`/dev/tty`** (Track-2, alt-buffer-immune). Security review PASSED both flagship controls (script-in-widget proven inert in-browser). |

---

## 3. IN PROGRESS — P2-A Bidirectional Stage widgets (Tier A centerpiece)

Interactive cards that write the user's response BACK to the pane's PTY (Stage → control surface).

**Backend DONE, `npm run typecheck` EXIT 0, but UNCOMMITTED** — working tree: `src/lib/contract.ts`, `src/lib/osc.ts`, `src/store/stage.ts`:
- `contract.ts`: `OscConfirm {t:"confirm",prompt,yes?,no?,id?}`, `OscChoice {t:"choice",prompt,options:{label,send}[],id?}`, `OscAsk {t:"ask",prompt,placeholder?,id?}` → `OscPayload` + `StageWidgetType`; `StageWidget.answered?`.
- `osc.ts`: accepts `confirm`/`choice`/`ask` (cooperative), validates, drops malformed.
- `stage.ts`: `respond(id, send)` → `ptyWrite(widget.paneId, send + "\r")`, marks `answered` (user-initiated, same-pane, verbatim, one response).

**Finish P2-A:**
1. `ui-builder` builds cards (disjoint: `Stage.tsx` cases + new `ConfirmCard`/`ChoiceCard`/`AskCard` + `components.css`): approve/deny buttons, option rows, text input+submit → `useStage.getState().respond(id, send)`; show `answered` resolved state (no double-submit); `cardMotion`, `outline` focus, semantic tokens.
2. Security review (write-back user-only/same-pane/verbatim/answered-guard/osc validation) + visual review (each card renders, action calls `ptyWrite` correctly, answered state, overflow/contrast/console).
3. Fix → **commit backend+UI together** (`feat(stage): bidirectional widgets`). ⟨live-test⟩: does the waiting tool read the response from stdin — §6.

---

## 4. REMAINING

**Must-do:** finish P2-A · fill **§6 Morning Review** in `docs/OVERHAUL-MASTER.md` (still template ~L305-327; use §5/§6/§7 below) · commit the docs (`docs/OVERHAUL-MASTER.md` + this file).

**Deferred Phase 2 (log in §6; need live-agent testing or larger architecture — don't rush unsupervised):**
- **Tier A:** MCP return channel (host MCP server, per-pane `HELM_PANE` routing, `helm_copy`/`helm_show_link`/`helm_preview_image` + `helm_pick_file`/`helm_ask`). **Track-2 Claude Code hook/output-style** (shim `/dev/tty` fix shipped; hook makes the hero work for Claude, which likely runs the **alternate buffer** the passive detector skips — HIGHEST-leverage next item). Stage history/pinning/per-artifact actions. More widget types (table/json/markdown/diff/progress).
- **Tier B:** agent roster (Agent-Teams/bg-agent status), orchestration UI, **⌘K palette**.
- **Tier C:** terminal search (`@xterm/addon-search`), session persistence, tab reorder/rename, broadcast-input.
- **Tier D:** motion polish, empty states, **light theme** (semantic re-map), byte-IPC perf, **WebGL renderer behind a setting** (deferred from WS-3), onboarding.

---

## 5. Defaults `⟦DEFAULT⟧`
Shell radius 12px / inner 0 (DESIGN §7) · Canvas renderer default, WebGL→Tier D · `$SHELL -il` root + typed cmd · muted colored icons (DESIGN §4.5) · passive detect ON (`stageDetect`), commands never auto-run · unicode11 ^0.8 + `allowProposedApi` · kept `transparent:true`+`macos-private-api` (needed for corners), maximize squares · opus `AgentKind` + v3 migration · git branch `overhaul`, incremental commits, **not pushed, no PR**.

## 6. MUST TEST LIVE (WSLg couldn't verify)
1. Input snappy in real `claude` TUI; glyph alignment; no cutoff after resize (WS-3).
2. Ctrl-C/exit claude/codex/opus-route → live shell same pane; **launch cmd resolves under `$SHELL -il`** (p10k/rc-file reading stdin could eat it; fallback = gate write on first output); `\r` submits; no orphaned CLI (WS-4).
3. Wispr paste → fresh text, all 4 triggers; multi-line paste doesn't mis-submit (WS-5).
4. Select+Ctrl-C copies w/o interrupt; empty Ctrl-C SIGINTs; Ctrl+Shift+C (WS-5).
5. Resize smooth; corners rounded on Windows; maximize squares; 8 grips grab; controls clickable at corners (WS-1/2).
6. **Real Claude output → Stage cards** + lightbox; confirm Claude/Codex buffer mode (detector skips alternate; if alt → Track-2) (WS-6). Bidirectional response read by the tool (P2-A).

## 7. Parked (§6 "D")
- WS-4: `pty_kill` signals shell PID only (not pgroup) — SIGHUP-ignoring child could orphan (normal reap via master-fd-drop SIGHUP). Agent panes rarely reach done/error now (Exit tied to shell) — intended.
- WS-6: `csp:null` — sandbox blocks scripts but passive `<img>` beacon possible from widget HTML; add CSP after live-testing it doesn't break assets.
- WS-2: no load-time center-floor (masked by breakpoints); static `aria-valuemax`.

---

## 8. Immediate next action
1. `git status` (expect: modified `contract.ts`/`osc.ts`/`stage.ts` = P2-A backend, typechecks; untracked `docs/OVERHAUL-MASTER.md`, `docs/HANDOFF-OVERHAUL.md`).
2. Spawn `ui-builder` for P2-A cards (§3) → review → fix → commit backend+UI.
3. Fill §6 Morning Review; commit docs.
4. If continuing Phase 2: do the **Track-2 Claude hook** first (makes the hero work for Claude regardless of buffer).
