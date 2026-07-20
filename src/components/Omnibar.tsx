/* ══════════════════════════════════════════════════════════════════════════
   Omnibar (U1 · §7.1) — the ⌘K surface, evolved. One input, prefix-routed into
   four verbs plus the command palette, so with 16 sessions the operator never
   hunts for a menu:

     (no prefix)  fuzzy over the command registry + the live contextual actions
     ">"  run     — execute a command in the focused pane (pty write)
     "@"  prompt  — send text to a chosen agent session (pty write + reveal)
     "#"  file    — fuzzy-open a project file into the editor (bounded walk)
     "+"  task    — create a Board card, optionally dispatch it immediately

   It REPLACES CommandPalette (CommandPalette.tsx now re-exports it, same ⌘K
   entry) and keeps every prior palette behavior: the local action set (new tab /
   split / broadcast / go-to / copy-stage / git / settings / cheatsheet) is
   ported verbatim and MERGED with the registered command catalog, so board /
   swarm / memory / prompts / skills / … now appear here too.

   Transient surface → the §13.2 glass carve-out applies: the plate is `.glass`
   (blur + tint, two hard legibility fallbacks in global.css). INSTANT open/close
   (§8 palette gate — no entrance Motion); the only transitions are the
   --dur-fast hover fades. a11y: combobox + listbox, aria-activedescendant, focus
   trapped on the input, prior focus (the xterm textarea) restored on close.
   ══════════════════════════════════════════════════════════════════════════ */
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePalette } from "../store/palette";
import { usePanes } from "../store/panes";
import { useLayout } from "../store/layout";
import { useSettings, resolveProfileCommand, profileLabel } from "../store/settings";
import { useStage } from "../store/stage";
import { useEnv } from "../store/env";
import { useModelHub } from "../store/modelhub";
import { useBoard } from "../store/board";
import { useEditor } from "../store/editor";
import { useExplorer } from "../store/explorer";
import { useCheatsheet } from "../store/cheatsheet";
import { agentVis } from "./agent-view";
import { seatHueFor } from "./BoardCard";
import { clipboardWrite, ptyWrite, fsReadDir, getCommandList, type AppCommand } from "../lib/commands";
import { revealPane } from "../lib/dispatch";
import { fuzzyMatch } from "../lib/fuzzy";
import { getShortcutById, formatKeySegments } from "../lib/shortcuts";
import { Icon, type IconName } from "./icons";
import type { OscPayload } from "../lib/contract";
import "../styles/palette.css";
import "../styles/omnibar.css";

/* ── prefix routing ──────────────────────────────────────────────────────── */
type Mode = "command" | "run" | "agent" | "file" | "task";
const PREFIX: Record<string, Mode> = { ">": "run", "@": "agent", "#": "file", "+": "task" };
const MODE_META: Record<Mode, { chip: string; icon: IconName; placeholder: string }> = {
  command: { chip: "", icon: "ic-search", placeholder: "Search commands, or > @ # + …" },
  run: { chip: "Run", icon: "ic-play", placeholder: "Run a command in the focused pane" },
  agent: { chip: "Prompt", icon: "ic-roster", placeholder: "Message an agent session" },
  file: { chip: "File", icon: "ic-files", placeholder: "Open a project file" },
  task: { chip: "Task", icon: "ic-plus", placeholder: "Describe a task to dispatch" },
};
function detectMode(query: string): { mode: Mode; term: string } {
  const first = query[0];
  if (first && PREFIX[first]) return { mode: PREFIX[first], term: query.slice(1).replace(/^\s+/, "") };
  return { mode: "command", term: query };
}

/* ── file walk (`#`) — reuses QuickOpen's primitives (fsReadDir + fuzzyMatch);
      bounded + cached per root so re-entering the mode is instant. ─────────── */
const SKIP_DIRS = new Set([".git", "node_modules", "target", "dist", "build", ".next", ".helm", ".helm-worktrees"]);
const MAX_FILES = 4000;
const MAX_DEPTH = 12;
const fileCache = new Map<string, { path: string; rel: string }[]>();

