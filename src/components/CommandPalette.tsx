/* ══════════════════════════════════════════════════════════════════════════
   CommandPalette (Tier B) — the ⌘K command bar. Linear/Raycast-shaped, but built
   from helm's OWN switcher-popover DNA: a floating plate (--glow-plate /
   --border-panel / --shadow-floating / --radius-floating) over a --scrim, upper-
   anchored. Keyboard-first: ↑↓ move (hover follows), ↵ runs, esc closes. INSTANT
   open/close — DESIGN §8 lists "palette open" under NO animation (Raycast ships
   zero palette motion on purpose); so no Motion here, only --dur-fast hover fades.

   a11y: an ARIA combobox+listbox. Focus stays on the input; rows are role="option"
   surfaced via aria-activedescendant (never tab stops), so there is no focus-ring
   gymnastics — the caret + the 2px active marker are the focus indicators. Opening
   snapshots document.activeElement (the xterm textarea) and restores it on close,
   isConnected-guarded — the same idiom the Settings modal uses (there is no
   terminal focus helper to call). The registered global mod+k shortcut
   (lib/shortcuts, capture-phase) stopImmediatePropagation()s Ctrl/Cmd+K so \x0b
   never reaches the PTY.

   Browse mode (empty query) surfaces RECENT commands first (usePalette recents,
   recorded on every execution), then the grouped catalog. Matching runs through
   lib/fuzzy; matched characters highlight in accent. Rows whose action id is a
   registered shortcut (e.g. tab.broadcast, help.cheatsheet) carry keycap chips.

   Actions bind to the REAL store APIs (usePanes / useLayout / useSettings /
   useStage) — never guessed. Inapplicable actions are omitted, not disabled
   (e.g. Next/Previous tab only appear with ≥2 tabs; Copy last Stage item only
   when a copyable widget exists).
   ══════════════════════════════════════════════════════════════════════════ */
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePalette } from "../store/palette";
import { usePanes } from "../store/panes";
import { useLayout } from "../store/layout";
import { useSettings, resolveProfileCommand, profileLabel } from "../store/settings";
import { useStage } from "../store/stage";
import { useEnv } from "../store/env";
import { useCheatsheet } from "../store/cheatsheet";
import { agentVis } from "./agent-view";
import { clipboardWrite } from "../lib/commands";
import { fuzzyMatch } from "../lib/fuzzy";
import { getShortcutById, formatKeySegments } from "../lib/shortcuts";
import { Icon, type IconName } from "./icons";
import type { OscPayload } from "../lib/contract";
import "../styles/palette.css";