async function walkFiles(root: string): Promise<{ path: string; rel: string }[]> {
  const out: { path: string; rel: string }[] = [];
  const queue: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
  const rel = (p: string) => (p.startsWith(root) ? p.slice(root.length).replace(/^[/\\]+/, "") : p);
  while (queue.length && out.length < MAX_FILES) {
    const next = queue.shift()!;
    let entries: { name: string; path: string; dir: boolean }[];
    try {
      entries = (await fsReadDir(next.dir)) as { name: string; path: string; dir: boolean }[];
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.dir) {
        if (next.depth < MAX_DEPTH && !SKIP_DIRS.has(entry.name)) queue.push({ dir: entry.path, depth: next.depth + 1 });
      } else {
        out.push({ path: entry.path, rel: rel(entry.path) });
        if (out.length >= MAX_FILES) break;
      }
    }
  }
  return out;
}

function projectRoot(): string | null {
  const panes = usePanes.getState();
  const tab = panes.tabs.find((t) => t.id === panes.activeTabId);
  return (
    useExplorer.getState().root ??
    (tab ? panes.panes[tab.activePaneId]?.cwd ?? null : null) ??
    useEnv.getState().cwd ??
    null
  );
}

/* ── ported palette helpers ──────────────────────────────────────────────── */
function highlight(label: string, positions: number[]): ReactNode {
  if (positions.length === 0) return label;
  const hit = new Set(positions);
  const out: ReactNode[] = [];
  let buf = "";
  for (let i = 0; i < label.length; i++) {
    if (hit.has(i)) {
      if (buf) { out.push(buf); buf = ""; }
      out.push(<mark key={i} className="pi-hl">{label[i]}</mark>);
    } else {
      buf += label[i];
    }
  }
  if (buf) out.push(buf);
  return out;
}
function copyableText(p: OscPayload): string | null {
  switch (p.t) {
    case "copy": return p.text;
    case "link": return p.url;
    case "command": return p.command;
    case "file": return p.path;
    default: return null;
  }
}
const truncate = (value: string, max = 52): string => {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/* ── command catalog: local contextual actions (ported from CommandPalette) +
      the registered command catalog (getCommandList) merged into one list. ─── */
type Group = "Fleet" | "Workspace" | "Tabs" | "View" | "Tools" | "Git" | "Settings" | "Help";
const GROUP_ORDER: Group[] = ["Fleet", "Workspace", "Tabs", "View", "Tools", "Git", "Settings", "Help"];
type DisplayGroup = Group | "Recent";

interface Action {
  id: string;
  group: Group;
  label: string;
  subtitle?: string;
  icon: IconName;
  tone?: "cl" | "cx";
  iconStyle?: CSSProperties;
  keywords?: string;
  run: () => void;
}

const REGISTRY_ICON: Record<string, IconName> = {
  "board.open": "ic-table", "swarm.open": "ic-broadcast", "memory.open": "ic-markdown",
  "attention.open": "ic-bell", "dispatch.card": "ic-plus", "prompts.open": "ic-pin",
  "skills.open": "ic-braces", "agents.open": "ic-roster", "templates.open": "ic-split",
  "quick-open": "ic-files", "pane.new-from-template": "ic-split", "theme.gallery": "ic-image",
  "updates.check": "ic-info", "voice.toggle": "ic-broadcast",
};
const CATEGORY_GROUP: Record<AppCommand["category"], Group> = {
  Fleet: "Fleet", Workspace: "Workspace", Tools: "Tools", Settings: "Settings",
};

/** A rendered row — one shape for every mode. */
interface Row {
  key: string;
  icon: IconName;
  iconTone?: "cl" | "cx";
  iconStyle?: CSSProperties;
  seat?: string;
  label: ReactNode;
  sub?: string;
  group: DisplayGroup;
  shortcutId?: string;
  recentId?: string;
  disabled?: boolean;
  run: () => void;
}

function OmnibarBody({ onOpenSettings }: { onOpenSettings: () => void }) {
  const hide = usePalette((s) => s.hide);

  // Live slices for the contextual command actions.
  const profiles = useSettings((s) => s.profiles);
  const stageDetect = useSettings((s) => s.stageDetect);
  const shell = useEnv((s) => s.shell);
  const tabCount = usePanes((s) => s.tabs.length);
  const panesMap = usePanes((s) => s.panes);
  const activeTabId = usePanes((s) => s.activeTabId);
  const tabs = usePanes((s) => s.tabs);
  const activePaneCount = usePanes((s) => {
    const t = s.tabs.find((t) => t.id === s.activeTabId);
    return t ? t.paneIds.length : 0;
  });
  const broadcastEnabled = usePanes((s) => s.broadcastEnabled);
  const sidebarOpen = useLayout((s) => s.sidebar !== null);
  const stageDockOpen = useLayout((s) => s.stageOpen);
  const seats = useModelHub((s) => s.seats);
  const recents = usePalette((s) => s.recents);
  const lastCopyable = useStage((s) => {
    for (let i = s.widgets.length - 1; i >= 0; i--) {
      const text = copyableText(s.widgets[i].payload);
      if (text != null && text.trim()) return text;
    }
    return null;
  });

  const focusedPane = tabs.find((t) => t.id === activeTabId)?.activePaneId;
  const sessions = useMemo(() => Object.values(panesMap), [panesMap]);

  // ── the command catalog (no-prefix mode) ────────────────────────────────
  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];

    for (const profile of profiles) {
      const vis = agentVis(profile.agent, profile.command);
      const command = resolveProfileCommand(profile, shell);
      list.push({
        id: `new-${profile.id}`, group: "Tabs", label: `New ${profileLabel(profile)} tab`, subtitle: command,
        icon: vis.glyph, tone: vis.key === "cl" ? "cl" : vis.key === "cx" ? "cx" : undefined,
        keywords: `new tab session terminal ${profile.agent} ${vis.word} ${command}`,
        run: () => {
          usePanes.getState().addTab({ agent: profile.agent, command, launchViaShell: profile.launchViaShell });
          useLayout.getState().setWorkspaceView("terminal");
        },
      });
    }
    if (tabCount >= 1) {
      list.push({
        id: "close-tab", group: "Tabs", label: "Close current tab", icon: "ic-close", keywords: "close remove kill tab",
        run: () => { const { activeTabId, closeTab } = usePanes.getState(); if (activeTabId) closeTab(activeTabId); },
      });
    }
    if (tabCount >= 2) {
      const step = (dir: 1 | -1) => {
        const { tabs, activeTabId, setActiveTab } = usePanes.getState();
        if (tabs.length < 2) return;
        const i = tabs.findIndex((t) => t.id === activeTabId);
        const next = tabs[(i + dir + tabs.length) % tabs.length];
        if (next) { setActiveTab(next.id); useLayout.getState().setWorkspaceView("terminal"); }
      };
      list.push({ id: "next-tab", group: "Tabs", label: "Next tab", icon: "ic-chev", keywords: "next forward switch tab", run: () => step(1) });
      list.push({ id: "prev-tab", group: "Tabs", label: "Previous tab", icon: "ic-chev", iconStyle: { transform: "scaleX(-1)" }, keywords: "previous prev back switch tab", run: () => step(-1) });
    }

    list.push({
      id: "toggle-sidebar", group: "View", label: sidebarOpen ? "Hide sidebar" : "Show sidebar", icon: "ic-roster",
      keywords: "toggle sidebar panel show hide files roster explorer", run: () => useLayout.getState().toggleSidebar(),
    });
    list.push({
      id: "toggle-stage", group: "View", label: stageDockOpen ? "Hide Stage dock" : "Show Stage dock", icon: "ic-image",
      keywords: "toggle stage dock panel widgets show hide right", run: () => useLayout.getState().toggleStage(),
    });
    if (tabCount >= 1) {
      list.push({
        id: "split-right", group: "View", label: "Split pane right", subtitle: "side by side", icon: "ic-split",
        keywords: "split pane vertical right side by side divide",
        run: () => { const { activeTabId, splitPane } = usePanes.getState(); if (activeTabId) splitPane(activeTabId, "vertical"); useLayout.getState().setWorkspaceView("terminal"); },
      });
      list.push({
        id: "split-down", group: "View", label: "Split pane down", subtitle: "stacked", icon: "ic-split", iconStyle: { transform: "rotate(90deg)" },
        keywords: "split pane horizontal down below stacked divide",
        run: () => { const { activeTabId, splitPane } = usePanes.getState(); if (activeTabId) splitPane(activeTabId, "horizontal"); useLayout.getState().setWorkspaceView("terminal"); },
      });
    }
    if (activePaneCount >= 2) {
      list.push({
        id: "tab.broadcast", group: "View", label: broadcastEnabled ? "Disable broadcast input" : "Broadcast input to all panes",
        subtitle: "mirror keystrokes across this tab", icon: "ic-broadcast",
        keywords: "broadcast input mirror all panes type everywhere simultaneous", run: () => usePanes.getState().toggleBroadcast(),
      });
    }
    list.push({ id: "go-files", group: "View", label: "Go to Files", icon: "ic-files", keywords: "files explorer tree navigate open sidebar", run: () => { useLayout.getState().setWorkspaceView("terminal"); useLayout.getState().setRailView("files"); } });
    list.push({
      id: "go-search", group: "View", label: "Go to Search", icon: "ic-search", keywords: "search find files navigate",
      run: () => { const l = useLayout.getState(); l.setWorkspaceView("terminal"); l.setRailView("search"); if (l.sidebar === null) l.setSidebar("roster"); },
    });
    if (lastCopyable) {
      list.push({
        id: "copy-last-stage", group: "View", label: "Copy last Stage item", subtitle: truncate(lastCopyable), icon: "ic-copy",
        keywords: "copy clipboard stage last output result item",
        run: () => { const ws = useStage.getState().widgets; for (let i = ws.length - 1; i >= 0; i--) { const text = copyableText(ws[i].payload); if (text != null && text.trim()) { void clipboardWrite(text).catch(() => {}); return; } } },
      });
    }

    list.push({
      id: "go-scm", group: "Git", label: "Go to Source Control", icon: "ic-branch", keywords: "git source control scm changes commit branch diff stage version",
      run: () => { const l = useLayout.getState(); l.setWorkspaceView("terminal"); l.setRailView("scm"); if (l.sidebar === null) l.setSidebar("roster"); },
    });

    list.push({ id: "open-settings", group: "Settings", label: "Open Settings…", icon: "ic-settings", keywords: "settings preferences appearance config options fonts profiles", run: () => onOpenSettings() });
    list.push({
      id: "toggle-detect", group: "Settings", label: stageDetect ? "Disable passive Stage detection" : "Enable passive Stage detection",
      subtitle: "auto-surface widgets from agent output", icon: "ic-image",
      keywords: "toggle passive stage detection osc auto detect widgets setting",
      run: () => { const s = useSettings.getState(); s.setStageDetect(!s.stageDetect); },
    });

    list.push({ id: "help.cheatsheet", group: "Help", label: "Keyboard shortcuts…", icon: "ic-keyboard", keywords: "keyboard shortcuts help cheatsheet keys bindings hotkeys", run: () => useCheatsheet.getState().setOpen(true) });

    // Registered command catalog (board/swarm/memory/prompts/skills/agents/
    // templates/theme/voice/updates/settings.*) — merged so the omnibar routes
    // every surface. Distinct ids, so no clash with the contextual actions.
    for (const command of getCommandList()) {
      list.push({
        id: command.id, group: CATEGORY_GROUP[command.category], label: command.label,
        icon: REGISTRY_ICON[command.id] ?? "ic-play", keywords: command.keywords,
        run: () => void command.run(),
      });
    }

    return list.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  }, [profiles, shell, tabCount, activePaneCount, broadcastEnabled, sidebarOpen, stageDockOpen, stageDetect, lastCopyable, onOpenSettings]);

  // ── input + mode ────────────────────────────────────────────────────────
  const [query, setQuery] = useState(() => usePalette.getState().seed ?? "");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);

  const { mode, term } = detectMode(query);
  const q = term.trim();

  // file mode: walk the project once (cached per root).
  const [files, setFiles] = useState<{ path: string; rel: string }[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  useEffect(() => {
    if (mode !== "file") return;
    const root = projectRoot();
    if (!root) { setFiles([]); return; }
    const cached = fileCache.get(root);
    if (cached) { setFiles(cached); return; }
    let cancelled = false;
    setFilesLoading(true);
    void walkFiles(root).then((list) => {
      fileCache.set(root, list);
      if (!cancelled) { setFiles(list); setFilesLoading(false); }
    });
    return () => { cancelled = true; };
  }, [mode]);

  // ── rows per mode ─────────────────────────────────────────────────────────
  const rows = useMemo<Row[]>(() => {
    if (mode === "command") {
      if (!q) {
        const byId = new Map(actions.map((a) => [a.id, a]));
        const seen = new Set<string>();
        const out: Row[] = [];
        for (const id of recents) {
          const a = byId.get(id);
          if (a && !seen.has(id)) {
            seen.add(id);
            out.push({ key: a.id, icon: a.icon, iconTone: a.tone, iconStyle: a.iconStyle, label: a.label, sub: a.subtitle, group: "Recent", shortcutId: a.id, recentId: a.id, run: a.run });
          }
        }
        for (const a of actions) {
          if (seen.has(a.id)) continue;
          out.push({ key: a.id, icon: a.icon, iconTone: a.tone, iconStyle: a.iconStyle, label: a.label, sub: a.subtitle, group: a.group, shortcutId: a.id, recentId: a.id, run: a.run });
        }
        return out;
      }
      const scored = actions.flatMap((a) => {
        const label = fuzzyMatch(q, a.label);
        if (label) return [{ a, positions: label.positions, score: label.score + 5 }];
        if (a.keywords) { const kw = fuzzyMatch(q, a.keywords); if (kw) return [{ a, positions: [] as number[], score: kw.score - 4 }]; }
        return [];
      });
      scored.sort((x, y) => y.score - x.score);
      return scored.map(({ a, positions }) => ({
        key: a.id, icon: a.icon, iconTone: a.tone, iconStyle: a.iconStyle,
        label: highlight(a.label, positions), sub: a.subtitle, group: a.group as DisplayGroup, shortcutId: a.id, recentId: a.id, run: a.run,
      }));
    }

    if (mode === "run") {
      const pane = focusedPane ? panesMap[focusedPane] : undefined;
      if (!pane) return [{ key: "run-none", icon: "ic-play", label: "No focused pane to run in", group: "View", disabled: true, run: () => {} }];
      if (!q) return [{ key: "run-hint", icon: "ic-play", label: `Type a command to run in ${pane.title}`, group: "View", disabled: true, run: () => {} }];
      return [{
        key: "run-exec", icon: "ic-play", label: q, sub: `run in ${pane.title}`, group: "View",
        run: () => { void ptyWrite(pane.id, `${q}\r`); useLayout.getState().setWorkspaceView("terminal"); revealPane(pane.id); },
      }];
    }

    if (mode === "agent") {
      if (sessions.length === 0) return [{ key: "agent-none", icon: "ic-roster", label: "No agent sessions open", group: "View", disabled: true, run: () => {} }];
      return sessions.map((pane) => {
        const vis = agentVis(pane.agent, pane.command);
        const hue = seatHueFor(pane.model ?? pane.agent, seats);
        return {
          key: `agent-${pane.id}`, icon: vis.glyph, seat: hue ?? undefined,
          label: pane.title, sub: q ? `send · ${pane.agent}` : `focus · ${pane.model ?? pane.cwd ?? pane.agent}`, group: "Fleet",
          run: () => {
            if (q) void ptyWrite(pane.id, `${q}\r`);
            useLayout.getState().setWorkspaceView("terminal");
            revealPane(pane.id);
          },
        };
      });
    }

    if (mode === "file") {
      if (filesLoading && files.length === 0) return [{ key: "file-loading", icon: "ic-files", label: "Indexing project…", group: "Workspace", disabled: true, run: () => {} }];
      const matches: { f: { path: string; rel: string }; positions: number[]; score: number }[] = [];
      for (const f of files) {
        if (!q) { matches.push({ f, positions: [], score: 0 }); if (matches.length >= 200) break; continue; }
        const m = fuzzyMatch(q, f.rel);
        if (m) matches.push({ f, positions: m.positions, score: m.score });
      }
      if (q) matches.sort((a, b) => b.score - a.score);
      if (matches.length === 0) return [{ key: "file-empty", icon: "ic-files", label: files.length ? "No files match" : "No project files found", group: "Workspace", disabled: true, run: () => {} }];
      return matches.slice(0, 200).map(({ f, positions }) => ({
        key: `file-${f.path}`, icon: "ic-files", label: highlight(f.rel, positions), group: "Workspace",
        run: () => { void useEditor.getState().openFile(f.path); useLayout.getState().setWorkspaceView("editor"); },
      }));
    }

    // task mode ("+")
    if (!q) return [{ key: "task-hint", icon: "ic-plus", label: "Describe a task to create on the Board", group: "Fleet", disabled: true, run: () => {} }];
    const create = async (dispatch: boolean) => {
      const root = projectRoot();
      const board = useBoard.getState();
      if (root && !board.loaded) await board.load(root);
      const id = useBoard.getState().addCard({ title: q });
      if (dispatch) await useBoard.getState().dispatchCard(id);
      useLayout.getState().setWorkspaceView("board");
    };
    return [
      { key: "task-create", icon: "ic-plus", label: `Create task “${truncate(q, 40)}”`, sub: "adds a To-do card on the Board", group: "Fleet", run: () => void create(false) },
      { key: "task-dispatch", icon: "ic-broadcast", label: `Create & dispatch “${truncate(q, 32)}”`, sub: "spawns a seat immediately", group: "Fleet", run: () => void create(true) },
    ];
  }, [mode, q, actions, recents, focusedPane, panesMap, sessions, seats, files, filesLoading]);

  useEffect(() => {
    setActive((i) => (rows.length === 0 ? 0 : Math.min(i, rows.length - 1)));
  }, [rows.length]);

  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      if (prev?.isConnected) prev.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const commit = (row: Row | undefined) => {
    if (!row || row.disabled) return;
    if (row.recentId) usePalette.getState().recordRecent(row.recentId);
    row.run();
    hide();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); if (rows.length) setActive((i) => (i + 1) % rows.length); break;
      case "ArrowUp": e.preventDefault(); if (rows.length) setActive((i) => (i - 1 + rows.length) % rows.length); break;
      case "Home": e.preventDefault(); setActive(0); break;
      case "End": e.preventDefault(); if (rows.length) setActive(rows.length - 1); break;
      case "Enter": e.preventDefault(); commit(rows[active]); break;
      case "Tab": e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); break;
      case "Escape": e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); hide(); break;
    }
  };

  const meta = MODE_META[mode];
  let prevGroup: DisplayGroup | null = null;

  return (
    <div className="pi-scrim" role="presentation" onMouseDown={hide}>
      <div className="ob-plate glass" role="dialog" aria-modal="true" aria-label="Omnibar" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pi-input-row">
          <Icon name={meta.icon} className="icon sm" />
          {mode !== "command" && <span className="ob-mode">{meta.chip}</span>}
          <input
            ref={inputRef}
            className="pi-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="omnibar-listbox"
            aria-activedescendant={rows[active] ? `omnibar-opt-${active}` : undefined}
            aria-autocomplete="list"
            aria-label="Omnibar"
            placeholder={meta.placeholder}
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
          />
        </div>

        <div className="pi-list" id="omnibar-listbox" role="listbox" aria-label="Omnibar results">
          {rows.length === 0 ? (
            <div className="pi-empty">
              No matches{q && <> for <span className="pi-q">“{q}”</span></>}
            </div>
          ) : (
            rows.map((row, index) => {
              const header = row.group !== prevGroup ? row.group : null;
              prevGroup = row.group;
              const isActive = index === active;
              const shortcut = row.shortcutId ? getShortcutById(row.shortcutId) : undefined;
              return (
                <Fragment key={row.key}>
                  {header && <div className="pi-group" role="presentation">{header}</div>}
                  <div
                    id={`omnibar-opt-${index}`}
                    role="option"
                    aria-selected={isActive}
                    aria-disabled={row.disabled || undefined}
                    ref={isActive ? activeRowRef : undefined}
                    className={`pi-row${isActive ? " active" : ""}${row.disabled ? " disabled" : ""}`}
                    onMouseMove={() => setActive((i) => (i === index ? i : index))}
                    onClick={() => commit(row)}
                  >
                    {row.seat !== undefined ? (
                      <span className="pi-ic" data-seat={row.seat}><i className="seat-dot" aria-hidden="true" /></span>
                    ) : (
                      <span className={`pi-ic${row.iconTone ? ` ${row.iconTone}` : ""}`}>
                        <Icon name={row.icon} className="icon sm" style={row.iconStyle} />
                      </span>
                    )}
                    <span className="pi-main">
                      <span className="pi-label">{row.label}</span>
                      {row.sub && <span className="pi-sub">{row.sub}</span>}
                    </span>
                    {shortcut && (
                      <span className="pi-keys" aria-hidden="true">
                        {formatKeySegments(shortcut.keys).map((segment, chipIndex) => (
                          <kbd className="kbd" key={chipIndex}>{segment}</kbd>
                        ))}
                      </span>
                    )}
                    {isActive && !row.disabled && <span className="pi-enter" aria-hidden="true">↵</span>}
                  </div>
                </Fragment>
              );
            })
          )}
        </div>

        <div className="pi-foot ob-foot" aria-hidden="true">
          <span className="ob-verbs">
            <kbd className="kbd">&gt;</kbd>run
            <kbd className="kbd">@</kbd>agent
            <kbd className="kbd">#</kbd>file
            <kbd className="kbd">+</kbd>task
          </span>
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
          <span><kbd className="kbd">↵</kbd> select</span>
          <span><kbd className="kbd">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

/** Gate: render nothing until open. Mounting the body only while open makes the
 *  open/close INSTANT (no AnimatePresence — §8 palette gate) and resets state. */
export function Omnibar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const open = usePalette((s) => s.open);
  if (!open) return null;
  return <OmnibarBody onOpenSettings={onOpenSettings} />;
}