/** Split a label into plain text + <mark> runs at the matched indices. */
function highlight(label: string, positions: number[]): ReactNode {
  if (positions.length === 0) return label;
  const hit = new Set(positions);
  const out: ReactNode[] = [];
  let buf = "";
  for (let i = 0; i < label.length; i++) {
    if (hit.has(i)) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      out.push(
        <mark key={i} className="pi-hl">
          {label[i]}
        </mark>,
      );
    } else {
      buf += label[i];
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** The single copyable string a Stage widget carries, or null (img/interactive). */
function copyableText(p: OscPayload): string | null {
  switch (p.t) {
    case "copy":
      return p.text;
    case "link":
      return p.url;
    case "command":
      return p.command;
    case "file":
      return p.path;
    default:
      return null;
  }
}

const truncate = (value: string, max = 52): string => {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

type Group = "Tabs" | "View" | "Git" | "Settings" | "Help";
const GROUP_ORDER: Group[] = ["Tabs", "View", "Git", "Settings", "Help"];
/** "Recent" is a virtual browse-mode group for the recents strip (not an Action group). */
type DisplayGroup = Group | "Recent";

interface Action {
  id: string;
  group: Group;
  label: string;
  /** Secondary line (mono — it's data: a command, a path, current state). */
  subtitle?: string;
  /** Leading glyph. Agent glyphs carry a tone; everything else is neutral. */
  icon: IconName;
  tone?: "cl" | "cx";
  iconStyle?: CSSProperties;
  /** Extra fuzzy-match surface (never highlighted — only the label is). */
  keywords?: string;
  run: () => void;
}

/**
 * The palette body — mounted ONLY while open (App gates it), so query/selection
 * reset per open for free and the focus snapshot/restore lives in mount effects.
 */
function PaletteBody({ onOpenSettings }: { onOpenSettings: () => void }) {
  const hide = usePalette((s) => s.hide);

  // Live slices → correct labels/availability. Actions mutate via getState() at
  // run time, so they always act on the freshest state (not this render's).
  const profiles = useSettings((s) => s.profiles);
  const stageDetect = useSettings((s) => s.stageDetect);
  const shell = useEnv((s) => s.shell);
  const tabCount = usePanes((s) => s.tabs.length);
  const activePaneCount = usePanes((s) => {
    const t = s.tabs.find((t) => t.id === s.activeTabId);
    return t ? t.paneIds.length : 0;
  });
  const broadcastEnabled = usePanes((s) => s.broadcastEnabled);
  const sidebarOpen = useLayout((s) => s.sidebar !== null);
  const stageDockOpen = useLayout((s) => s.stageOpen);
  const recents = usePalette((s) => s.recents);
  const lastCopyable = useStage((s) => {
    for (let i = s.widgets.length - 1; i >= 0; i--) {
      const text = copyableText(s.widgets[i].payload);
      if (text != null && text.trim()) return text;
    }
    return null;
  });

  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];

    // ── Tabs ──────────────────────────────────────────────────────────────
    for (const profile of profiles) {
      const vis = agentVis(profile.agent, profile.command);
      const command = resolveProfileCommand(profile, shell);
      list.push({
        id: `new-${profile.id}`,
        group: "Tabs",
        label: `New ${profileLabel(profile)} tab`,
        subtitle: command,
        icon: vis.glyph,
        tone: vis.key === "cl" ? "cl" : vis.key === "cx" ? "cx" : undefined,
        keywords: `new tab session terminal ${profile.agent} ${vis.word} ${command}`,
        run: () => {
          usePanes.getState().addTab({
            agent: profile.agent,
            command,
            launchViaShell: profile.launchViaShell,
          });
          useLayout.getState().setWorkspaceView("terminal");
        },
      });
    }
    if (tabCount >= 1) {
      list.push({
        id: "close-tab",
        group: "Tabs",
        label: "Close current tab",
        icon: "ic-close",
        keywords: "close remove kill tab",
        run: () => {
          const { activeTabId, closeTab } = usePanes.getState();
          if (activeTabId) closeTab(activeTabId);
        },
      });
    }
    if (tabCount >= 2) {
      const step = (dir: 1 | -1) => {
        const { tabs, activeTabId, setActiveTab } = usePanes.getState();
        if (tabs.length < 2) return;
        const i = tabs.findIndex((t) => t.id === activeTabId);
        const next = tabs[(i + dir + tabs.length) % tabs.length];
        if (next) {
          setActiveTab(next.id);
          useLayout.getState().setWorkspaceView("terminal");
        }
      };
      list.push({
        id: "next-tab",
        group: "Tabs",
        label: "Next tab",
        icon: "ic-chev",
        keywords: "next forward switch tab",
        run: () => step(1),
      });
      list.push({
        id: "prev-tab",
        group: "Tabs",
        label: "Previous tab",
        icon: "ic-chev",
        iconStyle: { transform: "scaleX(-1)" },
        keywords: "previous prev back switch tab",
        run: () => step(-1),
      });
    }

    // ── View ──────────────────────────────────────────────────────────────
    list.push({
      id: "toggle-sidebar",
      group: "View",
      label: sidebarOpen ? "Hide sidebar" : "Show sidebar",
      icon: "ic-roster",
      keywords: "toggle sidebar panel show hide files roster explorer",
      run: () => useLayout.getState().toggleSidebar(),
    });
    list.push({
      id: "toggle-stage",
      group: "View",
      label: stageDockOpen ? "Hide Stage dock" : "Show Stage dock",
      icon: "ic-image",
      keywords: "toggle stage dock panel widgets show hide right",
      run: () => useLayout.getState().toggleStage(),
    });
    if (tabCount >= 1) {
      list.push({
        id: "split-right",
        group: "View",
        label: "Split pane right",
        subtitle: "side by side",
        icon: "ic-split",
        keywords: "split pane vertical right side by side divide",
        run: () => {
          const { activeTabId, splitPane } = usePanes.getState();
          if (activeTabId) splitPane(activeTabId, "vertical");
          useLayout.getState().setWorkspaceView("terminal");
        },
      });
      list.push({
        id: "split-down",
        group: "View",
        label: "Split pane down",
        subtitle: "stacked",
        icon: "ic-split",
        iconStyle: { transform: "rotate(90deg)" },
        keywords: "split pane horizontal down below stacked divide",
        run: () => {
          const { activeTabId, splitPane } = usePanes.getState();
          if (activeTabId) splitPane(activeTabId, "horizontal");
          useLayout.getState().setWorkspaceView("terminal");
        },
      });
    }
    if (activePaneCount >= 2) {
      list.push({
        id: "tab.broadcast",
        group: "View",
        label: broadcastEnabled ? "Disable broadcast input" : "Broadcast input to all panes",
        subtitle: "mirror keystrokes across this tab",
        icon: "ic-broadcast",
        keywords: "broadcast input mirror all panes type everywhere simultaneous",
        run: () => usePanes.getState().toggleBroadcast(),
      });
    }
    list.push({
      id: "go-files",
      group: "View",
      label: "Go to Files",
      icon: "ic-files",
      keywords: "files explorer tree navigate open sidebar",
      run: () => useLayout.getState().setRailView("files"),
    });
    list.push({
      id: "go-search",
      group: "View",
      label: "Go to Search",
      icon: "ic-search",
      keywords: "search find files navigate",
      run: () => {
        const l = useLayout.getState();
        l.setRailView("search");
        if (l.sidebar === null) l.setSidebar("roster"); // reveal the docked panel
      },
    });
    if (lastCopyable) {
      list.push({
        id: "copy-last-stage",
        group: "View",
        label: "Copy last Stage item",
        subtitle: truncate(lastCopyable),
        icon: "ic-copy",
        keywords: "copy clipboard stage last output result item",
        run: () => {
          const ws = useStage.getState().widgets;
          for (let i = ws.length - 1; i >= 0; i--) {
            const text = copyableText(ws[i].payload);
            if (text != null && text.trim()) {
              void clipboardWrite(text).catch(() => {});
              return;
            }
          }
        },
      });
    }

    // ── Git ───────────────────────────────────────────────────────────────
    list.push({
      id: "go-scm",
      group: "Git",
      label: "Go to Source Control",
      icon: "ic-branch",
      keywords: "git source control scm changes commit branch diff stage version",
      run: () => {
        const l = useLayout.getState();
        l.setRailView("scm");
        if (l.sidebar === null) l.setSidebar("roster"); // reveal the docked panel
      },
    });

    // ── Settings ──────────────────────────────────────────────────────────
    list.push({
      id: "open-settings",
      group: "Settings",
      label: "Open Settings…",
      icon: "ic-settings",
      keywords: "settings preferences appearance config options fonts profiles",
      run: () => onOpenSettings(),
    });
    list.push({
      id: "toggle-detect",
      group: "Settings",
      label: stageDetect ? "Disable passive Stage detection" : "Enable passive Stage detection",
      subtitle: "auto-surface widgets from agent output",
      icon: "ic-image",
      keywords: "toggle passive stage detection osc auto detect widgets setting",
      run: () => {
        const s = useSettings.getState();
        s.setStageDetect(!s.stageDetect);
      },
    });

    // ── Help ──────────────────────────────────────────────────────────────
    list.push({
      id: "help.cheatsheet",
      group: "Help",
      label: "Keyboard shortcuts…",
      icon: "ic-keyboard",
      keywords: "keyboard shortcuts help cheatsheet keys bindings hotkeys",
      run: () => useCheatsheet.getState().setOpen(true),
    });

    // Stable group order regardless of push order.
    return list.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  }, [profiles, shell, tabCount, activePaneCount, broadcastEnabled, sidebarOpen, stageDockOpen, stageDetect, lastCopyable, onOpenSettings]);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);

  // Filter + rank. Query → flat, best-first (Linear-style), headers dropped;
  // label match wins, a keyword-only match is eligible but scored lower and
  // never highlighted. Empty query → RECENTS first (usePalette order, deduped,
  // dead ids dropped), then the grouped catalog — the Raycast browse pattern.
  const q = query.trim();
  const results = useMemo(() => {
    if (!q) {
      const byId = new Map(actions.map((action) => [action.id, action]));
      const seen = new Set<string>();
      const recent: { action: Action; positions: number[]; group: DisplayGroup }[] = [];
      for (const id of recents) {
        const action = byId.get(id);
        if (action && !seen.has(id)) {
          seen.add(id);
          recent.push({ action, positions: [], group: "Recent" });
        }
      }
      return [
        ...recent,
        ...actions
          .filter((action) => !seen.has(action.id))
          .map((action) => ({ action, positions: [] as number[], group: action.group as DisplayGroup })),
      ];
    }
    const scored = actions.flatMap((action) => {
      const label = fuzzyMatch(q, action.label);
      if (label) return [{ action, positions: label.positions, score: label.score + 5, group: null as DisplayGroup | null }];
      if (action.keywords) {
        const kw = fuzzyMatch(q, action.keywords);
        if (kw) return [{ action, positions: [] as number[], score: kw.score - 4, group: null as DisplayGroup | null }];
      }
      return [];
    });
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [actions, q, recents]);

  // Keep the active index in range whenever the visible set changes.
  useEffect(() => {
    setActive((i) => (results.length === 0 ? 0 : Math.min(i, results.length - 1)));
  }, [results.length]);

  // Focus the input on open; restore the prior focus (the terminal textarea) on
  // close — isConnected-guarded, mirroring the Settings modal. There is no
  // terminal focus helper to call; the xterm textarea IS document.activeElement.
  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      if (prev?.isConnected) prev.focus({ preventScroll: true });
    };
  }, []);

  // Scroll the active row into view under keyboard navigation.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const runActive = () => {
    const hit = results[active];
    if (!hit) return;
    usePalette.getState().recordRecent(hit.action.id);
    hit.action.run();
    hide();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (results.length) setActive((i) => (i + 1) % results.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (results.length) setActive((i) => (i - 1 + results.length) % results.length);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        if (results.length) setActive(results.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        runActive();
        break;
      case "Tab":
        // Trap focus on the input (rows are aria-activedescendant, not tab stops).
        // Stop the NATIVE bubble too so a Settings modal underneath (document-level
        // keydown trap) can't steal focus when the palette is opened over it.
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        break;
      case "Escape":
        // Same isolation: a bare React stopPropagation won't stop the native event
        // reaching an underlying overlay's document listener (which would also close
        // it). Stop it at the native layer so Escape closes ONLY the palette.
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        hide();
        break;
    }
  };

  let prevGroup: DisplayGroup | null = null;

  return (
    <div className="pi-scrim" role="presentation" onMouseDown={hide}>
      <div
        className="pi-plate"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pi-input-row">
          <Icon name="ic-search" className="icon sm" />
          <input
            ref={inputRef}
            className="pi-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-activedescendant={results[active] ? `palette-opt-${active}` : undefined}
            aria-autocomplete="list"
            aria-label="Search commands"
            placeholder="Search commands…"
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        <div className="pi-list" id="palette-listbox" role="listbox" aria-label="Commands">
          {results.length === 0 ? (
            <div className="pi-empty">
              No commands match <span className="pi-q">“{q}”</span>
            </div>
          ) : (
            results.map(({ action, positions, group }, index) => {
              const header = group !== null && group !== prevGroup ? group : null;
              prevGroup = group;
              const isActive = index === active;
              const shortcut = getShortcutById(action.id);
              return (
                <Fragment key={action.id}>
                  {header && (
                    <div className="pi-group" role="presentation">
                      {header}
                    </div>
                  )}
                  <div
                    id={`palette-opt-${index}`}
                    role="option"
                    aria-selected={isActive}
                    ref={isActive ? activeRowRef : undefined}
                    className={`pi-row${isActive ? " active" : ""}`}
                    onMouseMove={() => setActive((i) => (i === index ? i : index))}
                    onClick={() => {
                      usePalette.getState().recordRecent(action.id);
                      action.run();
                      hide();
                    }}
                  >
                    <span className={`pi-ic${action.tone ? ` ${action.tone}` : ""}`}>
                      <Icon name={action.icon} className="icon sm" style={action.iconStyle} />
                    </span>
                    <span className="pi-main">
                      <span className="pi-label">{highlight(action.label, positions)}</span>
                      {action.subtitle && <span className="pi-sub">{action.subtitle}</span>}
                    </span>
                    {shortcut && (
                      <span className="pi-keys" aria-hidden="true">
                        {formatKeySegments(shortcut.keys).map((segment, chipIndex) => (
                          <kbd className="kbd" key={chipIndex}>{segment}</kbd>
                        ))}
                      </span>
                    )}
                    {isActive && (
                      <span className="pi-enter" aria-hidden="true">
                        ↵
                      </span>
                    )}
                  </div>
                </Fragment>
              );
            })
          )}
        </div>

        <div className="pi-foot" aria-hidden="true">
          <span>
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> navigate
          </span>
          <span>
            <kbd className="kbd">↵</kbd> select
          </span>
          <span>
            <kbd className="kbd">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

/** Gate: render nothing until open. Mounting the body only while open makes the
 *  open/close INSTANT (no AnimatePresence — §8 palette gate) and resets state. */
export function CommandPalette({ onOpenSettings }: { onOpenSettings: () => void }) {
  const open = usePalette((s) => s.open);
  if (!open) return null;
  return <PaletteBody onOpenSettings={onOpenSettings} />;
}
